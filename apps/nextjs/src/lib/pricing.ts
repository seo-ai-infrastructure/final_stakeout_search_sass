/**
 * The one price list: the pricing page and the checkout both read it, so they cannot disagree.
 * Amounts are in US cents. Each item is identified at checkout by its key.
 */
export type PriceItem = { key: string; name: string; credits: number; cents: number; blurb: string };

/**
 * Optional, once: we set the account up, run a first audit and hand over a report. Nobody has to
 * buy it to start (since v167): anyone can begin with a credit pack or a plan.
 */
export const ONBOARDING: PriceItem = {
  key: 'onboarding',
  name: 'Onboarding',
  credits: 1000,
  cents: 99700,
  blurb: 'Done for you, once: an onboarding call, your businesses set up, a first audit, and 1,000 credits.',
};

/**
 * The way in: 25 credits (one 5×5 scan) for $5, once per account and once per card. It is priced
 * below every plan on purpose, so it is only for a first purchase.
 */
export const WELCOME: PriceItem = { key: 'welcome', name: 'First-Scan Welcome Pack', credits: 25, cents: 500, blurb: 'One time, for a first purchase: 25 credits, enough for one 5×5 scan.' };

/**
 * Credit packs, bought once and as often as wanted: top-ups, and one-off jobs. Each costs more per
 * credit than any plan, so a plan is the obvious next step.
 */
export const PACKS: (PriceItem & { fits: string; featured?: boolean })[] = [
  { key: 'pack-25', name: 'Single Scan', credits: 25, cents: 900, blurb: 'One-time pack: 25 credits.', fits: 'One more 5×5 scan' },
  { key: 'pack-100', name: 'Starter Pack', credits: 100, cents: 3500, blurb: 'One-time pack: 100 credits.', fits: 'Room to test properly', featured: true },
  { key: 'pack-300', name: 'Pro Pack', credits: 300, cents: 9900, blurb: 'One-time pack: 300 credits.', fits: 'A few clients, a few keywords each' },
];

/** Bought each month; no contract. */
export const PLANS: (PriceItem & { fits: string; featured?: boolean })[] = [
  { key: 'starter', name: 'Starter', credits: 700, cents: 19700, blurb: 'Monthly plan: 700 credits.', fits: '1–2 clients, scanned weekly' },
  { key: 'growth', name: 'Growth', credits: 1600, cents: 39700, blurb: 'Monthly plan: 1,600 credits.', fits: 'A typical agency: 5 clients, 3 keywords each, weekly', featured: true },
  { key: 'agency', name: 'Agency', credits: 3500, cents: 69700, blurb: 'Monthly plan: 3,500 credits.', fits: '10 or more clients, or daily scans' },
];

/**
 * The Black Friday offer: three months of a plan paid at once, for less. On sale until PROMO_ENDS
 * and gone after it, on the pricing page and at checkout alike, so the deadline is real.
 */
export const PROMO = { name: 'Black Friday', ends: '2026-12-02T05:00:00Z', endsText: 'Tuesday, December 1' };
export const promoLive = (now = Date.now()) => now < Date.parse(PROMO.ends);
export const PREPAID: (PriceItem & { plan: string; saves: number })[] = [
  { key: 'starter-3', plan: 'starter', name: 'Starter, 3 months', credits: 2100, cents: 49700, saves: 9400, blurb: 'Black Friday: three months of Starter, paid once. 2,100 credits now.' },
  { key: 'growth-3', plan: 'growth', name: 'Growth, 3 months', credits: 4800, cents: 99700, saves: 19400, blurb: 'Black Friday: three months of Growth, paid once. 4,800 credits now.' },
  { key: 'agency-3', plan: 'agency', name: 'Agency, 3 months', credits: 10500, cents: 179700, saves: 29400, blurb: 'Black Friday: three months of Agency, paid once. 10,500 credits now.' },
];

/**
 * Only an admin sees or can buy this: a real $1 purchase that proves the live payment settings
 * work (after first setup, or after changing any of them) without spending real money on a pack.
 */
export const ADMIN_TEST: PriceItem = { key: 'admin-test', name: 'Live payment test (admin only)', credits: 5, cents: 100, blurb: 'A real $1 charge to check that payments work. Adds 5 credits.' };

/**
 * For an account on a plan that runs short before the month is out: more credits at its plan's own
 * price per credit, so nobody on a plan pays pack prices.
 */
export const TOPUPS: (PriceItem & { plan: string })[] = [
  { key: 'topup-starter', plan: 'starter', name: 'Starter top-up', credits: 25, cents: 700, blurb: 'At your plan’s price: 25 more credits.' },
  { key: 'topup-growth', plan: 'growth', name: 'Growth top-up', credits: 100, cents: 2500, blurb: 'At your plan’s price: 100 more credits.' },
  { key: 'topup-agency', plan: 'agency', name: 'Agency top-up', credits: 100, cents: 2000, blurb: 'At your plan’s price: 100 more credits.' },
];

export const ALL_ITEMS: PriceItem[] = [ONBOARDING, WELCOME, ...PACKS, ...PLANS, ...PREPAID, ...TOPUPS, ADMIN_TEST];

/**
 * What a recorded purchase was. Purchases made before items were recorded by key are told apart by
 * their credits, which were all different then.
 */
const BEFORE_KEYS: Record<number, string> = { 25: 'pack-25', 100: 'pack-100', 300: 'pack-300', 700: 'starter', 1600: 'growth', 3500: 'agency', 2100: 'starter-3', 4800: 'growth-3', 10500: 'agency-3', 1000: 'onboarding', 5: 'admin-test' };
export const itemKeyOf = (o: { item?: string | null; credits: number }): string => o.item ?? BEFORE_KEYS[o.credits] ?? '';

/**
 * The plan an account is on, from what it has paid for: its most recent monthly plan bought in the
 * last 35 days, or three-month offer bought in the last 95. Null when neither.
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
 * What an account can buy: the welcome pack until it has paid for anything; its plan's top-up while
 * it is on a plan; the packs and the plans, always; the three-month offer while it runs; onboarding
 * (optional) until it has been bought or waived. An admin also gets the $1 payment test.
 */
export function itemsFor(state: { onboarded: boolean; admin?: boolean; now?: number; /** Has never paid for anything. */ firstPurchase?: boolean; /** The plan it is on now, if any. */ plan?: string | null }): PriceItem[] {
  const items: PriceItem[] = [...(state.firstPurchase ? [WELCOME] : []), ...TOPUPS.filter((t) => t.plan === state.plan), ...PACKS, ...PLANS, ...(promoLive(state.now) ? PREPAID : []), ...(state.onboarded ? [] : [ONBOARDING])];
  return state.admin ? [...items, ADMIN_TEST] : items;
}

/** The email an admin gets when a payment is recorded: who paid, for what, and what to do next. */
export function paymentNotice(p: { buyer: string; credits: number; cents: number; balance: number; orderId: string; captureId: string; sandbox: boolean; item?: string | null; /** Paid for a second welcome pack: refunded, no credits. */ refunded?: boolean }) {
  const key = itemKeyOf(p);
  const item = ALL_ITEMS.find((i) => i.key === key);
  if (p.refunded) return { subject: `${p.sandbox ? '[Test] ' : ''}Refunded: second welcome pack, ${p.buyer}`, lines: [`${p.buyer} paid ${usd(p.cents)} for the welcome pack, but this account or this card has already had one. The payment was refunded and no credits were added.`, `Stripe checkout ${p.orderId}, payment ${p.captureId}.`] };
  const name = item?.name ?? p.credits + ' credits';
  const lines = [
    `${p.buyer} paid ${usd(p.cents)} for ${name} (${p.credits.toLocaleString('en-US')} credits). Their balance is now ${p.balance.toLocaleString('en-US')}.`,
    ...(item?.key === 'onboarding' ? ['This is an onboarding purchase: book their onboarding call and set up their businesses.'] : []),
    ...(p.sandbox ? ['This was a Stripe TEST payment: no real money moved.'] : []),
    `Stripe checkout ${p.orderId}, payment ${p.captureId}.`,
  ];
  return { subject: `${p.sandbox ? '[Test] ' : ''}Payment: ${name}, ${usd(p.cents)}, ${p.buyer}`, lines };
}

export const perCredit = (i: Pick<PriceItem, 'credits' | 'cents'>) => i.cents / 100 / i.credits;
/** "$997" or "$0.35". */
export const usd = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
/** How many 5×5 scans a number of credits covers (25 points each, AI Overview tracking included). */
export const scans5x5 = (credits: number) => Math.floor(credits / 25);

export type Onboarding = 'exempt' | 'paid' | 'waived' | 'no';
/**
 * Where an account stands on onboarding. Paid beats waived beats exempt, so the list shows the
 * strongest reason; only 'no' keeps the plans out of reach.
 */
export function onboardingStatus(a: { paid: boolean; waived: boolean; admin: boolean; beforePricing: boolean }): Onboarding {
  return a.paid ? 'paid' : a.waived ? 'waived' : a.admin || a.beforePricing ? 'exempt' : 'no';
}

/** Reports under the customer's own logo and domain, share links included: a one-time setup, arranged by email. */
export const WHITE_LABEL = { cents: 9700 };

/** A real report anyone can open: the business plus the highest-income neighborhoods around it (Lakeland, FL). */
export const DEMO_REPORT_URL = '/share/daa01a387187cc2ecc1baaf0f6ff095416e0099a8f997a9e';
