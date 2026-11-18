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
  /** Brightest colour for the lowest values instead of the highest (older homes stand out). */
  reversed?: boolean;
  unit: 'money' | 'percent' | 'year';
};

export const METRICS: Record<Exclude<CensusMetric, 'off'>, MetricDef> = {
  income: { label: 'Median household income', prop: 'inc', moe: 'inc_m', breaks: [40000, 60000, 80000, 100000, 150000], unit: 'money' },
  owners: { label: 'Homeowners (owner-occupied homes)', prop: 'own_pct', breaks: [30, 45, 60, 75, 90], unit: 'percent' },
  value: { label: 'Median home value', prop: 'val', moe: 'val_m', breaks: [150000, 250000, 350000, 500000, 750000], unit: 'money' },
  built: { label: 'Median year built', prop: 'yb', moe: 'yb_m', breaks: [1950, 1970, 1990, 2005, 2015], reversed: true, unit: 'year' },
};

/**
 * Six steps per metric, dark (low) to bright (high), for the dark basemap: low values sink into the
 * charcoal and the areas that matter light up. One colour family per metric, so switching metrics is
 * obvious at a glance, and none is green, amber or red, the colours of the rank pins.
 */
export const PALETTES: Record<Exclude<CensusMetric, 'off'>, string[]> = {
  // One hue, the same blue as the buying-power figures, in even steps of lightness. The steps stay
  // far enough apart to tell the six bands apart when the layer is faded under the pins.
  income: ['#14233a', '#16385c', '#17507f', '#1a6ba3', '#2a8cc4', '#67c7ee'],
  owners: ['#1f192e', '#31254d', '#4c3575', '#7c3aed', '#a855f7', '#e9d5ff'],
  value: ['#24141d', '#4a1d35', '#831843', '#be185d', '#ec4899', '#fbcfe8'],
  built: ['#1c1f24', '#33383f', '#565d66', '#8a919a', '#c0c6cd', '#f1f5f9'],
};
/** The income ramp, kept for callers that want a single palette. */
export const PALETTE = PALETTES.income;
const paletteFor = (metric: Exclude<CensusMetric, 'off'>) =>
  METRICS[metric].reversed ? [...PALETTES[metric]].reverse() : PALETTES[metric];

function formatValue(unit: MetricDef['unit'], v: number) {
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
export function fillColor(metric: Exclude<CensusMetric, 'off'>, breaks?: number[] | null) {
  const m = { ...METRICS[metric], breaks: breaks ?? METRICS[metric].breaks };
  const colors = paletteFor(metric);
  const step: unknown[] = ['step', ['to-number', ['get', m.prop]], colors[0]];
  m.breaks.forEach((b, i) => step.push(b, colors[i + 1]));
  return ['case', ['has', m.prop], step, 'rgba(0,0,0,0)'];
}

/** Areas whose income estimate is very uncertain (margin of error above ~30% of the value) are faded. */
export function fillOpacity(metric: Exclude<CensusMetric, 'off'>, opacity = 0.55) {
  return metric === 'income' ? ['case', ['==', ['get', 'rel'], 0], Math.round(opacity * 40) / 100, opacity] : opacity;
}

export function legend(metric: Exclude<CensusMetric, 'off'>, breaks?: number[] | null) {
  const m = { ...METRICS[metric], breaks: breaks ?? METRICS[metric].breaks };
  const colors = paletteFor(metric);
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

/**
 * "Compare within this market": six classes holding equal numbers of the areas around the grid,
 * rounded to clean values ($1k, 1%, a year). Null when there are too few distinct values to split.
 */
export function quantileBreaks(metric: Exclude<CensusMetric, 'off'>, values: number[], classes = 6): number[] | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < classes * 2) return null;
  const unit = METRICS[metric].unit;
  const round = (x: number) => (unit === 'money' ? Math.round(x / 1000) * 1000 : Math.round(x));
  const breaks: number[] = [];
  for (let i = 1; i < classes; i++) {
    const q = round(v[Math.min(v.length - 1, Math.floor((i * v.length) / classes))]);
    if (breaks.length && q <= breaks[breaks.length - 1]) return null;
    breaks.push(q);
  }
  return breaks;
}

/** 3D neighborhoods: height from owner-occupied homes, scaled per level so all three read alike. */
const METERS_PER_HOME: Record<CensusLayer, number> = { bg: 1.6, tract: 0.5, zcta: 0.07 };
export function extrusionHeight(layer: CensusLayer) {
  return ['*', ['coalesce', ['to-number', ['get', 'own']], 0], METERS_PER_HOME[layer]];
}

/** The few map methods the basemap helpers use, loosely typed: the map library types each property name. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type StyleMap = { getStyle: () => { layers?: any[] }; setLayoutProperty: (...a: any[]) => unknown; setPaintProperty: (...a: any[]) => unknown };
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Basemap clean-up for every Stakeout map: shop and restaurant icons are hidden, since a basemap
 * POI can be mistaken for a tracked business. Roads, places and street names stay.
 */
export function declutterBasemap(m: Pick<StyleMap, 'getStyle' | 'setLayoutProperty'>) {
  for (const l of m.getStyle().layers ?? [])
    if (l['source-layer'] === 'poi') m.setLayoutProperty(l.id, 'visibility', 'none');
}

/**
 * The report's base map, turned down so the pins are the only strong colour on it: a near-black
 * ground, thin translucent roads (no casings, paths or rail), faint land shading and light labels
 * with a dark outline. Only the report uses this: on the New scan page clear roads help place a
 * grid. Works by the map schema's layer names, so each change is tried on its own and skipped if
 * a style lacks that layer or property.
 */
export function quietBasemap(m: StyleMap) {
  const attempt = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* this style has no such layer or property */
    }
  };
  for (const l of m.getStyle().layers ?? []) {
    const id = l.id, type = l.type as string | undefined, src = l['source-layer'] as string | undefined;
    if (type === 'background') attempt(() => m.setPaintProperty(id, 'background-color', BASE_GROUND));
    else if (type === 'line' && src === 'transportation') {
      if (/casing|path|track|service|rail|pier|ferry/i.test(id)) attempt(() => m.setLayoutProperty(id, 'visibility', 'none'));
      else {
        // Three weights: motorways read as the main arteries, minor streets as a faint mesh.
        const minor = /minor|street|tertiary|residential/i.test(id), motorway = /motorway|trunk/i.test(id);
        attempt(() => m.setPaintProperty(id, 'line-color', motorway ? '#3b4a61' : '#334155'));
        attempt(() => m.setPaintProperty(id, 'line-opacity', minor ? 0.28 : motorway ? 0.8 : 0.55));
        attempt(() => m.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 8, minor ? 0.3 : motorway ? 1 : 0.6, 12, minor ? 0.8 : motorway ? 2.4 : 1.5, 16, minor ? 2 : motorway ? 4 : 3.2]));
      }
    } else if (type === 'line') attempt(() => m.setPaintProperty(id, 'line-opacity', 0.3));
    else if (type === 'fill' && src === 'water') {
      // Darker than the ground, with a faint shoreline, so a lake never reads as a low-income area.
      attempt(() => m.setPaintProperty(id, 'fill-color', '#050811'));
      attempt(() => m.setPaintProperty(id, 'fill-outline-color', '#1b2a44'));
    }
    else if (type === 'fill' && src !== undefined && /^(landuse|landcover|park|building|aeroway)$/.test(src)) attempt(() => m.setPaintProperty(id, 'fill-opacity', 0.2));
    else if (type === 'symbol') {
      // Road names and numbers are quieter than place names.
      attempt(() => m.setPaintProperty(id, 'text-color', src === 'transportation_name' ? '#94a3b8' : '#cbd5e1'));
      attempt(() => m.setPaintProperty(id, 'text-opacity', 0.85));
      attempt(() => m.setPaintProperty(id, 'text-halo-color', BASE_GROUND));
      attempt(() => m.setPaintProperty(id, 'text-halo-width', 1.6));
    }
  }
}
/** The report map's ground colour: the page's own near-black navy. */
export const BASE_GROUND = '#0b1220';

/**
 * How strongly the neighborhood shading shows under the pins. In Pack rank it is part of the
 * story (rank against wealth), so it stays readable; in AI place and Ads above it is only
 * context and fades back. Behind 3D columns it is dimmer still.
 */
export function shadeStrength(mode: 'combined' | 'rank' | 'ai' | 'ads', behindColumns: boolean) {
  return behindColumns ? 0.3 : mode === 'rank' ? 0.4 : 0.2;
}

/**
 * After the neighborhood layers are added: lakes and roads are lifted above the shading (and stay
 * below the labels). Nobody lives in a lake, so a tract's colour should not be painted across it;
 * and roads drawn over the shading keep one even weight instead of darkening where it is strong.
 */
export function liftAboveShading(
  m: { getStyle: () => { layers?: { id: string; [k: string]: unknown }[] }; moveLayer: (id: string, beforeId?: string) => void },
  beforeLabels: string | undefined,
) {
  for (const l of m.getStyle().layers ?? []) {
    const src = l['source-layer'];
    if ((l.type === 'fill' && src === 'water') || (l.type === 'line' && (src === 'transportation' || src === 'waterway'))) {
      try {
        m.moveLayer(l.id, beforeLabels);
      } catch {
        /* a layer that cannot move stays where it is */
      }
    }
  }
}

