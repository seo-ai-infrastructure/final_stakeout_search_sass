/**
 * The 3D grid: one column per point. Height = the point's share of the grid's buying power
 * (tallest = most valuable point); colour = the rank shown there. Tall red columns are valuable
 * places the business is losing; tall green ones are valuable places it is winning.
 */
/**
 * One colour scale for a rank, used by the 2D pins, the 3D columns, the legends and the charts:
 * the top 3 in one deep green (Gucci green), then a step for each place from #4 to #8, yellow
 * through orange to red, #9–20 in red, and 20+ / not found in the darkest red.
 */
export const RANK_COLORS = {
  top: '#2a6600', // #1–3
  four: '#c6b100', // #4: just outside the top 3
  five: '#f7c701', // #5
  six: '#e59c00', // #6
  seven: '#d26e00', // #7
  eight: '#c03f00', // #8
  low: '#af0a00', // #9–20
  none: '#7f1d1d', // 20+ / not found
  pending: '#475569', // not finished, or failed
};

/** The bands of the rank scale, in order: the keys a legend filters by. */
export const RANK_KEYS = ['top', 'four', 'five', 'six', 'seven', 'eight', 'low', 'none'] as const;
export type RankKey = (typeof RANK_KEYS)[number];
const LABELS: Record<RankKey, string> = { top: '#1–3', four: '#4', five: '#5', six: '#6', seven: '#7', eight: '#8', low: '#9–20', none: '20+ / not found' };

/** The scale in order, for a legend. */
export const RANK_SCALE: [string, string][] = RANK_KEYS.map((k) => [LABELS[k], RANK_COLORS[k]]);

/** The band a completed point's rank falls in (null while the point is unfinished or failed). */
export function rankKey(status: string, rank: number | null | undefined): RankKey | null {
  if (status !== 'COMPLETED') return null;
  if (!rank || rank > 20) return 'none';
  return rank <= 3 ? 'top' : rank === 4 ? 'four' : rank === 5 ? 'five' : rank === 6 ? 'six' : rank === 7 ? 'seven' : rank === 8 ? 'eight' : 'low';
}

/**
 * A point whose page had no map pack (local rank not applicable): a bright cyan, well away from
 * the green-to-red rank scale and from the violet of the AI ring, so it is never read as a rank.
 */
export const NA_COLOR = '#22d3ee';

export function rankColor(status: string, rank: number | null | undefined) {
  const k = rankKey(status, rank);
  return k ? RANK_COLORS[k] : RANK_COLORS.pending;
}

/**
 * The same scale for the 3D columns, in brighter shades: a lit column in the pins' deep green
 * goes muddy, so wins would read as grey-green. Same hues, same bands, same meaning.
 */
export const COLUMN_COLORS: typeof RANK_COLORS = {
  top: '#58a423',
  four: '#cdb800',
  five: '#fed21e',
  six: '#ffb10a',
  seven: '#fb8300',
  eight: '#ee4e00',
  low: '#d11c11',
  none: '#a02525',
  pending: '#64748b',
};

/**
 * Sponsored results above the business at a point: none, one or two, three or more. Its own
 * colours (teal, orange, crimson), so ad pressure is never read as a rank.
 */
export const ADS_SCALE: [string, string][] = [
  ['no ads above', '#0e7490'],
  ['1–2 ads', '#fb923c'],
  ['3 or more', '#e11d48'],
];
export function adsColor(ads: number | null | undefined) {
  return ads == null ? RANK_COLORS.pending : ads === 0 ? ADS_SCALE[0][1] : ads <= 2 ? ADS_SCALE[1][1] : ADS_SCALE[2][1];
}
export const COLUMN_SCALE: [string, string][] = RANK_KEYS.map((k) => [LABELS[k], COLUMN_COLORS[k]]);

/** A rank's colour as a 3D column. */
export function columnColor(status: string, rank: number | null | undefined) {
  const k = rankKey(status, rank);
  return k ? COLUMN_COLORS[k] : COLUMN_COLORS.pending;
}

/**
 * The text colour that stays readable on a colour: dark on a light one, white on a dark one. The
 * cut-off is where dark text starts to read clearly better than white (the oranges of #6–7 take
 * dark text; the reds, greens and purples keep white).
 */
export function rankTextColor(background: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(background);
  if (!m) return '#ffffff';
  const [r, g, b] = m.slice(1).map((h) => {
    const v = parseInt(h, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.24 ? '#0f172a' : '#ffffff';
}

type Pin = { id: string; lat: number; lng: number; status: string; rankFound: number | null };

export function gridColumns(
  pins: Pin[],
  shares: Map<string, number>,
  rankOf: (p: Pin) => number | null | undefined,
  spacingKm: number,
  faded: (p: Pin) => boolean = () => false,
) {
  const n = Math.max(2, Math.round(Math.sqrt(pins.length)));
  const spanKm = Math.max(spacingKm, spacingKm * (n - 1));
  const tallest = Math.max(600, spanKm * 1000 * 0.35);
  const half = Math.max(0.06, spacingKm * 0.16);
  const maxShare = Math.max(0, ...shares.values());
  return {
    type: 'FeatureCollection' as const,
    features: pins.map((p) => {
      const share = shares.get(p.id);
      const h = share !== undefined && maxShare > 0 ? tallest * (0.08 + (0.92 * share) / maxShare) : tallest * 0.04;
      const dLat = half / 111.32;
      const dLng = half / (111.32 * Math.cos((p.lat * Math.PI) / 180));
      const ring = [
        [p.lng - dLng, p.lat - dLat],
        [p.lng + dLng, p.lat - dLat],
        [p.lng + dLng, p.lat + dLat],
        [p.lng - dLng, p.lat + dLat],
        [p.lng - dLng, p.lat - dLat],
      ];
      return {
        type: 'Feature' as const,
        id: p.id,
        properties: {
          id: p.id,
          h: Math.round(h),
          color: faded(p) ? '#1e293b' : columnColor(p.status, rankOf(p)),
          share: share ?? null,
        },
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      };
    }),
  };
}
