/**
 * Per-phone health rules. Pure functions so the worker and the admin API agree
 * and the rules can be unit-tested.
 */

/** Window of recent outcomes kept per phone: "S" success, "F" failure, newest last. */
const OUTCOME_WINDOW = 20;

/**
 * Failures that say something about the PHONE. Proxy, location and fleet-capacity
 * failures are not the phone's fault and must not get a healthy phone paused.
 */
export function isDeviceAttributable(code: string) {
  // Not the phone's fault: proxy/location problems, waiting for phones, storage (R2/S3) and
  // credential errors, DuoPlus API refusals and phones still applying settings.
  // LOCATION_* is about how Google described the place (or a proxy's location), not the phone itself.
  return !/^(CANCELLED|PROXY_|LOCATION_|ISP_TARGETING_NOT_CONFIGURED|NO_COMPATIBLE_DEVICE|DEVICE_WAIT_TIMEOUT|DEVICE_LEASE_LOST|UNSUPPORTED_SURFACE|R2_|NoSuchBucket|NoSuchKey|AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch|InvalidArgument|InvalidBucketName|CredentialsProviderError|Credential|DuoPlus|DUOPLUS_|PHONE_STILL_CONFIGURING|PHONE_NOT_READY)/.test(
    code,
  );
}

/**
 * A short code for why a point failed. Errors from libraries (e.g. the S3 client's
 * "NoSuchBucket") carry their real type in `name`; our own errors start with a CODE.
 */
export function failureCode(e: unknown): string {
  if (!(e instanceof Error)) return 'PIN_FAILED';
  if (e.name && e.name !== 'Error') return e.name;
  return e.message.split(' ')[0] || 'PIN_FAILED';
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

/** Redis keys shared by the worker and the admin API. */
export const probationKey = (imageId: string) => 'stakeout:probation:' + imageId;
export const autoResumeKey = (imageId: string) => 'stakeout:autoresumes:' + imageId;

/**
 * A phone resumed automatically is on probation until it has run 10 pins: two failures in that
 * time pause it again straight away, instead of after the usual ten-pin window.
 */
export function probationReason(outcomes: string, failures = 2, length = 10) {
  if (outcomes.length > length) return null;
  const failed = [...outcomes].filter((c) => c === 'F').length;
  return failed >= failures ? `${failed} of its first ${outcomes.length} pins after an automatic resume failed` : null;
}

/**
 * A failure that `minPhones` or more OTHER phones also had in the last few minutes says something
 * about the search (Google changed a page, the template, the proxies), not about this phone, so
 * it is not held against the phone.
 */
export function fleetWideFailure(otherPhones: number, minPhones = Number(process.env.FLEET_WIDE_FAIL_PHONES ?? 3)) {
  return minPhones > 0 && otherPhones >= minPhones;
}

/**
 * What to do with an auto-paused phone: resume it once it has rested `minutes`, at most `max`
 * times a day (a phone that keeps failing then waits for an admin).
 */
export function autoResumeDecision(x: { pausedAt: Date; now: number; minutes: number; resumesToday: number; max: number }): 'resume' | 'wait' | 'hold' {
  if (!(x.minutes > 0) || x.resumesToday >= x.max) return 'hold';
  return x.now - x.pausedAt.getTime() >= x.minutes * 60000 ? 'resume' : 'wait';
}

/**
 * One phone's power state from a cloudPhone/status response ({data: {list: [{id, status}]}}, one
 * request for many phones). Null when the phone is not in the response.
 */
export function readPhoneStatus(res: any, imageId: string, asked = 1): { on: boolean; status: string } | null {
  const data = res?.data;
  const items: any[] = Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : data && typeof data === 'object' && 'status' in data ? [data] : [];
  const item = items.find((i) => String(i?.id ?? i?.image_id ?? '') === imageId) ?? (asked === 1 && items.length === 1 ? items[0] : null);
  if (!item || item.status === undefined || item.status === null) return null;
  const code = Number(item.status);
  return { on: code === 1, status: PHONE_STATUS[code] ?? 'status ' + String(item.status) };
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
const PHONE_STATUS: Record<number, string> = {
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
export function phoneInScope(imageId: string, env: Record<string, string | undefined> = process.env) {
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


/**
 * A phone's ADB endpoint refused us: the connection failed, or the phone shows as offline or
 * missing. DuoPlus can still report such a phone as on; switching it off and on resets ADB.
 */
export function adbUnreachable(message: string) {
  return /ADB_CONNECT_FAILED|device offline|device '[^']*' not found|no devices\/emulators found/i.test(message);
}

/**
 * When the worker restarts a phone whose ADB refuses it: after 2 refusals within 10 minutes; at most
 * once every 20 minutes and 6 times a day per phone; no new points for 5 minutes while it boots.
 * When more than `fleetWide` phones are refused within 5 minutes the connection is at fault (the
 * DuoPlus ADB whitelist, the network), not the phones: nothing is restarted, the admins are told.
 */
export const ADB_RESTART = { strikes: 2, strikeWindowSec: 600, gapSec: 1200, perDay: 6, restSec: 300, offForMs: 30000, fleetWide: 3, fleetWindowSec: 300, powerOnTries: 3 } as const;

/** Whether ADB refusals from this many phones at once point at the connection rather than the phones. */
export const adbFleetWide = (phones: number) => phones > ADB_RESTART.fleetWide;

/** IPv4 addresses DuoPlus names when it refuses a phone action ("… is not allowed to access"). */
export const refusedAddresses = (text: string) =>
  /not allowed to access/i.test(text) ? [...new Set(text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? [])] : [];

/**
 * At worker start: phones whose last point failed on ADB within the hour, with no success since.
 * They were stuck when the worker stopped, so they are restarted straight away.
 */
export function stuckOnAdb(phones: { imageId: string; isEnabled: boolean; lastFailureCode: string | null; lastFailureAt: Date | null; lastSuccessAt: Date | null }[], now = Date.now()) {
  return phones
    .filter((d) => d.isEnabled && d.lastFailureCode === 'ADB_COMMAND_FAILED' && d.lastFailureAt && now - d.lastFailureAt.getTime() <= 3600000)
    .filter((d) => !d.lastSuccessAt || d.lastSuccessAt < d.lastFailureAt!)
    .map((d) => d.imageId);
}


/** The Eastern-time day ("2026-11-24") and hour (0-23) of a moment. */
export function easternDayHour(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}

/**
 * The nightly phone restart: the Eastern day to run it for when `now` is within the restart hour
 * (midnight by default) and it hasn't run that day; otherwise null.
 */
export function nightlyRestartDue(now: Date, hourEt: number, lastDoneDay: string | null): string | null {
  const { day, hour } = easternDayHour(now);
  return hour === hourEt && lastDoneDay !== day ? day : null;
}
