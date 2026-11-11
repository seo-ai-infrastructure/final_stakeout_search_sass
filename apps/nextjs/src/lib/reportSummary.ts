import { buyingPower } from './buyingPower';
import { aiSources, groundOwners, paidPressure, winningRadius, type InsightPin } from './marketInsights';

export type RankBucket = { key: 'first' | 'top3' | 'top10' | 'beyond' | 'absent'; label: string; count: number; pct: number };

/** How the completed points split by rank: #1, #2–3, #4–10, #11 and lower, not found. */
export function rankDistribution(pins: InsightPin[]): { total: number; buckets: RankBucket[] } {
  const done = pins.filter((p) => p.status === 'COMPLETED');
  const of = (test: (r: number | null) => boolean) => done.filter((p) => test(p.rankFound ?? null)).length;
  const raw: [RankBucket['key'], string, number][] = [
    ['first', '#1', of((r) => r === 1)],
    ['top3', '#2–3', of((r) => r !== null && r >= 2 && r <= 3)],
    ['top10', '#4–10', of((r) => r !== null && r >= 4 && r <= 10)],
    ['beyond', '#11 and lower', of((r) => r !== null && r > 10)],
    ['absent', 'Not found', of((r) => r === null)],
  ];
  return { total: done.length, buckets: raw.map(([key, label, count]) => ({ key, label, count, pct: done.length ? (100 * count) / done.length : 0 })) };
}

const pct = (n: number) => `${Math.round(n)}%`;
const points = (n: number) => (n === 1 ? '1 point' : `${n} points`);

/**
 * The report's headline numbers and what they mean, in plain language. Every finding is a sentence
 * built from the scan's own data; one is only included when the data behind it exists.
 */
export function reportSummary(scan: { pins: InsightPin[]; targetBusiness: string; centerLat: number; centerLng: number }) {
  const dist = rankDistribution(scan.pins);
  const top3 = dist.buckets[0].count + dist.buckets[1].count;
  const found = scan.pins.filter((p) => p.status === 'COMPLETED' && p.rankFound != null);
  const avgRank = found.length ? found.reduce((n, p) => n + (p.rankFound as number), 0) / found.length : null;
  const bp = buyingPower(scan.pins);
  const owners = groundOwners(scan.pins, scan.targetBusiness);
  const radius = winningRadius(scan.pins, { lat: scan.centerLat, lng: scan.centerLng });
  const paid = paidPressure(scan.pins);
  const ai = aiSources(scan.pins, scan.targetBusiness);
  const you = owners.rows.find((r) => r.isYou);
  const rival = owners.rows.filter((r) => !r.isYou).sort((a, b) => b.top3Points - a.top3Points)[0];

  const findings: string[] = [];
  if (dist.total) {
    findings.push(
      top3 === 0
        ? `${scan.targetBusiness} is not in the top 3 at any of the ${points(dist.total)}.`
        : top3 === dist.total
          ? `${scan.targetBusiness} is in the top 3 at every point (${dist.total} of ${dist.total}).`
          : `${scan.targetBusiness} is in the top 3 at ${top3} of ${points(dist.total)} (${pct((100 * top3) / dist.total)}), and #1 at ${dist.buckets[0].count}.`,
    );
    if (dist.buckets[4].count) findings.push(`It does not appear in the results at ${points(dist.buckets[4].count)}.`);
  }
  if (bp.standard !== null && bp.buyingPower !== null && Math.abs(bp.buyingPower - bp.standard) >= 5)
    findings.push(
      bp.buyingPower > bp.standard
        ? `Its top-3 points cover more buying power than their number suggests: ${pct(bp.standard)} of points but ${pct(bp.buyingPower)} of the grid's buying power.`
        : `Its top-3 points cover less buying power than their number suggests: ${pct(bp.standard)} of points but only ${pct(bp.buyingPower)} of the grid's buying power.`,
    );
  if (radius?.radius != null && radius.beyond.total)
    findings.push(`It holds the top 3 out to about ${radius.radius.toFixed(1)} miles; beyond that it is top 3 at ${radius.beyond.top3} of ${points(radius.beyond.total)}.`);
  if (rival && rival.top3Points > 0)
    findings.push(
      rival.top3Points > (you?.top3Points ?? 0)
        ? `${rival.name} is in the top 3 at more points (${rival.top3Points}) than ${scan.targetBusiness} (${you?.top3Points ?? 0}).`
        : `The closest competitor, ${rival.name}, is in the top 3 at ${points(rival.top3Points)}.`,
    );
  if (paid.points && paid.withAds)
    findings.push(
      `Ads appear at ${paid.withAds} of ${points(paid.points)}` +
        (paid.avgAdsAboveYou ? `, with about ${paid.avgAdsAboveYou.toFixed(1)} above ${scan.targetBusiness} on average.` : '.'),
    );
  if (ai.points && ai.shown)
    findings.push(`An AI Overview appeared at ${ai.shown} of ${points(ai.points)}; ${scan.targetBusiness} was named at ${ai.youNamed}.`);

  return {
    completed: dist.total,
    top3,
    standard: bp.standard,
    buyingPower: bp.buyingPower,
    avgRank,
    found: found.length,
    distribution: dist,
    owners: owners.rows,
    ai,
    findings,
  };
}
