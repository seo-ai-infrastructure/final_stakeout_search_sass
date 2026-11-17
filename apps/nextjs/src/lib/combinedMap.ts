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
  /** The page had local results at all (a map pack, the full list or a single-business result). When
   *  false there was nothing local to rank in: the pin says "No LP", not "LP 20+". */
  localShown: boolean;
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
  const localShown = !(fromAiList || p.rankFrom === 'none');
  // Labels as they read on the pin: "AI #2" over "No LP", "#1" over "AI #1·LP 1", "LP #4" over "AI: No".
  const aiWord = typeof ai === 'number' ? 'AI #' + ai : 'AI ✓';
  const noAi = ai === 'no' ? 'AI: No' : 'No AI', noLp = localShown ? 'LP 20+' : 'No LP';
  const out = (top3: boolean, hero: string, sub: string): CombinedReading => ({ kind, ai, local, localShown, top3, hero, sub });
  if (kind === 'miss') return localShown && ai === null ? out(false, '20+', noAi) : out(false, noAi, noLp);
  if (kind === 'ai') return out(ai === 'named' || (ai as number) <= 3, aiWord, noLp);
  if (kind === 'local') return out(local! <= 3, 'LP #' + local, noAi);
  const best = typeof ai === 'number' ? Math.min(ai, local!) : local!;
  return out(best <= 3, '#' + best, aiWord + ' · LP ' + local);
}

/** How one pin is drawn: a gradient body, a coloured ring with a soft glow, and an optional icon. */
export type CombinedStyle = { label: string; swatch: string; fill: string; ring: string; glow: string; ink: string; pill: string; pillInk: string };
const DARK_PILL = 'rgba(2,6,23,0.45)';
export const COMBINED_STYLES: Record<'both' | 'bothLow' | 'ai' | 'aiLow' | 'local' | 'localLow' | 'miss', CombinedStyle> = {
  both: { label: 'Top 3 in both', swatch: '#10b981', fill: 'linear-gradient(135deg,#10b981,#059669 55%,#115e59)', ring: 'linear-gradient(45deg,#fcd34d,#a78bfa,#6ee7b7)', glow: 'rgba(16,185,129,0.45)', ink: '#ffffff', pill: DARK_PILL, pillInk: '#d1fae5' },
  bothLow: { label: 'In both, 4th or lower', swatch: '#0d9488', fill: 'linear-gradient(135deg,#14b8a6,#4338ca)', ring: 'linear-gradient(45deg,#5eead4,#a5b4fc)', glow: 'rgba(20,184,166,0.35)', ink: '#ffffff', pill: DARK_PILL, pillInk: '#f0fdfa' },
  ai: { label: 'AI Overview win (rescued)', swatch: '#7c3aed', fill: 'linear-gradient(135deg,#7c3aed,#9333ea 55%,#3730a3)', ring: 'linear-gradient(45deg,#c4b5fd,#e879f9,#a5b4fc)', glow: 'rgba(139,92,246,0.5)', ink: '#ffffff', pill: DARK_PILL, pillInk: '#ddd6fe' },
  aiLow: { label: 'AI Overview, 4th or lower', swatch: '#4f46e5', fill: 'linear-gradient(135deg,#6366f1,#4f46e5 55%,#1e293b)', ring: 'linear-gradient(45deg,#a5b4fc,#7dd3fc)', glow: 'rgba(99,102,241,0.4)', ink: '#ffffff', pill: DARK_PILL, pillInk: '#e0e7ff' },
  local: { label: 'Local results only', swatch: '#34d399', fill: 'linear-gradient(135deg,#10b981,#047857)', ring: 'linear-gradient(45deg,#ffffff,#e2e8f0)', glow: 'rgba(255,255,255,0.18)', ink: '#ffffff', pill: DARK_PILL, pillInk: '#d1fae5' },
  localLow: { label: 'Local results only', swatch: '#34d399', fill: 'linear-gradient(135deg,#34d399,#0d9488)', ring: 'linear-gradient(45deg,#a7f3d0,#a7f3d0)', glow: 'rgba(52,211,153,0.25)', ink: '#020617', pill: 'rgba(2,6,23,0.2)', pillInk: '#020617' },
  miss: { label: 'True miss', swatch: '#e11d48', fill: 'linear-gradient(135deg,#e11d48,#991b1b)', ring: 'linear-gradient(45deg,#fda4af,#fda4af)', glow: 'rgba(244,63,94,0.7)', ink: '#ffffff', pill: 'rgba(0,0,0,0.45)', pillInk: '#fecdd3' },
};
export const combinedStyle = (r: CombinedReading): CombinedStyle =>
  r.kind === 'miss' ? COMBINED_STYLES.miss : COMBINED_STYLES[(r.kind + (r.top3 ? '' : 'Low')) as 'both' | 'bothLow' | 'ai' | 'aiLow' | 'local' | 'localLow'];
/** The legend, one entry per look (the two local shades share one). */
export const COMBINED_LEGEND: CombinedStyle[] = [COMBINED_STYLES.both, COMBINED_STYLES.ai, COMBINED_STYLES.aiLow, COMBINED_STYLES.bothLow, COMBINED_STYLES.local, COMBINED_STYLES.miss];
/** The two halves of a split pin: the AI Overview on top (it is higher on the page), the local results under it. */
export function combinedHalves(r: CombinedReading) {
  const aiIn = typeof r.ai === 'number' || r.ai === 'named';
  const top =
    aiIn && (r.ai === 'named' || (r.ai as number) <= 3)
      ? { text: typeof r.ai === 'number' ? '#' + r.ai : '✓', fill: 'linear-gradient(180deg,#8b5cf6,#7e22ce)', ink: '#ffffff', icon: true }
      : aiIn
        ? { text: '#' + r.ai, fill: 'linear-gradient(180deg,#6366f1,#5b21b6)', ink: '#eef2ff', icon: true }
        : r.ai === 'no'
          ? { text: 'No', fill: '#4c0519', ink: '#fecdd3', icon: false }
          : { text: 'No AI', fill: '#1e293b', ink: '#94a3b8', icon: false };
  const l = r.local;
  const bottom =
    l == null
      ? { text: r.localShown ? 'LP 20+' : 'No LP', fill: r.kind === 'miss' ? '#881337' : '#0f172a', ink: r.kind === 'miss' ? '#fecdd3' : '#94a3b8' }
      : l <= 3
        ? { text: 'LP #' + l, fill: 'linear-gradient(180deg,#059669,#115e59)', ink: '#ffffff' }
        : l === 4
          ? { text: 'LP #' + l, fill: '#10b981', ink: '#020617' }
          : { text: 'LP #' + l, fill: '#fbbf24', ink: '#020617' };
  const ring =
    r.kind === 'both'
      ? { fill: 'linear-gradient(45deg,#34d399,#5eead4,#a78bfa)', glow: 'rgba(52,211,153,0.45)' }
      : r.kind === 'ai'
        ? { fill: 'linear-gradient(45deg,#a78bfa,#e879f9)', glow: 'rgba(167,139,250,0.45)' }
        : r.kind === 'local'
          ? { fill: 'linear-gradient(45deg,#34d399,#34d399)', glow: 'rgba(52,211,153,0.35)' }
          : { fill: 'linear-gradient(45deg,#f43f5e,#f43f5e)', glow: 'rgba(244,63,94,0.6)' };
  return { top, bottom, ring };
}

/** Which small icon sits before the headline: a crown for #1 in both places, a sparkle wherever the AI Overview is the win. */
export const combinedIcon = (r: CombinedReading): 'crown' | 'sparkle' | null =>
  r.ai === 1 && r.local === 1 ? 'crown' : r.kind === 'ai' || (r.kind === 'both' && (r.top3 || typeof r.ai === 'number' && r.ai <= r.local!)) ? 'sparkle' : null;

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
