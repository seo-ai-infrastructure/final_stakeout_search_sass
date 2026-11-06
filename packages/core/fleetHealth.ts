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
