/**
 * The one price list: the pricing page and the checkout both read it, so they cannot disagree.
 * Amounts are in US cents. Each item is identified at checkout by its credit count, so every
 * item must carry a different number of credits.
 */
export type PriceItem = { key: string; name: string; credits: number; cents: number; blurb: string };

/** Paid once, before anything else: setup, a first audit, and the first credits. */
export const ONBOARDING: PriceItem & { regularCents: number; foundingPlaces: number } = {
  key: 'onboarding',
  name: 'Founding onboarding',
  credits: 1000,
  cents: 49700,
  regularCents: 99700,
  foundingPlaces: 10,
  blurb: 'One-time setup: an onboarding call, your businesses set up, a first audit, and 1,000 credits.',
};

/** Bought each month; no contract. */
export const PLANS: (PriceItem & { fits: string; featured?: boolean })[] = [
  { key: 'starter', name: 'Starter', credits: 700, cents: 19700, blurb: 'Monthly plan: 700 credits.', fits: '1–2 clients, scanned weekly' },
  { key: 'growth', name: 'Growth', credits: 1600, cents: 39700, blurb: 'Monthly plan: 1,600 credits.', fits: 'A typical agency: 5 clients, 3 keywords each, weekly', featured: true },
  { key: 'agency', name: 'Agency', credits: 3500, cents: 69700, blurb: 'Monthly plan: 3,500 credits.', fits: '10 or more clients, or daily scans' },
];

/** Credits on top of a plan, at a higher rate than any plan. */
export const EXTRA: PriceItem = { key: 'extra', name: 'Extra credits', credits: 200, cents: 7000, blurb: '200 more credits, at $0.35 each.' };

/**
 * Only an admin sees or can buy this: a real $1 purchase that proves the live payment settings
 * work (after first setup, or after changing any of them) without spending $70 or more.
 */
export const ADMIN_TEST: PriceItem = { key: 'admin-test', name: 'Live payment test (admin only)', credits: 5, cents: 100, blurb: 'A real $1 charge to check that payments work. Adds 5 credits.' };

export const ALL_ITEMS: PriceItem[] = [ONBOARDING, ...PLANS, EXTRA, ADMIN_TEST];

/**
 * What an account can buy: onboarding first, and only once; after it, the plans and extra
 * credits. An admin also gets the $1 payment test.
 */
export function itemsFor(state: { onboarded: boolean; admin?: boolean }): PriceItem[] {
  const items = state.onboarded ? [...PLANS, EXTRA] : [ONBOARDING];
  return state.admin ? [...items, ADMIN_TEST] : items;
}

/** The email an admin gets when a payment is recorded: who paid, for what, and what to do next. */
export function paymentNotice(p: { buyer: string; credits: number; cents: number; balance: number; orderId: string; captureId: string; sandbox: boolean }) {
  const item = ALL_ITEMS.find((i) => i.credits === p.credits);
  const name = item?.name ?? p.credits + ' credits';
  const lines = [
    `${p.buyer} paid ${usd(p.cents)} for ${name} (${p.credits.toLocaleString('en-US')} credits). Their balance is now ${p.balance.toLocaleString('en-US')}.`,
    ...(item?.key === 'onboarding' ? ['This is an onboarding purchase: book their onboarding call and set up their businesses.'] : []),
    ...(p.sandbox ? ['This was a PayPal SANDBOX payment: no real money moved.'] : []),
    `PayPal order ${p.orderId}, capture ${p.captureId}.`,
  ];
  return { subject: `${p.sandbox ? '[Sandbox] ' : ''}Payment: ${name}, ${usd(p.cents)}, ${p.buyer}`, lines };
}

export const perCredit = (i: Pick<PriceItem, 'credits' | 'cents'>) => i.cents / 100 / i.credits;
/** "$497" or "$0.35". */
export const usd = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
/** How many 5×5 scans a number of credits covers, with and without AI Overview tracking. */
export const scans5x5 = (credits: number) => ({ plain: Math.floor(credits / 25), withAi: Math.floor(credits / 50) });
