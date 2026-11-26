import { nudgeAlerts, pushAlert } from './alerts';
import { redis } from './redis';
import { getSettings, saveSettings } from './settings';

/**
 * The network a scan runs on: mobile data for every phone scan, on our 5G lines, with metered
 * VoidMob data for a line's overflow (the worker). Home internet (Proxy-Seller) was the first
 * network and is no longer given to a scan. Internal (admin) runs never use metered mobile data:
 * they wait for a line.
 */

/** Data a point is allowed for when choosing (measured: about 20 MB on home internet, 22–28 MB on mobile). */
export const BYTES_PER_POINT = 30e6;
/** Kept back on top of a scan's allowance: on home internet, and on mobile data. */
const HOME_RESERVE = 0.3e9;
const MOBILE_RESERVE = 1e9;

export type NetworkHealth = {
  traffic?: { leftBytes: number | null; expires?: string | null } | null;
  mobileData?: boolean;
  /** The unlimited mobile line(s) connected to the worker, described; null when none. */
  mobileLanes?: string | null;
  /** The metered mobile data provider set up on the worker (VoidMob), if any. */
  mobileProvider?: string | null;
  mobileTraffic?: { leftBytes: number | null } | null;
  mobileTrafficLow?: boolean;
} | null;

/** When Proxy-Seller's package ends ("22.12.2026 23:59:59"), or null when unreadable. */
export function packageEnds(v: string | null | undefined): number | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(v ?? '').trim());
  if (!m) return null;
  return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 23), +(m[5] ?? 59), +(m[6] ?? 59));
}

/**
 * The choice itself: every phone scan runs on mobile data, on our 5G lines first (the worker sends a
 * line's overflow to metered data). Home internet is no longer a network a scan can be given. A
 * desktop scan is not a phone scan and is not on a line. (h, s and points are kept for the callers;
 * switchNow is always false now.)
 */
export function pickNetwork(
  _h: NetworkHealth,
  _s: { mobileForCustomers: boolean; mobileFirst: boolean },
  _points: number,
  targetType: string,
  _opts: { internal?: boolean } = {},
  _now = Date.now(),
): { network: 'residential' | 'mobile'; switchNow: boolean } {
  return { network: targetType.startsWith('desktop_') ? 'residential' : 'mobile', switchNow: false };
}

/**
 * Proxy-Seller's prepaid home-internet package can still take points (the overflow when every
 * unlimited line is busy): more than half a GB left, or not read yet, and not ended.
 */
export function homeHasRoom(t: { leftBytes: number | null; expires?: string | null } | null | undefined, now = Date.now(), minBytes = 0.5e9) {
  if (typeof t?.leftBytes === 'number' && t.leftBytes <= minBytes) return false;
  const ends = packageEnds(t?.expires);
  return !(ends !== null && ends <= now);
}

const gbText = (b: number | null | undefined) => (typeof b === 'number' ? (b / 1e9).toFixed(b < 10e9 ? 2 : 1) + ' GB' : 'an unknown amount');

/** pickNetwork with today's settings and the worker's health report; keeps the switch and tells the admins once. */
export async function chooseNetwork(points: number, targetType: string, opts: { internal?: boolean } = {}): Promise<'residential' | 'mobile'> {
  const [settings, health] = await Promise.all([
    getSettings(),
    redis()
      .get('stakeout:health')
      .then((v) => (v ? (JSON.parse(v) as NetworkHealth) : null))
      .catch(() => null),
  ]);
  const pick = pickNetwork(health, settings, points, targetType, opts);
  if (pick.switchNow) {
    await saveSettings({ mobileFirst: true }).catch((e) => console.warn('[network] the switch to mobile data was not saved:', (e as Error).message));
    console.log('[network] new scans run on mobile data from now on: Proxy-Seller has', gbText(health?.traffic?.leftBytes), 'left');
    const fresh = await pushAlert(
      'network-switch',
      {
        subject: 'Stakeout: new scans switched to mobile data',
        lines: [
          `Proxy-Seller's home-internet data ran low (${gbText(health?.traffic?.leftBytes)} left), so every new scan now runs on mobile data, as planned.`,
          `VoidMob has ${gbText(health?.mobileTraffic?.leftBytes)} left; a 5×5 uses about 0.6 GB. To go back to home internet first, turn off "New scans run on Mobile Network" in Ops.`,
        ],
        path: '/admin/devices',
      },
      7 * 86400,
    ).catch(() => false);
    if (fresh) await nudgeAlerts().catch(() => {});
  }
  return pick.network;
}
