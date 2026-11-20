/**
 * What the phones themselves recorded: Android keeps per-app data use in two-hour buckets. Read
 * once after the worker starts (at most every six hours), from every phone no point holds, and
 * written to the log: per phone and bucket the total and the biggest apps, then the fleet total.
 * Read-only on the phones, over ADB (not through any proxy). Off with DATA_HISTORY=false.
 */
import { db } from '@stakeout/db';
import { redis } from '@stakeout/core/redis';
import { dataHistory, parseUidBuckets, parseUidPackages } from '@stakeout/core/dataUse';
import { shell } from './deviceShell';

const hhmm = (sec: number) => new Date(sec * 1000).toISOString().slice(5, 16).replace('T', ' ');

export async function logDataHistory(hours = Number(process.env.DATA_HISTORY_HOURS ?? 14)) {
  if (process.env.DATA_HISTORY === 'false') return;
  if (!(await redis().set('stakeout:datahistory:said', '1', 'EX', 6 * 3600, 'NX').catch(() => null))) return;
  const phones = await db.devicePool.findMany({
    where: { isEnabled: true, offlineAt: null, bootstrappedAt: { not: null } },
    select: { imageId: true, adbAddr: true },
    orderBy: { slotIndex: 'asc' },
  });
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const fleet = new Map<number, number>();
  const fleetApps = new Map<string, number>();
  let read = 0;
  for (const d of phones) {
    if (await redis().get('lock:duoplus:' + d.imageId).catch(() => '1')) continue; // a point has it
    try {
      const raw = await shell(
        d,
        "(cmd netstats poll || dumpsys netstats poll || dumpsys netstats --poll) >/dev/null 2>&1; dumpsys netstats --full --uid detail full 2>/dev/null | grep -E 'stats:|uid=|rb='",
        40000,
      );
      const rows = parseUidBuckets(raw);
      if (!rows.length) {
        console.warn('[data-history]', d.imageId, 'gave nothing readable. Start of its answer:', JSON.stringify(raw.slice(0, 300)));
        continue;
      }
      const names = parseUidPackages(await shell(d, 'pm list packages -U 2>/dev/null', 20000).catch(() => ''));
      const buckets = dataHistory(rows, names, since);
      read++;
      for (const b of buckets) {
        fleet.set(b.st, (fleet.get(b.st) ?? 0) + b.totalMb);
        for (const a of b.apps) fleetApps.set(a.app, (fleetApps.get(a.app) ?? 0) + a.mb);
        if (b.totalMb >= 1) console.log('[data-history]', d.imageId, hhmm(b.st), 'UTC:', b.totalMb, 'MB ·', b.apps.map((a) => a.app + ' ' + a.mb).join(', '));
      }
    } catch (e) {
      console.warn('[data-history]', d.imageId, 'not read:', (e instanceof Error ? e.message : String(e)).slice(0, 120));
    }
  }
  console.log('[data-history] fleet,', read, 'of', phones.length, 'phones, last', hours, 'h by bucket start (UTC):', [...fleet].sort((a, b) => a[0] - b[0]).map(([st, n]) => hhmm(st) + ' ' + Math.round(n) + ' MB').join(' | '));
  console.log('[data-history] fleet, biggest apps:', [...fleetApps].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([a, n]) => a + ' ' + Math.round(n) + ' MB').join(', '));
}
