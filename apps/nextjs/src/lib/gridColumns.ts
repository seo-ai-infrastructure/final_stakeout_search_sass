/**
 * The 3D grid: one column per point. Height = the point's share of the grid's buying power
 * (tallest = most valuable point); colour = the rank shown there. Tall red columns are valuable
 * places the business is losing; tall green ones are valuable places it is winning.
 */
/**
 * One colour scale for a rank, used by the 2D pins, the 3D columns, the legends and the charts.
 * Red belongs to "20+ / not found" alone, so the worst result is unmistakable.
 */
export const RANK_COLORS = {
  top: '#047857', // #1–3
  four: '#86efac', // #4: just outside the top 3
  mid: '#facc15', // #5–7
  late: '#f97316', // #8–10
  low: '#9a3412', // #11–20
  none: '#dc2626', // 20+ / not found
  pending: '#475569', // not finished, or failed
};

/** The scale in order, for a legend. */
export const RANK_SCALE: [string, string][] = [
  ['#1–3', RANK_COLORS.top],
  ['#4', RANK_COLORS.four],
  ['#5–7', RANK_COLORS.mid],
  ['#8–10', RANK_COLORS.late],
  ['#11–20', RANK_COLORS.low],
  ['20+ / not found', RANK_COLORS.none],
];

export function rankColor(status: string, rank: number | null | undefined) {
  if (status !== 'COMPLETED') return RANK_COLORS.pending;
  if (!rank || rank > 20) return RANK_COLORS.none;
  return rank <= 3 ? RANK_COLORS.top : rank === 4 ? RANK_COLORS.four : rank <= 7 ? RANK_COLORS.mid : rank <= 10 ? RANK_COLORS.late : RANK_COLORS.low;
}

/** The text colour that stays readable on a rank colour: dark on the three light ones, white on the rest. */
export function rankTextColor(background: string) {
  return background === RANK_COLORS.four || background === RANK_COLORS.mid || background === RANK_COLORS.late ? '#0f172a' : '#ffffff';
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
          color: faded(p) ? '#1e293b' : rankColor(p.status, rankOf(p)),
          share: share ?? null,
        },
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      };
    }),
  };
}
