import { isLocalFinder, isMapsList, readAiCopy, readAiOverview, readLocalFinder, readMapsList, readResultsPage, sameBusiness } from './serpEvidence';

/**
 * A compact record of what the phone saw at one point, saved on the point (GridPin.insights) so
 * reports can compare points without reopening evidence bundles: the Local Finder with each
 * business's distance, who advertised, and which websites the AI Overview cited.
 */
export type InsightListing = { name: string; pos: number | null; ad: boolean; miles: number | null; rating: number | null; reviews: number | null };
export type PinInsights = {
  v: 1;
  /** Local Finder cards in page order (ads included). */
  finder: InsightListing[];
  /** The tracked business in the Local Finder here: organic position and distance from the phone. */
  you: { pos: number | null; miles: number | null };
  /** Advertisers at this point, once each per place. */
  ads: { name: string; where: 'results' | 'local_services' | 'finder' | 'maps' }[];
  /** Ads shown before the business's own card in the Local Finder (null when it is not listed). */
  adsAboveYou: number | null;
  /** The AI Overview: whether one was shown, the websites it cited (in order) and the businesses it named. */
  ai: { shown: boolean; sources: string[]; named: string[] };
};

/** "0.4 mi" / "850 ft" / "1.2 km" as miles. */
export function toMiles(d: string | null | undefined): number | null {
  const m = /^(\d+(?:\.\d+)?) ?(mi|ft|km)$/.exec((d ?? '').trim());
  if (!m) return null;
  const v = Number(m[1]);
  return Math.round((m[2] === 'mi' ? v : m[2] === 'ft' ? v / 5280 : v * 0.621371) * 100) / 100;
}

/** "6.5K" / "1,234" / "85" as a number. */
export function toCount(r: string | null | undefined): number | null {
  const m = /^(\d+(?:[.,]\d+)?)(K)?$/i.exec((r ?? '').trim());
  if (!m) return null;
  const v = Number(m[1].replace(',', m[2] ? '.' : ''));
  return Math.round(m[2] ? v * 1000 : v);
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function buildPinInsights(input: {
  serp: string | null;
  finder: string | null;
  aiExpanded?: string | null;
  aiCopy?: string | null;
  /** Maps app points: every list snapshot in order (the final one included). */
  mapsScreens?: (string | null | undefined)[];
  target: string;
}): PinInsights {
  const maps = input.mapsScreens?.some((x) => isMapsList(x)) ? readMapsList(input.mapsScreens) : null;
  const list = maps ? [] : input.finder && isLocalFinder(input.finder) ? readLocalFinder(input.finder) : [];
  const finder: InsightListing[] = maps
    ? maps.map((c) => ({ name: c.name, pos: c.pos, ad: c.ad, miles: toMiles(c.distance), rating: c.rating ? Number(c.rating) : null, reviews: toCount(c.reviews) }))
    : list.map((l) => ({
        name: l.name,
        pos: l.pos,
        ad: l.ad,
        miles: toMiles(l.distance),
        rating: l.rating ? Number(l.rating) : null,
        reviews: toCount(l.reviews),
      }));
  const youAt = finder.findIndex((l) => !l.ad && sameBusiness(l.name, input.target));
  const you = youAt >= 0 ? { pos: finder[youAt].pos, miles: finder[youAt].miles } : { pos: null, miles: null };

  const ads: PinInsights['ads'] = [];
  const add = (name: string, where: PinInsights['ads'][number]['where']) => {
    if (!ads.some((a) => a.where === where && sameBusiness(a.name, name))) ads.push({ name, where });
  };
  const page = input.serp ? readResultsPage(input.serp) : null;
  for (const l of page?.pack ?? []) if (l.ad) add(l.name, 'results');
  for (const l of page?.localServicesAds.listings ?? []) add(l.name, 'local_services');
  for (const l of finder) if (l.ad) add(l.name, maps ? 'maps' : 'finder');
  const adsAboveYou = youAt >= 0 ? finder.slice(0, youAt).filter((l) => l.ad).length : null;

  let sources: string[] = [],
    named: string[] = [];
  if (input.aiCopy) {
    const copy = readAiCopy(input.aiCopy);
    sources = [...new Set(copy.citations.map((c) => domainOf(c.url)).filter((d): d is string => Boolean(d)))];
    named = copy.businesses.map((b) => b.name);
  }
  if (!named.length && input.aiExpanded) named = readAiOverview(input.aiExpanded)?.businesses.map((b) => b.name) ?? [];
  // An AI Overview was shown only if one was copied or a snapshot actually holds one: a saved
  // aio_ snapshot file on its own proves nothing (the template saves one on every page).
  const shown = Boolean(input.aiCopy?.trim() || (input.aiExpanded && readAiOverview(input.aiExpanded)) || page?.aiPreview);
  return { v: 1, finder, you, ads, adsAboveYou, ai: { shown, sources, named } };
}
