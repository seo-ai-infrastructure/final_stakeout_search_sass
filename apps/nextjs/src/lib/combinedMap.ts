/**
 * The combined map: one reading per grid point that takes in both places a business can appear
 * on the results page: the AI Overview at the top, and the local results under it.
 *
 * A local-only map marks a point "20+" whenever the business is missing from the local results,
 * even where the AI Overview above them names it first. Here a point is a miss only when the
 * business is in neither.
 */
export type CombinedKind = 'both' | 'ai' | 'local' | 'miss';
export type CombinedReading = {
  kind: CombinedKind;
  /** Place in the AI Overview's list; 'named' = mentioned without a place; 'no' = an AI Overview
   *  appeared without the business; null = no AI Overview at this point. */
  ai: number | 'named' | 'no' | null;
  /** Rank in the local results (map pack, Local Finder or single-business result); null = not in them. */
  local: number | null;
  /** The best placement of the two is in the top 3 (or the business is named without a place). */
  top3: boolean;
  /** What the pin leads with, and the other reading under it. */
  hero: string;
  sub: string;
};

export function combinedReading(p: {
  /** The stored rank. On a page with no local results it holds the place in the AI Overview's list. */
  rank: number | null;
  /** Where the stored rank was read from, when the full local list was not opened. */
  rankFrom: string | null;
  hasAiOverview: boolean;
  cited: boolean;
  /** The business's place in this point's AI Overview list, when the answer was a list. */
  aiPos: number | null;
}): CombinedReading {
  const fromAiList = p.rankFrom === 'ai_overview_list';
  const local = fromAiList || p.rankFrom === 'none' ? null : p.rank;
  const aiPlace = p.aiPos ?? (fromAiList ? p.rank : null);
  const ai: CombinedReading['ai'] = aiPlace != null ? aiPlace : p.cited ? 'named' : p.hasAiOverview ? 'no' : null;
  const inAi = typeof ai === 'number' || ai === 'named', inLocal = local != null;
  const kind: CombinedKind = inAi && inLocal ? 'both' : inAi ? 'ai' : inLocal ? 'local' : 'miss';
  const aiShort = typeof ai === 'number' ? 'AI #' + ai : ai === 'named' ? 'AI yes' : ai === 'no' ? 'No AI' : 'AI none';
  const lpShort = inLocal ? 'LP #' + local : 'LP 20+';
  if (kind === 'miss') return { kind, ai, local, top3: false, hero: '20+', sub: aiShort };
  if (kind === 'ai') return { kind, ai, local, top3: ai === 'named' || (ai as number) <= 3, hero: aiShort, sub: lpShort };
  if (kind === 'local') return { kind, ai, local, top3: local! <= 3, hero: lpShort, sub: aiShort };
  const best = typeof ai === 'number' ? Math.min(ai, local!) : local!;
  return { kind, ai, local, top3: best <= 3, hero: '#' + best, sub: (typeof ai === 'number' ? 'AI ' + ai : 'AI yes') + ' · LP ' + local };
}

/** Pin colours: one hue per kind, strong for a top-3 placement and pale for 4th or lower. */
export const COMBINED_COLORS: Record<CombinedKind, { strong: string; pale: string; label: string }> = {
  both: { strong: '#34d399', pale: '#bbf7d0', label: 'In both' },
  ai: { strong: '#7c3aed', pale: '#c4b5fd', label: 'AI Overview only (rescued)' },
  local: { strong: '#38bdf8', pale: '#bae6fd', label: 'Local results only' },
  miss: { strong: '#9f1239', pale: '#9f1239', label: 'In neither' },
};
export const combinedFill = (r: CombinedReading) => (r.top3 ? COMBINED_COLORS[r.kind].strong : COMBINED_COLORS[r.kind].pale);
/** Text colour that reads on a combined fill. */
export const combinedInk = (r: CombinedReading) => (r.kind === 'miss' || (r.kind === 'ai' && r.top3) ? '#ffffff' : '#04130d');

/** The headline numbers for a set of finished points. */
export function combinedTotals(readings: CombinedReading[]) {
  const n = (k: CombinedKind) => readings.filter((r) => r.kind === k).length;
  const both = n('both'), ai = n('ai'), local = n('local'), miss = n('miss');
  return {
    total: readings.length,
    visible: both + ai + local,
    localVisible: both + local,
    /** Points a local-only map marks as not found. */
    notInLocal: ai + miss,
    rescued: ai,
    both,
    local,
    miss,
    firstInBoth: readings.filter((r) => r.ai === 1 && r.local === 1).length,
  };
}
