import { redis } from '@stakeout/core/redis';

/**
 * A state whose proxies are all down (out of traffic, or the provider not answering). While it
 * is marked, one point at a time checks whether they are back; the others wait in the queue
 * without taking a phone or calling DuoPlus. The mark lapses on its own 15 minutes after the
 * last failed check, and is cleared the moment a point gets a working proxy there.
 */
const key = (region: string) => 'stakeout:proxydown:' + region;
const OUTAGE_MS = 15 * 60000;
const PROBE_MS = 90000;

export async function noteProxyOutage(region: string) {
  const r = redis();
  const since = (await r.get(key(region)).catch(() => null)) ?? new Date().toISOString();
  await r.set(key(region), since, 'PX', OUTAGE_MS).catch(() => null);
  return since;
}

export async function clearProxyOutage(region: string | null | undefined) {
  if (!region) return;
  const was = await redis().del(key(region)).catch(() => 0);
  if (was) console.log('[proxy] proxies in', region, 'are working again');
}

/** When the region's proxies went down (ISO time), or null while they work. */
export async function proxyOutageSince(region: string) {
  return redis().get(key(region)).catch(() => null);
}

/** Lets one point through every PROBE_MS to check whether the region's proxies are back. */
export async function claimProxyProbe(region: string, pinId: string) {
  return Boolean(await redis().set('stakeout:proxyprobe:' + region, pinId, 'PX', PROBE_MS, 'NX').catch(() => null));
}
