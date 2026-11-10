/**
 * The 3D grid: one column per point. Height = the point's share of the grid's buying power
 * (tallest = most valuable point); colour = the rank shown there. Tall red columns are valuable
 * places the business is losing; tall green ones are valuable places it is winning.
 */
export const RANK_COLORS = { top: '#10b981', mid: '#f59e0b', low: '#ef4444', none: '#64748b', pending: '#334155' };

export function rankColor(status: string, rank: number | null | undefined) {
  if (status !== 'COMPLETED') return RANK_COLORS.pending;
  if (!rank) return RANK_COLORS.none;
  return rank <= 3 ? RANK_COLORS.top : rank <= 10 ? RANK_COLORS.mid : RANK_COLORS.low;
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
