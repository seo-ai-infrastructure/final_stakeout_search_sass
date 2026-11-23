/**
 * Monthly searches and what advertisers pay per click, for searches in one place, from DataForSEO's
 * Google Ads keyword data (DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD on Vercel, the same login the
 * rival listings use). Each request is paid for (about 7.5 cents, however many searches it holds)
 * and the live endpoint takes at most 12 requests a minute per account, so answers are kept.
 *
 * Google reports one set of figures for a group of near-identical searches ("car accident lawyer",
 * "car accident attorney") and can leave the others in the same request empty. A search that comes
 * back empty is asked again on its own, once, so each search gets its own price; those are marked
 * `alone`, and their monthly searches may overlap with another search's, so they are not added up.
 */
import { InputError } from '@stakeout/core/grid';

const API = 'https://api.dataforseo.com/v3/keywords_data/google_ads/';
/** Searches asked again on their own after one request: 1 + 10 stays inside 12 requests a minute. */
const ALONE = 10;

export const pricesConfigured = () => Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);

export type KeywordPrice = {
  keyword: string;
  /** Google's spelling, when it priced a corrected one. */
  spell: string | null;
  /** Average monthly searches over the last 12 months. */
  searches: number | null;
  /** Cost per click, US dollars. */
  cpc: number | null;
  /** The usual range of top-of-page bids, US dollars. */
  lowBid: number | null;
  highBid: number | null;
  /** Competition for the paid places on the page. */
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  competitionIndex: number | null;
  months: { year: number; month: number; searches: number | null }[];
  /** Asked on its own after coming back empty beside other searches. */
  alone: boolean;
};

export type Place = { location_code: number } | { location_name: string };

/**
 * A place as DataForSEO takes it: a number is a location code (Google's geo target id, e.g. 2840 for
 * the United States, 1023022 for Huntington, NY); a name is "Place,State,Country", and one without a
 * country is taken to be in the United States ("Suffolk County, New York" becomes
 * "Suffolk County,New York,United States").
 */
export function placeOf(v: unknown): Place | null {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return { location_code: v };
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d+$/.test(s)) return { location_code: Number(s) };
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length < 3 && parts[parts.length - 1] !== 'United States') parts.push('United States');
  return { location_name: parts.join(',') };
}

/** Searches as Google Ads takes them: lowercase, no symbols, at most 80 characters and 10 words, no repeats. */
export function cleanKeywords(v: unknown, max = 100): { keywords: string[]; skipped: string[] } {
  const keywords: string[] = [], skipped: string[] = [];
  for (const raw of Array.isArray(v) ? v : []) {
    const k = String(raw).toLowerCase().replace(/[^\p{L}\p{N}\s'&.-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!k) continue;
    if (k.length > 80 || k.split(' ').length > 10) skipped.push(k);
    else if (!keywords.includes(k)) keywords.push(k);
  }
  return { keywords: keywords.slice(0, max), skipped: [...skipped, ...keywords.slice(max)] };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const money = (v: unknown) => { const n = num(v); return n === null ? null : Math.round(n * 100) / 100; };

/** DataForSEO's answer for one request (tasks[0].result) as prices. */
export function readPrices(result: unknown, alone = false): KeywordPrice[] {
  return (Array.isArray(result) ? result : []).flatMap((r): KeywordPrice[] => {
    if (!r || typeof r !== 'object') return [];
    const x = r as Record<string, unknown>;
    if (typeof x.keyword !== 'string' || !x.keyword) return [];
    const c = x.competition;
    const months = (Array.isArray(x.monthly_searches) ? x.monthly_searches : [])
      .map((m) => { const o = (m ?? {}) as Record<string, unknown>; return { year: num(o.year) ?? 0, month: num(o.month) ?? 0, searches: num(o.search_volume) }; })
      .filter((m) => m.year > 0 && m.month > 0);
    return [{
      keyword: x.keyword,
      spell: typeof x.spell === 'string' && x.spell ? x.spell : null,
      searches: num(x.search_volume),
      cpc: money(x.cpc),
      lowBid: money(x.low_top_of_page_bid),
      highBid: money(x.high_top_of_page_bid),
      competition: c === 'LOW' || c === 'MEDIUM' || c === 'HIGH' ? c : null,
      competitionIndex: num(x.competition_index),
      months,
      alone,
    }];
  });
}

/** No figures at all: Google left it out, or grouped it with another search in the request. */
export const empty = (p: KeywordPrice) => p.searches === null && p.cpc === null && p.lowBid === null && p.highBid === null;
const blank = (keyword: string): KeywordPrice => ({ keyword, spell: null, searches: null, cpc: null, lowBid: null, highBid: null, competition: null, competitionIndex: null, months: [], alone: false });

type Answer = { status_code?: number; status_message?: string; cost?: number; tasks?: { status_code?: number; status_message?: string; cost?: number; result?: unknown[] | null }[] };

async function ask(path: 'search_volume/live' | 'keywords_for_keywords/live', task: Record<string, unknown>, alone = false): Promise<{ prices: KeywordPrice[]; cost: number }> {
  const auth = Buffer.from(process.env.DATAFORSEO_LOGIN + ':' + process.env.DATAFORSEO_PASSWORD).toString('base64');
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ ...task, search_partners: false }]),
    cache: 'no-store',
    signal: AbortSignal.timeout(45000),
  });
  const j = (await res.json().catch(() => null)) as Answer | null;
  const t = j?.tasks?.[0];
  if (!res.ok || !j || j.status_code !== 20000 || !t || t.status_code !== 20000) {
    const why = String(t?.status_message ?? j?.status_message ?? 'HTTP ' + res.status).slice(0, 200);
    throw new InputError('DataForSEO refused the keyword lookup: ' + why, res.status === 429 || /rate|limit/i.test(why) ? 429 : 502);
  }
  return { prices: readPrices(t.result, alone), cost: num(j.cost) ?? num(t.cost) ?? 0 };
}

/**
 * Prices for these searches in one place, in the order given. `cost`: what DataForSEO charged, US
 * dollars. `complete`: every search that came back empty was asked again on its own and answered
 * (a request refused for the rate limit leaves it empty, and the answer should not be kept).
 */
export async function keywordPrices(keywords: string[], place: Place, language: 'en' | 'es' = 'en', opts: { alone?: boolean } = {}): Promise<{ results: KeywordPrice[]; cost: number; askedAlone: number; answered: string[]; complete: boolean }> {
  if (!pricesConfigured()) throw new InputError('DataForSEO is not set up: DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD on Vercel.', 503);
  if (!keywords.length) return { results: [], cost: 0, askedAlone: 0, answered: [], complete: true };
  const first = await ask('search_volume/live', { keywords, ...place, language_code: language });
  const got = new Map(first.prices.map((p) => [p.keyword, p]));
  let cost = first.cost;
  const missing = keywords.filter((k) => { const p = got.get(k); return !p || empty(p); });
  // Only the first request when asked to (another lookup in the same minute may need the rest of the 12).
  const retry = opts.alone === false ? [] : missing.slice(0, ALONE);
  const again = await Promise.allSettled(retry.map((k) => ask('search_volume/live', { keywords: [k], ...place, language_code: language }, true)));
  let complete = opts.alone === false || missing.length <= ALONE;
  // The searches Google has had its full say on: everything it priced, and each empty one asked alone.
  const answered = new Set(keywords.filter((k) => !missing.includes(k) || opts.alone === false));
  again.forEach((r, i) => {
    if (r.status !== 'fulfilled') { complete = false; return; }
    answered.add(retry[i]);
    cost += r.value.cost;
    const p = r.value.prices.find((x) => x.keyword === retry[i]) ?? r.value.prices[0];
    if (p && !empty(p)) got.set(retry[i], { ...p, keyword: retry[i] });
  });
  return { results: keywords.map((k) => got.get(k) ?? blank(k)), cost: Math.round(cost * 10000) / 10000, askedAlone: retry.length, answered: [...answered], complete };
}

/**
 * Google's related searches around up to 20 seeds in one place, with their prices, most searched
 * first (one request). For a search Google leaves unpriced even on its own ("car accident lawyer"),
 * its family here says what the market pays. Google repeats a group's figures on each search in the
 * group, so these monthly searches are not added up either.
 */
export async function keywordIdeas(seeds: string[], place: Place, language: 'en' | 'es' = 'en', limit = 300): Promise<{ results: KeywordPrice[]; found: number; cost: number }> {
  if (!pricesConfigured()) throw new InputError('DataForSEO is not set up: DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD on Vercel.', 503);
  if (!seeds.length) return { results: [], found: 0, cost: 0 };
  const { prices, cost } = await ask('keywords_for_keywords/live', { keywords: seeds.slice(0, 20), ...place, language_code: language, sort_by: 'search_volume' });
  const priced = prices.filter((p) => !empty(p));
  return { results: priced.slice(0, limit), found: priced.length, cost };
}
