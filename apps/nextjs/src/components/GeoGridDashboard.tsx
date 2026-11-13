'use client';
import { useEffect, useRef, useState } from 'react';
import { EvidencePanel } from './EvidencePanel';
import Link from 'next/link';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  CompetitorLeaderboard,
  type CompetitorMarketStat,
} from './CompetitorLeaderboard';
import { Protocol } from 'pmtiles';
import type { PinCensus } from '@stakeout/core/censusLookup';
import type { PinInsights } from '@stakeout/core/pinInsights';
import { ReportVerdict, RankDistributionCard, AiCoverageCard, ProofStrip } from './ReportSummary';
import { bandOf, type RankBucket } from '../lib/reportSummary';
import { groundOwners } from '../lib/marketInsights';
import { MarketInsights } from './MarketInsights';
import { buyingPower, passesFilters, pointShares, NO_FILTERS, type BuyingPowerFilters } from '../lib/buyingPower';
import { gridColumns, RANK_COLORS, rankColor, rankTextColor, RANK_SCALE } from '../lib/gridColumns';
import {
  CENSUS_LAYERS,
  CENSUS_SOURCE_LABEL,
  CENSUS_VINTAGE,
  LEVEL_LABEL,
  METRICS,
  autoLevelAt,
  describeArea,
  fillColor,
  fillOpacity,
  legend,
  levelZoomRange,
  declutterBasemap,
  quantileBreaks,
  extrusionHeight,
  type CensusArea,
  type CensusLayer,
  type CensusLevel,
  type CensusMetric,
} from '../lib/censusLayer';

let pmtilesReady = false;
/** The Census layer: the yearly tile file, drawn under the basemap's labels and the rank pins. */
function addCensusLayers(m: maplibregl.Map) {
  if (!pmtilesReady) {
    maplibregl.addProtocol('pmtiles', new Protocol().tile);
    pmtilesReady = true;
  }
  const beforeLabels = m.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
  m.addSource('census', {
    type: 'vector',
    url: `pmtiles://${window.location.origin}/api/census/${CENSUS_VINTAGE}.pmtiles`,
    promoteId: 'id',
  });
  for (const layer of CENSUS_LAYERS) {
    m.addLayer(
      { id: `census-${layer}`, type: 'fill', source: 'census', 'source-layer': layer, layout: { visibility: 'none' }, paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0.55 } },
      beforeLabels,
    );
    m.addLayer(
      { id: `census-${layer}-line`, type: 'line', source: 'census', 'source-layer': layer, layout: { visibility: 'none' }, paint: { 'line-color': '#ffffff', 'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0.2], 'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 1] } },
      beforeLabels,
    );
    m.addLayer(
      { id: `census-${layer}-3d`, type: 'fill-extrusion', source: 'census', 'source-layer': layer, layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': '#74a9cf', 'fill-extrusion-height': 0, 'fill-extrusion-opacity': 0.88 } },
    );
  }
}

/** The 3D grid: one column per point (height = buying power, colour = rank), lit for depth. */
function addGridColumns(m: maplibregl.Map, onPick: (id: string) => void) {
  m.addSource('grid-columns', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addLayer({
    id: 'grid-columns',
    type: 'fill-extrusion',
    source: 'grid-columns',
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': ['get', 'color'],
      'fill-extrusion-height': ['get', 'h'],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.93,
      'fill-extrusion-vertical-gradient': true,
    },
  });
  m.setLight({ anchor: 'viewport', color: '#ffffff', intensity: 0.45, position: [1.4, 210, 35] });
  m.on('click', 'grid-columns', (e) => {
    const id = e.features?.[0]?.properties?.id;
    if (id) onPick(String(id));
  });
  m.on('mouseenter', 'grid-columns', () => (m.getCanvas().style.cursor = 'pointer'));
  m.on('mouseleave', 'grid-columns', () => (m.getCanvas().style.cursor = ''));
}
export type GridPinData = {
  id: string;
  rowIdx: number;
  colIdx: number;
  lat: number;
  lng: number;
  zip: string;
  city: string;
  stateCode: string;
  status: string;
  rankFound: number | null;
  topCompetitors: string[] | null;
  hasAiOverview: boolean;
  targetCitedInAi: boolean;
  aiOverviewText: string | null;
  aiCitations: string[] | null;
  videoUrl: string | null;
  metaJsonUrl?: string | null;
  dumpsTarUrl?: string | null;
  proxyMeta: {
    /** The internet provider the point ran on, as a display name. */
    isp: string | null;
    finderShown: boolean | null;
    rankFrom: string | null;
  } | null;
  census?: PinCensus | null;
  insights?: PinInsights | null;
};
export type GridScanData = {
  id: string;
  targetBusiness: string;
  keyword: string;
  status: string;
  createdAt: string;
  gridSize: number;
  spacingKm: number;
  centerLat: number;
  centerLng: number;
  totalPins: number;
  completedPins: number;
  failedPins: number;
  creditsCharged?: number;
  solv: number | null;
  arp: number | null;
  atrp: number | null;
  aioCitationRate: number | null;
  aioTriggerRate: number | null;
  targetType: string;
  trackAiOverviews: boolean;
  pins: GridPinData[];
};
export function GeoGridDashboard({
  identifier,
  shared = false,
}: {
  identifier: string;
  shared?: boolean;
}) {
  const [scan, setScan] = useState<GridScanData | null>(null),
    [selected, select] = useState<string | null>(null),
    [error, setError] = useState(''),
    [share, setShare] = useState(''),
    [projected, project] = useState<CompetitorMarketStat | null>(null),
    [mapWarning, setMapWarning] = useState('');
  const [tab, setTab] = useState<'overview' | 'evidence'>('overview');
  const [censusMetric, setCensusMetric] = useState<CensusMetric>(CENSUS_VINTAGE ? 'income' : 'off'),
    [censusLevel, setCensusLevel] = useState<CensusLevel>('auto'),
    [censusArea, setCensusArea] = useState<CensusArea | null>(null),
    [mapZoom, setMapZoom] = useState(11),
    [mapReady, setMapReady] = useState(false),
    [bpFilters, setBpFilters] = useState<BuyingPowerFilters>(NO_FILTERS),
    [view3d, setView3d] = useState(false),
    [style3d, setStyle3d] = useState<'columns' | 'areas'>('columns'),
    [colorScale, setColorScale] = useState<'market' | 'national'>('market'),
    [marketBreaks, setMarketBreaks] = useState<number[] | null>(null),
    [reloadKey, setReloadKey] = useState(0),
    [rerunBusy, setRerunBusy] = useState(false),
    [stopBusy, setStopBusy] = useState(false),
    // A rank band chosen in the Rank distribution card: pins outside it are dimmed on the map.
    [rankBand, setRankBand] = useState<RankBucket['key'] | null>(null),
    [rerunNote, setRerunNote] = useState('');
  const container = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      let retry = true;
      try {
        const r = await fetch(
            '/api/' + (shared ? 'share/' : 'scans/') + identifier,
            { cache: 'no-store' },
          ),
          d = await r.json();
        if (!r.ok) {
          if (r.status === 404 || r.status === 401) retry = false;
          throw Error(d.error);
        }
        if (alive) {
          setScan(d);
          setError('');
        }
        retry = ['QUEUED', 'RUNNING'].includes(d.status);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive && retry) timer = setTimeout(load, 5000);
      }
    }
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [identifier, shared, reloadKey]);
  useEffect(() => {
    if (!scan || !container.current) return;
    try {
      const m = new maplibregl.Map({
        container: container.current,
        style:
          process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
          'https://tiles.openfreemap.org/styles/dark',
        center: [scan.centerLng, scan.centerLat],
        zoom: 11,
      });
      m.addControl(new maplibregl.NavigationControl());
      map.current = m;
      m.on('load', () => {
        declutterBasemap(m);
        if (CENSUS_VINTAGE) {
          try {
            addCensusLayers(m);
            const pick = (e: maplibregl.MapMouseEvent) => {
              const visible = CENSUS_LAYERS.flatMap((l) => [`census-${l}`, `census-${l}-3d`]).filter(
                (id) => m.getLayer(id) && m.getLayoutProperty(id, 'visibility') === 'visible',
              );
              const f = visible.length ? m.queryRenderedFeatures(e.point, { layers: visible })[0] : undefined;
              setCensusArea(f ? describeArea(f.sourceLayer as CensusLayer, f.properties ?? {}) : null);
              const next = f?.sourceLayer && f.id !== undefined ? { source: 'census', sourceLayer: f.sourceLayer, id: f.id } : null;
              if (hovered && (!next || next.id !== hovered.id || next.sourceLayer !== hovered.sourceLayer))
                m.setFeatureState(hovered, { hover: false });
              if (next) m.setFeatureState(next, { hover: true });
              hovered = next;
            };
            let hovered: { source: string; sourceLayer: string; id: string | number } | null = null;
            m.on('mousemove', pick);
            m.on('click', pick);
            m.on('mouseout', () => {
              setCensusArea(null);
              if (hovered) m.setFeatureState(hovered, { hover: false });
              hovered = null;
            });
          } catch (e) {
            console.error('[census layer]', e);
          }
        }
        try {
          addGridColumns(m, select);
        } catch (e) {
          console.error('[3D grid]', e);
        }
        setMapZoom(m.getZoom());
        setMapReady(true);
      });
      m.on('zoomend', () => setMapZoom(m.getZoom()));
      const bounds = new maplibregl.LngLatBounds();
      scan.pins.forEach((p) => bounds.extend([p.lng, p.lat]));
      if (!bounds.isEmpty())
        m.fitBounds(bounds, { padding: 52, maxZoom: 14, duration: 0 });
      return () => {
        setMapReady(false);
        m.remove();
        map.current = null;
      };
    } catch {
      setMapWarning(
        'Map rendering is unavailable. Use the pin selector below.',
      );
    }
  }, [scan?.id]);
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !m.getSource('census')) return;
    const breaks = colorScale === 'market' ? marketBreaks : null;
    const areas3d = view3d && style3d === 'areas';
    for (const layer of CENSUS_LAYERS) {
      const range = censusMetric === 'off' ? null : levelZoomRange(censusLevel, layer);
      const show = (id: string, on: boolean) => {
        m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
        if (on && range) m.setLayerZoomRange(id, range[0], range[1]);
      };
      show(`census-${layer}`, Boolean(range) && !areas3d);
      show(`census-${layer}-line`, Boolean(range));
      show(`census-${layer}-3d`, Boolean(range) && areas3d);
      if (range && censusMetric !== 'off') {
        const color = fillColor(censusMetric, breaks) as never;
        m.setPaintProperty(`census-${layer}`, 'fill-color', color);
        m.setPaintProperty(`census-${layer}`, 'fill-opacity', fillOpacity(censusMetric) as never);
        m.setPaintProperty(`census-${layer}-3d`, 'fill-extrusion-color', color);
      }
    }
    if (censusMetric === 'off') setCensusArea(null);
  }, [censusMetric, censusLevel, mapReady, colorScale, marketBreaks, view3d, style3d]);
  // "Compare within this market": colour steps from the areas loaded around the grid.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !m.getSource('census') || colorScale !== 'market' || censusMetric === 'off') return;
    const compute = () => {
      const level = censusLevel === 'auto' ? autoLevelAt(m.getZoom()) : censusLevel;
      const prop = METRICS[censusMetric].prop;
      const seen = new Set<string>(),
        values: number[] = [];
      for (const f of m.querySourceFeatures('census', { sourceLayer: level })) {
        const id = String(f.properties?.id ?? ''),
          v = Number(f.properties?.[prop]);
        if (!id || seen.has(id) || !Number.isFinite(v)) continue;
        seen.add(id);
        values.push(v);
      }
      const b = quantileBreaks(censusMetric, values);
      setMarketBreaks((prev) => (JSON.stringify(prev) === JSON.stringify(b) ? prev : b));
    };
    compute();
    m.on('idle', compute);
    return () => {
      m.off('idle', compute);
    };
  }, [mapReady, colorScale, censusMetric, censusLevel]);
  // The 3D grid's columns follow the ranks shown (competitor view), the filters and the data.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !scan || !m.getSource('grid-columns')) return;
    const fc = gridColumns(
      scan.pins,
      pointShares(scan.pins),
      (p) => (projected ? ((projected.pinRanks as Record<string, number | null | undefined>)[p.id] ?? null) : p.rankFound),
      scan.spacingKm,
      (p) => !passesFilters(scan.pins.find((x) => x.id === p.id)?.census, bpFilters),
    );
    (m.getSource('grid-columns') as maplibregl.GeoJSONSource).setData(fc as never);
    m.setLayoutProperty('grid-columns', 'visibility', view3d && style3d === 'columns' ? 'visible' : 'none');
  }, [scan, projected, bpFilters, mapReady, view3d, style3d]);
  // Entering 3D tilts and turns the camera; leaving it flattens the view. Only on the switch itself,
  // so changing the metric never undoes the angle a viewer chose.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;
    m.easeTo(view3d ? { pitch: 58, bearing: -18, duration: 1400 } : { pitch: 0, bearing: 0, duration: 900 });
  }, [view3d, mapReady]);
  // The columns (or neighborhoods) grow out of the ground whenever they appear.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !view3d) return;
    const prop = censusMetric === 'off' ? 'inc' : METRICS[censusMetric].prop;
    let start: number | null = null,
      raf = 0;
    const grow = (t: number) => {
      start ??= t;
      const k = Math.min(1, (t - start) / 1300),
        ease = 1 - Math.pow(1 - k, 3);
      if (style3d === 'columns' && m.getLayer('grid-columns'))
        m.setPaintProperty('grid-columns', 'fill-extrusion-height', ['*', ['get', 'h'], ease]);
      if (style3d === 'areas')
        for (const layer of CENSUS_LAYERS)
          if (m.getLayer(`census-${layer}-3d`))
            m.setPaintProperty(`census-${layer}-3d`, 'fill-extrusion-height', [
              '*',
              ['case', ['has', prop], extrusionHeight(layer), 0],
              ease,
            ] as never);
      if (k < 1) raf = requestAnimationFrame(grow);
    };
    raf = requestAnimationFrame(grow);
    return () => cancelAnimationFrame(raf);
  }, [view3d, style3d, mapReady, censusMetric, scan?.id]);
  useEffect(() => {
    if (!map.current || !scan) return;
    const m = map.current;
    const markers = scan.pins.map((p) => {
      const rank = projected ? projected.pinRanks[p.id] : p.rankFound,
        cited = projected ? projected.aiCitedPinIds[p.id] : p.targetCitedInAi;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'rounded-full border-2 border-white text-xs font-bold';
      el.style.width = el.style.height = '34px';
      const fill = rankColor(p.status, rank);
      el.style.backgroundColor = fill;
      el.style.color = rankTextColor(fill);
      el.textContent =
        p.status === 'FAILED'
          ? '×'
          : p.status === 'PENDING'
            ? '…'
            : rank
              ? String(rank)
              : '20+';
      el.style.boxShadow = cited ? '0 0 0 4px #c084fc' : '';
      el.style.opacity = passesFilters(p.census, bpFilters) && (!rankBand || bandOf(rank) === rankBand) ? '1' : '0.25';
      el.title =
        'Pin ' + (p.rowIdx + 1) + ',' + (p.colIdx + 1) + ' · ' + p.status;
      el.onclick = () => select(p.id);
      return new maplibregl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .addTo(m);
    });
    return () => {
      markers.forEach((v) => v.remove());
    };
  }, [scan, projected, bpFilters, rankBand]);
  async function changeShare(action: string) {
    try {
      const r = await fetch('/api/scans/' + identifier, {
          method: 'POST',
          body: JSON.stringify({ action }),
        }),
        v = await r.json();
      if (!r.ok) throw Error(v.error);
      setShare(v.path ? window.location.origin + v.path : '');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  /** Re-runs failed points (all of them, or the ones given): charged per point, refunded if they fail again. */
  async function rerun(pinIds?: string[]) {
    setRerunBusy(true);
    setRerunNote('');
    try {
      const r = await fetch('/api/scans/' + identifier, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rerun', pinIds }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRerunNote(
        `Re-running ${d.points === 1 ? '1 point' : `${d.points} points`}${d.credits ? ` (${d.credits} credits, refunded if it fails again)` : ''}. They run next on the first free phone.`,
      );
      setReloadKey((k) => k + 1);
    } catch (e) {
      setRerunNote((e as Error).message);
    } finally {
      setRerunBusy(false);
    }
  }
  /** Stops the scan: finished points are kept, the rest are refunded, and a phone that is mid-search is cancelled. */
  async function stop() {
    if (!window.confirm('Stop this scan? Finished points are kept, and every point that has not finished is refunded.')) return;
    setStopBusy(true);
    setRerunNote('');
    try {
      const r = await fetch('/api/scans/' + identifier, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRerunNote(`Stopped: ${d.stopped === 1 ? '1 point' : `${d.stopped} points`} refunded.`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setRerunNote((e as Error).message);
    } finally {
      setStopBusy(false);
    }
  }
  if (!scan) return <p className="p-8">{error || 'Loading report…'}</p>;
  const pin = scan.pins.find((p) => p.id === selected);
  const rankOf = (p: { id: string; rankFound: number | null }) =>
    projected ? ((projected.pinRanks as Record<string, number | null | undefined>)[p.id] ?? null) : p.rankFound;
  const bp = buyingPower(scan.pins, bpFilters, rankOf);
  const hasCensus = scan.pins.some((p) => p.census?.tract?.inc != null);
  const filtering = bpFilters.minOwnerPct > 0 || bpFilters.minIncome > 0;
  const pct = (v: number | null) => (v === null ? 'n/a' : `${v.toFixed(1)}%`);
  const pinArea = pin?.census?.bg?.inc != null && pin.census.bg.rel !== 0
    ? describeArea('bg', pin.census.bg)
    : pin?.census?.tract
      ? describeArea('tract', pin.census.tract)
      : null;
  const pinZip = pin?.census?.zcta ? describeArea('zcta', pin.census.zcta) : null;
  return (
    <div className="mx-auto max-w-screen-2xl space-y-5 p-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{scan.targetBusiness}</h1>
          <p className="text-slate-300">
            {scan.keyword} · {scan.gridSize} × {scan.gridSize} ·{' '}
            {scan.targetType.replaceAll('_', ' ')}
          </p>
        </div>
        {shared ? (
          // New accounts are closed unless NEXT_PUBLIC_SIGNUPS_OPEN=true: no sign-up button on shared reports.
          process.env.NEXT_PUBLIC_SIGNUPS_OPEN === 'true' ? (
            <Link
              className="rounded border border-emerald-500 p-2 text-emerald-300"
              href="/login?mode=register"
            >
              Create agency account
            </Link>
          ) : null
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={'/new-scan?from=' + encodeURIComponent(scan.id)}
              className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-300"
            >
              Run again
            </Link>
            <button onClick={() => changeShare('share')}>Share report</button>
            <button onClick={() => changeShare('revoke')}>Revoke link</button>
          </div>
        )}
      </header>
      {share && (
        <div>
          <label>
            Client report link{' '}
            <input
              className="w-full bg-slate-800 p-2"
              readOnly
              value={share}
              onFocus={(e) => e.target.select()}
            />
          </label>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <p>
          {scan.status} · {scan.completedPins}/{scan.totalPins} completed · {scan.failedPins} failed
        </p>
        {!shared && (scan.status === 'RUNNING' || scan.status === 'QUEUED') && (
          <button
            type="button"
            disabled={stopBusy}
            onClick={stop}
            className="rounded-lg border border-rose-500/60 px-3 py-1 font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
          >
            {stopBusy ? 'Stopping…' : 'Stop scan'}
          </button>
        )}
        {!shared && scan.failedPins > 0 && (
          <button
            type="button"
            disabled={rerunBusy}
            onClick={() => rerun()}
            className="rounded-lg border border-emerald-500/60 px-3 py-1 font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
          >
            {rerunBusy ? 'Starting…' : `Re-run ${scan.failedPins === 1 ? 'the failed point' : `${scan.failedPins} failed points`}`}
            {scan.creditsCharged && scan.totalPins ? ` (${(scan.creditsCharged / scan.totalPins) * scan.failedPins} credits)` : ''}
          </button>
        )}
        {rerunNote && <p className="text-xs text-slate-300">{rerunNote}</p>}
      </div>
      <nav aria-label="Report sections" className="flex gap-1 border-b border-slate-800">
        {([['overview', 'Overview'], ['evidence', 'Evidence']] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-current={tab === k ? 'page' : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold ${tab === k ? 'border-emerald-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            {label}
            {k === 'evidence' && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">NEW</span>}
          </button>
        ))}
      </nav>
      {tab === 'evidence' && (
        <EvidencePanel scan={scan} selected={selected} onSelect={select} shareToken={shared ? identifier : undefined} />
      )}
      <div className={tab === 'overview' ? 'space-y-5' : 'hidden'}>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div>
          <p className="mb-2 text-sm text-slate-300">
            Showing {projected?.businessName ?? scan.targetBusiness} · purple
            ring = AI appearance
          </p>
          <div className="relative">
            <div ref={container} className="h-[520px] rounded-lg bg-slate-900" />
            <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-2">
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-700 bg-slate-950/85 text-xs font-bold shadow-lg backdrop-blur">
                {(['2D', '3D'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={(v === '3D') === view3d}
                    onClick={() => setView3d(v === '3D')}
                    className={'px-3 py-1.5 transition ' + ((v === '3D') === view3d ? 'bg-emerald-400 text-slate-950' : 'text-slate-200 hover:bg-slate-800')}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {view3d && (
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-700 bg-slate-950/85 text-xs font-semibold shadow-lg backdrop-blur">
                  <button
                    type="button"
                    aria-pressed={style3d === 'columns'}
                    onClick={() => setStyle3d('columns')}
                    className={'px-3 py-1.5 transition ' + (style3d === 'columns' ? 'bg-slate-200 text-slate-950' : 'text-slate-200 hover:bg-slate-800')}
                  >
                    Rank × buying power
                  </button>
                  {CENSUS_VINTAGE && (
                    <button
                      type="button"
                      aria-pressed={style3d === 'areas'}
                      onClick={() => {
                        setStyle3d('areas');
                        if (censusMetric === 'off') setCensusMetric('income');
                      }}
                      className={'px-3 py-1.5 transition ' + (style3d === 'areas' ? 'bg-slate-200 text-slate-950' : 'text-slate-200 hover:bg-slate-800')}
                    >
                      Neighborhoods
                    </button>
                  )}
                </div>
              )}
            </div>
            {!view3d && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[75%] flex-wrap gap-x-3 gap-y-1 rounded-lg border border-slate-700 bg-slate-950/85 px-2.5 py-2 text-[11px] text-slate-200 shadow-lg backdrop-blur">
                {RANK_SCALE.map(([label, color]) => (
                  <span key={label} className="inline-flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    {label}
                  </span>
                ))}
              </div>
            )}
            {view3d && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[75%] rounded-lg border border-slate-700 bg-slate-950/85 p-2.5 text-[11px] text-slate-200 shadow-lg backdrop-blur">
                {style3d === 'columns' ? (
                  <>
                    <p className="font-bold">Height = the point&apos;s share of this grid&apos;s buying power</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      {RANK_SCALE.map(([label, color]) => (
                        <span key={label} className="inline-flex items-center gap-1">
                          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                          {label}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-slate-400">Tall red: valuable ground you&apos;re losing. Tall green: valuable ground you&apos;re winning.</p>
                  </>
                ) : (
                  <p className="font-bold">
                    Height = owner-occupied homes · colour ={' '}
                    {censusMetric === 'off' ? 'household income' : METRICS[censusMetric].label.toLowerCase()}
                  </p>
                )}
              </div>
            )}
          </div>
          {mapWarning && <p>{mapWarning}</p>}
          {CENSUS_VINTAGE && (
            <div className="mt-3 space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">Neighborhood data</span>
                <select
                  aria-label="Neighborhood data shown under the map"
                  value={censusMetric}
                  onChange={(e) => setCensusMetric(e.target.value as CensusMetric)}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
                >
                  <option value="income">Household income</option>
                  <option value="owners">Homeowners</option>
                  <option value="value">Home value</option>
                  <option value="built">Year built</option>
                  <option value="off">Off</option>
                </select>
                {censusMetric !== 'off' && (
                  <select
                    aria-label="Area size"
                    value={censusLevel}
                    onChange={(e) => setCensusLevel(e.target.value as CensusLevel)}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
                  >
                    <option value="auto">Areas: auto ({LEVEL_LABEL[autoLevelAt(mapZoom)].toLowerCase()}s)</option>
                    <option value="zcta">ZIP codes</option>
                    <option value="tract">Census tracts</option>
                    <option value="bg">Block groups</option>
                  </select>
                )}
                {censusMetric !== 'off' && (
                  <select
                    aria-label="Colour scale"
                    value={colorScale}
                    onChange={(e) => setColorScale(e.target.value as 'market' | 'national')}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
                  >
                    <option value="market">Colours: compare within this market</option>
                    <option value="national">Colours: national steps</option>
                  </select>
                )}
              </div>
              {censusMetric !== 'off' && (
                <>
                  <p className="text-xs text-slate-400">
                    {METRICS[censusMetric].label}
                    {colorScale === 'market' && marketBreaks ? ' · six equal groups of the areas around this grid' : ' · national steps'}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {legend(censusMetric, colorScale === 'market' ? marketBreaks : null).map((item) => (
                      <span key={item.label} className="inline-flex items-center gap-1">
                        <span className="inline-block h-3 w-4 rounded-sm" style={{ background: item.color }} />
                        {item.label}
                      </span>
                    ))}
                  </div>
                  {censusArea ? (
                    <div className="rounded border border-slate-800 p-2 text-xs">
                      <p className="font-bold">
                        {censusArea.name} · {LEVEL_LABEL[censusArea.level]}
                      </p>
                      {censusArea.rows.map((r) => (
                        <p key={r.label}>
                          <span className="text-slate-400">{r.label}:</span> {r.value}
                        </p>
                      ))}
                      {censusArea.uncertain && (
                        <p className="text-amber-300">
                          The income estimate here has a large margin of error, so it is faded on the map.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Hover over or tap an area for its estimates.</p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    {CENSUS_SOURCE_LABEL}. Area estimates with 90% margins of error, not information about
                    individual households or searchers.
                  </p>
                </>
              )}
              {hasCensus && (
                <div className="space-y-2 border-t border-slate-800 pt-2">
                  <p className="font-bold">Visibility where the buying power is</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded border border-slate-800 p-2">
                      <p className="text-xs text-slate-400">Standard SoLV (top 3)</p>
                      <p className="text-xl font-bold">{pct(bp.standard)}</p>
                      <p className="text-xs text-slate-400">
                        {bp.top3} of {bp.eligible} points; every point counts the same
                      </p>
                    </div>
                    <div className="rounded border border-slate-800 p-2">
                      <p className="text-xs text-slate-400">Buying-Power SoLV</p>
                      <p className="text-xl font-bold">
                        {pct(bp.buyingPower)}{' '}
                        {bp.delta !== null && (
                          <span className={'text-sm ' + (bp.delta >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                            {bp.delta >= 0 ? '+' : ''}
                            {bp.delta.toFixed(1)} pts
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        Each point weighted by its tract&apos;s owner-occupied homes × median income ({bp.weightedPins}{' '}
                        points in {bp.tracts} tracts)
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="inline-flex items-center gap-1">
                      Homeowners at least
                      <select
                        value={bpFilters.minOwnerPct}
                        onChange={(e) => setBpFilters({ ...bpFilters, minOwnerPct: Number(e.target.value) })}
                        className="rounded border border-slate-700 bg-slate-950 px-1 py-0.5"
                      >
                        {[0, 50, 60, 70, 80].map((v) => (
                          <option key={v} value={v}>
                            {v ? `${v}%` : 'any'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inline-flex items-center gap-1">
                      Median income at least
                      <select
                        value={bpFilters.minIncome}
                        onChange={(e) => setBpFilters({ ...bpFilters, minIncome: Number(e.target.value) })}
                        className="rounded border border-slate-700 bg-slate-950 px-1 py-0.5"
                      >
                        {[0, 75000, 100000, 150000].map((v) => (
                          <option key={v} value={v}>
                            {v ? `$${v / 1000}k` : 'any'}
                          </option>
                        ))}
                      </select>
                    </label>
                    {filtering && (
                      <span className="text-slate-400">
                        {bp.eligible} of {bp.observed} points match; the others are faded on the map.
                      </span>
                    )}
                  </div>
                </div>
              )}
              {pin && (pinArea || pinZip) && (
                <div className="rounded border border-slate-800 p-2 text-xs">
                  <p className="font-bold">
                    Point {pin.rowIdx + 1},{pin.colIdx + 1}: its neighborhood
                  </p>
                  {pinArea && (
                    <>
                      <p className="text-slate-400">
                        {pinArea.name} · {LEVEL_LABEL[pinArea.level]}
                      </p>
                      {pinArea.rows.map((r) => (
                        <p key={r.label}>
                          <span className="text-slate-400">{r.label}:</span> {r.value}
                        </p>
                      ))}
                    </>
                  )}
                  {pinZip && (
                    <p className="mt-1">
                      <span className="text-slate-400">{pinZip.name}:</span> {pinZip.rows[0].value},{' '}
                      {pinZip.rows[1].value.split(' (')[0]} homeowners
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="space-y-4">
        <ReportVerdict scan={scan} />
        <aside className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <label className="block font-bold">
            Pin evidence
            <select
              value={selected ?? ''}
              onChange={(e) => select(e.target.value)}
              className="mt-2 block w-full rounded bg-slate-800 p-2 text-sm"
            >
              <option value="">Choose a coordinate</option>
              {scan.pins.map((p) => (
                <option value={p.id} key={p.id}>
                  Row {p.rowIdx + 1} · Col {p.colIdx + 1} · {p.status}
                </option>
              ))}
            </select>
          </label>
          {pin && (
            <>
              <p className="text-sm">
                {pin.lat}, {pin.lng} · {pin.city} {pin.stateCode} {pin.zip}
              </p>
              <p>
                Target rank ·{' '}
                {pin.status !== 'COMPLETED'
                  ? pin.status
                  : pin.proxyMeta?.finderShown === false
                    ? pin.proxyMeta.rankFrom === 'map_pack'
                      ? pin.rankFound != null
                        ? `#${pin.rankFound} in the map pack (the Local Finder was not opened)`
                        : 'Not in the map pack (the Local Finder was not opened)'
                      : pin.rankFound != null
                      ? `#${pin.rankFound} in the AI Overview’s list (no Local Finder on this page)`
                      : pin.proxyMeta.rankFrom === 'none'
                        ? 'No local results on this page'
                        : 'Not in the AI Overview’s list (no Local Finder on this page)'
                    : (pin.rankFound ?? 'Not in the top 10')}
              </p>
              {!shared && pin.status === 'FAILED' && (
                <button
                  type="button"
                  disabled={rerunBusy}
                  onClick={() => rerun([pin.id])}
                  className="mt-1 rounded-lg bg-emerald-400 px-3 py-1.5 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                >
                  {rerunBusy ? 'Starting…' : 'Re-run this point'}
                  {scan.creditsCharged && scan.totalPins ? ` (${scan.creditsCharged / scan.totalPins} credits)` : ''}
                </button>
              )}
              {pin.proxyMeta?.isp && <p className="text-xs text-emerald-300">Connection · {pin.proxyMeta.isp}</p>}
              {pin.videoUrl && (
                <video
                  controls
                  preload="metadata"
                  src={pin.videoUrl}
                  className="max-h-72 w-full"
                />
              )}
              {pin.aiOverviewText && (
                <details>
                  <summary>AI text and visible sources</summary>
                  <p className="whitespace-pre-wrap text-sm">
                    {pin.aiOverviewText}
                  </p>
                  <p>{pin.aiCitations?.join(' · ')}</p>
                </details>
              )}
              {pin.topCompetitors?.length ? (
                <details>
                  <summary>Observed result order</summary>
                  <ol className="list-decimal pl-5">
                    {pin.topCompetitors.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ol>
                </details>
              ) : null}
              {!shared && (
                <div className="flex gap-3 text-emerald-300">
                  {pin.metaJsonUrl && (
                    <a href={pin.metaJsonUrl}>Receipt JSON</a>
                  )}
                  {pin.dumpsTarUrl && <a href={pin.dumpsTarUrl}>Raw bundle</a>}
                </div>
              )}
            </>
          )}
        </aside>
        </div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <RankDistributionCard scan={scan} band={rankBand} onBand={setRankBand} />
        <CompetitorLeaderboard
          pins={scan.pins}
          targetBusiness={scan.targetBusiness}
          activeProjectedBusiness={projected?.normalizedKey}
          onSelectCompetitorForMap={project}
          buyingPower={Object.fromEntries(
            groundOwners(scan.pins, scan.targetBusiness, 999).rows.map((r) => [r.name.trim().toLowerCase().replace(/\s+/g, ' '), r.buyingPower]),
          )}
        />
      </div>
      <AiCoverageCard scan={scan} />
      <ProofStrip
        scan={scan}
        onOpen={(id) => {
          select(id);
          setTab('evidence');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      <MarketInsights scan={scan} />
      </div>
    </div>
  );
}
