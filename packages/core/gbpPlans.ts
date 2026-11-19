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
    // Not on sale: agent access is to come back as one flat add-on for any number of listings.
    available: false,
    lookupKey: 'stakeout_gbp_agent_v1',
    tiers: [{ upTo: 9, cents: 5900 }, { upTo: 24, cents: 4500 }, { upTo: 99, cents: 3300 }, { upTo: null, cents: 2500 }],
  },
};

/**
 * AI agents: one flat price a month for the whole account, however many listings it has. With it,
 * the account's own agents can run scans and read Search Console and Analytics, and work on every
 * listing that is on the Manage plan.
 */
export const AGENT_ADDON = { name: 'AI agents', cents: 4700, lookupKey: 'stakeout_agent_addon_v1' };

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

/** Whether a listing on this plan (null = free) may do something that needs `need`. `addon`: the account has the AI agents add-on. */
export function allows(plan: Plan | null, need: Need, addon = false): boolean {
  if (need === 'free') return true;
  if (need === 'manage') return plan === 'MANAGE' || plan === 'AGENT';
  return plan === 'AGENT' || (addon && plan === 'MANAGE');
}
/** Whether the add-on on a subscription in this state counts: a failed card keeps it while Stripe retries. */
export const addonOn = (sub: { agentAddon?: boolean | null; status?: string | null } | null | undefined) => Boolean(sub?.agentAddon) && PAYING.has(sub?.status ?? '');

/** What to tell someone whose listing is not on the plan a feature needs. */
export const upgradeMessage = (need: Need) =>
  need === 'agent' ? 'Working on this listing through an agent needs the listing on the Manage plan and the AI agents add-on.' : 'This listing is on the free plan. Put it on the Manage plan to edit it, post to it, answer its reviews and watch it for changes.';

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

/** How long a Google Business connection may go without a paying listing before it is disconnected. */
export const UNPAID_DAYS = 7;
/** Subscription states that count as paying for this clock: a failed card (past_due) does not. */
const SETTLED = new Set(['active', 'trialing']);

/**
 * Whether a connection has a listing that is being paid for right now. Stricter than `planNow`:
 * a listing whose card has failed still works while Stripe retries, but the clock on its
 * connection starts. A listing taken off its plan counts until the month it paid for ends.
 */
export function connectionPaid(rows: PlanRow[], subStatus: string | null | undefined, now: Date): boolean {
  return rows.some((r) => isPlan(r.plan) && ((r.status === 'ACTIVE' && SETTLED.has(subStatus ?? '')) || (r.status === 'ENDING' && r.endsAt !== null && r.endsAt.getTime() > now.getTime())));
}

/**
 * What to do with a connection today. `unpaidSince` is when it last stopped having a paying
 * listing (null: it had one at the last look). Returns the new `unpaidSince`, and whether its
 * time is up.
 */
export function unpaidClock(paid: boolean, unpaidSince: Date | null, now: Date): { unpaidSince: Date | null; disconnect: boolean; daysLeft: number | null } {
  if (paid) return { unpaidSince: null, disconnect: false, daysLeft: null };
  const since = unpaidSince ?? now;
  const left = UNPAID_DAYS - (now.getTime() - since.getTime()) / 86400000;
  return { unpaidSince: since, disconnect: left <= 0, daysLeft: Math.max(0, Math.ceil(left)) };
}

/**
 * When a few more listings would cost the same or less: the whole count is charged at its
 * bracket's price, so just under a bracket the month is dearer than at it (9 at $29 is $261; 10 at
 * $22 is $220). The count to reach and what the month then costs, or null when there is no saving.
 */
export function tierNudge(plan: Plan, count: number): { count: number; cents: number; each: number; more: number } | null {
  if (count < 1) return null;
  const now = count * unitCents(plan, count);
  const tiers = PLANS[plan].tiers;
  const i = tiers.findIndex((t) => t.upTo === null || count <= t.upTo);
  const upTo = tiers[i]?.upTo;
  if (upTo === null || upTo === undefined) return null;
  const next = upTo + 1, cents = next * unitCents(plan, next);
  return cents <= now ? { count: next, cents, each: unitCents(plan, next), more: next - count } : null;
}

/**
 * After Stripe reports on a subscription: what to do with listings still waiting for a payment to
 * clear. Once the subscription holds enough seats for them they switch on; if it does not (the
 * payment lapsed), they are dropped.
 */
export function settlePending(seats: number, active: number, pending: number): 'activate' | 'drop' | 'none' {
  if (pending < 1) return 'none';
  return seats >= active + pending ? 'activate' : 'drop';
}
