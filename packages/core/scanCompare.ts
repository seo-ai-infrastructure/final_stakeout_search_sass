/**
 * Two scans of the same grid, side by side: what moved at each point, and how the whole grid
 * changed. Only scans of the same grid can be compared point by point; anything else that makes
 * the comparison less than fair (a different search, a different time of day) is said, not hidden.
 */
export type ComparedScan = {
  id: string; keyword: string; business: string; gridSize: number; spacingKm: number; centerLat: number; centerLng: number; targetType: string; createdAt: Date;
  pins: { row: number; col: number; status: string; rank: number | null; top3: string[] }[];
};

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const round1 = (n: number) => Math.round(n * 10) / 10;
/** Roughly how far apart two points are, in metres (fine for points a few kilometres apart). */
const metres = (a: { centerLat: number; centerLng: number }, b: { centerLat: number; centerLng: number }) =>
  Math.hypot((a.centerLat - b.centerLat) * 111320, (a.centerLng - b.centerLng) * 111320 * Math.cos((a.centerLat * Math.PI) / 180));

/** Why two scans cannot be compared point by point, or null. */
export function compareProblem(a: ComparedScan, b: ComparedScan): string | null {
  if (a.id === b.id) return 'Give two different scans.';
  if (a.gridSize !== b.gridSize) return `These scans use different grids (${a.gridSize}×${a.gridSize} and ${b.gridSize}×${b.gridSize}), so their points do not line up. Compare two scans of the same grid.`;
  if (Math.abs(a.spacingKm - b.spacingKm) > 0.01) return 'These scans space their points differently, so their points do not line up.';
  if (metres(a, b) > 150) return 'These scans are centred on different places, so their points do not line up.';
  return null;
}

function summary(s: ComparedScan) {
  const done = s.pins.filter((p) => p.status === 'COMPLETED'), found = done.filter((p) => p.rank !== null);
  return {
    pointsRead: done.length, inTop3: found.filter((p) => (p.rank as number) <= 3).length, first: found.filter((p) => p.rank === 1).length, notFound: done.length - found.length,
    averageRankWhereFound: found.length ? round1(found.reduce((n, p) => n + (p.rank as number), 0) / found.length) : null,
    shareOfLocalVoice: done.length ? round1((found.filter((p) => (p.rank as number) <= 3).length / done.length) * 100) : null,
  };
}

/** In how many points each other business is among the first three, the scanned business left out. */
function presence(s: ComparedScan): Map<string, { name: string; points: number }> {
  const out = new Map<string, { name: string; points: number }>();
  for (const p of s.pins) {
    if (p.status !== 'COMPLETED') continue;
    for (const name of p.top3) {
      const k = norm(name);
      if (!k || k === norm(s.business)) continue;
      const r = out.get(k) ?? { name, points: 0 };
      r.points++;
      out.set(k, r);
    }
  }
  return out;
}

/** `before` is the earlier scan, `after` the later one, whichever order they were given in. */
export function compareScans(x: ComparedScan, y: ComparedScan, timeZone = 'UTC') {
  const [before, after] = x.createdAt.getTime() <= y.createdAt.getTime() ? [x, y] : [y, x];
  const at = new Map(before.pins.map((p) => [p.row + '_' + p.col, p]));
  const points = after.pins.map((p) => {
    const was = at.get(p.row + '_' + p.col);
    const read = p.status === 'COMPLETED' && was?.status === 'COMPLETED';
    const b = was?.rank ?? null, a = p.rank;
    // A lower number is a better rank. "Not found" is worse than any rank.
    const move = !read ? 'not read in both' : a === b ? 'same' : a === null ? 'lost' : b === null ? 'gained' : a < b ? 'better' : 'worse';
    return { row: p.row, col: p.col, before: read || was?.status === 'COMPLETED' ? b : undefined, after: p.status === 'COMPLETED' ? a : undefined, move, ...(read && a !== null && b !== null && a !== b ? { places: b - a } : {}) };
  });
  const count = (m: string) => points.filter((p) => p.move === m).length;
  const pb = presence(before), pa = presence(after);
  const rivals = [...new Set([...pb.keys(), ...pa.keys()])].map((k) => ({ name: (pa.get(k) ?? pb.get(k))!.name, inTopThreeBefore: pb.get(k)?.points ?? 0, inTopThreeAfter: pa.get(k)?.points ?? 0 }))
    .map((r) => ({ ...r, change: r.inTopThreeAfter - r.inTopThreeBefore })).sort((p, q) => Math.abs(q.change) - Math.abs(p.change) || q.inTopThreeAfter - p.inTopThreeAfter).slice(0, 8);
  const clock = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
  const hour = (d: Date) => Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(d)) % 24;
  const apart = Math.min(Math.abs(hour(before.createdAt) - hour(after.createdAt)), 24 - Math.abs(hour(before.createdAt) - hour(after.createdAt)));
  const cautions = [
    ...(norm(before.keyword) !== norm(after.keyword) ? [`Different searches: “${before.keyword}” and “${after.keyword}”.`] : []),
    ...(norm(before.business) !== norm(after.business) ? [`Different businesses: “${before.business}” and “${after.business}”.`] : []),
    ...(before.targetType !== after.targetType ? ['One searched Google, the other the Google Maps app: their results are ranked differently.'] : []),
    ...(apart >= 2 ? [`Run at different times of day (${clock(before.createdAt)} and ${clock(after.createdAt)}). Google ranks a business higher while it is shown as open, so part of the difference may be the hour, not a real change.`] : []),
    ...(after.createdAt.getTime() - before.createdAt.getTime() < 3 * 86400000 ? ['Less than three days apart: this shows day-to-day movement, not a trend.'] : []),
    ...(count('not read in both') ? [`${count('not read in both')} point(s) were not read in both scans and are left out of the counts.`] : []),
  ];
  return {
    before: { id: before.id, at: clock(before.createdAt), ...summary(before) }, after: { id: after.id, at: clock(after.createdAt), ...summary(after) },
    timesShownIn: timeZone, keyword: after.keyword, business: after.business, grid: `${after.gridSize}×${after.gridSize}`,
    moved: { better: count('better'), worse: count('worse'), same: count('same'), gained: count('gained'), lost: count('lost') },
    points,
    rivalsInTheTopThree: { note: 'How many points each other business is among the first three results at. Being counted does not mean it is above the scanned business at that point.', list: rivals },
    cautions,
  };
}
