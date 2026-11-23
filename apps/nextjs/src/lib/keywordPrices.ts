/**
 * Monthly searches and what advertisers pay per click, for searches in one place, from DataForSEO's
 * Google Ads keyword data (DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD on Vercel, the same login the
 * rival listings use). Each live request is one paid task, $0.09 at DataForSEO's price list
 * whether it holds 1 search or 1,000, and the live endpoint takes at most 12 requests a minute per
 * account, so answers are kept and every paid request is logged with its cost ("[dataforseo]").
 *
 * Google reports one set of figures for a group of near-identical searches ("car accident lawyer",
 * "car accident attorney") and can leave the others in the same request empty. Asking each empty
 * one again on its own costs a task apiece (ten of them made a brief cost about $1), so it is off
 * unless a caller asks for it with `alone: true`; callers put a search's variants and plurals in the
 * same request instead. Searches asked alone are marked `alone`, and their monthly searches may
 * overlap with another search's, so they are not added up.
 */
import { InputError } from '@stakeout/core/grid';
import { redis } from '@stakeout/core/redis';

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
  const where = String(task.location_name ?? task.location_code ?? '?'), n = Array.isArray(task.keywords) ? task.keywords.length : 0;
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
    console.warn(`[dataforseo] ${path} refused · ${n} searches · ${where} · ${why}`);
    throw new InputError('DataForSEO refused the keyword lookup: ' + why, res.status === 429 || /rate|limit/i.test(why) ? 429 : 502);
  }
  const cost = num(j.cost) ?? num(t.cost) ?? 0;
  console.info(`[dataforseo] ${path} · ${n} searches · ${where} · $${cost.toFixed(4)}${alone ? ' · asked alone' : ''}`);
  return { prices: readPrices(t.result, alone), cost };
}

/**
 * Prices for these searches in one place, in the order given: one paid request. `alone: true` also
 * asks up to 10 searches that came back empty again on their own (a paid request each). `cost`: what
 * DataForSEO charged, US dollars. `complete`: Google has had its full say on every search (with
 * `alone`, a request refused for the rate limit leaves it empty, and the answer should not be kept).
 */
export async function keywordPrices(keywords: string[], place: Place, language: 'en' | 'es' = 'en', opts: { alone?: boolean } = {}): Promise<{ results: KeywordPrice[]; cost: number; askedAlone: number; answered: string[]; complete: boolean }> {
  if (!pricesConfigured()) throw new InputError('DataForSEO is not set up: DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD on Vercel.', 503);
  if (!keywords.length) return { results: [], cost: 0, askedAlone: 0, answered: [], complete: true };
  const first = await ask('search_volume/live', { keywords, ...place, language_code: language });
  const got = new Map(first.prices.map((p) => [p.keyword, p]));
  let cost = first.cost;
  const missing = keywords.filter((k) => { const p = got.get(k); return !p || empty(p); });
  // One request unless asked to retry the empty ones alone: each retry is another paid task.
  const alone = opts.alone === true;
  const retry = alone ? missing.slice(0, ALONE) : [];
  const again = await Promise.allSettled(retry.map((k) => ask('search_volume/live', { keywords: [k], ...place, language_code: language }, true)));
  let complete = !alone || missing.length <= ALONE;
  // The searches Google has had its full say on: everything it priced, and each empty one (asked alone, when that was asked for).
  const answered = new Set(keywords.filter((k) => !missing.includes(k) || !alone));
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

/** A place as Google Ads targets it. */
export type GeoPlace = { code: number; name: string; type: string };

const CITY_TYPES = ['City', 'Municipality', 'Borough', 'Township', 'Neighborhood'];
const COUNTY_TYPES = ['County', 'Parish', 'Borough'];
const LOC_KEY = 'stakeout:dfs:loc:v1:us:';
const LOC_KEEP_S = 30 * 86400;

/** A place name as written anywhere ("Mt. Juliet", "Mount Juliet", "St. Lucie", "Saint Lucie") reduced to one form. */
export const placeWord = (s: string) =>
  s.toLowerCase().replace(/[.'’]/g, '').replace(/-/g, ' ').replace(/\bmt\b/g, 'mount').replace(/\bste\b/g, 'sainte').replace(/\bst\b/g, 'saint').replace(/\bft\b/g, 'fort').replace(/\s+/g, ' ').trim();

/** The place in a state's list with this name, a city or a county, preferring the plain kind (a City over a Neighborhood). */
export function pickPlace(list: GeoPlace[], name: string, kind: 'city' | 'county'): GeoPlace | null {
  const want = placeWord(name), types = kind === 'city' ? CITY_TYPES : COUNTY_TYPES;
  const found = list.filter((p) => types.includes(p.type) && placeWord(p.name.split(',')[0]) === want);
  return found.sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type))[0] ?? null;
}

/**
 * Google Ads' places in one US state (cities, counties and the like), from DataForSEO's location
 * list, which costs nothing; the whole list is read at most once a month and kept by state. null:
 * the list couldn't be had (the caller goes on with the name it built).
 */
async function statePlaces(state: string): Promise<GeoPlace[] | null> {
  const r = redis();
  const kept = await r.get(LOC_KEY + state).catch(() => null);
  if (kept) return JSON.parse(kept) as GeoPlace[];
  if (await r.get(LOC_KEY + 'ready').catch(() => null)) return [];
  if (!pricesConfigured()) return null;
  const auth = Buffer.from(process.env.DATAFORSEO_LOGIN + ':' + process.env.DATAFORSEO_PASSWORD).toString('base64');
  const res = await fetch(API + 'locations/us', { headers: { Authorization: 'Basic ' + auth }, cache: 'no-store', signal: AbortSignal.timeout(60000) }).catch(() => null);
  const j = (await res?.json().catch(() => null)) as { status_code?: number; status_message?: string; tasks?: { status_code?: number; result?: unknown[] | null }[] } | null;
  const t = j?.tasks?.[0];
  if (!res?.ok || j?.status_code !== 20000 || t?.status_code !== 20000 || !Array.isArray(t.result)) {
    console.warn('[dataforseo] locations/us refused · ' + String(j?.status_message ?? res?.status ?? 'no answer'));
    return null;
  }
  const byState = new Map<string, GeoPlace[]>();
  for (const x of t.result as Record<string, unknown>[]) {
    const type = String(x?.location_type ?? ''), name = String(x?.location_name ?? ''), code = Number(x?.location_code);
    if (x?.country_iso_code !== 'US' || !Number.isInteger(code) || (!CITY_TYPES.includes(type) && !COUNTY_TYPES.includes(type))) continue;
    const parts = name.split(',');
    if (parts.length < 3) continue;
    const st = parts[parts.length - 2];
    if (!byState.has(st)) byState.set(st, []);
    byState.get(st)!.push({ code, name, type });
  }
  const pipe = r.pipeline();
  for (const [st, list] of byState) pipe.set(LOC_KEY + st, JSON.stringify(list), 'EX', LOC_KEEP_S);
  pipe.set(LOC_KEY + 'ready', '1', 'EX', LOC_KEEP_S);
  await pipe.exec().catch(() => null);
  console.info(`[dataforseo] locations/us · ${[...byState.values()].reduce((a, l) => a + l.length, 0)} places in ${byState.size} states kept · $0`);
  return byState.get(state) ?? [];
}

/**
 * A city or county as Google Ads names it: { place } when found; 'none' when Google Ads has no such
 * place in the state (a small town is counted at its county); 'unknown' when the list couldn't be had.
 */
export async function findPlace(name: string, state: string, kind: 'city' | 'county'): Promise<GeoPlace | 'none' | 'unknown'> {
  const list = await statePlaces(state).catch(() => null);
  if (!list) return 'unknown';
  return pickPlace(list, name, kind) ?? 'none';
}
