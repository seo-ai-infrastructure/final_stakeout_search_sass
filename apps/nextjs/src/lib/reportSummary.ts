import { buyingPower } from './buyingPower';
import { aiBusinesses, aiPosition, aiSources, aiVersusPack, groundOwners, packOrder, paidPressure, siteKind, winningRadius, type InsightPin } from './marketInsights';

/** What a finding is about. */
export type FindingKind = 'rank' | 'bp' | 'radius' | 'rival' | 'ads' | 'ai';

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

/** The band a rank falls in (null: the business was not found at that point). */
export function bandOf(rank: number | null | undefined): RankBucket['key'] {
  if (rank == null) return 'absent';
  return rank === 1 ? 'first' : rank <= 3 ? 'top3' : rank <= 10 ? 'top10' : 'beyond';
}

/** One word for the headline score: how much of the grid the business holds. */
export function verdictFor(solv: number | null | undefined): { label: string; tone: 'strong' | 'patchy' | 'weak' | 'none' } {
  if (solv == null) return { label: 'No result yet', tone: 'none' };
  return solv >= 70 ? { label: 'Strong', tone: 'strong' } : solv >= 40 ? { label: 'Patchy', tone: 'patchy' } : { label: 'Weak', tone: 'weak' };
}

const pct = (n: number) => `${Math.round(n)}%`;
const points = (n: number) => (n === 1 ? '1 point' : `${n} points`);

/**
 * The report's headline numbers and what they mean, in plain language. Every finding is a sentence
 * built from the scan's own data; one is only included when the data behind it exists.
 */
/**
 * Share of local search: at how many points the business is in the top three of whatever Google
 * showed there. Where the page had a map pack, that is the local results; where it had none, the
 * AI Overview (its list, or its opening sentences: "position zero"). The two parts are also given
 * on their own: Share of Local Voice over the points with a map pack, and the AI Overview over
 * the points that had one.
 */
export function searchShare(pins: InsightPin[], target: string) {
  const done = pins.filter((p) => p.status === 'COMPLETED');
  const noPack = (p: InsightPin) => Boolean(p.proxyMeta?.noLocal);
  const local = done.filter((p) => !noPack(p));
  const localTop3 = local.filter((p) => p.rankFound != null && p.rankFound <= 3).length;
  const place = (p: InsightPin) => p.proxyMeta?.aiPosition ?? (p.insights?.v === 1 ? (aiPosition(p.insights.ai.named, target)?.pos ?? null) : null);
  const answered = done.filter((p) => p.hasAiOverview ?? (p.insights?.v === 1 && p.insights.ai.shown));
  const zero = (p: InsightPin) => Boolean(p.proxyMeta?.aiLead);
  const aiTop = (p: InsightPin) => zero(p) || ((place(p) ?? 99) <= 3);
  const wins = localTop3 + done.filter((p) => noPack(p) && aiTop(p)).length;
  return {
    points: done.length,
    wins,
    share: done.length ? (100 * wins) / done.length : null,
    /** Map pack: points that had one, and the business's top-three share of them (Share of Local Voice). */
    local: { points: local.length, top3: localTop3, first: local.filter((p) => p.rankFound === 1).length, solv: local.length ? (100 * localTop3) / local.length : null },
    /** AI Overview: points that had one, where the business is named, in its top three, and in its opening sentences. */
    ai: { points: answered.length, named: answered.filter((p) => p.targetCitedInAi || place(p) != null || zero(p)).length, top3: answered.filter(aiTop).length, zero: answered.filter(zero).length, winsWithoutPack: wins - localTop3 },
  };
}

export function reportSummary(scan: { pins: InsightPin[]; targetBusiness: string; centerLat: number; centerLng: number }) {
  // Rank numbers are about the points that had local results. A point with no map pack has no
  // local rank: it is left out here and counted under the AI Overview.
  const allDone = scan.pins.filter((p) => p.status === 'COMPLETED').length;
  const localPins = scan.pins.filter((p) => !(p.status === 'COMPLETED' && p.proxyMeta?.noLocal));
  const share = searchShare(scan.pins, scan.targetBusiness);
  const dist = rankDistribution(localPins);
  const top3 = dist.buckets[0].count + dist.buckets[1].count;
  const found = localPins.filter((p) => p.status === 'COMPLETED' && p.rankFound != null);
  const avgRank = found.length ? found.reduce((n, p) => n + (p.rankFound as number), 0) / found.length : null;
  const bp = buyingPower(localPins);
  const owners = groundOwners(localPins, scan.targetBusiness);
  const radius = winningRadius(localPins, { lat: scan.centerLat, lng: scan.centerLng });
  const paid = paidPressure(scan.pins);
  const ai = aiSources(scan.pins, scan.targetBusiness);
  const aiNamed = aiBusinesses(scan.pins, scan.targetBusiness);
  // Each AI-named business against its place on the local leaderboard, and each cited site's kind.
  const pack = packOrder(scan.pins);
  const aiVs = aiVersusPack(aiNamed.rows.map((r) => r.name), pack);
  const known = [...new Set([...pack, ...aiNamed.rows.map((r) => r.name)])];
  const aiSites = ai.sources.map((x) => ({ ...x, kind: siteKind(x.domain, scan.targetBusiness, known) }));
  const you = owners.rows.find((r) => r.isYou);
  const rival = owners.rows.filter((r) => !r.isYou).sort((a, b) => b.top3Points - a.top3Points)[0];

  // Who holds #1 at each completed point (the first name in the point's ordered results).
  const firsts = new Map<string, { name: string; points: number; isYou: boolean }>();
  for (const p of localPins) {
    const name = p.status === 'COMPLETED' ? p.topCompetitors?.[0] : null;
    if (!name) continue;
    const key = name.toLowerCase().trim();
    const row = firsts.get(key) ?? { name, points: 0, isYou: key === scan.targetBusiness.toLowerCase().trim() };
    row.points++;
    firsts.set(key, row);
  }
  const leaders = [...firsts.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const findings: string[] = [];
  // What each finding is about, in step with `findings`: the report shows them as chips that
  // switch the map to the matching view.
  const findingKinds: FindingKind[] = [];
  const note = (kind: FindingKind, text: string) => {
    findings.push(text);
    findingKinds.push(kind);
  };
  const noPackPoints = allDone - dist.total;
  if (noPackPoints)
    note(
      'ai',
      dist.total
        ? `Google showed no map pack at ${noPackPoints} of ${points(allDone)}: those have no local rank, and what counts there is the AI Overview.`
        : `Google showed no map pack at any of the ${points(allDone)}, so there is no local rank on this search. What counts here is the AI Overview: ${scan.targetBusiness} is in its top three or opening line at ${share.ai.top3} of ${points(share.ai.points)}.`,
    );
  if (dist.total) {
    note('rank', 
      top3 === 0
        ? `${scan.targetBusiness} is not in the top 3 at any of the ${points(dist.total)}.`
        : top3 === dist.total
          ? `${scan.targetBusiness} is in the top 3 at every point (${dist.total} of ${dist.total}), and #1 at ${dist.buckets[0].count}.`
          : `${scan.targetBusiness} is in the top 3 at ${top3} of ${points(dist.total)} (${pct((100 * top3) / dist.total)}), and #1 at ${dist.buckets[0].count}.`,
    );
    if (dist.buckets[4].count) note('rank', `It does not appear in the results at ${points(dist.buckets[4].count)}.`);
  }
  if (bp.standard !== null && bp.buyingPower !== null && Math.abs(bp.buyingPower - bp.standard) >= 5)
    note('bp', 
      bp.buyingPower > bp.standard
        ? `Its top-3 points cover more buying power than their number suggests: ${pct(bp.standard)} of points but ${pct(bp.buyingPower)} of the grid's buying power.`
        : `Its top-3 points cover less buying power than their number suggests: ${pct(bp.standard)} of points but only ${pct(bp.buyingPower)} of the grid's buying power.`,
    );
  if (radius?.radius != null && radius.beyond.total)
    note('radius', `It holds the top 3 out to about ${radius.radius.toFixed(1)} miles; beyond that it is top 3 at ${radius.beyond.top3} of ${points(radius.beyond.total)}.`);
  if (rival && rival.top3Points > 0)
    note('rival', 
      rival.top3Points > (you?.top3Points ?? 0)
        ? `${rival.name} is in the top 3 at more points (${rival.top3Points}) than ${scan.targetBusiness} (${you?.top3Points ?? 0}).`
        : `The closest competitor, ${rival.name}, is in the top 3 at ${points(rival.top3Points)}.`,
    );
  if (paid.points && paid.withAds)
    note('ads', 
      `Ads appear at ${paid.withAds} of ${points(paid.points)}` +
        (paid.avgAdsAboveYou ? `, with about ${paid.avgAdsAboveYou.toFixed(1)} above ${scan.targetBusiness} on average.` : '.'),
    );
  if (ai.points && ai.shown)
    note('ai', 
      `An AI Overview appeared at ${ai.shown} of ${points(ai.points)}; ${scan.targetBusiness} was named at ${ai.youNamed}.` +
        (aiNamed.you ? ` Where the AI listed businesses, it was named first at ${aiNamed.you.first} of ${aiNamed.lists} and placed #${aiNamed.you.avgPos} on average.` : ''),
    );

  return {
    completed: allDone,
    /** Points whose page had a map pack: what the rank numbers below are counted over. */
    localPoints: dist.total,
    share,
    top3,
    standard: bp.standard,
    buyingPower: bp.buyingPower,
    avgRank,
    found: found.length,
    distribution: dist,
    owners: owners.rows,
    leaders,
    radiusMiles: radius?.radius ?? null,
    adsAboveYou: paid.avgAdsAboveYou,
    ai,
    aiNamed,
    findingKinds,
    aiVs,
    aiSites,
    rivalName: rival?.name ?? null,
    findings,
  };
}
