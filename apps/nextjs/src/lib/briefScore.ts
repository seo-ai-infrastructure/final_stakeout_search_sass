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

export type Scored = Point & { score: number; afterAds: number; mapPart: number | null; aiPart: number | null; scenario: string; reading: 'card' | 'named' | 'none' };

export function scorePoints(points: Point[]): Scored[] {
  return points.map((p) => {
    const s = scorePin(stakeoutPin(p));
    return { ...p, score: s.baseScore ?? 0, afterAds: s.adjustedScore ?? s.baseScore ?? 0, mapPart: s.packUtility, aiPart: s.aiUtility, scenario: s.scenario, reading: p.aiShown ? (p.state === 'parsed' ? 'card' : 'named') : 'none' };
  });
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Income band × households (3); a tract with no households counts 0, one not known counts as the scan's typical tract. */
export function weights(points: Point[]): number[] {
  const known = points.map((p) => p.hh).filter((x): x is number => typeof x === 'number' && x > 0).sort((a, b) => a - b);
  const typical = known.length ? known[Math.floor(known.length / 2)] : 1;
  return points.map((p) => incomeWeight(p.inc ?? null).weight * (typeof p.hh === 'number' ? p.hh : typical));
}

export function summarize(scored: Scored[]) {
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
  if (map && !current.some((p) => p.pack)) return null;
  const pairs: { now: number; was: number }[] = [];
  for (const p of current) {
    const was = earlier
      .map((run) => run.filter((q) => near(p, q)).sort((a, b) => haversineMeters(p.lat!, p.lng!, a.lat!, a.lng!) - haversineMeters(p.lat!, p.lng!, b.lat!, b.lng!))[0])
      .filter((q): q is Scored => Boolean(q));
    if (was.length) pairs.push({ now: part(p), was: mean(was.map(part)) as number });
  }
  if (pairs.length < 4) return null;
  return { change: (mean(pairs.map((x) => x.now)) as number) - (mean(pairs.map((x) => x.was)) as number), points: pairs.length, map, runs: earlier.length };
}

const TRADE = new Set(['plumbing', 'plumber', 'plumbers', 'law', 'lawyer', 'lawyers', 'attorney', 'attorneys', 'firm', 'office', 'offices', 'group', 'services', 'service', 'company', 'llc', 'inc', 'pllc', 'pc', 'co', 'the', 'and', 'of', 'at', 'personal', 'injury', 'heating', 'cooling', 'air', 'roofing', 'dental', 'clinic', 'center', 'home', 'repair', 'pros', 'experts']);
const tokens = (v: string) => v.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/** The business's own name as people search it: "Stuart's Plumbing" → "stuarts plumbing"; "Brandon J. Broderick, Personal Injury…" → "brandon j broderick". */
export const brandSearch = (business: string) => tokens(business.split(',')[0]).join(' ');

/** A search naming the business: it holds one of the name's distinctive words (5). */
export function isBranded(keyword: string, business: string) {
  const own = tokens(business.split(',')[0]).filter((t) => t.length >= 4 && !TRADE.has(t));
  const kw = new Set(tokens(keyword));
  return own.some((t) => kw.has(t));
}
