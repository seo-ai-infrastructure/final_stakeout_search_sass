/** Marks a point the worker queues again straight away; the worker clears it once queued. */
export const RERUN_MARKER = 'RERUN_REQUESTED';

/** Credits to re-run failed points: the normal price per point, only for points that were refunded. */
export function rerunCharge(points: { isRefunded: boolean }[], creditsCharged: number, totalPins: number) {
  const perPoint = totalPins > 0 ? creditsCharged / totalPins : 0;
  const refunded = points.filter((p) => p.isRefunded).length;
  return { perPoint, refunded, credits: perPoint * refunded };
}
