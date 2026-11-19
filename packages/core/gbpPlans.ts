/**
 * What a customer pays for on a Google listing, and what each plan lets them do.
 *
 * Connecting a Google account is free, and so is reading: every connected listing gets Search
 * insights. Doing things to a listing (edits, posts, review replies, the change watchdog, the
 * competitor gaps) is paid per listing per month. The more listings an account pays for, the less
 * each one costs: the whole count is charged at the rate of the bracket it lands in.
 */
export type Plan = 'MANAGE' | 'AGENT';
/** What a request needs: 'free' to read, 'manage' to change a listing, 'agent' to let an AI agent do it. */
export type Need = 'free' | 'manage' | 'agent';
export type Tier = { upTo: number | null; cents: number };

export const PLANS: Record<Plan, { name: string; blurb: string; available: boolean; lookupKey: string; tiers: Tier[] }> = {
  MANAGE: {
    name: 'Manage',
    blurb: 'Edits, posts, review replies, the change watchdog and competitor gaps.',
    available: true,
    lookupKey: 'stakeout_gbp_manage_v1',
    tiers: [{ upTo: 9, cents: 2900 }, { upTo: 24, cents: 2200 }, { upTo: 99, cents: 1600 }, { upTo: null, cents: 1200 }],
  },
  AGENT: {
    name: 'Agent',
    blurb: 'Everything in Manage, plus access for your own AI agents.',
    available: true,
    lookupKey: 'stakeout_gbp_agent_v1',
    tiers: [{ upTo: 9, cents: 5900 }, { upTo: 24, cents: 4500 }, { upTo: 99, cents: 3300 }, { upTo: null, cents: 2500 }],
  },
};

export const isPlan = (v: unknown): v is Plan => v === 'MANAGE' || v === 'AGENT';

/** The price of one listing a month when an account pays for `count` of them on this plan. */
export function unitCents(plan: Plan, count: number): number {
  const t = PLANS[plan].tiers;
  return (t.find((x) => x.upTo === null || count <= x.upTo) ?? t[t.length - 1]).cents;
}

/** The month's bill for these counts, in cents. */
export const monthlyCents = (counts: Partial<Record<Plan, number>>): number =>
  (['MANAGE', 'AGENT'] as Plan[]).reduce((sum, p) => sum + (counts[p] ?? 0) * unitCents(p, counts[p] ?? 0), 0);

/** The brackets as Stripe takes them for a volume-priced monthly price. */
export const stripeTiers = (plan: Plan) => PLANS[plan].tiers.map((t) => ({ up_to: t.upTo ?? 'inf', unit_amount: t.cents }));

export type PlanRow = { plan: string; status: string; endsAt: Date | null };
/** Subscription states in which paid features stay on. A failed card gets Stripe's retries before anything is switched off. */
const PAYING = new Set(['active', 'trialing', 'past_due']);

/**
 * The plan a listing is on right now, or null when it is on the free one. ACTIVE needs a paying
 * subscription; ENDING (taken off the plan) keeps working until the paid month runs out; PENDING
 * (checkout not finished) gives nothing.
 */
export function planNow(row: PlanRow | null | undefined, subStatus: string | null | undefined, now: Date): Plan | null {
  if (!row || !isPlan(row.plan)) return null;
  if (row.status === 'ACTIVE') return PAYING.has(subStatus ?? '') ? row.plan : null;
  if (row.status === 'ENDING') return row.endsAt && row.endsAt.getTime() > now.getTime() ? row.plan : null;
  return null;
}

/** Whether a listing on this plan (null = free) may do something that needs `need`. */
export function allows(plan: Plan | null, need: Need): boolean {
  if (need === 'free') return true;
  if (need === 'manage') return plan === 'MANAGE' || plan === 'AGENT';
  return plan === 'AGENT';
}

/** What to tell someone whose listing is not on the plan a feature needs. */
export const upgradeMessage = (need: Need) =>
  need === 'agent' ? 'This listing needs the Agent plan for that.' : 'This listing is on the free plan. Put it on the Manage plan to edit it, post to it, answer its reviews and watch it for changes.';

/**
 * What a subscription should hold for these listings, against what it holds now: the quantity per
 * plan, and whether the change adds listings (charged now) or only takes some away (no refund; they
 * keep working until the month ends).
 */
export function quantityPlan(rows: { plan: string; status: string }[], current: Partial<Record<Plan, number>>) {
  const want: Record<Plan, number> = { MANAGE: 0, AGENT: 0 };
  for (const r of rows) if (r.status === 'ACTIVE' && isPlan(r.plan)) want[r.plan]++;
  const grows = (['MANAGE', 'AGENT'] as Plan[]).some((p) => want[p] > (current[p] ?? 0));
  const same = (['MANAGE', 'AGENT'] as Plan[]).every((p) => want[p] === (current[p] ?? 0));
  return { want, grows, same, empty: want.MANAGE + want.AGENT === 0 };
}

export const dollars = (cents: number) => '$' + (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
