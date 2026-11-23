/**
 * How Stakeout's stored readings become the v2 engine's inputs, and the brief's summaries, under
 * the decisions taken on November 22, 2026:
 *  1. An AI answer that was shown but couldn't be read counts as "not in it" (it never adds points).
 *     An earlier reading (before answers were read card by card) counts as "named", or "not in it".
 *  2. Ads above the results are estimated from what the phone recorded: a Local Services Ads block
 *     counts once, each sponsored result once; ads among the map results don't count.
 *  3. Income weighting: the tract's income band × its households; a tract with no households counts 0.
 *  4. Change: each point against its average over the previous period, on matched points.
 *  5. The headline is unweighted; weighted and after-ads figures sit beside it; branded searches
 *     are shown apart from it.
 */
import { MODEL_VERSION, haversineMeters, incomeWeight, scorePin, type StakeoutPin } from './scoringV2';

export const SCORING_VERSION = MODEL_VERSION;
const MATCH_M = 150;

/** A point as the visibility report reads it, with the ads the phone recorded and its census tract. */
export type Point = {
  r: number; c: number; lat: number | null; lng: number | null; area: string | null; zip?: string | null;
  rank: number | null; pack: boolean; oneBox: 'won' | 'other' | null;
  aiShown: boolean; old: boolean; state: 'none' | 'parsed' | 'unparsed' | 'legacy' | string;
  featured: { card?: number | null; of?: number | null; afterMore?: boolean | null; inline?: boolean | null } | null;
  named: boolean; listing: { links?: number; inSources?: number } | boolean | null; website: 'confirmed' | 'possible' | null;
  first: string[]; aiFirst: string[];
  ads?: { n: string; w: string }[]; inc?: number | null; hh?: number | null; tract?: string | null;
};

/** Ads above the first local or AI section, as the phone recorded them (2). */
export const paidUnitsAbove = (p: Point) => {
  const ads = p.ads ?? [];
  return (ads.some((a) => a.w === 'local_services') ? 1 : 0) + ads.filter((a) => a.w === 'results').length;
};

/** The engine's input for a point (1, 2). */
export function stakeoutPin(p: Point): StakeoutPin {
  const read = p.state === 'parsed';
  const ai: Partial<StakeoutPin> = !p.aiShown
    ? { aiShown: false, state: 'none' }
    : read
      ? { aiShown: true, state: 'parsed', featured: p.featured, named: p.named, listing: p.listing, website: p.website }
      : // Shown but not read card by card: the earlier reading says named or not; unreadable says nothing.
        { aiShown: true, state: 'parsed', featured: null, named: p.state === 'legacy' ? p.old : false, listing: null, website: null };
  return { id: `${p.r},${p.c}`, r: p.r, c: p.c, lat: p.lat, lng: p.lng, inc: p.inc ?? null, pack: p.pack, rank: p.rank, oneBox: p.oneBox, paidUnitsAbove: paidUnitsAbove(p), ...ai } as StakeoutPin;
}

export type Scored = Point & { score: number; afterAds: number; mapPart: number | null; aiPart: number | null; scenario: string; reading: 'card' | 'named' | 'unread' | 'none'; excluded: boolean };

export function scorePoints(points: Point[]): Scored[] {
  return points.map((p) => {
    const s = scorePin(stakeoutPin(p));
    const reading = !p.aiShown ? 'none' : p.state === 'parsed' ? 'card' : p.state === 'legacy' ? 'named' : 'unread';
    return { ...p, score: s.baseScore ?? 0, afterAds: s.adjustedScore ?? s.baseScore ?? 0, mapPart: s.packUtility, aiPart: s.aiUtility, scenario: s.scenario, reading, excluded: s.scenario === 'EXCLUDED' } as Scored;
  });
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Income band × households (3); a tract with no households counts 0, one not known counts as the scan's typical tract. */
export function weights(points: Point[]): number[] {
  const known = points.map((p) => p.hh).filter((x): x is number => typeof x === 'number' && x > 0).sort((a, b) => a - b);
  const typical = known.length ? known[Math.floor(known.length / 2)] : 1;
  return points.map((p) => incomeWeight(p.inc ?? null).weight * (typeof p.hh === 'number' ? p.hh : typical));
}

/** Points with neither a map pack nor an AI answer on the page are left out, as the engine leaves them out. */
export function summarize(all: Scored[]) {
  const scored = all.filter((p) => !p.excluded);
  const w = weights(scored);
  const wt = w.reduce((a, b) => a + b, 0);
  return {
    points: scored.length,
    score: mean(scored.map((p) => p.score)),
    weighted: wt > 0 ? scored.reduce((a, p, i) => a + p.score * w[i], 0) / wt : null,
    afterAds: mean(scored.map((p) => p.afterAds)),
  };
}

const near = (a: Point, b: Point) => typeof a.lat === 'number' && typeof a.lng === 'number' && typeof b.lat === 'number' && typeof b.lng === 'number' && haversineMeters(a.lat, a.lng, b.lat, b.lng) <= MATCH_M;

/**
 * Change on matched points (4): each current point against the average of its readings in the
 * earlier runs (the nearest point within 150 m in each). When an earlier run's AI answers weren't
 * read card by card, only the map results' part is compared, and `map` says so.
 */
export function matchedChange(current: Scored[], earlier: Scored[][]) {
  const map = earlier.flat().some((p) => p.reading === 'named') || current.some((p) => p.reading === 'named');
  const part = (p: Scored) => (map ? (p.mapPart ?? 0) : p.score);
  // Answers that couldn't be read are left out on both sides.
  const usable = (p: Scored) => !p.excluded && p.reading !== 'unread';
  if (map && !current.some((p) => p.pack)) return null;
  const pairs: { now: number; was: number }[] = [];
  for (const p of current.filter(usable)) {
    const was = earlier
      .map((run) => run.filter((q) => usable(q) && near(p, q)).sort((a, b) => haversineMeters(p.lat!, p.lng!, a.lat!, a.lng!) - haversineMeters(p.lat!, p.lng!, b.lat!, b.lng!))[0])
      .filter((q): q is Scored => Boolean(q));
    if (was.length) pairs.push({ now: part(p), was: mean(was.map(part)) as number });
  }
  if (pairs.length < 4) return null;
  return { change: (mean(pairs.map((x) => x.now)) as number) - (mean(pairs.map((x) => x.was)) as number), points: pairs.length, map, runs: earlier.length };
}

/** Trade and firm words: in a name they say what the business does, not who it is. */
export const TRADE = new Set(['plumbing', 'plumber', 'plumbers', 'law', 'lawyer', 'lawyers', 'attorney', 'attorneys', 'firm', 'office', 'offices', 'group', 'services', 'service', 'company', 'llc', 'inc', 'pllc', 'pc', 'co', 'the', 'and', 'of', 'at', 'personal', 'injury', 'heating', 'cooling', 'air', 'roofing', 'dental', 'clinic', 'center', 'home', 'repair', 'pros', 'experts',
  'legal', 'accident', 'accidents', 'trial', 'lawyers', 'counsel', 'hvac', 'conditioning', 'electric', 'electrical', 'electrician', 'electricians', 'roofer', 'roofers', 'dentist', 'dentistry', 'orthodontics', 'chiropractic', 'chiropractor', 'medical', 'health', 'wellness', 'landscaping', 'lawn', 'pest', 'control', 'cleaning', 'cleaners', 'carpet', 'painting', 'painters', 'construction', 'contractor', 'contractors', 'remodeling', 'restoration', 'water', 'damage', 'garage', 'door', 'doors', 'locksmith', 'towing', 'moving', 'movers', 'storage', 'insurance', 'realty', 'real', 'estate', 'homes', 'salon', 'auto', 'body', 'shop', 'glass', 'tree', 'pool', 'pools', 'solar', 'appliance', 'flooring', 'kitchen', 'bath', 'cabinets', 'concrete', 'paving', 'fence', 'fencing', 'gutters', 'windows', 'siding', 'insulation', 'septic', 'drain', 'drains', 'sewer', 'rooter', 'mechanical', 'heater', 'heaters', 'veterinary', 'animal', 'hospital', 'pharmacy']);
/** Words people add to a search that say nothing about which business they mean. */
export const MODIFIERS = new Set(['best', 'near', 'nearby', 'emergency', 'local', 'cheap', 'affordable', 'rated', 'open', 'today', 'hour', 'hours', 'same', 'free', 'estimate', 'estimates', 'repairs', 'install', 'installation', 'replacement', 'cost', 'costs', 'price', 'prices', 'pricing', 'quote', 'quotes', 'review', 'reviews', 'number', 'phone', 'call', 'contact', 'licensed', 'certified', 'professional', 'professionals', 'reliable', 'trusted', 'quality', 'express', 'fast', 'quick', 'family', 'owned', 'city', 'county', 'area', 'north', 'south', 'east', 'west', 'central', 'american', 'national', 'united', 'premier', 'elite', 'choice', 'solutions', 'systems', 'associates', 'partners', 'corp', 'corporation', 'companies']);
const tokens = (v: string) => v.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
/** Plurals and possessives alike: "stuarts" and "stuart" are one word. */
const stem = (t: string) => (t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);

/** The business's own name as people search it: "Stuart's Plumbing" → "stuarts plumbing"; "Brandon J. Broderick, Personal Injury…" → "brandon j broderick". */
export const brandSearch = (business: string) => tokens(business.split(',')[0]).join(' ');

/** What tells a branded search apart: the business's website, and the places around it (a town's name in a business name isn't a brand). */
export type BrandHints = { website?: string | null; places?: string[] };
const placeWords = (places: string[] = []) => new Set(places.flatMap(tokens).flatMap((t) => [t, stem(t)]));
const generic = (t: string, places: Set<string>) => [t, stem(t)].some((x) => TRADE.has(x) || MODIFIERS.has(x) || places.has(x));

/** The website's own name: "https://www.stuartsplumbing.com/x" → "stuartsplumbing". */
export function domainStem(website: string | null | undefined) {
  const host = String(website ?? '').toLowerCase().trim().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '');
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  const at = parts.length >= 3 && parts[parts.length - 1].length === 2 && parts[parts.length - 2].length <= 3 ? parts.length - 3 : parts.length - 2;
  const name = parts[at].replace(/[^a-z0-9]/g, '');
  return name.length >= 4 ? name : null;
}

/** The words of the business's name that set it apart: not trade words, search words or places. */
export function brandTokens(business: string, hints: BrandHints = {}) {
  const places = placeWords(hints.places);
  return [...new Set(tokens(business.split(',')[0]).filter((t) => t.length >= 4 && !generic(t, places)).map(stem))];
}

/**
 * A search naming the business (5), worked out from its name and website with no setting at scan time:
 * one of the name's distinctive words ("broderick law", "stuart plumbing"), or the website's own name
 * ("stuartsplumbing"), unless that name is only trade, search and place words ("lakelandplumbing").
 */
export function isBranded(keyword: string, business: string, hints: BrandHints = {}) {
  const kw = tokens(keyword).map(stem);
  if (brandTokens(business, hints).some((t) => kw.includes(t))) return true;
  const site = domainStem(hints.website);
  if (!site) return false;
  let rest = site;
  for (const w of [...TRADE, ...MODIFIERS, ...placeWords(hints.places)].filter((x) => x.length >= 4).sort((a, b) => b.length - a.length)) rest = rest.split(w).join('');
  return rest.length >= 4 && keyword.toLowerCase().replace(/[^a-z0-9]/g, '').includes(site);
}

/** The same business, by the name the AI answer or the map results give it. */
export function sameBusiness(name: string, business: string) {
  const own = tokens(business.split(',')[0]).filter((t) => t.length >= 4 && !TRADE.has(t)).map(stem);
  const nm = new Set(tokens(name).map(stem));
  return own.some((t) => nm.has(t)) || tokens(name).join(' ') === tokens(business).join(' ');
}
