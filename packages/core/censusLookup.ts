import { deserialize } from 'flatgeobuf/geojson';
import { signedRead } from './r2';

/**
 * Each grid point's Census neighborhood: the block group, tract and ZIP (ZCTA) it falls in, with
 * their ACS 5-year estimates, read from the yearly lookup files built by tools/census/build.py
 * (census/<vintage>/lookup/{bg,tract}/<state FIPS>.fgb and lookup/zcta.fgb on R2).
 * Only the slice of each file covering the points is read (FlatGeobuf's spatial index + byte ranges).
 */
export type AreaEstimate = {
  id: string;
  nm?: string;
  inc?: number;
  inc_m?: number;
  own?: number;
  own_m?: number;
  occ?: number;
  own_pct?: number;
  val?: number;
  val_m?: number;
  yb?: number;
  yb_m?: number;
  /** Reliability of the income estimate: 2 good, 1 fair, 0 use with caution. */
  rel?: number;
};
/** Saved on each point (GridPin.census), with the data vintage it came from. */
export type PinCensus = { v: string; bg?: AreaEstimate; tract?: AreaEstimate; zcta?: AreaEstimate };
export type LookupPoint = { id: string; lat: number; lng: number; stateCode: string };

const KEEP = ['id', 'nm', 'inc', 'inc_m', 'own', 'own_m', 'occ', 'own_pct', 'val', 'val_m', 'yb', 'yb_m', 'rel'] as const;

export const STATE_FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12',
  GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23',
  MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33',
  NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
  SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55',
  WY: '56', PR: '72',
};

type Ring = number[][];
function inRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is the point (x = longitude, y = latitude) inside a GeoJSON Polygon or MultiPolygon (holes excluded)? */
export function inGeometry(x: number, y: number, g: { type: string; coordinates: unknown } | null | undefined): boolean {
  if (!g) return false;
  const polygon = (rings: Ring[]) => rings.length > 0 && inRing(x, y, rings[0]) && !rings.slice(1).some((h) => inRing(x, y, h));
  if (g.type === 'Polygon') return polygon(g.coordinates as Ring[]);
  if (g.type === 'MultiPolygon') return (g.coordinates as Ring[][]).some(polygon);
  return false;
}

function pick(props: Record<string, unknown> | null | undefined): AreaEstimate {
  const out: Record<string, unknown> = {};
  for (const k of KEEP) {
    const v = props?.[k];
    if (v === null || v === undefined || v === '') continue;
    out[k] = k === 'id' || k === 'nm' ? String(v) : Number(v);
  }
  return out as AreaEstimate;
}

export type CensusLookupResult = { byPin: Map<string, PinCensus>; failedFiles: string[] };

export async function lookupCensus(
  points: LookupPoint[],
  vintage: string,
  urlFor: (key: string) => Promise<string> = signedRead,
): Promise<CensusLookupResult> {
  const byPin = new Map<string, PinCensus>(points.map((p) => [p.id, { v: vintage }]));
  const failedFiles: string[] = [];
  const byState = new Map<string, LookupPoint[]>();
  for (const p of points) {
    const fips = STATE_FIPS[(p.stateCode ?? '').toUpperCase()];
    if (fips) byState.set(fips, [...(byState.get(fips) ?? []), p]);
  }
  const jobs: Promise<void>[] = [];
  for (const [fips, pts] of byState)
    for (const level of ['bg', 'tract'] as const) jobs.push(match(`census/${vintage}/lookup/${level}/${fips}.fgb`, level, pts));
  if (points.length) jobs.push(match(`census/${vintage}/lookup/zcta.fgb`, 'zcta', points));
  await Promise.all(jobs);
  return { byPin, failedFiles };

  async function match(key: string, level: 'bg' | 'tract' | 'zcta', pts: LookupPoint[]) {
    const pad = 0.0005;
    const rect = {
      minX: Math.min(...pts.map((p) => p.lng)) - pad,
      minY: Math.min(...pts.map((p) => p.lat)) - pad,
      maxX: Math.max(...pts.map((p) => p.lng)) + pad,
      maxY: Math.max(...pts.map((p) => p.lat)) + pad,
    };
    try {
      for await (const f of deserialize(await urlFor(key), { rect })) {
        for (const p of pts) {
          const c = byPin.get(p.id)!;
          if (!c[level] && inGeometry(p.lng, p.lat, f.geometry as never)) c[level] = pick(f.properties as Record<string, unknown>);
        }
      }
    } catch (e) {
      failedFiles.push(key);
      console.error('[census lookup]', key, (e as Error)?.message);
    }
  }
}
