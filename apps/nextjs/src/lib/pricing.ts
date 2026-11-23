/**
 * The one price list for things bought once: the pricing page and the checkout both read it, so
 * they cannot disagree. Amounts are in US cents. Each item is identified at checkout by its key.
 * Monthly seats (Scout, Command, Dominator) are in packages/core/gbpPlans.ts.
 *
 * A phone session is one real Android phone run at one grid point, Scan Now or scheduled: one 5×5
 * is 25 phone sessions. (`credits` on an item is its phone sessions: the name is kept because orders
 * and the ledger store it under that name. Customers never see the word.)
 */
export type PriceItem = { key: string; name: string; credits: number; cents: number; blurb: string; /** Points that run out this many days after purchase. */ validityDays?: number };

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

export const ALL_ITEMS: PriceItem[] = [WELCOME, ...PROSPECT_PACKS, TOPUP, WHITE_LABEL_ITEM, ADMIN_TEST, ONBOARDING, ...PACKS, ...PLANS, ...PREPAID, ...TOPUPS];

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
export function itemsFor(state: { admin?: boolean; /** Has never paid for anything. */ firstPurchase?: boolean; /** Client seats (Scout, Command and Dominator) now. */ seats?: number; /** The white-label setup is already paid for. */ whiteLabel?: boolean }): PriceItem[] {
  const seats = state.seats ?? 0;
  const items: PriceItem[] = [
    ...(state.firstPurchase ? [WELCOME] : []),
    ...PROSPECT_PACKS,
    ...(seats > 0 ? [TOPUP] : []),
    ...(seats < WHITE_LABEL.freeFrom && !state.whiteLabel ? [WHITE_LABEL_ITEM] : []),
  ];
  return state.admin ? [...items, ADMIN_TEST] : items;
}

/** The email an admin gets when a payment is recorded: who paid, for what, and what to do next. */
export function paymentNotice(p: { buyer: string; credits: number; cents: number; balance: number; orderId: string; captureId: string; sandbox: boolean; item?: string | null; /** Paid for a second first audit: refunded, no points. */ refunded?: boolean }) {
  const item = itemOf(p);
  if (p.refunded) return { subject: `${p.sandbox ? '[Test] ' : ''}Refunded: second first audit, ${p.buyer}`, lines: [`${p.buyer} paid ${usd(p.cents)} for the first audit, but this account or this card has already had one. The payment was refunded and no phone sessions were added.`, `Stripe checkout ${p.orderId}, payment ${p.captureId}.`] };
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

export type Onboarding = 'exempt' | 'paid' | 'waived' | 'no';
/**
 * Where an account stands on onboarding (sold until November 2026). Paid beats waived beats
 * exempt, so the admin list shows the strongest reason.
 */
export function onboardingStatus(a: { paid: boolean; waived: boolean; admin: boolean; beforePricing: boolean }): Onboarding {
  return a.paid ? 'paid' : a.waived ? 'waived' : a.admin || a.beforePricing ? 'exempt' : 'no';
}

/** A real report anyone can open: the business plus the highest-income neighborhoods around it (Lakeland, FL). */
export const DEMO_REPORT_URL = '/share/daa01a387187cc2ecc1baaf0f6ff095416e0099a8f997a9e';
