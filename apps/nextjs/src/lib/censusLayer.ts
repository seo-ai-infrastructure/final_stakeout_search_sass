/**
 * The Census layer under report maps: ACS 5-year estimates per ZIP (ZCTA), census tract and
 * block group, from the yearly tile file built by tools/census/build.py.
 * Shown only once NEXT_PUBLIC_CENSUS_VINTAGE (e.g. "acs2024") is set, after that build has run.
 */
export const CENSUS_VINTAGE = (process.env.NEXT_PUBLIC_CENSUS_VINTAGE ?? '').trim();
export const CENSUS_SOURCE_LABEL = 'U.S. Census Bureau, ACS 2020–2024 5-year estimates';

export type CensusMetric = 'income' | 'owners' | 'value' | 'built' | 'off';
export type CensusLevel = 'auto' | 'zcta' | 'tract' | 'bg';
export const CENSUS_LAYERS = ['zcta', 'tract', 'bg'] as const;
export type CensusLayer = (typeof CENSUS_LAYERS)[number];
export const LEVEL_LABEL: Record<CensusLayer, string> = { zcta: 'ZIP code', tract: 'Census tract', bg: 'Block group' };

type MetricDef = {
  label: string;
  prop: string;
  moe?: string;
  /** Upper bounds of the first five colour steps; values above the last fall in the sixth. */
  breaks: number[];
  /** Darkest colour for the lowest values instead of the highest (older homes). */
  reversed?: boolean;
  unit: 'money' | 'percent' | 'year';
};

export const METRICS: Record<Exclude<CensusMetric, 'off'>, MetricDef> = {
  income: { label: 'Median household income', prop: 'inc', moe: 'inc_m', breaks: [40000, 60000, 80000, 100000, 150000], unit: 'money' },
  owners: { label: 'Homeowners (owner-occupied homes)', prop: 'own_pct', breaks: [30, 45, 60, 75, 90], unit: 'percent' },
  value: { label: 'Median home value', prop: 'val', moe: 'val_m', breaks: [150000, 250000, 350000, 500000, 750000], unit: 'money' },
  built: { label: 'Median year built', prop: 'yb', moe: 'yb_m', breaks: [1950, 1970, 1990, 2005, 2015], reversed: true, unit: 'year' },
};

/** Six muted blue steps, so green, yellow and orange rank pins stay readable on top. */
export const PALETTE = ['#f1eef6', '#d0d1e6', '#a6bddb', '#74a9cf', '#2b8cbe', '#045a8d'];

export function formatValue(unit: MetricDef['unit'], v: number) {
  if (unit === 'money') return '$' + Math.round(v).toLocaleString('en-US');
  if (unit === 'percent') return `${v.toFixed(1)}%`;
  return String(Math.round(v));
}

function short(unit: MetricDef['unit'], v: number) {
  if (unit === 'money') return v >= 1_000_000 ? `$${v / 1_000_000}M` : `$${Math.round(v / 1000)}k`;
  if (unit === 'percent') return `${v}%`;
  return String(v);
}

/** MapLibre fill colour: six steps on the metric; areas without an estimate stay clear. */
export function fillColor(metric: Exclude<CensusMetric, 'off'>) {
  const m = METRICS[metric];
  const colors = m.reversed ? [...PALETTE].reverse() : PALETTE;
  const step: unknown[] = ['step', ['to-number', ['get', m.prop]], colors[0]];
  m.breaks.forEach((b, i) => step.push(b, colors[i + 1]));
  return ['case', ['has', m.prop], step, 'rgba(0,0,0,0)'];
}

/** Areas whose income estimate is very uncertain (margin of error above ~30% of the value) are faded. */
export function fillOpacity(metric: Exclude<CensusMetric, 'off'>, opacity = 0.5) {
  return metric === 'income' ? ['case', ['==', ['get', 'rel'], 0], opacity * 0.4, opacity] : opacity;
}

export function legend(metric: Exclude<CensusMetric, 'off'>) {
  const m = METRICS[metric];
  const colors = m.reversed ? [...PALETTE].reverse() : PALETTE;
  const b = m.breaks;
  const labels =
    m.unit === 'year'
      ? [`Before ${b[0]}`, ...b.slice(0, -1).map((v, i) => `${v}–${b[i + 1] - 1}`), `${b[b.length - 1]} or later`]
      : [`Under ${short(m.unit, b[0])}`, ...b.slice(0, -1).map((v, i) => `${short(m.unit, v)}–${short(m.unit, b[i + 1])}`), `${short(m.unit, b[b.length - 1])}+`];
  return labels.map((label, i) => ({ label, color: colors[i] }));
}

/** Zoom range in which a level is drawn: Auto shows ZIPs zoomed out, tracts in between, block groups close up. */
export function levelZoomRange(level: CensusLevel, layer: CensusLayer): [number, number] | null {
  if (level !== 'auto') return level === layer ? [0, 24] : null;
  return layer === 'zcta' ? [0, 10] : layer === 'tract' ? [10, 12] : [12, 24];
}

/** The level Auto shows at a zoom (MapLibre's maxzoom is exclusive). */
export function autoLevelAt(zoom: number): CensusLayer {
  return zoom < 10 ? 'zcta' : zoom < 12 ? 'tract' : 'bg';
}

export type CensusArea = {
  level: CensusLayer;
  name: string;
  rows: { label: string; value: string }[];
  uncertain: boolean;
};

/** The details shown for one area: estimates with their 90% margins of error. */
export function describeArea(level: CensusLayer, p: Record<string, unknown>): CensusArea {
  const num = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : typeof p[k] === 'string' && p[k] !== '' && !isNaN(Number(p[k])) ? Number(p[k]) : null);
  const rows: CensusArea['rows'] = [];
  for (const key of ['income', 'owners', 'value', 'built'] as const) {
    const m = METRICS[key];
    const v = num(m.prop);
    if (v === null) {
      rows.push({ label: m.label, value: 'No estimate' });
      continue;
    }
    const moe = m.moe ? num(m.moe) : null;
    let value = formatValue(m.unit, v) + (moe !== null && moe > 0 ? ` ± ${formatValue(m.unit, moe)}` : '');
    if (key === 'owners') {
      const own = num('own'), occ = num('occ');
      if (own !== null && occ !== null) value += ` (${own.toLocaleString('en-US')} of ${occ.toLocaleString('en-US')} homes)`;
    }
    rows.push({ label: m.label, value });
  }
  return { level, name: String(p.nm ?? p.id ?? ''), rows, uncertain: num('rel') === 0 };
}
