/**
 * Idle proxies (IDLE_PROXY_GROUP, a DuoPlus proxy group id): once no point has been able to run for
 * IDLE_PROXY_AFTER_SECONDS (default 90), every phone that is on and not running a point is bound
 * to its own proxy from that group, one proxy (one IP) per phone, always the same one. The paid
 * residential and mobile proxies then carry only searches. Nothing else changes: a phone's next
 * point binds its own search proxy, then checks the exit, before anything is searched.
 *
 * Points waiting for a network whose proxies are all down (an outage: they retry one at a time,
 * for up to a day) do not keep the fleet on its paid proxies.
 */
import { randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { redis, duoplusPost } from '@stakeout/core/redis';
import { assignIdleProxies, groupProxyIds, IDLE_MAP_KEY, idleBoundKey } from '@stakeout/core/idleProxy';
import { pinOutageKey } from '@stakeout/core/proxyWait';
import { proxyOutageSince } from './proxyOutage';

export const idleProxyGroup = () => (process.env.IDLE_PROXY_GROUP ?? '').trim();
const afterMs = () => Math.max(30, Number(process.env.IDLE_PROXY_AFTER_SECONDS ?? 90)) * 1000;

let listed: { group: string; at: number; ids: string[] } | null = null;
let lastDemandAt = Date.now();
let report: { group: string; proxies: number; phones: number; assigned: number; bound: number; note: string } = {
  group: '', proxies: 0, phones: 0, assigned: 0, bound: 0, note: '',
};
/** For the admin page's System health card. */
export const idleProxyReport = () => report;

/** The group's proxy ids (read from DuoPlus at most every 10 minutes). */
export async function idleGroupProxyIds(): Promise<string[]> {
  const group = idleProxyGroup();
  if (!group) return [];
  if (listed?.group === group && Date.now() - listed.at < 10 * 60000) return listed.ids;
  const rows: unknown[] = [];
  for (let page = 1; page <= 30; page++) {
    const res = await duoplusPost('/api/v1/proxy/list', { page, pagesize: 100 });
    const list: unknown[] = res?.data?.list ?? [];
    rows.push(...list);
    if (list.length < 100) break;
  }
  listed = { group, at: Date.now(), ids: groupProxyIds(rows, group) };
  return listed.ids;
}

/** A phone has started a point: its idle binding is over (the point binds its own proxy). */
export const leftIdle = (imageId: string) => redis().del(idleBoundKey(imageId)).catch(() => 0);

export async function idleProxyTick() {
  const group = idleProxyGroup();
  if (!group) {
    report = { group: '', proxies: 0, phones: 0, assigned: 0, bound: 0, note: '' };
    return;
  }
  // Every check fills in the real counts (the admin page shows them while scans run too): the
  // phones, the group's proxies, which proxy is each phone's, and how many phones are on it now.
  const phones = await db.devicePool.findMany({
    where: { isEnabled: true, offlineAt: null, bootstrappedAt: { not: null } },
    select: { imageId: true, proxyId: true },
    orderBy: { slotIndex: 'asc' },
  });
  let ids: string[];
  try {
    ids = await idleGroupProxyIds();
  } catch (e) {
    // DuoPlus did not list the proxies this time: keep the last counts and try again on the next check.
    report = { ...report, group, note: 'could not list group ' + group + ' just now: ' + (e instanceof Error ? e.message : String(e)).slice(0, 120) };
    return;
  }
  const all = await db.devicePool.findMany({ select: { proxyId: true } });
  const previous = (await redis().hgetall(IDLE_MAP_KEY).catch(() => ({}))) as Record<string, string>;
  const { map, without } = assignIdleProxies(phones.map((p) => p.imageId), ids, previous, new Set(all.map((d) => d.proxyId)));
  const changed = Object.entries(map).filter(([phone, id]) => previous[phone] !== id);
  if (changed.length) await redis().hset(IDLE_MAP_KEY, Object.fromEntries(changed)).catch(() => 0);
  const boundNow = phones.length ? ((await redis().mget(...phones.map((p) => idleBoundKey(p.imageId))).catch(() => [])) as (string | null)[]) : [];
  const counts = (bound: number, note: string) => ({ group, proxies: ids.length, phones: phones.length, assigned: Object.keys(map).length, bound, note });
  const onIdle = phones.filter((p, i) => map[p.imageId] && boundNow[i] === map[p.imageId]).length;
  const shortNote = !ids.length
    ? 'no proxies found in group ' + group
    : without.length
      ? without.length + ' phone(s) have no idle proxy (the group has ' + ids.length + ')'
      : '';

  // Points that can run (or are running): phones keep their search proxies. Points waiting for a
  // network that is down are left out: they retry one at a time and may wait for hours.
  const pending = await db.gridPin.findMany({
    where: { status: 'PENDING', scan: { status: { in: ['QUEUED', 'RUNNING'] }, targetType: { not: 'desktop_aimode' } } },
    select: { rowIdx: true, colIdx: true, scan: { select: { proxyRegion: true, stateCode: true, network: true } } },
    take: 5000,
  });
  const down = new Map<string, boolean>();
  let runnable = 0;
  for (const p of pending) {
    const key = pinOutageKey(p);
    if (key && !down.has(key)) down.set(key, Boolean(await proxyOutageSince(key)));
    if (!key || !down.get(key)) runnable++;
  }
  const now = Date.now();
  if (runnable > 0) {
    lastDemandAt = now;
    report = counts(onIdle, shortNote || runnable + ' point(s) to run: phones keep their search proxies');
    return;
  }
  if (now - lastDemandAt < afterMs()) {
    report = counts(onIdle, shortNote || 'nothing to run: phones move to their idle proxies in ' + Math.ceil((afterMs() - (now - lastDemandAt)) / 1000) + 's');
    return;
  }

  // Bind the phones not on their idle proxy yet, each held (like a point holds it) while it switches.
  const due: { imageId: string; idle: string; lock: string; token: string }[] = [];
  let bound = 0;
  for (const p of phones) {
    const idle = map[p.imageId];
    if (!idle) continue;
    if ((await redis().get(idleBoundKey(p.imageId)).catch(() => null)) === idle) {
      bound++;
      continue;
    }
    const lock = 'lock:duoplus:' + p.imageId, token = 'idle|' + randomUUID();
    if (!(await redis().set(lock, token, 'PX', 60000, 'NX'))) continue; // a point has it
    due.push({ imageId: p.imageId, idle, lock, token });
  }
  try {
    for (let i = 0; i < due.length; i += 20) {
      const chunk = due.slice(i, i + 20);
      let failed = new Set<string>();
      try {
        const res = await duoplusPost('/api/v1/cloudPhone/update', { images: chunk.map((x) => ({ image_id: x.imageId, proxy: { id: x.idle, dns: 1 } })) });
        const f = res?.data?.fail;
        failed = new Set(Array.isArray(f) ? f.map((x: any) => String(x?.id ?? x?.image_id ?? x)) : []);
      } catch (e) {
        // DuoPlus refuses the whole batch when one phone fails: then the response names nobody.
        console.warn('[idle] binding idle proxies failed:', (e instanceof Error ? e.message : String(e)).slice(0, 200));
        failed = new Set(chunk.map((x) => x.imageId));
      }
      for (const x of chunk) {
        if (failed.has(x.imageId)) continue;
        await redis().set(idleBoundKey(x.imageId), x.idle, 'EX', 7 * 86400).catch(() => {});
        bound++;
      }
      const moved = chunk.filter((x) => !failed.has(x.imageId));
      if (moved.length) console.log('[idle] nothing waiting: moved', moved.map((x) => x.imageId + '→' + x.idle).join(', '), 'to their idle proxies (group ' + group + ')');
      if (failed.size) console.warn('[idle] DuoPlus did not bind idle proxies for', [...failed].join(', '));
    }
  } finally {
    for (const x of due)
      await redis()
        .eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) end return 0", 1, x.lock, x.token)
        .catch(() => 0);
  }
  report = counts(bound, shortNote || (pending.length ? pending.length + ' point(s) waiting for proxies that are down' : ''));
  if (without.length && changed.length) console.warn('[idle] group', group, 'has', ids.length, 'proxies for', phones.length, 'phones: no idle proxy for', without.join(', '));
}
