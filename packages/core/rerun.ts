/** Marks a point the worker queues again straight away; the worker clears it once queued. */
export const RERUN_MARKER = 'RERUN_REQUESTED';

/** Credits to re-run failed points: the normal price per point, only for points that were refunded. */
export function rerunCharge(points: { isRefunded: boolean }[], creditsCharged: number, totalPins: number) {
  const perPoint = totalPins > 0 ? creditsCharged / totalPins : 0;
  const refunded = points.filter((p) => p.isRefunded).length;
  return { perPoint, refunded, credits: perPoint * refunded };
}

/**
 * The ISP a re-run point should use. A point that failed for want of a working proxy would fail
 * the same way on the same ISP, so in "Mix of ISPs" mode it moves to the next ISP of the scan's
 * mix (or any ISP when the mix has no other). A single chosen ISP (mode "single") is kept, and
 * points that failed for other reasons keep theirs.
 */
export function rerunIsp(current: string | null, mode: string | null, isps: unknown, lastError: string | null): string | null {
  if (mode !== 'mix' || !/^(PROXY_|ISP_)/.test(lastError ?? '')) return current;
  const mix = Array.isArray(isps) ? isps.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  const others = mix.filter((x) => x !== current);
  if (!others.length) return '';
  const at = mix.indexOf(current ?? '');
  return at < 0 ? others[0] : (mix.slice(at + 1).find((x) => x !== current) ?? others[0]);
}
