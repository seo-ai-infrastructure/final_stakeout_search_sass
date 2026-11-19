'use client';
import { useEffect, useRef, useState } from 'react';
import { EvidencePanel } from './EvidencePanel';
import Link from 'next/link';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@/lib/mapWorker';
import {
  CompetitorLeaderboard,
  type CompetitorMarketStat,
} from './CompetitorLeaderboard';
import { Protocol } from 'pmtiles';
import type { PinCensus } from '@stakeout/core/censusLookup';
import type { PinInsights } from '@stakeout/core/pinInsights';
import { ReportVerdict, RankDistributionCard, AiCoverageCard } from './ReportSummary';
import AiCitationsTab from '@/components/AiCitationsTab';
import { bandOf, reportSummary, type RankBucket, type FindingKind } from '../lib/reportSummary';
import { groundOwners, aiPosition, winningRadius } from '../lib/marketInsights';
import { combinedReading, combinedStyle, combinedTotals, COMBINED_LEGEND } from '../lib/combinedMap';
import { paintSplitPin } from '../lib/combinedPin';
import { PinEvidenceCard } from './PinEvidenceCard';
import { MarketInsights } from './MarketInsights';
import { buyingPower, nearWins, passesFilters, pointShares, NO_FILTERS, type BuyingPowerFilters } from '../lib/buyingPower';
import { gridColumns, rankColor, rankTextColor, RANK_SCALE, columnColor, COLUMN_SCALE, RANK_KEYS, rankKey, ADS_SCALE, adsColor, type RankKey } from '../lib/gridColumns';
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
  quietBasemap,
  liftAboveShading,
  shadeStrength,
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
      { id: `census-${layer}-line`, type: 'line', source: 'census', 'source-layer': layer, layout: { visibility: 'none' }, paint: { 'line-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#7dd3fc', '#94a3b8'], 'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, 0.18], 'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 1.5, 0.75] } },
      beforeLabels,
    );
    m.addLayer(
      { id: `census-${layer}-3d`, type: 'fill-extrusion', source: 'census', 'source-layer': layer, layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': '#74a9cf', 'fill-extrusion-height': 0, 'fill-extrusion-opacity': 0.88 } },
    );
  }
  // Lakes and roads sit above the shading, below the labels.
  liftAboveShading(m, beforeLabels);
}

/** The 3D grid: one column per point (height = buying power, colour = rank), lit for depth. */
/** Whether a pin stays lit: it passes the neighborhood filters, the rank-distribution band and the legend band. */
function pinPasses(
  p: { status: string; census?: GridPinData['census'] },
  rank: number | null | undefined,
  f: { bpFilters: BuyingPowerFilters; rankBand: RankBucket['key'] | null; legendBand: RankKey | null; focusIds?: Set<string> | null; id?: string },
) {
  // A focus set (the opportunity card's points) lights exactly those points, whatever the bands say.
  if (f.focusIds) return Boolean(f.id && f.focusIds.has(f.id));
  return passesFilters(p.census, f.bpFilters) && (!f.rankBand || bandOf(rank) === f.rankBand) && (!f.legendBand || rankKey(p.status, rank) === f.legendBand);
}

/** A competitor's rank at every point, in the shape the map uses to show a business other than the target. */
function statFor(name: string, pins: GridPinData[]): CompetitorMarketStat {
  const key = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
  const pinRanks: Record<string, number | null> = {};
  for (const p of pins) {
    const i = (p.topCompetitors ?? []).findIndex((n) => key(n) === key(name));
    pinRanks[p.id] = i >= 0 ? i + 1 : null;
  }
  return { businessName: name, normalizedKey: key(name), isTarget: false, pinRanks, aiCitedPinIds: {} } as unknown as CompetitorMarketStat;
}

/** A circle of `miles` around a point, as a line the map can draw. */
function ringAround(lat: number, lng: number, miles: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * 2 * Math.PI;
    pts.push([lng + (miles * Math.sin(a)) / (69.172 * Math.cos((lat * Math.PI) / 180)), lat + (miles * Math.cos(a)) / 69.0]);
  }
  return { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: pts } }] };
}

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
      // Solid: any transparency greys the colours against the map underneath.
      'fill-extrusion-opacity': 1,
      'fill-extrusion-vertical-gradient': true,
    },
  });
  // Gentle shading, enough for each column to read as a solid shape. Stronger light turns the
  // sides nearly black, and a tall column's colour is then unreadable from the side.
  m.setLight({ anchor: 'viewport', color: '#ffffff', intensity: 0.55, position: [1.4, 200, 40] });
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
  /** The raw evidence bundle: sent to admins only. */
  dumpsTarUrl?: string | null;
  /** Evidence was kept for this point (so its page can be rebuilt), whoever is looking. */
  hasBundle?: boolean;
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
  /** On a shared report: the white-label name and logo it is shown under, when the owner has one. */
  brand?: { name: string; accent: string | null; logo: string | null } | null;
  /** Set when an admin is reading another account's scan: that account's email. */
  viewingFor?: string;
  /** For the owner of a finished 5×5 scan of a business with no paid listing: the points it was weak on. */
  bridge?: { weak: number; total: number; why: 'rank' | 'ai'; business: string; monthly: string } | null;
  id: string;
  targetBusiness: string;
  /** The business's own website (a bare domain), when it was given. */
  targetDomain?: string | null;
  keyword: string;
  status: string;
  createdAt: string;
  gridSize: number;
  spacingKm: number;
  /** "mobile", "mix" (mobile and residential) or "residential". */
  network?: string;
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
  initialMapMode = 'combined',
  initialTab = 'overview',
  initialPin = null,
}: {
  identifier: string;
  shared?: boolean;
  /** Which map view opens first; the demo page deep-links to one. */
  initialMapMode?: 'combined' | 'rank' | 'ai' | 'ads';
  /** Tab and point that open first; the demo page uses them to land on one point's evidence. */
  initialTab?: 'overview' | 'ai' | 'evidence';
  initialPin?: string | null;
}) {
  const [scan, setScan] = useState<GridScanData | null>(null),
    [selected, select] = useState<string | null>(initialPin),
    [error, setError] = useState(''),
    [share, setShare] = useState(''),
    [projected, project] = useState<CompetitorMarketStat | null>(null),
    [mapWarning, setMapWarning] = useState('');
  const [tab, setTab] = useState<'overview' | 'ai' | 'evidence'>(initialTab);
  const [censusMetric, setCensusMetric] = useState<CensusMetric>(CENSUS_VINTAGE ? 'income' : 'off'),
    [censusLevel, setCensusLevel] = useState<CensusLevel>('auto'),
    [censusArea, setCensusArea] = useState<CensusArea | null>(null),
    [mapZoom, setMapZoom] = useState(11),
    [mapReady, setMapReady] = useState(false),
    [bpFilters, setBpFilters] = useState<BuyingPowerFilters>(NO_FILTERS),
    [view3d, setView3d] = useState(false),
    // What the pins show: the local rank, the business's place in the AI Overview's list, or the
    // number of sponsored results above it.
    [mapMode, setMapMode] = useState<'combined' | 'rank' | 'ai' | 'ads'>(initialMapMode),
    // Combined view: show only the points the AI Overview recommends while the local results leave them out.
    [recommendedOnly, setRecommendedOnly] = useState(false),
    // Combined view: one headline per pin, or each pin split in two (AI Overview over local results).
    [pinStyle, setPinStyle] = useState<'best' | 'split'>('best'),
    // A band picked in the map's legend: pins outside it are dimmed. And whether the purple ring
    // (the business is named in that point's AI Overview) is drawn.
    [legendBand, setLegendBand] = useState<RankKey | null>(null),
    // The opportunity card's points, when it is showing them: only these stay lit.
    [focusIds, setFocusIds] = useState<Set<string> | null>(null),
    [aiRing, setAiRing] = useState(true),
    [finding, setFinding] = useState<FindingKind | null>(null),
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
        // The report's base steps back so the pins are the only strong colour on the map.
        quietBasemap(m);
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
        try {
          // Place names stay readable over the neighbourhood shading: a dark halo behind each label.
          for (const layer of m.getStyle().layers ?? [])
            if (layer.type === 'symbol') {
              m.setPaintProperty(layer.id, 'text-halo-color', '#020617');
              m.setPaintProperty(layer.id, 'text-halo-width', 1.6);
            }
          // The winning radius: a dashed ring around the business, filled in when the scan is known.
          m.addSource('win-radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          m.addLayer({ id: 'win-radius', type: 'line', source: 'win-radius', paint: { 'line-color': '#e2e8f0', 'line-width': 2, 'line-dasharray': [3, 2.5], 'line-opacity': 0.85 } });
        } catch (e) {
          console.error('[map extras]', e);
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
        // Behind the 3D columns the neighbourhood shading steps back, so the columns stand clear of it.
        m.setPaintProperty(`census-${layer}`, 'fill-opacity', fillOpacity(censusMetric, shadeStrength(mapMode, view3d && style3d === 'columns')) as never);
        m.setPaintProperty(`census-${layer}-3d`, 'fill-extrusion-color', color);
      }
    }
    if (censusMetric === 'off') setCensusArea(null);
  }, [censusMetric, censusLevel, mapReady, colorScale, marketBreaks, view3d, style3d, mapMode]);
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
  // One point's combined reading (AI Overview + local results), for whichever business is shown.
  const readCombined = (p: GridPinData) => {
    const name = projected?.businessName ?? scan?.targetBusiness ?? '';
    const ins = p.insights?.v === 1 ? p.insights : null;
    const place = ins ? aiPosition(ins.ai.named, name) : null;
    return combinedReading({
      rank: (projected ? (projected.pinRanks as Record<string, number | null | undefined>)[p.id] : p.rankFound) ?? null,
      rankFrom: p.proxyMeta?.finderShown === false ? (p.proxyMeta.rankFrom ?? 'ai_overview_list') : null,
      hasAiOverview: p.hasAiOverview,
      cited: projected ? Boolean(projected.aiCitedPinIds[p.id]) || Boolean(place) : p.targetCitedInAi,
      aiPos: place?.pos ?? null,
    });
  };
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
      // On a 3D column the label takes the column's own (brighter) shade.
      let fill = view3d && style3d === 'columns' ? columnColor(p.status, rank) : rankColor(p.status, rank);
      let text = p.status === 'FAILED' ? '×' : p.status === 'PENDING' ? '…' : rank ? String(rank) : '20+';
      // In AI place: a point with no AI Overview is a small muted dot; one that names the business stands out.
      let quiet = false, standout = false;
      let combined: ReturnType<typeof combinedReading> | null = null;
      const ins = p.insights?.v === 1 ? p.insights : null;
      if (p.status === 'COMPLETED' && mapMode === 'ai') {
        // The business's place in this point's AI Overview: its place in the AI's list, "yes" when it
        // is named without an order, "no" when an answer appeared without it, a dash when none did.
        const place = !projected && ins ? aiPosition(ins.ai.named, scan.targetBusiness) : null;
        // A pinker violet than the ring's, to stand clear of the blue neighborhood shading.
        fill = p.hasAiOverview ? (cited ? '#a855f7' : '#4c1d95') : '#0f172a';
        text = !p.hasAiOverview ? '–' : place ? '#' + place.pos : cited ? 'yes' : 'no';
        if (!p.hasAiOverview) quiet = true;
        else if (cited) standout = true;
      } else if (p.status === 'COMPLETED' && mapMode === 'combined') {
        // The same pin as the other views: its colour says where the business shows, the label its best placement.
        combined = readCombined(p);
        fill = combinedStyle(combined).swatch;
        text = combined.label;
      } else if (p.status === 'COMPLETED' && mapMode === 'ads') {
        const ads = ins?.adsAboveYou ?? null;
        fill = adsColor(ads);
        text = ads == null ? '?' : String(ads);
      }
      el.style.backgroundColor = fill;
      el.style.color = quiet ? '#64748b' : rankTextColor(fill);
      el.textContent = text;
      // Combined view, 50/50 split: the top half is the AI Overview, the bottom half the local results.
      if (combined && pinStyle === 'split') paintSplitPin(el, combined);
      if (quiet) {
        el.style.width = el.style.height = '22px';
        el.style.border = '1px solid #475569';
        el.style.fontSize = '11px';
      } else if (standout) el.style.width = el.style.height = '38px';
      if (!combined) el.style.boxShadow = standout ? '0 0 0 4px rgba(168,85,247,0.28)' : cited && aiRing && (mapMode === 'rank' || mapMode === 'ads') ? '0 0 0 4px #c084fc' : '';
      // A point where Google showed one business only: a gold outline, whoever holds it.
      const solo = p.proxyMeta?.rankFrom === 'single_business' && mapMode === 'rank';
      el.style.outline = solo ? '2px solid #fde047' : '';
      el.style.outlineOffset = solo ? '3px' : '';
      el.style.opacity = pinPasses(p, rank, { bpFilters, rankBand, legendBand, focusIds, id: p.id }) && !(mapMode === 'combined' && recommendedOnly && combined?.kind !== 'ai') ? '1' : '0.25';
      el.title =
        'Pin ' + (p.rowIdx + 1) + ',' + (p.colIdx + 1) + ' · ' + (combined ? combined.detail : p.status);
      el.onclick = () => select(p.id);
      return new maplibregl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .addTo(m);
    });
    // The business itself, at the centre of the grid.
    const home = document.createElement('div');
    home.title = scan.targetBusiness;
    home.setAttribute('aria-label', scan.targetBusiness + ': the centre of the grid');
    home.style.cssText = 'width:14px;height:14px;border-radius:4px;background:#f8fafc;border:2px solid #020617;box-shadow:0 0 0 1.5px #f8fafc;pointer-events:none';
    // Offset up and to the right: the business usually sits on the grid's centre point, whose pin must stay readable.
    markers.push(new maplibregl.Marker({ element: home, offset: [19, -19] }).setLngLat([scan.centerLng, scan.centerLat]).addTo(m));
    return () => {
      markers.forEach((v) => v.remove());
    };
  }, [scan, projected, bpFilters, rankBand, view3d, style3d, mapMode, legendBand, aiRing, focusIds, recommendedOnly, pinStyle]);
  // The winning radius, drawn around the business: how far out it holds the top 3.
  const radiusMiles = scan ? (winningRadius(scan.pins, { lat: scan.centerLat, lng: scan.centerLng })?.radius ?? null) : null;
  // Points where Google answered with one business and no map pack, and who holds them.
  const combinedStats = scan ? combinedTotals(scan.pins.filter((x) => x.status === 'COMPLETED').map(readCombined)) : null;
  const soloPins = scan ? scan.pins.filter((x) => x.status === 'COMPLETED' && x.proxyMeta?.rankFrom === 'single_business') : [];
  const soloWinners = (() => {
    const tally = new Map<string, { name: string; count: number; isYou: boolean }>();
    for (const x of soloPins) {
      const name = x.topCompetitors?.[0] ?? 'Unknown business';
      const k = name.trim().toLowerCase();
      const row = tally.get(k) ?? { name, count: 0, isYou: x.rankFound === 1 };
      row.count++;
      tally.set(k, row);
    }
    return [...tally.values()].sort((a, b) => b.count - a.count);
  })();
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !scan) return;
    const src = m.getSource('win-radius') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(radiusMiles ? ringAround(scan.centerLat, scan.centerLng, radiusMiles) : { type: 'FeatureCollection', features: [] });
  }, [scan, mapReady, radiusMiles]);
  async function changeShare(action: string) {
    try {
      const r = await fetch('/api/scans/' + identifier, {
          method: 'POST',
          body: JSON.stringify({ action }),
        }),
        v = await r.json();
      if (!r.ok) throw Error(v.error);
      setShare(v.url ?? (v.path ? window.location.origin + v.path : ''));
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
  // The cheapest wins: the target's points ranked #4 to #6 in $100k+ neighborhoods, and what winning them would add.
  const near = nearWins(scan.pins);
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
      {scan.viewingFor && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-4 py-2 text-sm text-amber-200">
          Quality-control view: this scan belongs to {scan.viewingFor}. You can read it and stop it; re-runs, sharing and schedules stay with the owner.{' '}
          <a href="/admin/scans" className="underline">All scans</a>
        </div>
      )}
      {!shared && scan.bridge && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-slate-200">
            <span className="font-semibold text-slate-50">{scan.bridge.business} {scan.bridge.why === 'rank' ? 'missed the top 3' : 'was left out of the AI Overview'} on {scan.bridge.weak} of {scan.bridge.total} points.</span>{' '}
            <span className="text-slate-400">Put its Google listing on the Manage plan ({scan.bridge.monthly} a month) for Business Profile insights, the gaps against the competitors above it, and scheduled posts.</span>
          </p>
          <a href="/profiles?tab=listing" className="whitespace-nowrap rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400">Manage this listing · {scan.bridge.monthly}/mo</a>
        </div>
      )}
      {shared && scan.brand && (
        <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
          {scan.brand.logo && (
            // The logo sits on white: most logos are drawn for a light background.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={scan.brand.logo} alt={scan.brand.name} className="h-16 w-auto max-w-[220px] rounded-lg bg-white object-contain p-1.5" />
          )}
          <div>
            <p className="text-base font-bold text-white">{scan.brand.name}</p>
            <p className="text-xs text-slate-400">Local visibility report</p>
          </div>
        </div>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{scan.targetBusiness}</h1>
          <p className="text-slate-300">
            {scan.keyword} · {scan.gridSize} × {scan.gridSize} ·{' '}
            {scan.targetType.replaceAll('_', ' ')}
            {scan.network === 'mobile' ? ' · Mobile Network' : scan.network === 'mix' ? ' · Mobile & Residential Networks' : ''}
          </p>
        </div>
        {shared ? (
          // New accounts are closed unless NEXT_PUBLIC_SIGNUPS_OPEN=true: no sign-up button on shared reports.
          process.env.NEXT_PUBLIC_SIGNUPS_OPEN === 'true' && !scan.brand ? (
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
        {([['overview', 'Overview'], ['ai', 'AI citations'], ['evidence', 'Evidence']] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-current={tab === k ? 'page' : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold ${tab === k ? 'border-emerald-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            {label}
            {k === 'ai' && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">NEW</span>}
          </button>
        ))}
      </nav>
      {tab === 'ai' && <AiCitationsTab scan={scan} shared={shared} identifier={identifier} onOpenPin={(id) => { select(id); setTab('evidence'); }} />}
      {tab === 'evidence' && (
        <EvidencePanel scan={scan} selected={selected} onSelect={select} shareToken={shared ? identifier : undefined} />
      )}
      <div className={tab === 'overview' ? 'space-y-5' : 'hidden'}>
      {mapMode === 'combined' && combinedStats && combinedStats.total > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Visible on the page</p>
            <p className="mt-1 text-2xl font-bold text-emerald-300">
              {combinedStats.visible} <span className="text-sm font-medium text-slate-300">of {combinedStats.total} points</span>
            </p>
            <p className="mt-1 text-xs text-slate-300">Local results alone: {combinedStats.localVisible} of {combinedStats.total}</p>
          </div>
          <button
            type="button"
            aria-pressed={recommendedOnly}
            disabled={combinedStats.recommended === 0}
            onClick={() => setRecommendedOnly(!recommendedOnly)}
            title="Show only these points on the map"
            className={'rounded-xl border p-4 text-left ' + (recommendedOnly ? 'border-violet-300 bg-violet-900/50' : 'border-violet-500/40 bg-violet-950/30 hover:border-violet-400')}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-violet-300">Recommended by AI Overview</p>
            <p className="mt-1 text-2xl font-bold text-violet-300">
              {combinedStats.recommended} <span className="text-sm font-medium text-slate-300">of {combinedStats.notInLocal} points not in the local results</span>
            </p>
            <p className="mt-1 text-xs text-slate-300">{recommendedOnly ? 'Showing only these on the map. Click to show all.' : 'Named in the AI Overview above the local results. Click to spotlight.'}</p>
          </button>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">In both places</p>
            <p className="mt-1 text-2xl font-bold">
              {combinedStats.both} <span className="text-sm font-medium text-slate-300">points</span>
            </p>
            <p className="mt-1 text-xs text-slate-300">#1 in both at {combinedStats.firstInBoth} of them</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">True misses</p>
            <p className="mt-1 text-2xl font-bold text-rose-300">
              {combinedStats.miss} <span className="text-sm font-medium text-slate-300">of {combinedStats.total} points</span>
            </p>
            <p className="mt-1 text-xs text-slate-300">In neither the AI Overview nor the local results</p>
          </div>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div>
          <p className="mb-2 text-sm text-slate-300">
            Showing {projected?.businessName ?? scan.targetBusiness} ·{' '}
            {mapMode === 'combined'
              ? 'its best placement at each point, in the AI Overview or the local results'
              : mapMode === 'ai'
              ? 'its place in each point’s AI Overview'
              : mapMode === 'ads'
                ? 'sponsored results above it at each point'
                : 'purple ring = named in that point’s AI Overview'}
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
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-700 bg-slate-950/85 text-xs font-semibold shadow-lg backdrop-blur" role="group" aria-label="What the pins show">
                {(
                  [
                    ['combined', 'Combined'],
                    ['rank', 'Pack rank'],
                    ['ai', 'AI place'],
                    ['ads', 'Ads above'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={mapMode === key}
                    onClick={() => {
                      setMapMode(key);
                      if (key !== 'rank') setLegendBand(null);
                      if (key !== 'combined') setRecommendedOnly(false);
                    }}
                    className={'px-3 py-1.5 transition ' + (mapMode === key ? 'bg-slate-200 text-slate-950' : 'text-slate-200 hover:bg-slate-800')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mapMode === 'combined' && (
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-700 bg-slate-950/85 text-xs font-semibold shadow-lg backdrop-blur" role="group" aria-label="How each pin is drawn">
                  {(
                    [
                      ['best', 'Best placement'],
                      ['split', '50/50 split'],
                    ] as const
                  ).map(([key, label]) => (
                    <button key={key} type="button" aria-pressed={pinStyle === key} onClick={() => setPinStyle(key)} className={'px-3 py-1.5 transition ' + (pinStyle === key ? 'bg-slate-200 text-slate-950' : 'text-slate-200 hover:bg-slate-800')}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
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
              <div className="absolute bottom-3 left-3 z-10 flex max-w-[80%] flex-wrap items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/90 p-1.5 text-[11px] text-slate-200 shadow-lg backdrop-blur">
                {mapMode === 'rank' &&
                  RANK_SCALE.map(([label, color], i) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={legendBand === RANK_KEYS[i]}
                      onClick={() => setLegendBand(legendBand === RANK_KEYS[i] ? null : RANK_KEYS[i])}
                      title="Show only these points"
                      className={'inline-flex items-center gap-1 rounded-md px-1.5 py-1 ' + (legendBand === RANK_KEYS[i] ? 'bg-slate-200 text-slate-950' : 'hover:bg-slate-800')}
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                      {label}
                    </button>
                  ))}
                {mapMode === 'combined' && (
                  <>
                    {pinStyle === 'split' && <span className="px-1.5 py-1"><span className="font-bold text-violet-300">Top half</span> AI Overview · <span className="font-bold text-emerald-300">bottom half</span> local results · <span className="font-bold">20+</span> not in the local results · <span className="font-bold">–</span> none on the page</span>}
                    {pinStyle === 'best' && COMBINED_LEGEND.map((l) => (
                      <span key={l.label} className="inline-flex items-center gap-1 px-1.5 py-1">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.swatch }} />
                        {l.label}
                      </span>
                    ))}
                  </>
                )}
                {mapMode === 'ads' &&
                  ADS_SCALE.map(([label, color]) => (
                    <span key={label} className="inline-flex items-center gap-1 px-1.5 py-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                      {label}
                    </span>
                  ))}
                {mapMode === 'ai' && (
                  <span className="px-1.5 py-1">
                    <span className="font-bold text-violet-300">#1</span> your place in the AI&apos;s list · <span className="font-bold text-violet-300">yes</span> named · <span className="font-bold text-violet-300">no</span> not named · <span className="font-bold">–</span> no AI Overview
                  </span>
                )}
                {(mapMode === 'rank' || mapMode === 'ads') && (
                  <button
                    type="button"
                    aria-pressed={aiRing}
                    onClick={() => setAiRing(!aiRing)}
                    title="The business is named in that point's AI Overview"
                    className={'inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 ' + (aiRing ? '' : 'opacity-50') + ' hover:bg-slate-800'}
                  >
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-700" style={{ boxShadow: '0 0 0 2px #c084fc' }} />
                    AI Overview named you
                  </button>
                )}
                {mapMode === 'rank' && soloPins.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-1.5 py-1 text-slate-300" title="Google answered with one business at these points">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-700" style={{ outline: '2px solid #fde047', outlineOffset: 2 }} />
                    Single-business result
                  </span>
                )}
                {radiusMiles !== null && (
                  <span className="inline-flex items-center gap-1.5 px-1.5 py-1 text-slate-400">
                    <span className="inline-block w-4 border-t-2 border-dashed border-slate-200" />
                    {radiusMiles.toFixed(1)} mi winning radius
                  </span>
                )}
                {(() => {
                  const lit = scan.pins.filter((p) => pinPasses(p, projected ? projected.pinRanks[p.id] : p.rankFound, { bpFilters, rankBand, legendBand, focusIds, id: p.id })).length;
                  return lit < scan.pins.length ? (
                    <span className="rounded-md bg-amber-400/15 px-1.5 py-1 font-semibold text-amber-200">
                      Showing {lit} of {scan.pins.length} points
                    </span>
                  ) : null;
                })()}
              </div>
            )}
            {view3d && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[75%] rounded-lg border border-slate-700 bg-slate-950/85 p-2.5 text-[11px] text-slate-200 shadow-lg backdrop-blur">
                {style3d === 'columns' ? (
                  <>
                    <p className="font-bold">Height = the point&apos;s share of this grid&apos;s buying power</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      {COLUMN_SCALE.map(([label, color]) => (
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
                  {/* One statement of where the money is, in place of repeating SoLV and Buying-Power SoLV (both are in the verdict card). */}
                  {near.count > 0 && near.now !== null && near.projected !== null ? (
                    <div className="rounded-xl border border-sky-500/40 bg-sky-950/30 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">Where the money is, and you are close</p>
                      <p className="mt-1 text-base font-bold leading-snug text-white">
                        {near.count} {near.count === 1 ? 'point sits' : 'points sit'} in ${Math.round(near.minIncome / 1000)}k+ income neighborhoods where {scan.targetBusiness} ranks #{near.from} to #{near.to}.
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">
                        One to three places from the top 3, on the most valuable ground. If {near.count === 1 ? 'it' : 'all of them'} reached the top 3, Buying-Power SoLV would go from{' '}
                        <span className="font-bold text-sky-300">{near.now.toFixed(0)}%</span> to <span className="font-bold text-sky-300">{near.projected.toFixed(0)}%</span>
                        {near.lift !== null && <span className="font-semibold text-emerald-300"> (+{near.lift.toFixed(0)} pts)</span>}.
                      </p>
                      <button
                        type="button"
                        aria-pressed={focusIds !== null}
                        onClick={() => {
                          setFinding(null);
                          setRankBand(null);
                          setLegendBand(null);
                          setMapMode('rank');
                          setFocusIds(focusIds ? null : new Set(near.ids));
                        }}
                        className={'mt-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ' + (focusIds ? 'border-sky-300 bg-sky-400 text-slate-950' : 'border-sky-400/60 text-sky-200 hover:bg-sky-400/10')}
                      >
                        {focusIds ? 'Show every point again' : `Show these ${near.count} points on the map`}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Buying-Power SoLV {pct(bp.buyingPower)} against {pct(bp.standard)} of points: each point is weighted by its tract&apos;s owner-occupied homes × median income ({bp.weightedPins} points in {bp.tracts} tracts).
                    </p>
                  )}
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
          {/* Under the map: the right-hand column is the taller one, and this fills the space beside it. */}
          {soloPins.length > 0 && (
            <div className="mt-4 rounded-xl border border-yellow-300/40 bg-yellow-300/[0.06] p-4">
              <h3 className="text-sm font-bold text-yellow-200">Single-business results</h3>
              <p className="mt-1 text-sm text-slate-200">
                At {soloPins.length} of {scan.pins.filter((x) => x.status === 'COMPLETED').length} points Google showed one business and no map pack: the whole local answer went to one company.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {soloWinners.map((w) => (
                  <li key={w.name} className="flex items-baseline justify-between gap-3">
                    <span className={w.isYou ? 'font-bold text-emerald-300' : 'text-slate-200'}>{w.name}{w.isYou ? ' (you)' : ''}</span>
                    <span className="text-slate-400">{w.count} point{w.count === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ul>
              {!soloWinners.some((w) => w.isYou) && <p className="mt-2 text-xs text-slate-400">You hold none of them yet. These are the points where a rival gets the whole screen.</p>}
            </div>
          )}
          <div className="mt-4">
            <RankDistributionCard scan={scan} band={rankBand} onBand={setRankBand} />
          </div>
        </div>
        <div className="space-y-4">
        <ReportVerdict
          scan={scan}
          activeFinding={finding}
          onFinding={(kind) => {
            // Choosing a finding puts its view on the map; choosing it again returns to the plain rank map.
            const off = finding === kind;
            setFinding(off ? null : kind);
            setRankBand(null);
            setLegendBand(off ? null : kind === 'rank' ? 'top' : null);
            setMapMode(off ? 'rank' : kind === 'ads' ? 'ads' : kind === 'ai' ? 'ai' : 'rank');
            // Buying power: light exactly the points the opportunity card counts.
            setFocusIds(!off && kind === 'bp' && near.count ? new Set(near.ids) : null);
            // Competitor: put that business's ranks on the map, as selecting it in the leaderboard does.
            const rival = reportSummary(scan).rivalName;
            project(!off && kind === 'rival' && rival ? statFor(rival, scan.pins) : null);
          }}
        />
        </div>
      </div>
      {/* One point's evidence, full width: the recording in a phone frame, the results and AI text open beside it. */}
      <PinEvidenceCard
        scan={scan}
        pin={pin ?? null}
        onSelect={select}
        shared={shared}
        onRerun={(id) => rerun([id])}
        rerunBusy={rerunBusy}
        onOpenEvidence={() => setTab('evidence')}
        shareToken={shared ? identifier : undefined}
      />
      {/* Full width: its seven columns need the room. */}
      <div id="competitor-leaderboard" className="scroll-mt-4">
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
      <MarketInsights scan={scan} />
      </div>
    </div>
  );
}
