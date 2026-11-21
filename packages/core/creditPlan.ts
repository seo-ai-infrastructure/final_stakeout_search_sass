/**
 * Monthly credit plans as subscriptions. Each paid month adds the plan's credits. Credits from a
 * plan are used before credits from packs, and what is left of them at renewal rolls over for one
 * more month at most: the carry-over is capped at one month's worth, and anything above that
 * lapses. When the subscription ends, what is left of the plan's credits lapses too. Credits from
 * packs, top-ups and grants never expire.
 *
 * An account has one balance. The plan's share of it is worked out, not stored per credit:
 *   `bucket`    plan credits the account held right after the last renewal (carry-over + the month's)
 *   `packFloor` the rest of the balance at that moment (pack credits)
 *   `bought`    pack credits added since then
 * Whatever the balance holds above `packFloor + bought` is plan credits not yet used.
 */
export type PlanState = { balance: number; bucket: number; packFloor: number; bought: number };

/** Plan credits not yet used: never below zero, never more than the plan put in. */
export function planRemaining(s: PlanState): number {
  return Math.max(0, Math.min(s.bucket, s.balance - s.packFloor - s.bought));
}

/** A paid month: the unused plan credits carry over up to one month's worth, the rest lapse, and the month's credits are added. */
export function renewPlan(s: PlanState, monthly: number) {
  const left = planRemaining(s);
  const carry = Math.min(left, monthly);
  const lapse = left - carry;
  const balance = s.balance - lapse + monthly;
  const bucket = carry + monthly;
  return { carry, lapse, grant: monthly, balance, bucket, packFloor: balance - bucket };
}

/**
 * Clients added mid-month: their sessions join the plan's share now. Nothing carries over or lapses
 * here; the next renewal treats them like the rest of the month's.
 */
export function topUpPlan(s: PlanState, extra: number) {
  const left = planRemaining(s);
  const balance = s.balance + extra;
  const bucket = left + extra;
  return { grant: extra, balance, bucket, packFloor: balance - bucket };
}

/** The subscription ended: the plan's unused credits lapse; pack credits stay. */
export function endPlan(s: PlanState) {
  const lapse = planRemaining(s);
  return { lapse, balance: s.balance - lapse, bucket: 0, packFloor: s.balance - lapse };
}

/**
 * Where sessions come from other than a plan: a plan's rollover never touches these. (Prospect
 * Audit Packs and the Black Friday bonus pack are valid for 90 days; everything else never expires.)
 */
export const PACK_REASONS = ['STRIPE_TOPUP', 'ADMIN_TOPUP', 'WELCOME_GRANT', 'BONUS_PACK', 'PAYPAL_TOPUP'];
/** Subscription states in which a plan has ended for good. */
export const PLAN_ENDED = new Set(['canceled', 'unpaid', 'incomplete_expired']);
