/**
 * What a customer pays each month, per client, and what each seat comes with.
 *
 * Three seats, each priced per client per month on graduated brackets: a bracket's price applies
 * only to the clients inside it (the first 9 at the first price, the 10th to the 24th at the next,
 * and so on), so adding a client never makes the month cheaper.
 *   Scout      seats bought by number: 250 phone sessions a month each.
 *   Command    one Google listing switched on is one seat: 550 phone sessions a month (5 keywords
 *              weekly on a 5×5 plus two Scan Now 5×5s), and the listing tools (edits, posts,
 *              reviews, the change watchdog, rival gaps) and AI agents.
 *   Dominator  a listing on Dominator: everything in Command, with 1,250 phone sessions a month
 *              (10 keywords weekly on a 5×5 plus six Scan Now 5×5s).
 * A phone session is one real phone run at one grid point, Scan Now or scheduled: one pin, one session.
 * (`points` below is the same count: the name is kept because balances and the ledger store it.)
 * Connecting a Google account is free, and so is reading: every connected listing gets Search insights.
 * Manage (per listing, priced by volume, no points) is retired: Command replaced it. Agent was never sold.
 */
export type Plan = 'COMMAND' | 'DOMINATOR' | 'MANAGE' | 'AGENT' | 'LISTING';
/** The account plans sold from November 2026: one per account, priced per account, not per client. */
export type AccountPlan = 'P_SCOUT' | 'P_AGENCY' | 'P_SCALE' | 'P_MAX';
/** A priced line on the monthly subscription: an account plan, a listing plan, or (before the account plans) Scout seats. */
export type Line = Plan | 'SCOUT' | AccountPlan;
/** What a request needs: 'free' to read, 'manage' to change a listing, 'agent' to let an AI agent do it. */
export type Need = 'free' | 'manage' | 'agent';
export type Tier = { upTo: number | null; cents: number };
export type LineDef = {
  name: string;
  blurb: string;
  available: boolean;
  lookupKey: string;
  /** Each bracket's price for the clients inside it; otherwise the whole count at its bracket's price. */
  graduated: boolean;
  tiers: Tier[];
  /** Phone sessions a seat adds to the account's pool every paid month. */
  points: number;
  /** Briefs it adds every paid month (they roll over for one month, see briefWallet). */
  briefs: number;
};

/** What one Scan Now 5×5 costs: 25 grid points, one phone session each. */
export const SCAN_NOW_5X5 = 25;

export const PLANS: Record<Plan, LineDef> = {
  COMMAND: {
    name: 'Command',
    blurb: 'Weekly tracking plus the Google listing tools: rival gaps, safe edits, posts, review alerts and replies, the daily change watchdog, and AI agents.',
    available: true,
    lookupKey: 'stakeout_command_seat_v1',
    graduated: true,
    tiers: [{ upTo: 9, cents: 5900 }, { upTo: 24, cents: 4900 }, { upTo: 99, cents: 3900 }, { upTo: null, cents: 2900 }],
    points: 550,
  briefs: 0,
  },
  DOMINATOR: {
    name: 'Dominator',
    blurb: 'Everything in Command, with room for 10 weekly keywords or bigger grids, and six Scan Now 5×5s a month.',
    available: true,
    lookupKey: 'stakeout_dominator_seat_v1',
    graduated: true,
    tiers: [{ upTo: 9, cents: 9900 }, { upTo: 24, cents: 8500 }, { upTo: 99, cents: 6900 }, { upTo: null, cents: 5500 }],
    points: 1250,
  briefs: 0,
  },
  MANAGE: {
    name: 'Manage',
    blurb: 'Edits, posts, review replies, the change watchdog and competitor gaps.',
    // Retired: Command replaced it. Kept so a listing already on it keeps its name and its price.
    available: false,
    lookupKey: 'stakeout_gbp_manage_v1',
    graduated: false,
    tiers: [{ upTo: 9, cents: 2900 }, { upTo: 24, cents: 2200 }, { upTo: 99, cents: 1600 }, { upTo: null, cents: 1200 }],
    points: 0,
    briefs: 0,
  },
  AGENT: {
    name: 'Agent',
    blurb: 'Everything in Manage, plus access for your own AI agents.',
    // Never sold: agent access comes with Command, or as one flat add-on.
    available: false,
    lookupKey: 'stakeout_gbp_agent_v1',
    graduated: false,
    tiers: [{ upTo: 9, cents: 5900 }, { upTo: 24, cents: 4500 }, { upTo: 99, cents: 3300 }, { upTo: null, cents: 2500 }],
    points: 0,
    briefs: 0,
  },
  LISTING: {
    name: 'Listing add-on',
    blurb: 'One Google listing with the listing tools (safe edits, posts, review alerts and replies, the daily change watchdog, rival gaps) and AI agents, plus 50 phone sessions and 1 brief credit a month.',
    available: true,
    lookupKey: 'stakeout_listing_addon_v1',
    graduated: false,
    tiers: [{ upTo: null, cents: 2900 }],
    points: 50,
    briefs: 1,
  },
};

/** Scout: seats bought by number, for clients whose Google listing is not worked on here. */
export const SCOUT: LineDef = {
  name: 'Scout',
  blurb: 'Light tracking: 5 keywords every other week on a 5×5, or 6 weekly on a 3×3. AI Overview and Map Pack tracking, a recording at every point, the buying-power map, share links, Search Console and Analytics.',
  available: true,
  lookupKey: 'stakeout_scout_seat_v1',
  graduated: true,
  tiers: [{ upTo: 9, cents: 3900 }, { upTo: 24, cents: 3200 }, { upTo: 99, cents: 2600 }, { upTo: null, cents: 1900 }],
  points: 250,
  briefs: 0,
};

/**
 * The account plans (from November 2026, for new accounts; seats stay with those who have them).
 * One per account, flat, monthly or yearly. `rollover`: how many months' worth of unused plan
 * sessions carry into the next month (0: they reset; briefs carry one month whenever sessions do).
 * `founding`: the plan earns the founding bonus (FOUNDING) for the first accounts on it.
 * White label is set up by us for accounts on a plan with `whiteLabel`.
 */
export const ACCOUNT_PLANS: Record<AccountPlan, LineDef & { whiteLabel: boolean; bestFor: string; rollover: { month: number; year: number }; founding: boolean; /** People who can sign in to the account, the owner included (null: no limit). */ seats: number | null; /** Distinct businesses scanned a billing month (null: no limit; see locations.ts). */ locations: number | null; /** Its points go first in the scan queue and at the 5G lane door. */ priority: boolean }> = {
  P_SCOUT: { name: 'Scout', blurb: 'For solo consultants and in-house marketers.', bestFor: 'Solo and in-house', available: true, lookupKey: 'stakeout_plan_scout_v4', graduated: false, tiers: [{ upTo: null, cents: 9700 }], points: 800, briefs: 1, whiteLabel: false, rollover: { month: 0, year: 1 }, founding: false, seats: 1, locations: 5, priority: false },
  P_AGENCY: { name: 'Agency', blurb: 'For growing agencies.', bestFor: 'Growing agencies', available: true, lookupKey: 'stakeout_plan_agency_v3', graduated: false, tiers: [{ upTo: null, cents: 19700 }], points: 2000, briefs: 5, whiteLabel: true, rollover: { month: 1, year: 1 }, founding: true, seats: 5, locations: 20, priority: false },
  P_SCALE: { name: 'Scale', blurb: 'For multi-market teams.', bestFor: 'Multi-market teams', available: true, lookupKey: 'stakeout_plan_scale_v3', graduated: false, tiers: [{ upTo: null, cents: 29700 }], points: 3500, briefs: 20, whiteLabel: true, rollover: { month: 2, year: 2 }, founding: true, seats: 15, locations: 50, priority: true },
  P_MAX: { name: 'Agency Max', blurb: 'For large portfolios.', bestFor: 'Large portfolios', available: true, lookupKey: 'stakeout_plan_max_v1', graduated: false, tiers: [{ upTo: null, cents: 49700 }], points: 6500, briefs: 40, whiteLabel: true, rollover: { month: 2, year: 2 }, founding: true, seats: null, locations: null, priority: true },
};
/** Cheapest first. */
export const ACCOUNT_PLAN_ORDER: AccountPlan[] = ['P_SCOUT', 'P_AGENCY', 'P_SCALE', 'P_MAX'];
export const isAccountPlan = (v: unknown): v is AccountPlan => v === 'P_SCOUT' || v === 'P_AGENCY' || v === 'P_SCALE' || v === 'P_MAX';
/** The next plan up, for the nudges when buying sessions costs about as much as upgrading. */
export const nextPlan = (p: AccountPlan | null): AccountPlan | null => (p ? ACCOUNT_PLAN_ORDER[ACCOUNT_PLAN_ORDER.indexOf(p) + 1] ?? null : null);
/**
 * Team members an account may add besides its owner: its plan's seats less one (Agency Max: no limit).
 * Without a plan, or on Scout, none.
 */
export const memberSeats = (plan: AccountPlan | null | undefined) => (!plan ? 0 : ACCOUNT_PLANS[plan].seats === null ? Infinity : Math.max(0, (ACCOUNT_PLANS[plan].seats as number) - 1));
/**
 * The most unused plan sessions a renewal keeps: the plan's rollover months times what the account
 * actually gets a month (`monthly`: the founding bonus and listing add-ons included), so a founding
 * Agency banks up to 2,500, a founding Scale 8,750 and a founding Agency Max 16,250.
 */
export const carryCap = (plan: AccountPlan | null | undefined, interval: 'month' | 'year', monthly: number) => rolloverMonths(plan, interval) * Math.max(0, monthly);
/** Months' worth of unused plan sessions a renewal carries over: the plan's, monthly or yearly (seats from before the plans: one). */
export const rolloverMonths = (plan: AccountPlan | null | undefined, interval: 'month' | 'year') => (plan ? ACCOUNT_PLANS[plan].rollover[interval] : 1);

export const LINES: Record<Line, LineDef> = { ...PLANS, SCOUT, ...ACCOUNT_PLANS };
/** The order lines appear in, at checkout and on the subscription. */
export const LINE_ORDER: Line[] = ['P_MAX', 'P_SCALE', 'P_AGENCY', 'P_SCOUT', 'LISTING', 'DOMINATOR', 'COMMAND', 'SCOUT', 'MANAGE', 'AGENT'];
/** The seats sold before the account plans: kept for the accounts that have them. */
export const LEGACY_LINES: Line[] = ['DOMINATOR', 'COMMAND', 'SCOUT', 'MANAGE', 'AGENT'];
/** The seats on sale, most capable first. */
export const SEATS: Line[] = ['DOMINATOR', 'COMMAND', 'SCOUT'];

/**
 * AI agents come with any listing on Command or Dominator. This add-on is for an account with no
 * listing on a plan: one flat price a month for its agents to run scans and read Search Console and Analytics.
 */
export const AGENT_ADDON = { name: 'AI agents', cents: 4700, lookupKey: 'stakeout_agent_addon_v1' };

export const isPlan = (v: unknown): v is Plan => v === 'COMMAND' || v === 'DOMINATOR' || v === 'MANAGE' || v === 'AGENT' || v === 'LISTING';
export const isLine = (v: unknown): v is Line => v === 'SCOUT' || isPlan(v) || isAccountPlan(v);

/** The price of the `count`th client a month: its bracket's price (on a volume line, every client's). */
export function unitCents(line: Line, count: number): number {
  const t = LINES[line].tiers;
  return (t.find((x) => x.upTo === null || count <= x.upTo) ?? t[t.length - 1]).cents;
}

/** A month of `count` clients on one line, in cents. */
export function lineCents(line: Line, count: number): number {
  const n = Math.max(0, Math.floor(count));
  const def = LINES[line];
  if (!def.graduated) return n * unitCents(line, n);
  let total = 0, from = 0;
  for (const t of def.tiers) {
    const to = t.upTo === null ? n : Math.min(n, t.upTo);
    if (to > from) total += (to - from) * t.cents;
    if (t.upTo === null || n <= t.upTo) break;
    from = t.upTo;
  }
  return total;
}

/** The month's bill for these counts, in cents. */
export const monthlyCents = (counts: Partial<Record<Line, number>>): number => LINE_ORDER.reduce((sum, l) => sum + lineCents(l, counts[l] ?? 0), 0);

/** What `more` clients on top of `have` add to the month, in cents. */
export const addedCents = (line: Line, have: number, more = 1) => lineCents(line, have + more) - lineCents(line, have);

/** Seats that count as clients (white-label is free from 10). */
export const clientSeats = (counts: Partial<Record<Line, number>>) => SEATS.reduce((n, l) => n + Math.max(0, counts[l] ?? 0), 0);

/** Phone sessions a month for these seats. */
export const seatPoints = (counts: Partial<Record<Line, number>>) => LINE_ORDER.reduce((n, l) => n + Math.max(0, counts[l] ?? 0) * LINES[l].points, 0);
/**
 * Founding members: the first `seats` accounts to start a plan that earns it (Agency, Scale, Agency
 * Max) get `bonus` more of that plan's phone sessions every month, for as long as they are on one
 * of those plans (the listing add-on's are not raised).
 */
export const FOUNDING = { seats: 15, bonus: 0.25 };
/** The plans that earn the founding bonus, cheapest first. */
export const FOUNDING_PLANS: AccountPlan[] = ACCOUNT_PLAN_ORDER.filter((p) => ACCOUNT_PLANS[p].founding);
/** The founding bonus a month for these lines. */
export const foundingBonus = (counts: Partial<Record<Line, number>>) => FOUNDING_PLANS.reduce((n, l) => n + Math.max(0, counts[l] ?? 0) * Math.round(LINES[l].points * FOUNDING.bonus), 0);
/** Phone sessions a month for these lines, with the founding bonus when the account has it. */
export const monthlyPoints = (counts: Partial<Record<Line, number>>, founding: boolean) => seatPoints(counts) + (founding ? foundingBonus(counts) : 0);

/** Paying for a year: twelve months for the price of this many. */
export const ANNUAL_MONTHS_PAID = 10;
export type BillingInterval = 'month' | 'year';
export const isInterval = (v: unknown): v is BillingInterval => v === 'month' || v === 'year';
/** Stripe's lookup key for the yearly price of a line (or of the AI agents add-on). */
export const annualKey = (lookupKey: string) => lookupKey + '_annual';
/** Lines that can be paid for a year at a time: the account plans and the listing add-on. */
export const yearlyLine = (l: Line) => isAccountPlan(l) || l === 'LISTING';
/** A year of a plan, in cents. */
export const yearCents = (plan: AccountPlan) => ACCOUNT_PLANS[plan].tiers[0].cents * ANNUAL_MONTHS_PAID;

/**
 * `k` months after `t` (Unix seconds, UTC), as Stripe counts a billing month: the same day of the
 * month, or the month's last day when it is shorter (the 31st, then the 28th or 29th, 31st...).
 */
export function addMonths(t: number, k: number): number {
  const d = new Date(t * 1000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + k;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.floor(Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()) / 1000);
}
/** Which month of a yearly period starting at `start` the moment `at` falls in: 0 for the first. */
export function monthIndex(start: number, at: number): number {
  let k = 0;
  while (k < 1200 && addMonths(start, k + 1) <= at) k++;
  return k;
}
/** The billing month of a yearly period (start, end) that `at` falls in, as Unix seconds. */
export function monthWindow(start: number, end: number, at: number): { from: number; to: number; k: number } {
  const k = monthIndex(start, at);
  return { from: addMonths(start, k), to: Math.min(addMonths(start, k + 1), end), k };
}

/** Briefs a month for these lines (an account plan's, plus one for each listing add-on). */
export const seatBriefs = (counts: Partial<Record<Line, number>>) => LINE_ORDER.reduce((n, l) => n + Math.max(0, counts[l] ?? 0) * LINES[l].briefs, 0);
/** The account plan on a subscription, from its lines. */
export const accountPlanOf = (counts: Partial<Record<Line, number>>): AccountPlan | null => ACCOUNT_PLAN_ORDER.slice().reverse().find((l) => (counts[l] ?? 0) > 0) ?? null;
/** Whether these lines hold any seat sold before the account plans. */
export const hasLegacySeats = (counts: Partial<Record<Line, number>>) => LEGACY_LINES.some((l) => (counts[l] ?? 0) > 0);

/** The brackets as Stripe takes them for a tiered monthly price. */
export const stripeTiers = (line: Line) => LINES[line].tiers.map((t) => ({ up_to: t.upTo ?? 'inf', unit_amount: t.cents }));

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

/**
 * Whether a listing on this plan (null = free) may do something that needs `need`. A listing on a
 * paid plan can be worked on by the account's own AI agents too: agent access comes with Command.
 */
export function allows(plan: Plan | null, need: Need): boolean {
  if (need === 'free') return true;
  return isPlan(plan);
}
/** Whether the add-on on a subscription in this state counts: a failed card keeps it while Stripe retries. */
export const addonOn = (sub: { agentAddon?: boolean | null; status?: string | null } | null | undefined) => Boolean(sub?.agentAddon) && PAYING.has(sub?.status ?? '');

/** What to tell someone whose listing is not on the plan a feature needs. */
export const upgradeMessage = (need: Need) =>
  need === 'agent' ? 'An agent can work on a listing once the listing is on a paid plan. Choose one on the Plan tab of Google profiles.' : 'This listing is on the free plan. Put it on a paid plan on the Plan tab of Google profiles to edit it, post to it, answer its reviews and watch it for changes.';

/**
 * What a subscription should hold, against what it holds now: one seat per listing on each plan,
 * `scout` Scout seats and the `account` plan (each left as it is when not given). Whether the change adds seats
 * (charged now) or only takes some away (no refund; listings keep working until the month ends).
 */
export function quantityPlan(rows: { plan: string; status: string }[], current: Partial<Record<Line, number>>, scout?: number, account?: AccountPlan | null) {
  // The account plan: the one asked for (null takes it off), or the one on the subscription now.
  const plan = account === undefined ? accountPlanOf(current) : account;
  const want: Record<Line, number> = { DOMINATOR: 0, COMMAND: 0, MANAGE: 0, AGENT: 0, LISTING: 0, SCOUT: Math.max(0, Math.floor(scout ?? current.SCOUT ?? 0)), P_SCOUT: plan === 'P_SCOUT' ? 1 : 0, P_AGENCY: plan === 'P_AGENCY' ? 1 : 0, P_SCALE: plan === 'P_SCALE' ? 1 : 0, P_MAX: plan === 'P_MAX' ? 1 : 0 };
  for (const r of rows) if (r.status === 'ACTIVE' && isPlan(r.plan)) want[r.plan]++;
  const grows = LINE_ORDER.some((l) => want[l] > (current[l] ?? 0));
  const same = LINE_ORDER.every((l) => want[l] === (current[l] ?? 0));
  return { want, grows, same, empty: LINE_ORDER.every((l) => want[l] === 0) };
}

export const dollars = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });

/** How long a Google Business connection that once had a paying listing may go without one before it is disconnected. */
export const UNPAID_DAYS = 7;
/**
 * How long a connection that has never been paid for is kept, in minutes: long enough to pick
 * listings and get through checkout. Each connection costs us a seat with the connection service,
 * so one made to look around is given back quickly.
 */
export const UNPAID_FIRST_MINUTES = 60;
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
 * time is up. `everPaid`: the account has completed a checkout at some point.
 */
export function unpaidClock(paid: boolean, unpaidSince: Date | null, now: Date, everPaid = true): { unpaidSince: Date | null; disconnect: boolean; daysLeft: number | null; minutesLeft: number | null } {
  if (paid) return { unpaidSince: null, disconnect: false, daysLeft: null, minutesLeft: null };
  const since = unpaidSince ?? now;
  // An account that has never completed a checkout gets an hour; one that paid before gets the week.
  const allowed = everPaid ? UNPAID_DAYS * 1440 : UNPAID_FIRST_MINUTES;
  const left = allowed - (now.getTime() - since.getTime()) / 60000;
  return { unpaidSince: since, disconnect: left <= 0, daysLeft: Math.max(0, Math.ceil(left / 1440)), minutesLeft: Math.max(0, Math.ceil(left)) };
}

/**
 * When a few more listings would cost the same or less, on a line priced by volume (the whole count
 * at its bracket's price, so just under a bracket the month is dearer than at it: 9 at $29 is $261,
 * 10 at $22 is $220). The count to reach and what the month then costs, or null when there is no
 * saving. Graduated lines have no such cliff.
 */
export function tierNudge(line: Line, count: number): { count: number; cents: number; each: number; more: number } | null {
  if (count < 1 || LINES[line].graduated) return null;
  const now = lineCents(line, count);
  const tiers = LINES[line].tiers;
  const i = tiers.findIndex((t) => t.upTo === null || count <= t.upTo);
  const upTo = tiers[i]?.upTo;
  if (upTo === null || upTo === undefined) return null;
  const next = upTo + 1, cents = lineCents(line, next);
  return cents <= now ? { count: next, cents, each: unitCents(line, next), more: next - count } : null;
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

/**
 * What a paid invoice of the monthly subscription adds to the account's points. A new subscription
 * or a renewal: the month's points for every seat (last month's unused ones roll over, see
 * creditPlan.ts). A mid-month invoice for added seats: their points in proportion to the part of
 * the month left, the same share Stripe charges for them, so seats added late in a month buy only
 * what they pay for. `monthly`: the subscription's points a month now. `granted`: the monthly
 * points this month has already covered. `share`: the part of the month left (0 to 1).
 */
export function seatGrant(billingReason: string | null | undefined, monthly: number, granted: number, share = 1): { renew: boolean; points: number; granted: number } | null {
  const m = Math.max(0, Math.floor(monthly));
  if (billingReason === 'subscription_create' || billingReason === 'subscription_cycle') return { renew: true, points: m, granted: m };
  if (billingReason === 'subscription_update' && m > granted) return { renew: false, points: Math.round((m - Math.max(0, granted)) * Math.min(1, Math.max(0, share))), granted: m };
  return null;
}
