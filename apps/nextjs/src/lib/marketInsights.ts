import type { PinInsights } from '@stakeout/core/pinInsights';
import { pointShares, type BuyingPowerPin } from './buyingPower';

/** Grid-wide insights for the report, from what each point stored (ranks, Census weights, insights). */
export type InsightPin = BuyingPowerPin & {
  lat: number;
  lng: number;
  topCompetitors?: string[] | null;
  insights?: PinInsights | null;
};

const norm = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/\b(llc|inc|co|corp|company|ltd)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const done = (pins: InsightPin[]) => pins.filter((p) => p.status === 'COMPLETED');

/** 1. Who owns the valuable ground: each business's share of the grid's buying power where it is top 3. */
export function groundOwners(pins: InsightPin[], target: string, limit = 8) {
  const shares = pointShares(pins);
  const ranked = done(pins).filter((p) => p.topCompetitors?.length);
  const total = ranked.reduce((a, p) => a + (shares.get(p.id) ?? 0), 0);
  const rows = new Map<string, { name: string; top3: number; share: number }>();
  for (const p of ranked)
    for (const name of p.topCompetitors!.slice(0, 3)) {
      const r = rows.get(norm(name)) ?? { name, top3: 0, share: 0 };
      r.top3++;
      r.share += shares.get(p.id) ?? 0;
      rows.set(norm(name), r);
    }
  const all = [...rows.values()]
    .map((r) => ({
      name: r.name,
      isYou: norm(r.name) === norm(target),
      top3Points: r.top3,
      standard: ranked.length ? (100 * r.top3) / ranked.length : 0,
      buyingPower: total > 0 ? (100 * r.share) / total : null,
    }))
    .sort((a, b) => (b.buyingPower ?? 0) - (a.buyingPower ?? 0) || b.top3Points - a.top3Points);
  if (!all.some((r) => r.isYou)) all.push({ name: target, isYou: true, top3Points: 0, standard: 0, buyingPower: total > 0 ? 0 : null });
  return { rows: [...all.slice(0, limit), ...all.slice(limit).filter((r) => r.isYou)], points: ranked.length };
}

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(7917.6 * Math.asin(Math.sqrt(h)) * 100) / 100;
}

/**
 * 2. The winning radius: how far from the business it holds the top 3. Distances are Google's own
 * (from each point's Local Finder card); when the listing shows none, the grid's centre stands in.
 * The radius is the farthest top-3 point at which at least 3 in 4 points so far are top 3.
 */
export function winningRadius(pins: InsightPin[], center: { lat: number; lng: number }) {
  const points = done(pins)
    .map((p) => {
      const google = p.insights?.you?.miles ?? null;
      return { id: p.id, miles: google ?? milesBetween(p, center), fromGoogle: google !== null, rank: p.rankFound ?? null };
    })
    .sort((a, b) => a.miles - b.miles);
  if (!points.length) return null;
  const top = (r: number | null) => r !== null && r >= 1 && r <= 3;
  let radius: number | null = null,
    hits = 0;
  points.forEach((p, i) => {
    if (top(p.rank)) hits++;
    if (top(p.rank) && hits / (i + 1) >= 0.75) radius = p.miles;
  });
  const split = (inside: boolean) => {
    const list = points.filter((p) => (radius === null ? !inside : inside ? p.miles <= radius : p.miles > radius));
    return { top3: list.filter((p) => top(p.rank)).length, total: list.length };
  };
  const source = points.every((p) => p.fromGoogle) ? 'google' : points.some((p) => p.fromGoogle) ? 'mixed' : 'center';
  return { points, radius: radius as number | null, within: split(true), beyond: split(false), source };
}

/** 4. Paid pressure: who advertises where, and how many ads sit above the business in the Local Finder. */
export function paidPressure(pins: InsightPin[]) {
  const seen = done(pins).filter((p) => p.insights);
  const rows = new Map<string, { name: string; points: Set<string>; where: Set<string> }>();
  let withAds = 0;
  const above: number[] = [];
  for (const p of seen) {
    const i = p.insights!;
    if (i.ads.length) withAds++;
    if (i.adsAboveYou !== null) above.push(i.adsAboveYou);
    for (const a of i.ads) {
      const r = rows.get(norm(a.name)) ?? { name: a.name, points: new Set<string>(), where: new Set<string>() };
      r.points.add(p.id);
      r.where.add(a.where);
      rows.set(norm(a.name), r);
    }
  }
  return {
    points: seen.length,
    withAds,
    avgAdsAboveYou: above.length ? above.reduce((a, b) => a + b, 0) / above.length : null,
    advertisers: [...rows.values()]
      .map((r) => ({ name: r.name, points: r.points.size, where: [...r.where].sort() }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
  };
}

/** 5. What AI cites: the websites the AI Overviews linked to across the grid, and whether they named the business. */
export function aiSources(pins: InsightPin[], target: string) {
  const seen = done(pins).filter((p) => p.insights);
  const shown = seen.filter((p) => p.insights!.ai.shown);
  const counts = new Map<string, number>();
  for (const p of shown) for (const d of new Set(p.insights!.ai.sources)) counts.set(d, (counts.get(d) ?? 0) + 1);
  return {
    points: seen.length,
    shown: shown.length,
    youNamed: shown.filter((p) => p.insights!.ai.named.some((n) => norm(n) === norm(target))).length,
    sources: [...counts]
      .map(([domain, points]) => ({ domain, points, label: domain === 'google.com' ? 'Google Business Profiles' : domain }))
      .sort((a, b) => b.points - a.points || a.domain.localeCompare(b.domain)),
  };
}
