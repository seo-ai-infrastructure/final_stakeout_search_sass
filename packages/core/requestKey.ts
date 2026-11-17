/**
 * The key a launch sends (Idempotency-Key), so a retried request never starts the same scan twice.
 * The page sends a UUID, or with several keywords one key per keyword: the UUID plus "-0", "-1"…
 * Pages loaded before v143 joined them with a colon ("…:0"), so a colon is accepted as well.
 */
export function requestKeyValid(key: string) {
  return /^[\w:-]{8,80}$/.test(key);
}
