/**
 * Briefs an account can compile. Three kinds, spent in this order:
 *   carry   last month's plan briefs still unused (they roll over for one month, then lapse);
 *   plan    this month's plan briefs (an account plan's, plus one for each listing add-on);
 *   bought  brief packs and the Closer Pack's brief, which never expire.
 * A compiled brief is kept for good either way; this is only about what compiling one uses.
 */
export type PlanBriefs = { plan: number; carry: number; granted: number };
export type BriefSource = 'carry' | 'plan' | 'bought';

/**
 * What a paid invoice of the monthly subscription does to the plan's briefs. A new subscription:
 * the month's briefs. A renewal: the month's briefs, and last month's unused ones carried over (any
 * carried before that lapse). A mid-month invoice for added lines: the briefs they bring, in full.
 * `monthly`: the subscription's briefs a month now; `granted`: what this month has already covered.
 */
export function briefGrant(billingReason: string | null | undefined, monthly: number, now: PlanBriefs): PlanBriefs | null {
  const m = Math.max(0, Math.floor(monthly));
  if (billingReason === 'subscription_create') return { plan: m, carry: 0, granted: m };
  if (billingReason === 'subscription_cycle') return { plan: m, carry: Math.max(0, now.plan), granted: m };
  if (billingReason === 'subscription_update' && m > now.granted) return { plan: Math.max(0, now.plan) + (m - Math.max(0, now.granted)), carry: Math.max(0, now.carry), granted: m };
  return null;
}

/** Which kind of brief compiling one uses now, or null when there is none left. Plan briefs need a paying subscription. */
export function briefSource(w: { plan: number; carry: number; bought: number; paying: boolean }): BriefSource | null {
  if (w.paying && w.carry > 0) return 'carry';
  if (w.paying && w.plan > 0) return 'plan';
  if (w.bought > 0) return 'bought';
  return null;
}

/** All the briefs that can be compiled now. */
export const briefsLeft = (w: { plan: number; carry: number; bought: number; paying: boolean }) => (w.paying ? Math.max(0, w.plan) + Math.max(0, w.carry) : 0) + Math.max(0, w.bought);
