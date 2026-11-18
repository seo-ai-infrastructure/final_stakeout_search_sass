/**
 * Power saving: the fleet's phones are off while no point is waiting and are switched on when a
 * scan arrives, so an idle phone never sits on a paid residential proxy.
 *
 *   scan arrives → switch on as many phones as there are waiting points (up to all of them)
 *                → the fleet check sees them ready → each phone's first point sets its proxy,
 *                  then runs the warm-up template once (see mobile.ts) → points run
 *   queue empty for N minutes → switch every phone off
 *
 * Turned on from the admin Settings card (powerSave); off, phones stay on as before.
 * A phone switched on by hand while the queue is empty is left alone until the next scan ends.
 */
import { db } from '@stakeout/db';
import { redis, duoplusPost } from '@stakeout/core/redis';
import { getSettings } from '@stakeout/core/settings';
import { planPower, type PowerPhone } from '@stakeout/core/fleetPower';
import { phoneInScope, expiresWithin } from '@stakeout/core/fleetHealth';
import { fleetGroupId, setPowerManaged, ensureAdbWhitelist } from './duoplus';

let lastDemandAt = Date.now();
let resting = false; // every phone confirmed off and nothing waiting: no need to keep asking DuoPlus
let lastOnCount = -1;
const lastOnAt = new Map<string, number>();
let report: { managed: boolean; on: number; total: number; pending: number; offInSeconds: number | null; note: string } = {
  managed: false, on: 0, total: 0, pending: 0, offInSeconds: null, note: '',
};
/** For the admin page's System health card. */
export const powerReport = () => report;
export const warmKey = (imageId: string) => 'stakeout:warm:' + imageId;

async function listPhones(): Promise<any[] | null> {
  const group = fleetGroupId();
  const out: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await duoplusPost('/api/v1/cloudPhone/list', { page, pagesize: 100, ...(group ? { group_id: group } : {}) });
    const list: any[] = res?.data?.list ?? [];
    for (const i of list) {
      if (!i?.id || !phoneInScope(String(i.id))) continue;
      if (group && Array.isArray(i.group) && i.group.length && !i.group.some((g: any) => String(g?.id) === group)) continue;
      out.push(i);
    }
    if (list.length < 100) return out;
  }
  return null; // incomplete listing: act on nothing
}

/** IPv4 addresses DuoPlus says are "not allowed to access". */
const refusedIps = (text: string) =>
  /not allowed to access/i.test(text) ? [...new Set(text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? [])] : [];

const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/**
 * One look at the queue and, when needed, the phones. Returns true when the number of phones that
 * are on has changed, so the caller can run the fleet check straight away.
 */
export async function powerTick(): Promise<boolean> {
  const s = await getSettings();
  // Only ever a chosen set of phones (a group or DUOPLUS_PHONE_IDS), never the whole account.
  const scoped = Boolean(fleetGroupId()) || Boolean((process.env.DUOPLUS_PHONE_IDS ?? '').trim());
  const managed = s.powerSave && scoped && Boolean(process.env.DUOPLUS_API_KEY);
  setPowerManaged(managed);
  if (!managed) {
    report = { managed: false, on: 0, total: 0, pending: 0, offInSeconds: null, note: s.powerSave && !scoped ? 'needs DUOPLUS_GROUP_ID' : '' };
    resting = false;
    return false;
  }
  const waiting = { status: 'PENDING' as const, scan: { status: { in: ['QUEUED', 'RUNNING'] as any }, targetType: { not: 'desktop_aimode' } } };
  const pending = await db.gridPin.count({ where: waiting });
  const now = Date.now();
  if (pending > 0) {
    lastDemandAt = now;
    resting = false;
  }
  const idleOffMs = s.idleOffMinutes * 60000;
  const idleMs = now - lastDemandAt;
  if (pending === 0 && resting) return false;
  if (pending === 0 && idleMs < idleOffMs) {
    report = { ...report, managed: true, pending: 0, offInSeconds: Math.round((idleOffMs - idleMs) / 1000), note: '' };
    return false;
  }
  const listed = await listPhones();
  if (!listed) return false;
  const blocked = new Set(
    (await db.devicePool.findMany({ where: { OR: [{ isEnabled: false }, { autoPausedAt: { not: null } }] }, select: { imageId: true } })).map((d: { imageId: string }) => d.imageId),
  );
  const phones: PowerPhone[] = listed.map((i) => ({
    id: String(i.id),
    status: Number(i.status),
    canStart: Boolean(i.expired_at) && !expiresWithin(i.expired_at, 60) && !blocked.has(String(i.id)),
  }));
  // An admin test point names its phone ("device:<id>"): that phone is started even if others are on.
  const named = pending
    ? (await db.gridScan.findMany({ where: { status: { in: ['QUEUED', 'RUNNING'] }, phoneModel: { startsWith: 'device:' } }, select: { phoneModel: true }, take: 20 })).map((x: { phoneModel: string }) => x.phoneModel.slice(7))
    : [];
  const cap = Number(process.env.MOBILE_CONCURRENCY);
  const plan = planPower({ phones, pending, idleMs, idleOffMs, max: Number.isInteger(cap) && cap > 0 ? cap : null, mustIds: named });

  const due = plan.on.filter((id) => now - (lastOnAt.get(id) ?? 0) > 5 * 60000);
  if (due.length) {
    let r: any = await duoplusPost('/api/v1/cloudPhone/powerOn', { image_ids: due }).catch((e) => ({ error: String(e) }));
    // DuoPlus refuses phone actions from an address that is not on the whitelist, and names the
    // address. Railway can send from several, so add the one it named and try once more.
    const refused = refusedIps(JSON.stringify(r));
    if (refused.length) {
      console.warn('[power] DuoPlus refused', refused.join(', '), '- adding to the whitelist and trying again');
      await ensureAdbWhitelist(true, refused).catch((e) => console.warn('[power] whitelist not updated:', e instanceof Error ? e.message : e));
      await new Promise((res) => setTimeout(res, 3000));
      r = await duoplusPost('/api/v1/cloudPhone/powerOn', { image_ids: due }).catch((e) => ({ error: String(e) }));
    }
    // Only a request DuoPlus accepted counts: a refused one is tried again at the next look (30 s).
    if (!r?.error && !refusedIps(JSON.stringify(r)).length) due.forEach((id) => lastOnAt.set(id, now));
    console.log(`[power] ${pending} point(s) waiting: switching on ${due.join(', ')} ·`, JSON.stringify(r?.data ?? r).slice(0, 300));
  }
  if (plan.off.length) {
    for (const ids of chunks(plan.off, 20)) {
      const r = await duoplusPost('/api/v1/cloudPhone/powerOff', { image_ids: ids }).catch((e) => ({ error: String(e) }));
      console.log(`[power] nothing waiting for ${Math.round(idleMs / 60000)} min: switching off ${ids.join(', ')} ·`, JSON.stringify((r as any)?.data ?? r).slice(0, 200));
    }
    // Out of service at once (the next fleet check confirms it), and the next start warms up again.
    await db.devicePool.updateMany({ where: { imageId: { in: plan.off }, offlineAt: null }, data: { offlineAt: new Date() } }).catch(() => {});
    await redis().del(...plan.off.map(warmKey)).catch(() => {});
  }
  const on = phones.filter((p) => p.status === 1).length;
  // Rest only once DuoPlus itself reports every phone off.
  resting = pending === 0 && !plan.off.length && plan.active === 0;
  report = {
    managed: true,
    on,
    total: phones.length,
    pending,
    offInSeconds: null,
    note: due.length ? 'starting ' + due.length : plan.off.length ? 'switching off ' + plan.off.length : '',
  };
  const changed = on !== lastOnCount;
  lastOnCount = on;
  return changed;
}
