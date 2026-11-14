/**
 * How many grid points the worker runs at once: one per ready phone, so adding or removing a
 * phone needs no setting change. MOBILE_CONCURRENCY, when set to a whole number above zero, is a
 * ceiling the worker never exceeds (to hold phones back); unset or anything else means no ceiling.
 *
 * Never below one: with no phone ready for a moment the queue must still move when one returns.
 * Before the first fleet check the count is unknown (null): the ceiling, or three.
 */
export function targetConcurrency(readyPhones: number | null, ceiling: string | undefined): { n: number; capped: boolean } {
  const c = Number(ceiling);
  const cap = ceiling !== undefined && ceiling.trim() !== '' && Number.isInteger(c) && c > 0 ? c : null;
  if (readyPhones === null) return { n: cap ?? 3, capped: false };
  const want = Math.max(1, Math.floor(readyPhones));
  return cap !== null && want > cap ? { n: cap, capped: true } : { n: want, capped: false };
}
