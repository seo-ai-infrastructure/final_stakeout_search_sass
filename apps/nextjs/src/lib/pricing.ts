/**
 * The one price list for things bought once: the pricing page and the checkout both read it, so
 * they cannot disagree. Amounts are in US cents. Each item is identified at checkout by its key.
 * Monthly seats (Scout, Command, Dominator) are in packages/core/gbpPlans.ts.
 *
 * A phone session is one real Android phone run at one grid point, Scan Now or scheduled: one 5×5
 * is 25 phone sessions. (`credits` on an item is its phone sessions: the name is kept because orders
 * and the ledger store it under that name. Customers never see the word.)
 */
export type PriceItem = { key: string; name: string; credits: number; cents: number; blurb: string; /** Points that run out this many days after purchase. */ validityDays?: number; /** Briefs it adds (they never expire). */ briefs?: number; featured?: boolean };

/** One Scan Now 5×5: 25 grid points, one phone session each. */
export const SCAN_NOW_5X5_POINTS = 25;

/**
 * The way in: one Scan Now 5×5 audit (25 phone sessions) for $5, once per account and once per card, run
 * again free a week later. The $5 comes off the first month of a first seat (FIRST_AUDIT_COUPON).
 */
export const WELCOME: PriceItem = {
  key: 'welcome',
  name: 'First 5×5 audit',
  credits: SCAN_NOW_5X5_POINTS,
  cents: 500,
  blurb: 'One time: a full 5×5 audit on real phones, run right away and again free a week later. Your $5 comes off your first month on any seat.',
};
/** The Stripe coupon that takes a first audit's $5 off the first month of a first seat. */
export const FIRST_AUDIT_COUPON = 'stakeout_first_audit_5';

/** Prospect audits: Scan Now 5×5s for pitches, no subscription needed. Valid for 90 days. */
export const PROSPECT_PACKS: (PriceItem & { audits: number; saves: number; featured?: boolean })[] = [
  { key: 'prospect-1', name: '1 prospect audit', audits: 1, credits: SCAN_NOW_5X5_POINTS, cents: 1500, saves: 0, validityDays: 90, blurb: 'One Scan Now 5×5 audit for a pitch.' },
  { key: 'prospect-5', name: '5 prospect audits', audits: 5, credits: 5 * SCAN_NOW_5X5_POINTS, cents: 4900, saves: 2600, validityDays: 90, featured: true, blurb: 'Five Scan Now 5×5 audits, $9.80 each.' },
  { key: 'prospect-12', name: '12 prospect audits', audits: 12, credits: 12 * SCAN_NOW_5X5_POINTS, cents: 9900, saves: 8100, validityDays: 90, blurb: 'Twelve Scan Now 5×5 audits, $8.25 each.' },
];

/** For seat holders who run short: priced above every seat's rate, so a bigger seat is always the better deal. Never expires. */
export const TOPUP: PriceItem = { key: 'topup-100', name: 'Top-up: 100 phone sessions', credits: 100, cents: 2500, blurb: 'For seat holders who run short. Never expires.' };

/**
 * Sold with the account plans (Scout, Agency, Scale): the Closer Pack for a pitch with no
 * subscription (in place of the $5 first audit and the prospect audits), phone sessions for plan
 * holders who run short, and brief credits. Bought sessions and brief credits never expire.
 */
export const CLOSER: PriceItem = { key: 'closer', name: 'Closer Pack', credits: 50, briefs: 1, cents: 1900, blurb: 'No subscription: two full 5×5 audits on real phones and 1 brief credit for a revenue brief priced with live county Google Ads rates. Never expires. Up to 2 per account.' };
export const CLOSER_LIMIT = 2;
export const SESSION_PACKS: PriceItem[] = [
  { key: 'sessions-100', name: '100 phone sessions', credits: 100, cents: 2900, blurb: '4 full 5×5 scans ($7.25 a scan). For finishing a client audit today.' },
  { key: 'sessions-250', name: '250 phone sessions', credits: 250, cents: 5900, featured: true, blurb: '10 full 5×5 scans ($5.90 a scan). Covers two 5-keyword territory audits.' },
  { key: 'sessions-500', name: '500 phone sessions', credits: 500, cents: 9900, blurb: '20 full 5×5 scans ($4.95 a scan). For multi-keyword or 7×7 prospecting runs.' },
];
/** Only for accounts on a plan (Scout, Agency or Scale): more sessions at 15¢ each, below every pack. */
export const PLAN_TOPUP: PriceItem = { key: 'sessions-plan-200', name: 'Plan top-up: 200 phone sessions', credits: 200, cents: 3000, blurb: 'For plan holders: 8 full 5×5 scans ($3.75 a scan). Never expire.' };
export const BRIEF_PACKS: PriceItem[] = [
  { key: 'briefs-1', name: '1 brief credit', credits: 0, briefs: 1, cents: 900, blurb: 'Compile a client revenue brief, or update one with a newer scan.' },
  { key: 'briefs-5', name: '5 brief credits', credits: 0, briefs: 5, cents: 3500, blurb: '$7 a credit: 22% off, for prospecting runs and monthly updates.' },
];

/** Reports under the customer's own logo and domain, share links included: free from 10 clients, otherwise once. Set up by hand. */
export const WHITE_LABEL = { cents: 9700, freeFrom: 10 };
export const WHITE_LABEL_ITEM: PriceItem = { key: 'white-label', name: 'White-label setup', credits: 0, cents: WHITE_LABEL.cents, blurb: 'Your logo and domain on every report and share link, set up for you. Free from 10 clients.' };

/**
 * Black Friday: a first seat started before it ends comes with 250 bonus phone sessions (ten Scan Now 5×5s),
 * once per account. Shown on the site until it ends, and granted only until then.
 */
export const PROMO = { name: 'Black Friday', ends: '2026-12-02T05:00:00Z', endsText: 'Tuesday, December 1' };
export const promoLive = (now = Date.now()) => now < Date.parse(PROMO.ends);
export const BONUS_POINTS = 250;

/**
 * Only an admin sees or can buy this: a real $1 purchase that proves the live payment settings
 * work (after first setup, or after changing any of them) without spending real money on a pack.
 */
export const ADMIN_TEST: PriceItem = { key: 'admin-test', name: 'Live payment test (admin only)', credits: 5, cents: 100, blurb: 'A real $1 charge to check that payments work. Adds 5 phone sessions.' };

// No longer sold. Kept so purchases made before the seats can still be named.
/** Onboarding, sold until November 2026: a call, setup, a first audit and 1,000 phone sessions. */
export const ONBOARDING: PriceItem = { key: 'onboarding', name: 'Onboarding', credits: 1000, cents: 99700, blurb: 'Done for you, once: an onboarding call, your businesses set up, a first audit, and 1,000 phone sessions.' };
export const PACKS: (PriceItem & { fits: string; featured?: boolean })[] = [
  { key: 'pack-25', name: 'Single Scan', credits: 25, cents: 900, blurb: 'One-time pack: 25 phone sessions.', fits: 'One more 5×5 scan' },
  { key: 'pack-100', name: 'Starter Pack', credits: 100, cents: 3500, blurb: 'One-time pack: 100 phone sessions.', fits: 'Room to test properly', featured: true },
  { key: 'pack-300', name: 'Pro Pack', credits: 300, cents: 9900, blurb: 'One-time pack: 300 phone sessions.', fits: 'A few clients, a few keywords each' },
];
export const PLANS: (PriceItem & { fits: string; featured?: boolean })[] = [
  { key: 'starter', name: 'Starter', credits: 700, cents: 19700, blurb: 'Monthly plan: 700 phone sessions a month.', fits: '1–2 clients, scanned weekly' },
  { key: 'growth', name: 'Growth', credits: 1600, cents: 39700, blurb: 'Monthly plan: 1,600 phone sessions a month.', fits: 'A typical agency: 5 clients, 3 keywords each, weekly', featured: true },
  { key: 'agency', name: 'Agency', credits: 3500, cents: 69700, blurb: 'Monthly plan: 3,500 phone sessions a month.', fits: '10 or more clients, or daily scans' },
];
export const PREPAID: (PriceItem & { plan: string; saves: number })[] = [
  { key: 'starter-3', plan: 'starter', name: 'Starter, 3 months', credits: 2100, cents: 49700, saves: 9400, blurb: 'Black Friday: three months of Starter, paid once. 2,100 phone sessions now.' },
  { key: 'growth-3', plan: 'growth', name: 'Growth, 3 months', credits: 4800, cents: 99700, saves: 19400, blurb: 'Black Friday: three months of Growth, paid once. 4,800 phone sessions now.' },
  { key: 'agency-3', plan: 'agency', name: 'Agency, 3 months', credits: 10500, cents: 179700, saves: 29400, blurb: 'Black Friday: three months of Agency, paid once. 10,500 phone sessions now.' },
];
export const TOPUPS: (PriceItem & { plan: string })[] = [
  { key: 'topup-starter', plan: 'starter', name: 'Starter top-up', credits: 25, cents: 700, blurb: 'At your plan’s price: 25 more phone sessions.' },
  { key: 'topup-growth', plan: 'growth', name: 'Growth top-up', credits: 100, cents: 2500, blurb: 'At your plan’s price: 100 more phone sessions.' },
  { key: 'topup-agency', plan: 'agency', name: 'Agency top-up', credits: 100, cents: 2000, blurb: 'At your plan’s price: 100 more phone sessions.' },
];
/** The welcome pack as sold before the seats: 25 credits. */
const WELCOME_25: PriceItem = { ...WELCOME, key: 'welcome', credits: 25 };

export const ALL_ITEMS: PriceItem[] = [WELCOME, ...PROSPECT_PACKS, TOPUP, WHITE_LABEL_ITEM, ADMIN_TEST, ONBOARDING, ...PACKS, ...PLANS, ...PREPAID, ...TOPUPS, CLOSER, ...SESSION_PACKS, PLAN_TOPUP, ...BRIEF_PACKS];
/** The item a key names, for what a paid order brings. */
export const itemByKey = (key: string | null | undefined) => ALL_ITEMS.find((i) => i.key === key);

/**
 * What a recorded purchase was. Purchases made before items were recorded by key are told apart by
 * their credits, which were all different then.
 */
const BEFORE_KEYS: Record<number, string> = { 25: 'pack-25', 100: 'pack-100', 300: 'pack-300', 700: 'starter', 1600: 'growth', 3500: 'agency', 2100: 'starter-3', 4800: 'growth-3', 10500: 'agency-3', 1000: 'onboarding', 5: 'admin-test' };
export const itemKeyOf = (o: { item?: string | null; credits: number }): string => o.item ?? BEFORE_KEYS[o.credits] ?? '';
const itemOf = (o: { item?: string | null; credits: number }) => (o.item === 'welcome' && o.credits === 25 ? WELCOME_25 : ALL_ITEMS.find((i) => i.key === itemKeyOf(o)));

/**
 * The plan an account was on under the old credit plans: its most recent monthly plan bought in
 * the last 35 days, or three-month offer bought in the last 95. Null when neither.
 */
export function currentPlan(paid: { item?: string | null; credits: number; createdAt: Date }[], now = Date.now()): string | null {
  const DAY = 86400000;
  const live = paid
    .map((o) => { const key = itemKeyOf(o); const pre = PREPAID.find((x) => x.key === key); const plan = pre ? pre.plan : PLANS.some((x) => x.key === key) ? key : null; return plan ? { plan, at: o.createdAt.getTime(), until: o.createdAt.getTime() + (pre ? 95 : 35) * DAY } : null; })
    .filter((x): x is { plan: string; at: number; until: number } => x !== null && x.until > now)
    .sort((a, b) => b.at - a.at);
  return live[0]?.plan ?? null;
}

/**
 * What an account can buy once: the first audit until it has paid for anything, prospect audits
 * always, a top-up while it holds a seat, and the white-label setup while it has fewer than 10
 * client seats and has not bought it. An admin also gets the $1 payment test.
 */
export function itemsFor(state: { admin?: boolean; /** Has never paid for anything. */ firstPurchase?: boolean; /** Client seats (Scout, Command and Dominator) now. */ seats?: number; /** The white-label setup is already paid for. */ whiteLabel?: boolean; /** Sold the account plans rather than seats. */ newPlans?: boolean; /** On an account plan (Scout, Agency or Scale) now. */ plan?: boolean; /** Closer Packs already bought. */ closers?: number }): PriceItem[] {
  const seats = state.seats ?? 0;
  if (state.newPlans) {
    // With the account plans: the Closer Pack (twice at most), and the session packs and brief credits
    // for every account, on a plan or not; an account on a plan also gets the plan top-up. An account
    // still on seats keeps its own price for 100 sessions.
    const sessions = seats > 0 && !state.plan ? [TOPUP, ...SESSION_PACKS.filter((p) => p.credits > TOPUP.credits)] : SESSION_PACKS;
    const out = [...((state.closers ?? 0) < CLOSER_LIMIT ? [CLOSER] : []), ...(state.plan ? [PLAN_TOPUP] : []), ...sessions, ...BRIEF_PACKS];
    return state.admin ? [...out, ADMIN_TEST] : out;
  }
  const items: PriceItem[] = [
    ...(state.firstPurchase ? [WELCOME] : []),
    ...PROSPECT_PACKS,
    ...(seats > 0 ? [TOPUP] : []),
    ...(seats < WHITE_LABEL.freeFrom && !state.whiteLabel ? [WHITE_LABEL_ITEM] : []),
  ];
  return state.admin ? [...items, ADMIN_TEST] : items;
}

/**
 * What the buyer reads on coming back from Stripe after a one-time purchase (or an older credit plan):
 * what was added, or why the payment went back.
 */
export function paidMessage(d: { refunded?: boolean; item?: string | null; plan?: string | null; credits?: number; briefs?: number }): string {
  if (d.refunded)
    return d.item === CLOSER.key
      ? `The Closer Pack is limited to ${CLOSER_LIMIT} per account, and this account already has ${CLOSER_LIMIT}. Your payment was refunded in full; nothing was added.`
      : 'The first audit is one per account and per card, and this one has already been used. Your payment was refunded in full; no phone sessions were added.';
  const credits = Number(d.credits) || 0, briefs = Number(d.briefs) || 0;
  if (d.plan) return `You are on the ${d.plan} plan: ${credits.toLocaleString('en-US')} phone sessions added, and the same every month until you cancel.`;
  const got = [credits ? `${credits.toLocaleString('en-US')} phone sessions` : '', briefs ? `${briefs} brief credit${briefs === 1 ? '' : 's'}` : ''].filter(Boolean);
  return got.length ? `Payment received: ${got.join(' and ')} added.` : 'Payment received. We will email you to set up your white label.';
}

/** The email an admin gets when a payment is recorded: who paid, for what, and what to do next. */
export function paymentNotice(p: { buyer: string; credits: number; cents: number; balance: number; orderId: string; captureId: string; sandbox: boolean; item?: string | null; /** Paid for a second first audit: refunded, no points. */ refunded?: boolean }) {
  const item = itemOf(p);
  if (p.refunded)
    return p.item === CLOSER.key
      ? { subject: `${p.sandbox ? '[Test] ' : ''}Refunded: Closer Pack past the limit, ${p.buyer}`, lines: [`${p.buyer} paid ${usd(p.cents)} for a Closer Pack, but this account already has ${CLOSER_LIMIT}, the most one account can buy. The payment was refunded and nothing was added.`, `Stripe checkout ${p.orderId}, payment ${p.captureId}.`] }
      : { subject: `${p.sandbox ? '[Test] ' : ''}Refunded: second first audit, ${p.buyer}`, lines: [`${p.buyer} paid ${usd(p.cents)} for the first audit, but this account or this card has already had one. The payment was refunded and no phone sessions were added.`, `Stripe checkout ${p.orderId}, payment ${p.captureId}.`] };
  const name = item?.name ?? p.credits + ' phone sessions';
  const what = p.credits ? ` (${p.credits.toLocaleString('en-US')} phone sessions). Their balance is now ${p.balance.toLocaleString('en-US')}.` : '.';
  const lines = [
    `${p.buyer} paid ${usd(p.cents)} for ${name}${what}`,
    ...(item?.key === 'onboarding' ? ['This is an onboarding purchase: book their onboarding call and set up their businesses.'] : []),
    ...(item?.key === 'white-label' ? ['This is a white-label purchase: email them to set up their logo and domain.'] : []),
    ...(p.sandbox ? ['This was a Stripe TEST payment: no real money moved.'] : []),
    `Stripe checkout ${p.orderId}, payment ${p.captureId}.`,
  ];
  return { subject: `${p.sandbox ? '[Test] ' : ''}Payment: ${name}, ${usd(p.cents)}, ${p.buyer}`, lines };
}

export const perCredit = (i: Pick<PriceItem, 'credits' | 'cents'>) => i.cents / 100 / i.credits;
/** "$997" or "$0.35". */
export const usd = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
/** How many 5×5 scans a number of phone sessions covers (25 each, AI Overview tracking included). */
export const scans5x5 = (credits: number) => Math.floor(credits / 25);

/** A real report anyone can open: the business plus the highest-income neighborhoods around it (Lakeland, FL). */
export const DEMO_REPORT_URL = '/share/daa01a387187cc2ecc1baaf0f6ff095416e0099a8f997a9e';
