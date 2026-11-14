/**
 * Which phones to switch on and off (power saving). Phones are off while nothing is waiting, so
 * no phone sits on a residential proxy between scans; they are switched on when points arrive
 * and off again once the queue has been empty for a while.
 *
 * DuoPlus status codes: 1 on, 2 off, 10 powering on, 11 configuring (see PHONE_STATUS).
 */
export type PowerPhone = {
  id: string;
  status: number;
  /** Off, and allowed to be started (in scope, subscription not about to end, not paused by an admin). */
  canStart: boolean;
};

export type PowerPlan = { on: string[]; off: string[]; active: number; want: number };

const ACTIVE = new Set([1, 10, 11]);

export function planPower(input: {
  phones: PowerPhone[];
  /** Points waiting for a phone (queued or running scans, and re-runs). */
  pending: number;
  /** How long the queue has been empty. */
  idleMs: number;
  /** Empty for this long: switch the phones off. */
  idleOffMs: number;
  /** Never run more phones than this (MOBILE_CONCURRENCY); null = every phone. */
  max?: number | null;
  /** Phones a waiting point asked for by name (an admin test point on one phone). */
  mustIds?: string[];
}): PowerPlan {
  const { phones, pending, idleMs, idleOffMs } = input;
  const active = phones.filter((p) => ACTIVE.has(p.status));
  const startable = phones.filter((p) => p.status === 2 && p.canStart);
  if (pending > 0) {
    const cap = input.max && input.max > 0 ? input.max : Infinity;
    // One phone per waiting point, up to every phone there is: a single re-run starts one phone.
    const want = Math.min(pending, cap, active.length + startable.length);
    const must = startable.filter((p) => (input.mustIds ?? []).includes(p.id));
    const rest = startable.filter((p) => !must.includes(p));
    const extra = Math.max(0, want - active.length - must.length);
    return { on: [...must, ...rest.slice(0, extra)].map((p) => p.id), off: [], active: active.length, want };
  }
  // Nothing waiting: off once the queue has stayed empty long enough. A phone still starting up is
  // left to finish (DuoPlus refuses a power-off mid-start); the next look catches it.
  const off = idleMs >= idleOffMs ? phones.filter((p) => p.status === 1).map((p) => p.id) : [];
  return { on: [], off, active: active.length, want: 0 };
}
