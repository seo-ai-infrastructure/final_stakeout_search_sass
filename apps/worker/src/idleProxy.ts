/**
 * Idle proxies (IDLE_PROXY_GROUP, a DuoPlus proxy group id): a phone that has been free for
 * IDLE_PROXY_AFTER_SECONDS (default 20) is bound to its own proxy from that group, one proxy (one
 * IP) per phone, always the same one. Each phone moves on its own, whatever the rest of the fleet
 * is doing: between its points, while a scan uses other phones, and while points wait for proxies
 * that are down. The paid residential and mobile proxies then carry only searches. Nothing else
 * changes: a phone's next point binds its own search proxy, then checks the exit, before anything
 * is searched.
 *
 * DuoPlus sometimes refuses an idle proxy ("The proxy must detect availability"). Then the phones
 * are asked one by one (one refusal must not hold the rest), a refused phone is asked again a few
 * minutes later, and when no scan is open the paid lists are deleted at once so nothing is left on them.
 */
import { randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { redis, duoplusPost } from '@stakeout/core/redis';
import { assignIdleProxies, dueForIdle, groupProxyIds, IDLE_MAP_KEY, idleBoundKey } from '@stakeout/core/idleProxy';
import { releaseIdleProxyLists } from '@stakeout/core/proxyLists';
import { pinOutageKey } from '@stakeout/core/proxyWait';
import { proxyOutageSince } from './proxyOutage';

const idleProxyGroup = () => (process.env.IDLE_PROXY_GROUP ?? '').trim();
const afterMs = () => Math.max(10, Number(process.env.IDLE_PROXY_AFTER_SECONDS ?? 20)) * 1000;
const REFUSED_RETRY_MS = 3 * 60000;

let listed: { group: string; at: number; ids: string[] } | null = null;
/** Since when each phone has been free (no point holding it), and until when a refused one is left alone. */
const freeSince = new Map<string, number>();
const refusedUntil = new Map<string, number>();
let refusedLogged = '';
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

export async function idleProxyTick(busy: (imageId: string) => boolean = () => false) {
  const group = idleProxyGroup();
  if (!group) {
    report = { group: '', proxies: 0, phones: 0, assigned: 0, bound: 0, note: '' };
    return;
  }
  // Every check fills in the real counts (the admin page shows them while scans run too): the
  // phones, the group's proxies, which proxy is each phone's, and how many phones are on it now.
  const phones = await db.devicePool.findMany({
    where: { isEnabled: true, offlineAt: null, bootstrappedAt: { not: null } },
    select: { imageId: true, proxyId: true, cooldownUntil: true },
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

  // Points that can run (or are running). Points waiting for a network that is down are left
  // out: they retry one at a time and may wait for hours.
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
  // Who is free, and since when: a phone held by a point (its lease) is not.
  const locks = phones.length ? ((await redis().mget(...phones.map((p) => 'lock:duoplus:' + p.imageId)).catch(() => null)) as (string | null)[] | null) : [];
  if (!locks) return; // Redis did not answer: nobody is moved on a guess
  const seen = phones.map((p, i) => {
    const locked = Boolean(locks[i]);
    if (locked) freeSince.delete(p.imageId);
    else if (!freeSince.has(p.imageId)) freeSince.set(p.imageId, now);
    return {
      imageId: p.imageId,
      locked,
      busy: busy(p.imageId),
      freeSince: freeSince.get(p.imageId) ?? 0,
      restEndsAt: p.cooldownUntil.getTime(),
      wantsIdle: Boolean(map[p.imageId]) && boundNow[i] !== map[p.imageId],
      refusedUntil: refusedUntil.get(p.imageId) ?? 0,
    };
  });
  // Points still waiting for a phone: the ones that can run, less the ones a phone is running now.
  const waiting = Math.max(0, runnable - seen.filter((p) => p.locked).length);
  const moving = new Set(dueForIdle(seen, now, afterMs(), waiting));
  const waitingNote = runnable > 0 ? runnable + ' point(s) to run: a phone moves to its idle proxy ' + Math.round(afterMs() / 1000) + 's after its own point' : '';
  if (!moving.size) {
    const stuck = seen.filter((p) => p.wantsIdle && p.refusedUntil > now).length;
    report = counts(onIdle, shortNote || (stuck ? 'DuoPlus refused the idle proxy for ' + stuck + ' phone(s): asked again shortly' : waitingNote));
    return;
  }

  // Bind them, each held (like a point holds it) while it switches.
  const due: { imageId: string; idle: string; lock: string; token: string }[] = [];
  for (const p of phones) {
    if (!moving.has(p.imageId)) continue;
    const idle = map[p.imageId];
    const lock = 'lock:duoplus:' + p.imageId, token = 'idle|' + randomUUID();
    if (!(await redis().set(lock, token, 'PX', 60000, 'NX'))) continue; // a point has just taken it
    due.push({ imageId: p.imageId, idle, lock, token });
  }
  const bindOne = (x: { imageId: string; idle: string }) =>
    duoplusPost('/api/v1/cloudPhone/update', { images: [{ image_id: x.imageId, proxy: { id: x.idle, dns: 1 } }] }).then((res) => {
      const f = res?.data?.fail;
      if (Array.isArray(f) && f.map((y: any) => String(y?.id ?? y?.image_id ?? y)).includes(x.imageId)) throw new Error('DuoPlus did not apply it');
    });
  const refused: string[] = [];
  let why = '';
  let moved = 0;
  try {
    for (let i = 0; i < due.length; i += 20) {
      const chunk = due.slice(i, i + 20);
      let failed = new Set<string>();
      try {
        const res = await duoplusPost('/api/v1/cloudPhone/update', { images: chunk.map((x) => ({ image_id: x.imageId, proxy: { id: x.idle, dns: 1 } })) });
        const f = res?.data?.fail;
        failed = new Set(Array.isArray(f) ? f.map((x: any) => String(x?.id ?? x?.image_id ?? x)) : []);
      } catch (e) {
        // DuoPlus refuses the whole batch when one phone fails: everyone is asked again below, alone.
        why = (e instanceof Error ? e.message : String(e)).slice(0, 200);
        failed = new Set(chunk.map((x) => x.imageId));
      }
      for (const x of chunk) {
        if (failed.has(x.imageId)) {
          try {
            await bindOne(x);
          } catch (e) {
            why = (e instanceof Error ? e.message : String(e)).slice(0, 200);
            refused.push(x.imageId);
            refusedUntil.set(x.imageId, Date.now() + REFUSED_RETRY_MS);
            continue;
          }
        }
        refusedUntil.delete(x.imageId);
        await redis().set(idleBoundKey(x.imageId), x.idle, 'EX', 7 * 86400).catch(() => {});
        moved++;
      }
      const ok = chunk.filter((x) => !refused.includes(x.imageId));
      if (ok.length) console.log('[idle] free: moved', ok.map((x) => x.imageId + '→' + x.idle).join(', '), 'to their idle proxies (group ' + group + ')');
    }
  } finally {
    for (const x of due)
      await redis()
        .eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) end return 0", 1, x.lock, x.token)
        .catch(() => 0);
  }
  if (refused.length) {
    // Said once per set of phones, not every half minute.
    const key = refused.join(',');
    if (key !== refusedLogged) console.warn('[idle] DuoPlus refused the idle proxy for', key, '-', why, '- asked again in', REFUSED_RETRY_MS / 60000, 'minutes');
    refusedLogged = key;
    // A phone that cannot leave its paid proxy: with no scan open, the paid lists go now.
    if (!(await db.gridScan.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }))) {
      const n = await releaseIdleProxyLists(0).catch((e) => (console.warn('[proxy] release skipped:', (e as Error).message), 0));
      if (n) console.warn('[idle]', refused.length, 'phone(s) could not be moved: deleted', n, 'paid proxy list(s) instead');
    }
  } else refusedLogged = '';
  report = counts(onIdle + moved, shortNote || (refused.length ? 'DuoPlus refused the idle proxy for ' + refused.length + ' phone(s): asked again in ' + REFUSED_RETRY_MS / 60000 + ' minutes' : waitingNote || (pending.length ? pending.length + ' point(s) waiting for proxies that are down' : '')));
}
