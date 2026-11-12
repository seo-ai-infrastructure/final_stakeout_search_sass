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

export const ALL_ITEMS: PriceItem[] = [ONBOARDING, ...PLANS, EXTRA];

/** What an account can buy: onboarding first, and only once; after it, the plans and extra credits. */
export function itemsFor(state: { onboarded: boolean }): PriceItem[] {
  return state.onboarded ? [...PLANS, EXTRA] : [ONBOARDING];
}

export const perCredit = (i: Pick<PriceItem, 'credits' | 'cents'>) => i.cents / 100 / i.credits;
/** "$497" or "$0.35". */
export const usd = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
/** How many 5×5 scans a number of credits covers, with and without AI Overview tracking. */
export const scans5x5 = (credits: number) => ({ plain: Math.floor(credits / 25), withAi: Math.floor(credits / 50) });
