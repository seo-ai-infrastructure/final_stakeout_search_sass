/**
 * The one price list: the pricing page and the checkout both read it, so they cannot disagree.
 * Amounts are in US cents. Each item is identified at checkout by its credit count, so every
 * item must carry a different number of credits.
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
 * Credit packs, bought once: the way in, and top-ups later. Three on purpose: a taste, the one
 * most people should take, and a large one. Each costs more per credit than any plan, so a plan is
 * the obvious next step.
 */
export const PACKS: (PriceItem & { fits: string; featured?: boolean })[] = [
  { key: 'pack-25', name: 'Sample', credits: 25, cents: 2500, blurb: 'One-time pack: 25 credits.', fits: 'A first look' },
  { key: 'pack-100', name: 'Starter Pack', credits: 100, cents: 4900, blurb: 'One-time pack: 100 credits.', fits: 'Room to test properly', featured: true },
  { key: 'pack-300', name: 'Pro Pack', credits: 300, cents: 12900, blurb: 'One-time pack: 300 credits.', fits: 'A few clients, a few keywords each' },
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

export const ALL_ITEMS: PriceItem[] = [ONBOARDING, ...PACKS, ...PLANS, ...PREPAID, ADMIN_TEST];

/**
 * What an account can buy: the packs and the plans, always; the three-month offer while it runs;
 * onboarding (optional) until it has been bought or waived. An admin also gets the $1 payment test.
 */
export function itemsFor(state: { onboarded: boolean; admin?: boolean; now?: number }): PriceItem[] {
  const items: PriceItem[] = [...PACKS, ...PLANS, ...(promoLive(state.now) ? PREPAID : []), ...(state.onboarded ? [] : [ONBOARDING])];
  return state.admin ? [...items, ADMIN_TEST] : items;
}

/** The email an admin gets when a payment is recorded: who paid, for what, and what to do next. */
export function paymentNotice(p: { buyer: string; credits: number; cents: number; balance: number; orderId: string; captureId: string; sandbox: boolean }) {
  const item = ALL_ITEMS.find((i) => i.credits === p.credits);
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
