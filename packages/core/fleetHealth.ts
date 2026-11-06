/**
 * Per-phone health rules. Pure functions so the worker and the admin API agree
 * and the rules can be unit-tested.
 */

/** Window of recent outcomes kept per phone: "S" success, "F" failure, newest last. */
export const OUTCOME_WINDOW = 20;

/**
 * Failures that say something about the PHONE. Proxy, location and fleet-capacity
 * failures are not the phone's fault and must not get a healthy phone paused.
 */
export function isDeviceAttributable(code: string) {
  return !/^(PROXY_|LOCATION_FROM_IP|ISP_TARGETING_NOT_CONFIGURED|NO_COMPATIBLE_DEVICE|DEVICE_WAIT_TIMEOUT|DEVICE_LEASE_LOST|UNSUPPORTED_SURFACE)/.test(
    code,
  );
}

export function nextOutcomes(previous: string, ok: boolean) {
  return (previous + (ok ? 'S' : 'F')).slice(-OUTCOME_WINDOW);
}

export function failureRate(outcomes: string) {
  if (!outcomes.length) return null;
  return [...outcomes].filter((c) => c === 'F').length / outcomes.length;
}

/**
 * A reason to auto-pause, or null. Needs at least `minSamples` recent pins so one
 * unlucky run never pauses a phone; then pauses at or above `threshold` failures.
 */
export function pauseReason(
  outcomes: string,
  threshold = Number(process.env.AUTO_PAUSE_FAILURE_RATE ?? 0.2),
  minSamples = Number(process.env.AUTO_PAUSE_MIN_PINS ?? 10),
) {
  const rate = failureRate(outcomes);
  if (rate === null || outcomes.length < minSamples || rate < threshold) return null;
  const failed = [...outcomes].filter((c) => c === 'F').length;
  return `${failed} of the last ${outcomes.length} pins failed`;
}

/** Nearest-rank percentile of a list of numbers; null for an empty list. */
export function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

/**
 * Phone time zone from the pin's state, so GPS, time zone and network agree
 * without an API call to look up the exit IP first. States split across zones
 * use the zone covering most of their population.
 */
const STATE_TZ: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago',
  CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York',
  DC: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu',
  ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis', IA: 'America/Chicago',
  KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago',
  MS: 'America/Chicago', MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago',
  NV: 'America/Los_Angeles', NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver',
  NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York',
  OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  UT: 'America/Denver', VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles',
  WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver', PR: 'America/Puerto_Rico',
};
export function stateTimezone(stateCode: string) {
  return STATE_TZ[stateCode.toUpperCase()] ?? 'America/New_York';
}


// ---------------------------------------------------------------------------
// Which DuoPlus phones may be used at all
// ---------------------------------------------------------------------------

/** DuoPlus phone status codes (cloudPhone/list and cloudPhone/status). */
export const PHONE_STATUS: Record<number, string> = {
  0: 'not configured',
  1: 'powered on',
  2: 'powered off',
  3: 'expired',
  4: 'renewal overdue',
  10: 'powering on',
  11: 'configuring',
  12: 'configuration failed',
};

/**
 * True when a phone's DuoPlus expiry ("2026-11-30 19:14:56", China time, GMT+8)
 * falls within the next `minutes`. Unknown or unreadable dates don't exclude a phone.
 */
export function expiresWithin(expiredAt: unknown, minutes: number, now = Date.now()) {
  if (typeof expiredAt !== 'string' || !expiredAt.trim()) return false;
  const iso = expiredAt.trim().replace(' ', 'T');
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + '+08:00');
  return Number.isFinite(t) && t - now <= minutes * 60000;
}

/**
 * A phone the worker may use: powered on, connected, ADB switched on with an address,
 * and not about to expire. Fields DuoPlus doesn't return are not held against a phone.
 */
export function phoneUsable(
  item: { status?: unknown; link_status?: unknown; adb_status?: unknown; adb?: unknown; expired_at?: unknown },
  now = Date.now(),
) {
  if (Number(item.status) !== 1) return { ok: false, why: PHONE_STATUS[Number(item.status)] ?? 'status ' + String(item.status) };
  if (item.link_status !== undefined && item.link_status !== null && String(item.link_status) !== '1')
    return { ok: false, why: 'not connected' };
  if (item.adb_status !== undefined && item.adb_status !== null && String(item.adb_status) !== '1')
    return { ok: false, why: 'ADB switched off' };
  if (!item.adb) return { ok: false, why: 'no ADB address' };
  if (expiresWithin(item.expired_at, 30, now)) return { ok: false, why: 'expires within 30 minutes' };
  return { ok: true, why: '' };
}


/**
 * Which DuoPlus phones Stakeout may use and set up. With DUOPLUS_PHONE_IDS set
 * ("x0Puo,UXsp5,AbC12") only those; otherwise every phone on the account that is on.
 */
export function phoneInScope(imageId: string, env: { DUOPLUS_PHONE_IDS?: string } = process.env) {
  const ids = (env.DUOPLUS_PHONE_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return ids.length === 0 || ids.includes(imageId);
}


/**
 * The DuoPlus ADB whitelist to set: the worker's own public IP first, then any
 * addresses listed in DUOPLUS_ADB_WHITELIST_EXTRA. DuoPlus replaces the whole list
 * on every call and keeps at most 10, so extras are how other machines keep access.
 */
export function adbWhitelist(ownIp: string, extra = '') {
  const valid = (ip: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
  const list = [ownIp, ...extra.split(',').map((s) => s.trim())].filter(valid);
  return [...new Set(list)].slice(0, 10);
}
