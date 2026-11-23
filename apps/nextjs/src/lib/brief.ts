import { createHash } from 'node:crypto';
import { redis } from '@stakeout/core/redis';
import type { VisibilityData as Full } from './visibilityReport';

/** The visibility report's data; a share link may carry no Google numbers. */
type VisibilityData = Omit<Full, 'google'> & { google: Full['google'] | null };
import { SCORING_VERSION, brandSearch, isBranded, matchedChange, paidUnitsAbove, scorePoints, summarize, type Point, type Scored } from './briefScore';
import { keywordPrices, pricesConfigured, type KeywordPrice } from './keywordPrices';

/**
 * The local search and revenue brief (/reports/brief.html): the visibility report's data, scored with
 * the v2 engine (briefScore.ts), summed up for an owner or a board. Two cases share one page: with the
 * business's Google accounts connected, verified calls and visits are priced at local ad rates; without
 * them, the market's own search counts and prices stand in, and every estimate says so.
 * Local prices come from DataForSEO's Google Ads data (kept 14 days; a share link never pays for a lookup).
 */

const DAY = 86400000;
const KEEP_S = 14 * 86400;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x: number | null | undefined) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const words = (v: string) => v.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const STATES: Record<string, string> = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };

/** Sample inputs for the modeled figures, until the client sets its own. */
export type Assumptions = { qualified: number; close: number; value: number; tap: number; cpc: number | null };
export const defaultsFor = (keywords: string[]): Assumptions =>
  keywords.some((k) => /\b(lawyer|attorney|law firm|abogado)/i.test(k))
    ? { qualified: 0.35, close: 0.2, value: 16500, tap: 0.1, cpc: null }
    : { qualified: 0.6, close: 0.5, value: 450, tap: 0.1, cpc: null };
export const assumptionsKey = (owner: string, business: string) => 'stakeout:brief:assume:' + owner + ':' + brandSearch(business);
export function cleanAssumptions(v: unknown, base: Assumptions): Assumptions {
  const o = (v ?? {}) as Record<string, unknown>;
  const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : d);
  return {
    qualified: num(o.qualified, 0, 1, base.qualified),
    close: num(o.close, 0, 1, base.close),
    value: num(o.value, 0, 10_000_000, base.value),
    tap: num(o.tap, 0, 1, base.tap),
    cpc: o.cpc === null ? null : num(o.cpc, 0.01, 10_000, base.cpc ?? -1) === -1 ? null : num(o.cpc, 0.01, 10_000, 0),
  };
}

/** The short name a brief uses: "Stuart's Plumbing" → "Stuart’s"; "Brandon J. Broderick, Personal Injury…" → "Broderick". */
export function shortName(business: string) {
  const head = business.split(',')[0].trim();
  const parts = head.split(/\s+/);
  const trade = /^(plumbing|plumbers?|law|lawyers?|attorneys?|services?|company|co\.?|llc|inc\.?|group|firm|heating|cooling|roofing|electric|hvac|dental|pllc|p\.?c\.?)$/i;
  const short = parts.length > 1 && trade.test(parts[parts.length - 1]) ? parts[0] : parts[parts.length - 1];
  return short.replace(/'/g, '’');
}

const ordinal = (n: number) => ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][n - 1] ?? `#${n}`;
const isFirst = (p: Point) => p.rank === 1 || p.oneBox === 'won';
const inTop3 = (p: Point) => (p.rank !== null && p.rank <= 3) || p.oneBox === 'won';
const hasLsa = (p: Point) => (p.ads ?? []).some((a) => a.w === 'local_services');

/** Named first in the AI answer: card 1 or recommended in its text (read card by card), else first among the names it gave. */
function aiFirstOf(p: Point, business: string): boolean | null {
  if (!p.aiShown) return null;
  if (p.state === 'parsed') return Boolean(p.featured?.inline || p.featured?.card === 1);
  if (p.aiFirst?.length) return isBranded(p.aiFirst[0], business) || words(p.aiFirst[0]) === words(business);
  return null;
}
const mine = (name: string, business: string) => isBranded(name, business) || words(name) === words(business);

type Split = { axis: 'rows' | 'columns'; a: { label: string; points: number; score: number }; b: { label: string; points: number; score: number }; cut: number };
/** The two halves of the grid that differ most (rows north and south, or columns west and east). */
function splitOf(pins: Scored[], size: number): Split | null {
  const m = Math.floor(size / 2), out: Split[] = [];
  const name = (axis: 'rows' | 'columns', lo: number, hi: number, first: boolean) => `${axis === 'rows' ? (first ? 'Northern rows' : 'Southern rows') : first ? 'Western columns' : 'Eastern columns'} ${lo + 1}–${hi + 1}`;
  for (const axis of ['rows', 'columns'] as const)
    for (const cut of size % 2 ? [m, m + 1] : [m]) {
      const at = (p: Scored) => (axis === 'rows' ? p.r : p.c);
      const A = pins.filter((p) => at(p) < cut), B = pins.filter((p) => at(p) >= cut);
      if (A.length < 3 || B.length < 3) continue;
      const sa = mean(A.map((p) => p.score)) as number, sb = mean(B.map((p) => p.score)) as number;
      out.push({ axis, cut, a: { label: name(axis, 0, cut - 1, true), points: A.length, score: sa }, b: { label: name(axis, cut, size - 1, false), points: B.length, score: sb } });
    }
  return out.sort((x, y) => Math.abs(y.a.score - y.b.score) - Math.abs(x.a.score - x.b.score))[0] ?? null;
}

/** What the phone's screen showed at a point, in a line. */
function sawAt(p: Scored, business: string) {
  const bits: string[] = [];
  if (p.pack) {
    if (p.oneBox === 'won') bits.push('The single listing in the map results');
    else if (p.oneBox === 'other') bits.push(`${p.first[0] ?? 'A rival'} held the single listing in the map results`);
    else if (p.rank) bits.push(`${ordinal(p.rank)[0].toUpperCase() + ordinal(p.rank).slice(1)} in the map results`);
    else bits.push('Not in the map results');
  }
  if (p.aiShown) {
    const ai = p.state === 'parsed'
      ? p.featured?.inline ? 'AI answer recommends it in its text' : p.featured?.card ? `AI answer card ${p.featured.card}${p.featured.of ? ` of ${p.featured.of}` : ''}${p.named ? ', named' : ''}` : p.named ? 'AI answer names it' : 'Not in the AI answer'
      : p.state === 'legacy' ? (p.old ? 'AI answer names it (read the earlier way)' : 'Not in the AI answer (read the earlier way)') : 'AI answer not readable';
    const cites = p.state === 'parsed' ? [p.listing ? 'listing cited' : '', p.website === 'confirmed' ? 'website cited' : ''].filter(Boolean).join(', ') : '';
    bits.push(cites ? `${ai}; ${cites}` : ai);
  }
  if (!p.pack && p.aiShown) bits[0] = 'AI answer only. ' + bits[0].replace(/^AI answer /, '').replace(/^card/, 'Card');
  return bits.join('. ').replace(/^(.)/, (c) => c.toUpperCase()) || (mine(p.first[0] ?? '', business) ? 'First on the page' : 'Not found');
}
const adsAt = (p: Point) => {
  const lsa = (p.ads ?? []).filter((a) => a.w === 'local_services').length, sp = (p.ads ?? []).filter((a) => a.w === 'results').length;
  return [lsa ? `${lsa} Local Services Ad${lsa > 1 ? 's' : ''}` : '', sp ? `${sp} sponsored result${sp > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ') || 'None';
};

/** County and city as DataForSEO names them, from the grid's census tracts and the market ("Lakeland, FL"). */
function placesOf(market: string | null, pins: Point[]) {
  const [city, st] = (market ?? '').split(',').map((x) => x.trim());
  const state = STATES[(st ?? '').toUpperCase()];
  const counties = pins.map((p) => /,\s*([^,]+ (County|Parish|Borough))\s*$/i.exec(p.tract ?? '')?.[1]).filter((x): x is string => Boolean(x));
  const county = counties.sort((a, b) => counties.filter((x) => x === b).length - counties.filter((x) => x === a).length)[0];
  return { city: city && state ? `${city},${state},United States` : null, county: county && state ? `${county},${state},United States` : null, cityName: city || null, countyName: county || null };
}

/** Variants Google may price when it withholds a search: lawyer ↔ attorney, with or without "near me". */
function variantsOf(kw: string) {
  const out = new Set<string>();
  const swap = kw.replace(/\b(lawyer|attorney)(s?)\b/, (_, w: string, s: string) => (w === 'lawyer' ? 'attorney' : 'lawyer') + s);
  for (const k of [kw, swap]) {
    out.add(k);
    out.add(/ near me$/.test(k) ? k.replace(/ near me$/, '') : k + ' near me');
  }
  out.delete(kw);
  return [...out].filter((k) => k.split(' ').length <= 10);
}

type Market = { county: string | null; city: string | null; countyName: string | null; cityName: string | null; prices: Record<string, KeywordPrice & { via?: string }>; searches: Record<string, number | null>; basket: { cpc: number; low: number | null; high: number | null; searches: number } | null; at: string };

/** Google Ads figures for searches in one place, each kept 14 days on its own, so any set of searches (a share link's too) reuses them. */
async function figures(keywords: string[], location: string, lookUp: boolean, alone: boolean) {
  const got = new Map<string, KeywordPrice | null>();
  if (!keywords.length) return got;
  const keyOf = (k: string) => 'stakeout:brief:kw:v1:' + createHash('sha256').update(location + '|' + k).digest('hex').slice(0, 32);
  const kept = await redis().mget(...keywords.map(keyOf)).catch(() => keywords.map(() => null));
  keywords.forEach((k, i) => { const v = kept[i]; if (v) got.set(k, JSON.parse(v) as KeywordPrice | null); });
  const missing = keywords.filter((k) => !got.has(k));
  if (!missing.length || !lookUp) return got;
  const r = await keywordPrices(missing, { location_name: location }, 'en', { alone });
  const answered = new Set(r.answered);
  for (const [i, k] of missing.entries()) {
    const p = r.results[i] ? { ...r.results[i], keyword: k } : null;
    const has = Boolean(p && (p.cpc !== null || p.searches !== null));
    got.set(k, has ? p : null);
    // An empty answer is kept only once Google has had its full say on it; otherwise the next owner view asks again.
    if (has || answered.has(k)) await redis().set(keyOf(k), JSON.stringify(has ? p : null), 'EX', KEEP_S).catch(() => null);
  }
  return got;
}

async function marketFor(v: VisibilityData, market: string | null, plain: string[], extra: string[], pins: Point[], lookUp: boolean): Promise<Market | null> {
  const where = placesOf(market, pins);
  if (!where.county || !pricesConfigured()) return null;
  const brand = brandSearch(v.business);
  const priced = [...new Set([...plain, ...plain.flatMap(variantsOf), ...extra, ...extra.flatMap(variantsOf), brand])].slice(0, 60);
  const counted = [...new Set([...plain, brand])];
  const county = await figures(priced, where.county, lookUp, true);
  const city = where.city ? await figures(counted, where.city, lookUp, false).catch(() => null) : null;
  if (![...county.values()].some(Boolean)) return null;
  const byKw = new Map([...county].filter((e): e is [string, KeywordPrice] => Boolean(e[1])));
  const prices: Market['prices'] = {};
  for (const k of [...plain, ...extra, brand]) {
    const own = byKw.get(k);
    if (own && own.cpc !== null) prices[k] = own;
    else {
      const alt = variantsOf(k).map((x) => byKw.get(x)).find((x) => x && x.cpc !== null);
      if (alt) prices[k] = { ...alt, keyword: k, via: alt.keyword };
    }
  }
  // The basket: the scanned searches and their variants, each group Google prices counted once, by searches.
  const seen = new Set<string>(), groups: KeywordPrice[] = [];
  for (const k of [...plain, ...plain.flatMap(variantsOf)]) {
    const p = byKw.get(k);
    if (!p || p.cpc === null || !p.searches) continue;
    const sig = [p.searches, p.cpc, p.lowBid, p.highBid].join('|');
    if (!seen.has(sig)) { seen.add(sig); groups.push(p); }
  }
  const total = groups.reduce((a, p) => a + (p.searches ?? 0), 0);
  const w = (f: (p: KeywordPrice) => number | null) => { const ok = groups.filter((p) => f(p) !== null); const t = ok.reduce((a, p) => a + (p.searches ?? 0), 0); return t ? ok.reduce((a, p) => a + (f(p) as number) * (p.searches ?? 0), 0) / t : null; };
  const out: Market = {
    ...where,
    prices,
    searches: Object.fromEntries(counted.map((k) => [k, city?.get(k)?.searches ?? null])),
    basket: total ? { cpc: w((p) => p.cpc) as number, low: w((p) => p.lowBid), high: w((p) => p.highBid), searches: total } : null,
    at: new Date().toISOString(),
  };
  return out;
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The brief, from the visibility report's data. `lookUp`: may pay for a price lookup (never on a share link). */
export async function buildBrief(v: VisibilityData, opts: { lookUp: boolean; assumptions: unknown; link: { report: string } }) {
  const business = v.business, short = shortName(business);
  const scans = v.scans.map((s) => ({ ...s, at: new Date(s.at as unknown as string).toISOString(), pins: scorePoints(s.pins as unknown as Point[]) })).sort((a, b) => b.at.localeCompare(a.at));
  const byKw = new Map<string, typeof scans>();
  for (const s of scans) byKw.set(words(s.kw), [...(byKw.get(words(s.kw)) ?? []), s]);
  const searches = [...byKw.values()].map((runs) => {
    const latest = runs[0];
    const earlier = runs.slice(1).filter((r) => Date.parse(latest.at) - Date.parse(r.at) <= 14 * DAY);
    const sum = summarize(latest.pins);
    const change = matchedChange(latest.pins, earlier.map((r) => r.pins));
    // Why there's no change yet: no earlier scan of these points, or earlier answers read the older way on a page with no map results.
    const legacy = [latest.pins, ...earlier.map((r) => r.pins)].flat().some((p) => p.reading === 'named') && !latest.pins.some((p) => p.pack);
    return {
      kw: latest.kw, scan: latest.id, at: latest.at, branded: isBranded(latest.kw, business), size: latest.size, km: latest.km,
      score: sum.score, weighted: sum.weighted, afterAds: sum.afterAds, points: sum.points,
      top3: latest.pins.filter(inTop3).length, first: latest.pins.filter(isFirst).length,
      change, changeWhy: change ? null : earlier.length && legacy ? ('legacy' as const) : ('first' as const),
      runs,
    };
  });
  const plain = searches.filter((s) => !s.branded);
  const use = plain.length ? plain : searches;
  const changes = use.map((s) => s.change).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const headline = {
    score: r1(mean(use.map((s) => s.score ?? 0))),
    weighted: r1(mean(use.map((s) => s.weighted ?? 0))),
    afterAds: r1(mean(use.map((s) => s.afterAds ?? 0))),
    change: changes.length ? { change: r1(mean(changes.map((c) => c.change))), points: changes.reduce((a, c) => a + c.points, 0), map: changes.some((c) => c.map) } : null,
    changeWhy: changes.length ? null : use.some((s) => s.changeWhy === 'legacy') ? ('legacy' as const) : ('first' as const),
    searches: use.map((s) => ({ kw: s.kw, score: r1(s.score), at: s.at })),
    branded: searches.filter((s) => s.branded && plain.length).map((s) => ({ kw: s.kw, score: r1(s.score) })),
  };

  // Exhibit A: the largest recent scan of a search that doesn't name the business.
  const newest = Date.parse(scans[0]?.at ?? new Date().toISOString());
  const pool = scans.filter((s) => !isBranded(s.kw, business) && newest - Date.parse(s.at) <= 14 * DAY);
  const ms = [...(pool.length ? pool : scans)].sort((a, b) => b.pins.length - a.pins.length || b.at.localeCompare(a.at))[0];
  const mapPins = ms.pins;
  const lsaPts = mapPins.filter(hasLsa).length;
  const split = splitOf(mapPins, ms.size);
  const pick = [...mapPins].sort((a, b) => b.score - a.score || Number(b.state === 'parsed') - Number(a.state === 'parsed') || (Math.abs(a.r - ms.size / 2) + Math.abs(a.c - ms.size / 2)) - (Math.abs(b.r - ms.size / 2) + Math.abs(b.c - ms.size / 2)))[0];
  const aiShownPts = mapPins.filter((p) => p.aiShown).length;
  const rivalPanels = mapPins.filter((p) => p.oneBox === 'other');
  const topRival = (() => {
    const c = new Map<string, number>();
    for (const p of rivalPanels) if (p.first[0]) c.set(p.first[0], (c.get(p.first[0]) ?? 0) + 1);
    const [name, count] = [...c].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    return name ? { name, count } : null;
  })();
  const map = {
    scan: ms.id, kw: ms.kw, at: ms.at, size: ms.size, km: ms.km, center: ms.center, points: mapPins.length,
    lsaPoints: lsaPts, aiPoints: aiShownPts,
    pins: mapPins.map((p) => ({ r: p.r, c: p.c, lat: p.lat, lng: p.lng, score: r1(p.score), afterAds: r1(p.afterAds), m: p.pack ? r1(p.mapPart) : null, a: p.aiShown ? r1(p.aiPart ?? 0) : null, reading: p.reading, lsa: hasLsa(p), ai1: aiFirstOf(p, business) === true, rival: p.oneBox === 'other', won: p.oneBox === 'won', first: isFirst(p), rank: p.rank, area: p.area })),
    split: split ? { axis: split.axis, cut: split.cut, a: { ...split.a, score: r1(split.a.score) }, b: { ...split.b, score: r1(split.b.score) } } : null,
    receipt: pick ? {
      r: pick.r, c: pick.c, area: pick.area, at: (pick as { at?: string | null }).at ?? ms.at, score: r1(pick.score), afterAds: r1(pick.afterAds),
      saw: sawAt(pick, business), ads: adsAt(pick), aiFirst: pick.aiFirst ?? [], first: pick.first ?? [], you: (pick.aiFirst ?? []).map((x) => mine(x, business)), youMap: (pick.first ?? []).map((x) => mine(x, business)),
      listingLinks: pick.state === 'parsed' && pick.listing && typeof pick.listing === 'object' ? (pick.listing.links ?? null) : null,
      inc: pick.inc ?? null, hh: pick.hh ?? null, rec: Boolean((pick as { rec?: boolean }).rec),
    } : null,
    first: { total: mapPins.filter(isFirst).length, panel: mapPins.filter((p) => p.oneBox === 'won').length, pack: mapPins.filter((p) => p.rank === 1 && p.oneBox !== 'won').length, ai: mapPins.filter((p) => aiFirstOf(p, business) === true).length, rivals: rivalPanels.length, topRival },
    top3: mapPins.filter(inTop3).length,
  };

  // Exhibit B: the same points across the runs of one search.
  const exB = (() => {
    const cands = searches.map((s) => {
      const latest = s.runs[0];
      const runs = s.runs.slice(1, 8).filter((r) => latest.pins.filter((p) => r.pins.some((q) => near(p, q))).length >= Math.min(4, latest.pins.length)).slice(0, 3);
      return { s, latest, runs };
    }).filter((x) => x.runs.length >= 1).sort((a, b) => b.runs.length - a.runs.length || b.latest.pins.length - a.latest.pins.length);
    const x = cands[0];
    if (!x) return null;
    const ordered = [...x.runs].reverse().concat([x.latest]);
    const pts = x.latest.pins.filter((p) => x.runs.every((r) => r.pins.some((q) => near(p, q))));
    if (pts.length < 4) return null;
    const rows0 = Math.min(...pts.map((p) => p.r)), cols0 = Math.min(...pts.map((p) => p.c));
    const H = Math.max(...pts.map((p) => p.r)) - rows0 + 1, W = Math.max(...pts.map((p) => p.c)) - cols0 + 1;
    const cell = (run: typeof scans[number], p: Scored) => run.pins.filter((q) => near(p, q)).sort((a, b) => dist(p, a) - dist(p, b))[0];
    const grids = (f: (q: Scored) => boolean | null) => ordered.map((run) => ({ at: run.at, cells: Array.from({ length: H * W }, (_, i) => { const p = pts.find((q) => (q.r - rows0) * W + (q.c - cols0) === i); if (!p) return 'x'; const q = cell(run, p); const v = q ? f(q) : null; return v === null ? 'u' : v ? '1' : '0'; }).join('') }));
    const ai = pts.some((p) => p.aiShown) ? grids((q) => aiFirstOf(q, business)) : null;
    const mapRow = pts.some((p) => p.pack) ? grids((q) => (q.pack ? isFirst(q) : null)) : null;
    const count = (g: string) => [...g].filter((c) => c === '1').length;
    return { kw: x.s.kw, points: pts.length, width: W, ai, map: mapRow, counts: { ai: ai?.map((g) => count(g.cells)) ?? null, map: mapRow?.map((g) => count(g.cells)) ?? null } };
  })();

  // Exhibit C: ads on the screens, on the map's scan; and the business's own, on its newest scan.
  const lsaBy = new Map<string, number>();
  for (const p of mapPins) for (const name of new Set((p.ads ?? []).filter((a) => a.w === 'local_services').map((a) => a.n))) lsaBy.set(name, (lsaBy.get(name) ?? 0) + 1);
  const otherBy = (w: string) => { const m = new Map<string, number>(); for (const p of mapPins) for (const name of new Set((p.ads ?? []).filter((a) => a.w === w).map((a) => a.n))) m.set(name, (m.get(name) ?? 0) + 1); return [...m].filter(([k]) => !mine(k, business)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, points]) => ({ name, points })); };
  const newestScan = scans[0];
  const ownNow = newestScan ? { scan: newestScan.id, at: newestScan.at, points: newestScan.pins.length, lsa: newestScan.pins.filter((p) => (p.ads ?? []).some((a) => a.w === 'local_services' && mine(a.n, business))).length, finder: newestScan.pins.filter((p) => (p.ads ?? []).some((a) => a.w === 'finder' && mine(a.n, business))).length, results: newestScan.pins.filter((p) => (p.ads ?? []).some((a) => a.w === 'results' && mine(a.n, business))).length } : null;
  const ads = {
    points: mapPins.length, lsaPoints: lsaPts, rivalsLsaPoints: mapPins.filter((p) => (p.ads ?? []).some((a) => a.w === 'local_services' && !mine(a.n, business))).length,
    ownLsaPoints: lsaBy.get([...lsaBy.keys()].find((k) => mine(k, business)) ?? '') ?? 0,
    lsa: [...lsaBy].filter(([k]) => !mine(k, business)).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, points]) => ({ name, points })),
    finder: otherBy('finder'), results: otherBy('results'), anyPoints: mapPins.filter((p) => (p.ads ?? []).length > 0).length, ownNow,
  };

  // Google's numbers, when the business's accounts are connected.
  const g = (v.google?.numbers ?? null) as null | { listing?: Record<string, unknown> | null; search?: Record<string, unknown> | null };
  const daily = (g?.listing as { daily?: { kind?: string; totals?: Record<string, number>; before?: Record<string, number> } } | null)?.daily;
  const ga = (g?.search as { ga?: { listing?: { recent?: { sessions?: number }; before?: { sessions?: number } } | null; page?: { recent?: { sessions?: number }; before?: { sessions?: number } } | null; recent?: { sessions?: number } | null } } | null)?.ga;
  const gsc = (g?.search as { gsc?: { recent?: { clicks?: number; impressions?: number; position?: number | null } | null; before?: { clicks?: number; impressions?: number; position?: number | null } | null; queries?: { query: string; clicks: number; impressions: number; position: number | null; es?: boolean }[]; spanish?: number; spanishShown?: number; listed?: number } } | null)?.gsc;
  const kwRows = ((g?.listing as { keywords?: { rows?: { keyword: string; latest: string; total: number; es?: boolean }[] } } | null)?.keywords?.rows) ?? [];
  const calls = daily?.kind === 'daily' ? { now: n(daily.totals?.calls), was: n(daily.before?.calls) } : null;
  const visits = ga?.listing ? { now: n(ga.listing.recent?.sessions), was: n(ga.listing.before?.sessions) } : null;
  const clicks = gsc?.recent ? { now: n(gsc.recent.clicks), was: n(gsc.before?.clicks) } : null;
  const connected = Boolean(calls || visits || clicks);
  const actions = connected ? { now: (calls?.now ?? 0) + (visits?.now ?? 0) + (clicks?.now ?? 0), was: (calls?.was ?? 0) + (visits?.was ?? 0) + (clicks?.was ?? 0), calls, visits, clicks, directions: daily?.kind === 'daily' ? { now: n(daily.totals?.directions), was: n(daily.before?.directions) } : null } : null;
  const periods = (g?.search as { periods?: unknown } | null)?.periods ?? (g?.listing as { periods?: unknown } | null)?.periods ?? null;
  const offPageOne = (gsc?.queries ?? []).filter((q) => q.position !== null && q.position > 8 && q.position <= 20 && !isBranded(q.query, business)).sort((a, b) => b.impressions - a.impressions).slice(0, 3);

  // Local prices and searches.
  const plainKws = [...new Set(plain.map((s) => words(s.kw)))];
  // The market: the listing's own city when Google says it, else the city at the grid's centre.
  const lc = g?.listing as { city?: string | null; region?: string | null } | null | undefined;
  const place = lc?.city && lc?.region ? `${lc.city}, ${lc.region}` : v.market;
  const market = await marketFor(v, place, plainKws, offPageOne.map((q) => words(q.query)), mapPins, opts.lookUp).catch(() => null);
  const priceOf = (k: string) => market?.prices[words(k)] ?? null;

  // Assumptions: the client's own, else the sample inputs.
  const base = defaultsFor(searches.map((s) => s.kw));
  const a = cleanAssumptions(opts.assumptions, base);
  const sample = !opts.assumptions;
  const cpc = a.cpc ?? market?.basket?.cpc ?? null;

  // The ledger.
  const perSearch = plain.map((s) => ({ kw: s.kw, searches: market?.searches[words(s.kw)] ?? null, price: priceOf(s.kw), top3Share: s.points ? s.top3 / s.points : 0, top3: s.top3, points: s.points, at: s.at }));
  const seen = perSearch.reduce((acc, s) => acc + (s.searches ?? 0) * s.top3Share, 0);
  const tapCpc = (() => { const t = perSearch.filter((s) => s.searches && s.price?.cpc); const w = t.reduce((acc, s) => acc + (s.searches as number) * s.top3Share, 0); return w ? t.reduce((acc, s) => acc + (s.searches as number) * s.top3Share * (s.price!.cpc as number), 0) / w : null; })();
  const ledger = connected
    ? { kind: 'connected' as const, actions, spend: cpc !== null && actions ? { now: actions.now * cpc, was: actions.was * cpc, cpc, low: market?.basket?.low ?? null, high: market?.basket?.high ?? null, own: a.cpc !== null } : null, pipeline: actions ? { value: actions.now * a.qualified * a.close * a.value, wins: actions.now * a.qualified * a.close } : null }
    : { kind: 'scan' as const, demand: market ? { searches: perSearch.reduce((acc, s) => acc + (s.searches ?? 0), 0), rows: perSearch.map((s) => ({ kw: s.kw, searches: s.searches })), low: Math.min(...perSearch.map((s) => s.price?.cpc ?? Infinity)), high: Math.max(...perSearch.map((s) => s.price?.cpc ?? -Infinity)) } : null, value: market && tapCpc ? { seen: Math.round(seen), taps: Math.round(seen) * a.tap, cpc: a.cpc ?? Math.round(tapCpc * 100) / 100, monthly: Math.round(seen) * a.tap * (a.cpc ?? Math.round(tapCpc * 100) / 100) } : null };

  // Next moves, ranked by the searches each puts in play a month.
  type Move = { title: string; why: string; inPlay: string; inPlayNote: string; price: string | null; weight: number; kw?: string; type: string };
  const moves: Move[] = [];
  const cpcText = (k: string) => { const p = priceOf(k); return p?.cpc ? `$${p.cpc.toFixed(2)} a click as an ad${market?.countyName ? ' in ' + market.countyName : ''}` : null; };
  for (const s of perSearch) {
    const sr = searches.find((x) => x.kw === s.kw)!;
    const first = sr.first / Math.max(1, sr.points);
    if (s.searches && first < 0.5) {
      const pins = sr.runs[0].pins;
      const places = [1, 2, 3].map((k) => ({ k, n: pins.filter((p) => p.rank === k && p.oneBox !== 'won').length + (k === 1 ? pins.filter((p) => p.oneBox === 'won').length : 0) })).filter((x) => x.n);
      const nf = pins.filter((p) => p.pack && !p.rank && p.oneBox !== 'won').length;
      moves.push({ type: 'first', kw: s.kw, title: `Get ${short} to first for “${s.kw}”`, why: `Of ${sr.points} points, ${short} came ${places.map((x) => `${ordinal(x.k)} at ${x.n}`).join(' and ') || 'below third at every one'}${nf ? `, and wasn’t found at ${nf}` : ''}.${places.some((x) => x.k === 1) ? '' : ' It never came first.'}`, inPlay: s.searches.toLocaleString('en-US'), inPlayNote: `searches a month${market?.cityName ? ' from ' + market.cityName : ''}`, price: cpcText(s.kw), weight: s.searches * (1 - first) });
    }
  }
  if (rivalPanels.length >= Math.max(3, 0.2 * mapPins.length) && split) {
    const side = (p: Scored) => ((split.axis === 'rows' ? p.r : p.c) < split.cut ? 'a' : 'b');
    const inA = rivalPanels.filter((p) => side(p) === 'a').length, where = inA >= rivalPanels.length - inA ? split.a.label : split.b.label;
    const vol = market?.searches[words(ms.kw)] ?? null;
    moves.push({ type: 'panel', kw: ms.kw, title: `Win the single listing Google shows in the ${where.replace(/ \d.*$/, '').toLowerCase()}`, why: `For “${ms.kw}”, Google’s map results showed a single listing at ${rivalPanels.length + map.first.panel} of ${mapPins.length} points. ${short} held ${map.first.panel}; rivals held ${rivalPanels.length}${topRival ? `, ${topRival.name} ${topRival.count} of them` : ''}.`, inPlay: `${rivalPanels.length} points`, inPlayNote: 'where a rival held the single listing, Exhibit A', price: cpcText(ms.kw), weight: (vol ?? 50) * (rivalPanels.length / mapPins.length) });
  }
  if (split && aiShownPts >= mapPins.length / 2) {
    const side = (p: Scored) => ((split.axis === 'rows' ? p.r : p.c) < split.cut ? 'a' : 'b');
    for (const h of ['a', 'b'] as const) {
      const pts = mapPins.filter((p) => side(p) === h && p.aiShown);
      const named = pts.filter((p) => p.state === 'parsed' ? Boolean(p.featured?.inline || (p.featured?.card && p.featured.card <= 3)) : (p.aiFirst ?? []).slice(0, 3).some((x) => mine(x, business))).length;
      if (pts.length >= 4 && named / pts.length < 0.25) {
        const vol = market?.searches[words(ms.kw)] ?? null;
        moves.push({ type: 'ai', kw: ms.kw + ':ai', title: `Win the AI answer in the ${split[h].label.replace(/ \d.*$/, '').toLowerCase()}`, why: `For “${ms.kw}”, Google’s AI answer named ${short} among its first three at ${named} of ${pts.length} points there.`, inPlay: `${pts.length} points`, inPlayNote: `averaging ${r1(mean(pts.map((p) => p.score)))} of 100, Exhibit A`, price: cpcText(ms.kw), weight: (vol ?? 50) * (pts.length / mapPins.length) * 0.8 });
      }
    }
  }
  if (connected) {
    const q = offPageOne[0];
    if (q) moves.push({ type: 'pageone', kw: q.query, title: `Put the page on page one for “${q.query}”`, why: `It sits at position ${r1(q.position)}, just past page one, and Google showed it ${q.impressions} times in 28 days.`, inPlay: q.impressions.toLocaleString('en-US'), inPlayNote: 'times Google showed the page for it in 28 days, Exhibit D', price: cpcText(q.query), weight: (q.impressions * 30) / 28 });
    const es = kwRows.filter((r) => r.es), esShown = es.reduce((acc, r) => acc + n(r.total), 0), allShown = kwRows.reduce((acc, r) => acc + n(r.total), 0);
    if (es.length && allShown && esShown / allShown >= 0.25 && n(gsc?.spanishShown) < 50)
      moves.push({ type: 'spanish', kw: 'es', title: 'Add a Spanish version of the page', why: `Spanish searches led the listing’s top searches, starting with “${es[0].keyword}”, while the website is barely shown for Spanish searches.`, inPlay: `${esShown}${es.some((r) => /^</.test(r.latest)) ? '+' : ''}`, inPlayNote: 'times Spanish searches showed the listing, Exhibit D', price: null, weight: esShown });
  }
  const weakest = [...plain].sort((x, y) => (x.score ?? 0) - (y.score ?? 0))[0];
  const firstMove = moves.filter((m) => m.type === 'first').sort((x, y) => y.weight - x.weight)[0];
  if (weakest && plain.length > 1 && firstMove?.kw !== weakest.kw) {
    const vol = market?.searches[words(weakest.kw)] ?? null;
    const wp = weakest.runs[0].pins.filter((p) => !p.excluded);
    const mapFirst = wp.filter(isFirst).length, aiFirst = wp.filter((p) => aiFirstOf(p, business) === true).length;
    const anyFirst = wp.filter((p) => isFirst(p) || aiFirstOf(p, business) === true).length;
    const said = [wp.some((p) => p.pack) && `first in the map results at ${mapFirst}`, wp.some((p) => p.aiShown) && `named first in Google’s AI answer at ${aiFirst}`].filter(Boolean).join(' and ');
    moves.push({ type: 'weakest', kw: weakest.kw, title: `Lift ${short} for “${weakest.kw}”`, why: `It’s ${/[’']s$/.test(short) ? short : short + '’s'} weakest search, at ${r1(weakest.score)} of 100${said ? `: ${said} of ${wp.length} points` : ''}.`, inPlay: vol ? vol.toLocaleString('en-US') : `${wp.length - anyFirst} of ${wp.length}`, inPlayNote: vol ? `searches a month${market?.cityName ? ' from ' + market.cityName : ''}${connected ? '' : ', Exhibit D'}` : `points where another business came first; Google gives no monthly count for this search`, price: cpcText(weakest.kw), weight: vol ?? 10 });
  }
  const ranked: Move[] = [];
  // One move of each kind (the biggest "get to first" only), ranked by what each puts in play.
  for (const m of moves.sort((x, y) => y.weight - x.weight)) if (!ranked.some((x) => x.kw === m.kw || x.type === m.type) && ranked.length < 3) ranked.push(m);

  // Receipts: the map scan's points, strongest first and the weakest after.
  const sorted = [...mapPins].sort((x, y) => y.score - x.score);
  const rc = [...sorted.slice(0, 4), ...sorted.slice(4).reverse().slice(0, 3).reverse()];
  const receipts = rc.map((p) => ({ point: `R${p.r + 1}·C${p.c + 1}`, area: p.area, saw: sawAt(p, business), ads: adsAt(p), score: r1(p.score), rec: Boolean((p as { rec?: boolean }).rec) }));

  return {
    version: SCORING_VERSION,
    built: new Date().toISOString(),
    business, short, website: v.website, market: place, brand: v.brand, mapStyle: v.map, link: opts.link,
    connected, periods, googleHidden: v.google === null,
    headline, searches: searches.map(({ runs, ...s }) => ({ ...s, score: r1(s.score), weighted: r1(s.weighted), afterAds: r1(s.afterAds), runs: runs.length })),
    map, exB, ads, ledger, assumptions: { ...a, sample, base },
    marketData: market ? { county: market.countyName, city: market.cityName, at: market.at, basket: market.basket, rows: [...perSearch.map((s) => ({ kw: s.kw, searches: s.searches, cpc: s.price?.cpc ?? null, low: s.price?.lowBid ?? null, high: s.price?.highBid ?? null, via: (s.price as { via?: string } | null)?.via ?? null, top3: s.top3, points: s.points, at: s.at })), (() => { const b = brandSearch(business); const p = market.prices[b]; return { kw: b, brand: true, searches: market.searches[b] ?? null, cpc: p?.cpc ?? null, low: p?.lowBid ?? null, high: p?.highBid ?? null, via: null, top3: null, points: null, at: null }; })()] } : null,
    google: connected ? { calls, visits, clicks, directions: actions?.directions ?? null, views: daily?.kind === 'daily' ? { now: n(daily.totals?.views), was: n(daily.before?.views) } : null, websiteClicks: daily?.kind === 'daily' ? { now: n(daily.totals?.websiteClicks), was: n(daily.before?.websiteClicks) } : null, pageVisits: ga?.page ? { now: n(ga.page.recent?.sessions), was: n(ga.page.before?.sessions) } : null, gsc: gsc?.recent ? { impressions: { now: n(gsc.recent.impressions), was: n(gsc.before?.impressions) }, position: { now: gsc.recent.position ?? null, was: gsc.before?.position ?? null } } : null, listingTop: kwRows.map((r) => ({ kw: r.keyword, latest: r.latest, es: Boolean(r.es), branded: isBranded(r.keyword, business) })), offPageOne, spanish: { listed: gsc?.listed ?? 0, spanish: gsc?.spanish ?? 0, shown: gsc?.spanishShown ?? 0 }, brandShown: (gsc?.queries ?? []).filter((q) => isBranded(q.query, business)).reduce((acc, q) => acc + q.impressions, 0), brandClicks: (gsc?.queries ?? []).filter((q) => isBranded(q.query, business)).reduce((acc, q) => acc + q.clicks, 0), totalShown: gsc?.recent?.impressions ?? 0 } : null,
    moves: ranked.map(({ weight, kw, type, ...m }) => m),
    receipts, receiptsTotal: scans.reduce((acc, s) => acc + s.pins.length, 0), scansTotal: scans.length,
    measured: { points: scans.reduce((acc, s) => acc + s.pins.length, 0), scans: scans.length, searches: searches.length, from: scans[scans.length - 1]?.at ?? null, to: scans[0]?.at ?? null },
  };
}

const dist = (a: Point, b: Point) => (typeof a.lat === 'number' && typeof b.lat === 'number' && typeof a.lng === 'number' && typeof b.lng === 'number' ? Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)) * 111320 : Infinity);
const near = (a: Point, b: Point) => dist(a, b) <= 150;
export type Brief = Awaited<ReturnType<typeof buildBrief>>;
export { paidUnitsAbove };
