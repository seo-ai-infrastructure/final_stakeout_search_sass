/**
 * The combined map: one reading per grid point that takes in both places a business can appear
 * on the results page: the AI Overview at the top, and the local results under it.
 *
 * A local-only map marks a point "20+" whenever the business is missing from the local results,
 * even where the AI Overview above them names it first. Here a point is a miss only when the
 * business is in neither.
 */
import { NA_COLOR, RANK_COLORS, RANK_SCALE, rankColor, rankTextColor } from './gridColumns';

export type CombinedKind = 'both' | 'ai' | 'local' | 'miss';
export type CombinedReading = {
  kind: CombinedKind;
  /** Place in the AI Overview's list; 'named' = mentioned without a place; 'no' = an AI Overview
   *  appeared without the business; null = no AI Overview at this point. */
  ai: number | 'named' | 'no' | null;
  /** Rank in the local results (map pack, Local Finder or single-business result); null = not in them. */
  local: number | null;
  /** The page had local results at all (a map pack, the full list or a single-business result). When
   *  false there was nothing local to rank in. */
  localShown: boolean;
  /** The best placement of the two is in the top 3 (or the business is named without a place). */
  top3: boolean;
  /** The one short label on the pin: the best placement ("#2"), "✓" where the AI Overview names the
   *  business without a place, "20+" where it is in neither. */
  label: string;
  /** Both readings in words, for the pin's tooltip: "AI Overview #1 · not in the local results". */
  detail: string;
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
  const localShown = !(fromAiList || p.rankFrom === 'none');
  // The better of the two placements (null: named in the AI Overview without a place, and not in the local results).
  const best = typeof ai === 'number' ? (inLocal ? Math.min(ai, local!) : ai) : local;
  const aiWords = typeof ai === 'number' ? 'AI Overview #' + ai : ai === 'named' ? 'named in the AI Overview' : ai === 'no' ? 'not in the AI Overview' : 'no AI Overview';
  const localWords = inLocal ? 'local results #' + local : localShown ? 'not in the local results' : 'no local results on the page';
  return {
    kind,
    ai,
    local,
    localShown,
    top3: kind !== 'miss' && (best == null || best <= 3),
    label: kind === 'miss' ? '20+' : best == null ? '✓' : '#' + best,
    detail: aiWords[0].toUpperCase() + aiWords.slice(1) + ' · ' + localWords,
  };
}

/**
 * How a Combined pin is coloured and labelled, in this order:
 *  1. An AI Overview is on the page: purple, whatever the local rank is. The label is the
 *     business's place in it ("✓" when it is named without a place, "no" when the answer leaves
 *     it out, on a darker purple).
 *  2. No AI Overview and no local pack on the page: "N/A".
 *  3. Otherwise the Pack rank colours for its local rank; "20+" in red when a local pack was on
 *     the page and the business was not in it.
 */
type CombinedStyle = { label: string; swatch: string };
export const AI_PURPLE = '#a855f7';
export const AI_PURPLE_OUT = '#4c1d95';
export function combinedPin(r: CombinedReading, noLocalPack: boolean): { fill: string; text: string; from: 'ai' | 'na' | 'local' } {
  if (typeof r.ai === 'number') return { fill: AI_PURPLE, text: '#' + r.ai, from: 'ai' };
  if (r.ai === 'named') return { fill: AI_PURPLE, text: '✓', from: 'ai' };
  if (r.ai === 'no') return { fill: AI_PURPLE_OUT, text: 'no', from: 'ai' };
  if (noLocalPack || !r.localShown) return { fill: NA_COLOR, text: 'N/A', from: 'na' };
  return { fill: rankColor('COMPLETED', r.local), text: r.local != null ? '#' + r.local : '20+', from: 'local' };
}
/** The legend: the Pack rank colours, the two purples for a page with an AI Overview, and N/A. */
export const COMBINED_LEGEND: CombinedStyle[] = [
  ...RANK_SCALE.map(([label, swatch]) => ({ label, swatch })),
  { label: 'AI Overview: you are in it', swatch: AI_PURPLE },
  { label: 'AI Overview: you are not', swatch: AI_PURPLE_OUT },
  { label: 'No local pack', swatch: NA_COLOR },
];

/**
 * The two halves of a split pin: the AI Overview on top (it is higher on the page), the local
 * results under it, each with one short label. The local half takes the Pack rank colours; a
 * point missing from the local results stays neutral where the AI Overview names the business,
 * and takes the 20+ red only when it is in neither.
 */
export function combinedHalves(r: CombinedReading) {
  const top =
    r.ai === 'named' || (typeof r.ai === 'number' && r.ai <= 3)
      ? { text: typeof r.ai === 'number' ? '#' + r.ai : '✓', fill: '#7c3aed', ink: '#ffffff' }
      : typeof r.ai === 'number'
        ? { text: '#' + r.ai, fill: '#4f46e5', ink: '#eef2ff' }
        : r.ai === 'no'
          ? { text: 'No', fill: '#4c0519', ink: '#fecdd3' }
          : { text: '–', fill: '#1e293b', ink: '#94a3b8' };
  const fill = r.local != null ? rankColor('COMPLETED', r.local) : r.kind === 'miss' ? RANK_COLORS.none : '#0f172a';
  const bottom = {
    text: r.local != null ? '#' + r.local : r.localShown ? '20+' : '–',
    fill,
    ink: r.local != null || r.kind === 'miss' ? rankTextColor(fill) : '#94a3b8',
  };
  return { top, bottom };
}

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
    /** Named in the AI Overview while missing from the local results. */
    recommended: ai,
    both,
    local,
    miss,
    firstInBoth: readings.filter((r) => r.ai === 1 && r.local === 1).length,
  };
}
