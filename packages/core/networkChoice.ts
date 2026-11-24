import { nudgeAlerts, pushAlert } from './alerts';
import { redis } from './redis';
import { getSettings, saveSettings } from './settings';

/**
 * The network a scan runs on when we choose it (every customer scan; an admin's on Automatic):
 * home internet (Proxy-Seller) while its package has room for the whole scan, then mobile data
 * (VoidMob) for good. The first scan home internet can't fit turns mobileFirst on in the settings,
 * so a later top-up of Proxy-Seller doesn't bring home internet back (an admin can, in Ops).
 */

/** Data a point is allowed for when choosing (measured: about 20 MB on home internet, 22–28 MB on mobile). */
export const BYTES_PER_POINT = 30e6;
/** Kept back on top of a scan's allowance: on home internet, and on mobile data. */
const HOME_RESERVE = 0.3e9;
const MOBILE_RESERVE = 1e9;

export type NetworkHealth = {
  traffic?: { leftBytes: number | null; expires?: string | null } | null;
  mobileData?: boolean;
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
 * The choice itself. switchNow: this is the scan home internet first can't fit, so mobile data
 * becomes the network for good. Desktop scans stay on home internet (mobile data is for phones).
 * With mobile data off, not ready, low, or short of room for the scan, home internet is kept.
 */
export function pickNetwork(h: NetworkHealth, s: { mobileForCustomers: boolean; mobileFirst: boolean }, points: number, targetType: string, now = Date.now()): { network: 'residential' | 'mobile'; switchNow: boolean } {
  if (targetType.startsWith('desktop_')) return { network: 'residential', switchNow: false };
  const need = points * BYTES_PER_POINT;
  const mobileLeft = h?.mobileTraffic?.leftBytes;
  const mobileOk = s.mobileForCustomers && Boolean(h?.mobileData) && !h?.mobileTrafficLow && (typeof mobileLeft !== 'number' || mobileLeft >= need + MOBILE_RESERVE);
  if (s.mobileFirst) return { network: mobileOk ? 'mobile' : 'residential', switchNow: false };
  const home = h?.traffic;
  const ends = packageEnds(home?.expires);
  const homeOk = !(ends !== null && ends <= now) && (typeof home?.leftBytes !== 'number' || home.leftBytes >= need + HOME_RESERVE);
  if (homeOk || !mobileOk) return { network: 'residential', switchNow: false };
  return { network: 'mobile', switchNow: true };
}

const gbText = (b: number | null | undefined) => (typeof b === 'number' ? (b / 1e9).toFixed(b < 10e9 ? 2 : 1) + ' GB' : 'an unknown amount');

/** pickNetwork with today's settings and the worker's health report; keeps the switch and tells the admins once. */
export async function chooseNetwork(points: number, targetType: string): Promise<'residential' | 'mobile'> {
  const [settings, health] = await Promise.all([
    getSettings(),
    redis()
      .get('stakeout:health')
      .then((v) => (v ? (JSON.parse(v) as NetworkHealth) : null))
      .catch(() => null),
  ]);
  const pick = pickNetwork(health, settings, points, targetType);
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
