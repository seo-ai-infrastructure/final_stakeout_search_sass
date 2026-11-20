/**
 * A page with no map pack has no local rank. When Google answers a local search with an AI
 * Overview and shows no map pack (and no single-business panel), the business's local rank at
 * that point is "not applicable": it is neither a rank nor "not found". Where the AI Overview
 * lists the business, that is its AI position, kept apart and counted only as AI visibility.
 */
type Meta = { finderShown?: unknown; rankFrom?: unknown; aiPosition?: unknown } | null | undefined;

/** True when the point's results page had no local results to rank in (no map pack, no full list). */
export function noLocalResults(meta: unknown): boolean {
  const m = meta as Meta;
  if (!m || m.finderShown !== false) return false;
  return m.rankFrom === 'ai_overview_list' || m.rankFrom === 'none' || m.rankFrom == null;
}

/**
 * The business's place in the AI Overview's list at a point with no local results (null: not in
 * the list, or no list). Points saved before this rule kept that place in the rank field.
 */
export function aiPositionOf(meta: unknown, storedRank: number | null | undefined): number | null {
  const m = meta as Meta;
  if (!m || m.finderShown !== false || !(m.rankFrom === 'ai_overview_list' || m.rankFrom == null)) return null;
  return typeof m.aiPosition === 'number' ? m.aiPosition : (storedRank ?? null);
}

/** The local rank to show and count: null on a page with no local results, whatever was stored. */
export const localRankOf = (meta: unknown, storedRank: number | null | undefined): number | null => (noLocalResults(meta) ? null : (storedRank ?? null));
