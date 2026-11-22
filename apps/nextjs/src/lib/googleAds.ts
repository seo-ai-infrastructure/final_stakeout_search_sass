/**
 * Google Ads Keyword Planner, read-only: monthly searches and what advertisers bid at the top of the
 * page, for a list of searches in one place. Signs in with Stakeout's own Google Ads connection
 * (GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET and GOOGLE_ADS_REFRESH_TOKEN on Vercel, made in the
 * Google Cloud project that holds the API access level), and asks on GOOGLE_ADS_CUSTOMER_ID's behalf
 * through the manager account GOOGLE_ADS_LOGIN_CUSTOMER_ID.
 *
 * Google retired developer tokens on September 9, 2026: access comes from the Cloud project behind
 * the OAuth client, so no developer-token header is sent. Keyword Planner needs Basic access or above.
 */
import { InputError } from '@stakeout/core/grid';

/** The REST version; v26 is supported until about November 2027. */
export const ADS_API = 'v26';
const BASE = `https://googleads.googleapis.com/${ADS_API}`;
const digits = (v: string | undefined) => (v ?? '').replace(/\D/g, '');

export const adsConfigured = () =>
  Boolean(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET && process.env.GOOGLE_ADS_REFRESH_TOKEN && digits(process.env.GOOGLE_ADS_CUSTOMER_ID));

let cached: { token: string; until: number } | null = null;

/** A short-lived access token from the stored refresh token, kept until a minute before it lapses. */
async function accessToken(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  const v = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !v.access_token) {
    // invalid_grant: the refresh token is expired, revoked, or was made with another OAuth client.
    throw new InputError(`Google Ads sign-in failed: ${v.error ?? r.status}${v.error_description ? ' (' + v.error_description + ')' : ''}.`, 502);
  }
  cached = { token: v.access_token, until: Date.now() + Math.max(60, (v.expires_in ?? 3600) - 60) * 1000 };
  return v.access_token;
}

type AdsError = { error?: { message?: string; status?: string; details?: { errors?: { errorCode?: Record<string, string>; message?: string }[] }[] } };

/** One call. `login` is the manager account to act through (default GOOGLE_ADS_LOGIN_CUSTOMER_ID; null for none). */
async function ads<T>(path: string, body: unknown, opts: { login?: string | null; method?: 'GET' | 'POST' } = {}): Promise<T> {
  const login = opts.login === undefined ? digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) : digits(opts.login ?? '');
  const r = await fetch(BASE + path, {
    method: opts.method ?? 'POST',
    headers: { authorization: 'Bearer ' + (await accessToken()), 'content-type': 'application/json', ...(login ? { 'login-customer-id': login } : {}) },
    ...(opts.method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
  const v = (await r.json().catch(() => ({}))) as T & AdsError;
  if (!r.ok) {
    const first = v.error?.details?.flatMap((d) => d.errors ?? [])[0];
    const code = first?.errorCode ? Object.values(first.errorCode)[0] : v.error?.status;
    throw new InputError(`Google Ads: ${first?.message ?? v.error?.message ?? 'request failed'}${code ? ' (' + code + ')' : ''}.`, r.status === 429 ? 429 : 502);
  }
  return v;
}

export type AdsPlace = { id: string; name: string; type: string; canonical: string };

/** Google's place for a name ("Huntington, New York"), the best enabled match, or null. */
export async function placeFor(name: string): Promise<AdsPlace | null> {
  type S = { geoTargetConstantSuggestions?: { geoTargetConstant?: { resourceName?: string; id?: string; name?: string; targetType?: string; canonicalName?: string; status?: string } }[] };
  const v = await ads<S>('/geoTargetConstants:suggest', { locale: 'en', countryCode: 'US', locationNames: { names: [name] } });
  const g = (v.geoTargetConstantSuggestions ?? []).map((s) => s.geoTargetConstant).find((x) => x?.resourceName && x.status !== 'REMOVAL_PLANNED');
  return g?.resourceName ? { id: g.resourceName.replace('geoTargetConstants/', ''), name: g.name ?? name, type: g.targetType ?? '', canonical: g.canonicalName ?? g.name ?? name } : null;
}

export type KeywordPrice = {
  keyword: string;
  closeVariants: string[];
  avgMonthlySearches: number | null;
  competition: string | null;
  competitionIndex: number | null;
  /** What advertisers bid for the top of the page: the 20th and 80th percentile, in dollars. */
  lowTopOfPageBid: number | null;
  highTopOfPageBid: number | null;
  /** Google's average cost per click, in dollars, when it has one. */
  averageCpc: number | null;
  months: { year: number; month: string; searches: number | null }[];
};

const LANGUAGES = { en: '1000', es: '1003' } as const;
const num = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));
const dollars = (micros: unknown) => (num(micros) === null ? null : Math.round(Number(micros) / 10_000) / 100);

/** Monthly searches and top-of-page bids for up to 50 searches, in one place and language (asked for `customerId`, default GOOGLE_ADS_CUSTOMER_ID). */
export async function keywordPrices(keywords: string[], placeId: string, language: keyof typeof LANGUAGES = 'en', customerId?: string): Promise<KeywordPrice[]> {
  type M = { avgMonthlySearches?: string; competition?: string; competitionIndex?: string; lowTopOfPageBidMicros?: string; highTopOfPageBidMicros?: string; averageCpcMicros?: string; monthlySearchVolumes?: { year?: string; month?: string; monthlySearches?: string }[] };
  type H = { results?: { text?: string; closeVariants?: string[]; keywordMetrics?: M }[] };
  const customer = digits(customerId ?? process.env.GOOGLE_ADS_CUSTOMER_ID);
  const v = await ads<H>(`/customers/${customer}:generateKeywordHistoricalMetrics`, {
    keywords,
    language: 'languageConstants/' + LANGUAGES[language],
    geoTargetConstants: ['geoTargetConstants/' + placeId],
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    historicalMetricsOptions: { includeAverageCpc: true },
  });
  return (v.results ?? []).map((x) => {
    const m = x.keywordMetrics ?? {};
    return {
      keyword: x.text ?? '',
      closeVariants: x.closeVariants ?? [],
      avgMonthlySearches: num(m.avgMonthlySearches),
      competition: m.competition ?? null,
      competitionIndex: num(m.competitionIndex),
      lowTopOfPageBid: dollars(m.lowTopOfPageBidMicros),
      highTopOfPageBid: dollars(m.highTopOfPageBidMicros),
      averageCpc: dollars(m.averageCpcMicros),
      months: (m.monthlySearchVolumes ?? []).map((s) => ({ year: Number(s.year), month: s.month ?? '', searches: num(s.monthlySearches) })),
    };
  });
}

export type AdsAccount = { id: string; name: string | null; status: string; manager: boolean | null; test: boolean | null; via: 'direct' | 'manager'; setAsCustomer: boolean; setAsLogin: boolean };

/**
 * Every Google Ads account this sign-in can reach, with its status (ENABLED, CANCELED, SUSPENDED,
 * CLOSED, or the error Google gave), directly or under the manager account. For choosing
 * GOOGLE_ADS_CUSTOMER_ID: Keyword Planner needs an enabled account.
 */
export async function reachableAccounts(): Promise<AdsAccount[]> {
  const customer = digits(process.env.GOOGLE_ADS_CUSTOMER_ID), login = digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  const mark = (a: Omit<AdsAccount, 'setAsCustomer' | 'setAsLogin'>): AdsAccount => ({ ...a, setAsCustomer: a.id === customer, setAsLogin: a.id === login });
  type Row = { customer?: { id?: string; descriptiveName?: string; status?: string; manager?: boolean; testAccount?: boolean }; customerClient?: { id?: string; descriptiveName?: string; status?: string; manager?: boolean; testAccount?: boolean } };
  const out = new Map<string, AdsAccount>();
  const direct = await ads<{ resourceNames?: string[] }>('/customers:listAccessibleCustomers', null, { method: 'GET', login: null });
  for (const id of (direct.resourceNames ?? []).map((n) => n.replace('customers/', '')).slice(0, 25)) {
    try {
      const v = await ads<{ results?: Row[] }>(`/customers/${id}/googleAds:search`, { query: 'SELECT customer.id, customer.descriptive_name, customer.status, customer.manager, customer.test_account FROM customer LIMIT 1' }, { login: id });
      const c = v.results?.[0]?.customer ?? {};
      out.set(id, mark({ id, name: c.descriptiveName ?? null, status: c.status ?? 'UNKNOWN', manager: c.manager ?? null, test: c.testAccount ?? null, via: 'direct' }));
    } catch (e) {
      out.set(id, mark({ id, name: null, status: e instanceof Error ? e.message : 'error', manager: null, test: null, via: 'direct' }));
    }
  }
  // Accounts under the manager account, one level down.
  if (login) {
    try {
      const v = await ads<{ results?: Row[] }>(`/customers/${login}/googleAds:search`, { query: 'SELECT customer_client.id, customer_client.descriptive_name, customer_client.status, customer_client.manager, customer_client.test_account FROM customer_client WHERE customer_client.level <= 1' }, { login });
      for (const r of v.results ?? []) {
        const c = r.customerClient ?? {};
        if (c.id && !out.has(c.id)) out.set(c.id, mark({ id: c.id, name: c.descriptiveName ?? null, status: c.status ?? 'UNKNOWN', manager: c.manager ?? null, test: c.testAccount ?? null, via: 'manager' }));
      }
    } catch {
      /* the manager account itself is in the list above, with its error */
    }
  }
  if (customer && !out.has(customer)) out.set(customer, mark({ id: customer, name: null, status: 'NOT REACHABLE with this sign-in', manager: null, test: null, via: 'direct' }));
  return [...out.values()];
}
