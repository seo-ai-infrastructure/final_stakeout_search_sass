// apps/nextjs/src/components/NewScanWizard.tsx
'use client';
import { OFFERED_GRID_SIZES, shapeSkips, type GridShape } from '@stakeout/core/gridSizes';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { declutterBasemap, quietBasemap, fillColor, legend, CENSUS_VINTAGE } from '../lib/censusLayer';
import {
  Smartphone,
  Monitor,
  Sparkles,
  AlertCircle,
  ArrowRight,
  Loader2,
  MapPin,
  Search,
  Globe,
  Lock,
} from 'lucide-react';
import { IspSelectorDropdown, type IspMode, type IspOption } from '@/components/IspSelectorDropdown';
import { CreditTopUpModal } from '@/components/CreditTopUpModal';
type TargetType =
  'mobile_maps' | 'mobile_chrome' | 'mobile_google' | 'desktop_aimode';
// Only the sizes on offer right now (see OFFERED_GRID_SIZES).
const GRID_SIZES = OFFERED_GRID_SIZES.map((size) => ({ size, label: `${size}×${size} (${size * size} Pins)` }));
/** A size carried over from an older scan or a saved business that is no longer offered falls back to 5×5. */
const offeredSize = (n: number) => (OFFERED_GRID_SIZES.includes(n) ? n : 5);
const SPACING_OPTIONS = [
  { label: '0.5 Miles', short: '0.5 mi', km: 0.80467 },
  { label: '1.0 Mile', short: '1 mi', km: 1.60934 },
  { label: '2.0 Miles', short: '2 mi', km: 3.21868 },
  { label: '5.0 Miles', short: '5 mi', km: 8.04672 },
];
export function NewScanWizard() {
  const router = useRouter();
  // All 8 User Inputs
  const [targetType, setTargetType] = useState<TargetType>('mobile_chrome');
  // The keyword being typed; chosen keywords live in `picked`.
  const [keyword, setKeyword] = useState('');
  const [targetBusiness, setTargetBusiness] = useState('');
  const [centerLat, setCenterLat] = useState<number>(28.039465);
  const [centerLng, setCenterLng] = useState<number>(-81.949804);
  const [gridSize, setGridSize] = useState<number>(5);
  const [spacingKm, setSpacingKm] = useState<number>(1.60934);
  const [trackAiOverviews, setTrackAiOverviews] = useState<boolean>(true);
  const [scheduleType, setScheduleType] = useState<'once' | 'daily' | 'weekly'>(
    'once',
  );
  // Market & ISP State
  const [detectedZip, setDetectedZip] = useState('33801');
  const [detectedCity, setDetectedCity] = useState('Lakeland');
  const [detectedState, setDetectedState] = useState('FL');
  const [ispMode, setIspMode] = useState<IspMode>('any');
  // Home internet (residential IPs) or mobile data (a carrier IP in each point's state).
  const [network, setNetwork] = useState<'residential' | 'mobile'>('residential');
  const [mobileData, setMobileData] = useState<{ available: boolean; ready: boolean; creditsPerPoint: number } | null>(null);
  const [ispSelected, setIspSelected] = useState<string[]>([]);
  const [ispOptions, setIspOptions] = useState<IspOption[]>([]);
  const [ispLoading, setIspLoading] = useState(false);
  // Where this area's connections come from: its own city, the nearest covered city, or anywhere in the state.
  const [proxySource, setProxySource] = useState<{ city: string; level: string } | null>(null);
  // Session & UI State
  const [userId, setUserId] = useState<string>('');
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  // Saved businesses (one per client): pick one to fill every field; tick keywords to run several at once.
  type SavedBusiness = {
    id: string; name: string; centerLabel: string; centerLat: number; centerLng: number; keywords: string[];
    targetType: TargetType; gridSize: number; spacingKm: number; ispMode: IspMode; isps: string[];
    trackAiOverviews: boolean; scheduleType: 'once' | 'daily' | 'weekly';
  };
  const [saved, setSaved] = useState<SavedBusiness[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [keywordList, setKeywordList] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [saveMsg, setSaveMsg] = useState('');
  // Points left out on the map ("row_col"): not created, not charged.
  const [skipped, setSkipped] = useState<string[]>([]);
  // The grid's shape: the full square, a wide or tall rectangle inside it, or a rough circle.
  // 'wealth' is not a grid: one point at the middle of each of the highest-income census areas near the business.
  const [shape, setShape] = useState<GridShape | 'wealth'>('square');
  const [areas, setAreas] = useState<{ lat: number; lng: number; inc: number }[]>([]);
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [showWealth, setShowWealth] = useState(false);
  // What the map knows about each point once its tiles have drawn: the area's median income, and whether it sits on water.
  const [pointInfo, setPointInfo] = useState<Record<string, { inc: number | null; water: boolean }>>({});
  const waterLayers = useRef<string[]>([]);
  // The phones a scan will run on, by model.
  const [phones, setPhones] = useState<{ brand: string; model: string }[]>([]);
  const [launched, setLaunched] = useState<{ ids: string[]; summary: string; points: number; repeat: boolean } | null>(null);
  function addKeyword() {
    const v = keyword.trim();
    if (!v) return;
    setKeywordList((l) => (l.includes(v) ? l : [...l, v]));
    setPicked((l) => (l.includes(v) ? l : [...l, v]));
    setKeyword('');
  }
  function applyBusiness(b: SavedBusiness) {
    setBusinessId(b.id);
    setTargetBusiness(b.name);
    setCenterLat(b.centerLat);
    setCenterLng(b.centerLng);
    setAddressQuery(b.centerLabel);
    setTargetType(b.targetType);
    setGridSize(offeredSize(b.gridSize));
    setSpacingKm(b.spacingKm);
    setIspMode(b.ispMode);
    setIspSelected(b.isps ?? []);
    setTrackAiOverviews(b.trackAiOverviews);
    setScheduleType(b.scheduleType);
    setKeywordList(b.keywords);
    setPicked(b.keywords.slice(0, 1));
    setKeyword('');
    setSaveMsg('');
  }
  function togglePick(k: string) {
    const next = picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k];
    setPicked(next);
  }
  useEffect(() => {
    let live = true;
    (async () => {
      const list: SavedBusiness[] = await fetch('/api/businesses')
        .then((r) => (r.ok ? r.json() : { businesses: [] }))
        .then((d) => d.businesses ?? [])
        .catch(() => []);
      if (!live) return;
      setSaved(list);
      const q = new URLSearchParams(window.location.search);
      const b = q.get('business') && list.find((x) => x.id === q.get('business'));
      if (b) return applyBusiness(b);
      const from = q.get('from');
      if (from) {
        // "Run again": the same settings as a past scan.
        const scan = await fetch('/api/scans/' + encodeURIComponent(from)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const sc = scan?.scan ?? scan;
        if (!live || !sc?.keyword) return;
        setTargetBusiness(sc.targetBusiness);
        setCenterLat(sc.centerLat);
        setCenterLng(sc.centerLng);
        if (sc.targetType) setTargetType(sc.targetType);
        if (sc.gridSize) setGridSize(offeredSize(sc.gridSize));
        if (sc.spacingKm) setSpacingKm(sc.spacingKm);
        setTrackAiOverviews(Boolean(sc.trackAiOverviews));
        const match = list.find((x) => x.name === sc.targetBusiness);
        if (match) setBusinessId(match.id);
        setKeywordList([...new Set([...(match?.keywords ?? []), sc.keyword])]);
        setPicked([sc.keyword]);
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function saveBusiness() {
    setSaveMsg('');
    const keywords = [...new Set([...keywordList, ...picked, keyword].map((k) => k.trim()).filter(Boolean))];
    const body = {
      name: targetBusiness, centerLabel: addressQuery || [detectedCity, detectedState, detectedZip].filter(Boolean).join(' '),
      centerLat, centerLng, keywords, targetType, gridSize, spacingKm, ispMode, isps: ispMode === 'any' ? [] : ispSelected,
      trackAiOverviews, scheduleType,
    };
    const res = await fetch(businessId ? '/api/businesses/' + businessId : '/api/businesses', {
      method: businessId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setSaveMsg(data.error ?? 'Could not save this business.');
    const b: SavedBusiness = data.business;
    setSaved((list) => [b, ...list.filter((x) => x.id !== b.id)]);
    setBusinessId(b.id);
    setKeywordList(b.keywords);
    setSaveMsg(businessId ? 'Saved changes.' : 'Saved. Pick it from “Saved business” next time.');
  }
  async function deleteBusiness() {
    if (!businessId || !window.confirm('Delete this saved business? Scans already run are kept.')) return;
    const res = await fetch('/api/businesses/' + businessId, { method: 'DELETE' });
    if (!res.ok) return setSaveMsg('Could not delete it.');
    setSaved((list) => list.filter((x) => x.id !== businessId));
    setBusinessId('');
    setKeywordList([]);
    setPicked([]);
    setSaveMsg('Deleted.');
  }
  const submissionKey = useRef<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const previewMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading');
  type Place = { label: string; sub: string; lat: number; lng: number; businessId?: string };
  const [places, setPlaces] = useState<Place[]>([]);
  const [placeIdx, setPlaceIdx] = useState(-1);
  const [searchNote, setSearchNote] = useState('');
  const typedRef = useRef(false);
  // 1. Load Authenticated User via /api/user/me
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch('/api/user/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.id) setUserId(data.id);
          if (typeof data.creditBalance === 'number') {
            setCreditBalance(data.creditBalance);
          }
          if (data.mobileData?.available) setMobileData(data.mobileData);
        }
      } catch {}
    }
    loadUser();
    fetch('/api/fleet/profiles')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => Array.isArray(d?.phones) && setPhones(d.phones))
      .catch(() => {});
  }, []);
  // A different grid size is a different set of points: skips start over.
  useEffect(() => {
    setSkipped([]);
    setRows(gridSize);
    setCols(gridSize);
  }, [gridSize]);
  useEffect(() => setSkipped([]), [shape, rows, cols]);
  // Points the shape leaves out, and every point left out for any reason.
  const outOfShape = useMemo(() => (shape === 'wealth' ? [] : shapeSkips(shape, gridSize, rows, cols)), [shape, gridSize, rows, cols]);
  const allSkipped = useMemo(() => [...new Set([...outOfShape, ...skipped])], [outOfShape, skipped]);
  // 2. Auto-detect local ZIP/City/State when coordinates move
  useEffect(() => {
    const controller = new AbortController();
    setIspLoading(true);
    fetch(`/api/isps?lat=${centerLat}&lng=${centerLng}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.isps)) {
          const names = new Set(data.isps.map((i: IspOption) => i.name));
          setIspOptions(data.isps);
          // A new market may not have the ISPs chosen for the old one.
          setIspSelected((prev) => prev.filter((n) => names.has(n)));
        }
        setProxySource(data?.proxyMarket ? { city: String(data.proxyMarket.city ?? ''), level: String(data.proxyMarket.level ?? '') } : null);
        if (data?.detectedMarket) {
          setDetectedZip(data.detectedMarket.zip);
          setDetectedCity(data.detectedMarket.city);
          setDetectedState(data.detectedMarket.stateCode);
        }
      })
      .catch(() => {})
      .finally(() => setIspLoading(false));
    return () => controller.abort();
  }, [centerLat, centerLng]);
  // 3. Preview Coordinate Matrix
  const previewPoints = useMemo(() => {
    const half = Math.floor(gridSize / 2);
    const latDelta = (spacingKm / 6371.0) * (180.0 / Math.PI);
    const lngDelta = latDelta / Math.cos((centerLat * Math.PI) / 180.0);
    if (shape === 'wealth')
      return [
        { lat: centerLat, lng: centerLng, isCenter: true, key: 'c', skipped: false, out: false, n: 0 },
        ...areas.map((a, i) => ({ lat: a.lat, lng: a.lng, isCenter: false, key: 'a' + a.lat + ',' + a.lng, skipped: skipped.includes('a' + a.lat + ',' + a.lng), out: false, n: i + 1 })),
      ];
    const pts = [];
    for (let r = -half; r <= half; r++) {
      for (let c = -half; c <= half; c++) {
        pts.push({
          lat: Number((centerLat - r * latDelta).toFixed(6)),
          lng: Number((centerLng + c * lngDelta).toFixed(6)),
          isCenter: r === 0 && c === 0,
          key: r + half + '_' + (c + half),
          skipped: !(r === 0 && c === 0) && skipped.includes(r + half + '_' + (c + half)),
          out: outOfShape.includes(r + half + '_' + (c + half)),
          n: (r + half) * gridSize + (c + half) + 1,
        });
      }
    }
    return pts;
  }, [centerLat, centerLng, gridSize, spacingKm, skipped, outOfShape, shape, areas]);
  // 4. Credit cost: one credit per grid point. AI Overview tracking is included.
  const creditSummary = useMemo(() => {
    const totalPins = shape === 'wealth' ? previewPoints.filter((p) => !p.skipped).length : gridSize * gridSize - allSkipped.length;
    const isDesktop = targetType.startsWith('desktop_');
    const costPerPin = isDesktop ? 2 : network === 'mobile' && mobileData ? mobileData.creditsPerPoint : 1;
    const totalCost = totalPins * costPerPin;
    const spanMiles = ((gridSize - 1) * spacingKm * 0.621371).toFixed(1);
    return {
      totalPins,
      costPerPin,
      totalCost,
      spanMiles,
      hasEnoughCredits: creditBalance >= totalCost,
    };
  }, [gridSize, spacingKm, targetType, creditBalance, allSkipped, shape, previewPoints, network, mobileData]);
  // 5. MapLibre Initialization
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style:
          process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
          'https://tiles.openfreemap.org/styles/dark',
        center: [centerLng, centerLat],
        zoom: 11.5,
        attributionControl: { compact: true },
      });
    } catch {
      setMapState('error');
      return;
    }
    map.on('load', () => {
      declutterBasemap(map);
      // The same quiet base as the report, so the grid is the only strong colour.
      quietBasemap(map);
      // Lakes stand out here (a clear shoreline and blue names), so a point on water is easy to spot.
      for (const l of map.getStyle().layers ?? []) {
        const src = (l as { 'source-layer'?: string })['source-layer'];
        try {
          if (l.type === 'fill' && src === 'water') {
            waterLayers.current.push(l.id);
            map.setPaintProperty(l.id, 'fill-color', '#060c1a');
            map.setPaintProperty(l.id, 'fill-outline-color', '#3b82a6');
          } else if (l.type === 'symbol' && src === 'water_name') map.setPaintProperty(l.id, 'text-color', '#7dd3fc');
        } catch {
          /* this style lacks the property */
        }
      }
      const beforeLabels = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
      if (CENSUS_VINTAGE) {
        try {
          maplibregl.addProtocol('pmtiles', new Protocol().tile);
          map.addSource('census', { type: 'vector', url: `pmtiles://${window.location.origin}/api/census/${CENSUS_VINTAGE}.pmtiles`, promoteId: 'id' });
          map.addLayer(
            { id: 'setup-income', type: 'fill', source: 'census', 'source-layer': 'tract', paint: { 'fill-color': fillColor('income') as never, 'fill-opacity': 0.01 } },
            beforeLabels,
          );
        } catch (e) {
          console.error('[census layer]', e);
        }
      }
      // The grid's outline and the lines between its points.
      map.addSource('grid-frame', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'grid-lines', type: 'line', source: 'grid-frame', filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': '#34d399', 'line-opacity': 0.4, 'line-width': 1, 'line-dasharray': [2, 3] } });
      map.addLayer({ id: 'grid-ring', type: 'line', source: 'grid-frame', filter: ['==', ['get', 'kind'], 'ring'], paint: { 'line-color': '#e2e8f0', 'line-opacity': 0.35, 'line-width': 1.2, 'line-dasharray': [4, 4] } });
      map.addLayer({ id: 'grid-fill', type: 'fill', source: 'grid-frame', filter: ['==', ['get', 'kind'], 'box'], paint: { 'fill-color': '#34d399', 'fill-opacity': 0.04 } });
      map.addLayer({ id: 'grid-box', type: 'line', source: 'grid-frame', filter: ['==', ['get', 'kind'], 'box'], paint: { 'line-color': '#34d399', 'line-opacity': 0.6, 'line-width': 1.5, 'line-dasharray': [3, 3] } });
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('click', (e) => {
      setCenterLat(Number(e.lngLat.lat.toFixed(6)));
      setCenterLng(Number(e.lngLat.lng.toFixed(6)));
    });
    map.on('load', () => {
      setMapState('ready');
      map.resize();
    });
    map.on('error', () => {
      if (!map.isStyleLoaded()) setMapState('error');
    });
    // The panel can still be 0×0 when the map starts (a blank, black map): follow its size.
    const el = mapContainerRef.current;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    mapRef.current = map;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);
  // 6. The grid on the map: points (click to skip), the storefront at the centre, outline and labels.
  const lastFit = useRef('');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    previewMarkersRef.current.forEach((m) => m.remove());
    previewMarkersRef.current = [];
    const bounds = new maplibregl.LngLatBounds();
    const dot = gridSize <= 3 ? 30 : gridSize <= 5 ? 26 : gridSize <= 7 ? 22 : 18;
    const add = (el: HTMLElement, lng: number, lat: number, draggable = false, offset: [number, number] = [0, 0]) => {
      const marker = new maplibregl.Marker({ element: el, draggable, anchor: 'center', offset }).setLngLat([lng, lat]).addTo(map);
      previewMarkersRef.current.push(marker);
      return marker;
    };
    const tag = (text: string) => {
      const el = document.createElement('div');
      el.className = 'pointer-events-none whitespace-nowrap rounded-md border border-slate-700 bg-slate-900/95 px-2 py-0.5 text-xs font-semibold text-emerald-300';
      el.textContent = text;
      return el;
    };
    const inShape = previewPoints.filter((pt) => !pt.out);
    inShape.forEach((pt) => {
      bounds.extend([pt.lng, pt.lat]);
      if (pt.isCenter) {
        const el = document.createElement('div');
        el.className = 'flex h-9 w-9 cursor-grab items-center justify-center rounded-full border-2 border-emerald-400 bg-white text-slate-900 shadow-[0_0_0_5px_rgba(52,211,153,0.35)]';
        el.setAttribute('aria-label', 'The business: drag to move the whole grid');
        el.innerHTML =
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10l1.5-5h13L20 10"/><path d="M4 10a2.7 2.7 0 0 0 5.3 0a2.7 2.7 0 0 0 5.4 0a2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12.5V20h13v-7.5"/><path d="M10 20v-4.5h4V20"/></svg>';
        const marker = add(el, pt.lng, pt.lat, true);
        marker.on('dragend', () => {
          const lngLat = marker.getLngLat();
          setCenterLat(Number(lngLat.lat.toFixed(6)));
          setCenterLng(Number(lngLat.lng.toFixed(6)));
        });
        return;
      }
      const el = document.createElement('button');
      el.type = 'button';
      el.style.width = el.style.height = dot + 'px';
      const info = pointInfo[pt.key];
      const rich = showWealth && !pt.skipped && (info?.inc ?? 0) >= 100000;
      // A numbered ring, like the report's points; a point in a $100k+ area gets a blue halo while buying power is shown.
      el.className =
        'flex items-center justify-center rounded-full border-2 font-bold leading-none ' +
        (pt.skipped
          ? 'border-dashed border-slate-500 bg-slate-950/70 text-slate-500'
          : 'border-emerald-400 bg-slate-950 text-emerald-100 ' + (rich ? 'shadow-[0_0_0_4px_rgba(125,211,252,0.55)]' : 'shadow-[0_0_0_3px_rgba(52,211,153,0.18)]'));
      el.style.fontSize = (dot >= 26 ? 11 : dot >= 22 ? 10 : 8) + 'px';
      el.textContent = pt.skipped ? '' : String(pt.n);
      el.setAttribute('aria-pressed', String(!pt.skipped));
      el.setAttribute('aria-label', pt.skipped ? 'Skipped point: click to include it' : 'Grid point: click to skip it');
      el.title =
        (pt.skipped ? 'Skipped (not charged). Click to include.' : 'Click to skip this point') +
        (info?.water ? ' · on water' : '') +
        (info?.inc ? ` · area median income $${Math.round(info.inc / 1000)}k` : '');
      // A click on a point skips or restores it; it must not also move the grid's centre.
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSkipped((list) => (list.includes(pt.key) ? list.filter((k) => k !== pt.key) : [...list, pt.key]));
      });
      add(el, pt.lng, pt.lat);
    });
    // The box the highest-income areas are searched in: the square the size and spacing buttons describe.
    const halfN = Math.floor(gridSize / 2) + 0.5;
    const dLat = (spacingKm / 6371.0) * (180.0 / Math.PI), dLng = dLat / Math.cos((centerLat * Math.PI) / 180.0);
    const box = { N: centerLat + halfN * dLat, S: centerLat - halfN * dLat, W: centerLng - halfN * dLng, E: centerLng + halfN * dLng };
    if (shape === 'wealth') {
      bounds.extend([box.W, box.S]);
      bounds.extend([box.E, box.N]);
      (map.getSource('grid-frame') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { kind: 'box' }, geometry: { type: 'Polygon', coordinates: [[[box.W, box.N], [box.E, box.N], [box.E, box.S], [box.W, box.S], [box.W, box.N]]] } }],
      });
    } else {
    // Labels: the step between two neighbouring points, and the size of the shape.
    const mi = Number((spacingKm / 1.60934).toFixed(1));
    const lats = inShape.map((p) => p.lat), lngs = inShape.map((p) => p.lng);
    const top = Math.max(...lats), bottom = Math.min(...lats), west = Math.min(...lngs), east = Math.max(...lngs);
    const stepLat = Math.abs(previewPoints[0].lat - previewPoints[gridSize].lat), stepLng = Math.abs(previewPoints[1].lng - previewPoints[0].lng);
    const topRow = inShape.filter((p) => p.lat === top).sort((x, y) => x.lng - y.lng);
    const wide = Number(((east - west) / stepLng * mi).toFixed(1)), tall = Number(((top - bottom) / stepLat * mi).toFixed(1));
    if (topRow.length > 1) add(tag(mi + ' mi'), (topRow[0].lng + topRow[1].lng) / 2, top, false, [0, -dot - 8]);
    add(tag(wide === tall ? wide + ' mi across' : wide + ' × ' + tall + ' mi'), (west + east) / 2, bottom, false, [0, dot + 14]);
    // Outline (a box, or a ring for a round grid) and the lines between points.
    const src = map.getSource('grid-frame') as maplibregl.GeoJSONSource | undefined;
    if (src) {
      const N = top + stepLat / 3, S = bottom - stepLat / 3, W = west - stepLng / 3, E = east + stepLng / 3;
      const ring: number[][] =
        shape === 'round'
          ? Array.from({ length: 49 }, (_, i) => {
              const t = (i / 48) * 2 * Math.PI;
              return [centerLng + Math.cos(t) * ((E - W) / 2) * 1.04, centerLat + Math.sin(t) * ((N - S) / 2) * 1.04];
            })
          : [[W, N], [E, N], [E, S], [W, S], [W, N]];
      const lines = [];
      if (shape === 'square' || shape === 'custom') {
        for (const lat of [...new Set(lats)]) lines.push({ type: 'Feature' as const, properties: { kind: 'line' }, geometry: { type: 'LineString' as const, coordinates: [[west, lat], [east, lat]] } });
        for (const lng of [...new Set(lngs)]) lines.push({ type: 'Feature' as const, properties: { kind: 'line' }, geometry: { type: 'LineString' as const, coordinates: [[lng, top], [lng, bottom]] } });
      }
      // A scale ring through the outermost points east and west of the business.
      const reach = [];
      if ((shape === 'square' || shape === 'custom') && east > west) {
        const rx = (east - west) / 2, ry = rx * (stepLat / stepLng);
        reach.push({
          type: 'Feature' as const,
          properties: { kind: 'ring' },
          geometry: { type: 'LineString' as const, coordinates: Array.from({ length: 65 }, (_, i) => [centerLng + Math.cos((i / 64) * 2 * Math.PI) * rx, centerLat + Math.sin((i / 64) * 2 * Math.PI) * ry]) },
        });
        add(tag(Number((wide / 2).toFixed(1)) + ' mi from the business'), centerLng + rx * 0.7071, centerLat + ry * 0.7071, false, [0, -12]);
      }
      src.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { kind: 'box' }, geometry: { type: 'Polygon', coordinates: [ring] } }, ...lines, ...reach],
      });
    }
    }
    // Refit only when the grid itself moved or changed size, not when a point is skipped.
    const fitKey = [centerLat, centerLng, gridSize, spacingKm, shape, rows, cols].join('|');
    if ((inShape.length > 1 || shape === 'wealth') && fitKey !== lastFit.current) {
      lastFit.current = fitKey;
      map.fitBounds(bounds, { padding: { top: 110, bottom: 130, left: 70, right: 70 }, maxZoom: 14, duration: 400 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewPoints, mapState, pointInfo, showWealth]);
  // Top income: read every census area the map has drawn inside the search box and keep the 24 richest.
  useEffect(() => {
    const map = mapRef.current;
    if (shape !== 'wealth' || !map || mapState !== 'ready') {
      setAreas((prev) => (prev.length ? [] : prev));
      return;
    }
    const halfN = Math.floor(gridSize / 2) + 0.5;
    const dLat = (spacingKm / 6371.0) * (180.0 / Math.PI), dLng = dLat / Math.cos((centerLat * Math.PI) / 180.0);
    const read = () => {
      let feats: maplibregl.MapGeoJSONFeature[] = [];
      try {
        if (map.getLayer('setup-income')) feats = map.queryRenderedFeatures({ layers: ['setup-income'] });
      } catch {
        /* not drawn yet */
      }
      // An area can arrive in several pieces (one per map tile): its middle is the average of all their corners.
      const sums = new Map<string, { inc: number; x: number; y: number; n: number }>();
      for (const f of feats) {
        const inc = Number(f.properties?.inc);
        if (!(inc > 0)) continue;
        const g = f.geometry;
        const rings: number[][][] = g.type === 'Polygon' ? [g.coordinates[0] as number[][]] : g.type === 'MultiPolygon' ? g.coordinates.map((poly) => poly[0] as number[][]) : [];
        const id = String(f.id ?? f.properties?.id ?? '');
        if (!id) continue;
        const acc = sums.get(id) ?? { inc, x: 0, y: 0, n: 0 };
        for (const ring of rings) for (const [x, y] of ring) { acc.x += x; acc.y += y; acc.n++; }
        sums.set(id, acc);
      }
      const next = [...sums.values()]
        .filter((a) => a.n > 2)
        .map((a) => ({ lat: Number((a.y / a.n).toFixed(5)), lng: Number((a.x / a.n).toFixed(5)), inc: a.inc }))
        .filter((a) => Math.abs(a.lat - centerLat) <= halfN * dLat && Math.abs(a.lng - centerLng) <= halfN * dLng)
        .sort((a, b) => b.inc - a.inc || a.lat - b.lat)
        .slice(0, 24);
      setAreas((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    map.on('idle', read);
    if (map.loaded()) read();
    return () => {
      map.off('idle', read);
    };
  }, [shape, mapState, centerLat, centerLng, gridSize, spacingKm]);
  // Once the map has drawn, read each point's surroundings off it: income of its area, and water.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== 'ready') return;
    const read = () => {
      const next: Record<string, { inc: number | null; water: boolean }> = {};
      for (const pt of previewPoints) {
        const px = map.project([pt.lng, pt.lat]);
        let inc: number | null = null, water = false;
        try {
          if (map.getLayer('setup-income')) {
            const v = Number(map.queryRenderedFeatures(px, { layers: ['setup-income'] })[0]?.properties?.inc);
            inc = Number.isFinite(v) && v > 0 ? v : null;
          }
          if (waterLayers.current.length) water = map.queryRenderedFeatures(px, { layers: waterLayers.current }).length > 0;
        } catch {
          /* the layers are not drawn yet */
        }
        next[pt.key] = { inc, water };
      }
      setPointInfo((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    map.on('idle', read);
    if (map.loaded()) read();
    return () => {
      map.off('idle', read);
    };
  }, [previewPoints, mapState]);
  // Income shading on or off.
  useEffect(() => {
    const map = mapRef.current;
    if (map && mapState === 'ready' && map.getLayer('setup-income')) map.setPaintProperty('setup-income', 'fill-opacity', showWealth ? 0.45 : 0.01);
  }, [showWealth, mapState]);
  async function findPlaces(q: string): Promise<Place[]> {
    const needle = q.toLowerCase();
    const mine: Place[] = saved
      .filter((b) => b.name.toLowerCase().includes(needle) || b.centerLabel.toLowerCase().includes(needle))
      .slice(0, 3)
      .map((b) => ({ label: b.name, sub: 'Saved business · ' + (b.centerLabel || 'saved centre'), lat: b.centerLat, lng: b.centerLng, businessId: b.id }));
    let found: Place[] = [];
    try {
      const r = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=${centerLat}&lon=${centerLng}`,
      );
      const d = await r.json();
      found = (d.features ?? [])
        .filter((f: any) => f.properties?.countrycode === 'US')
        .slice(0, 6)
        .map((f: any) => {
          const p = f.properties;
          const street = [p.housenumber, p.street].filter(Boolean).join(' ');
          return {
            label: p.name || street || p.city || p.postcode || q,
            sub: [p.name && street, p.city || p.county, [p.state, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', '),
            lat: Number(f.geometry.coordinates[1]),
            lng: Number(f.geometry.coordinates[0]),
          };
        });
    } catch {
      setSearchNote('Place search is unavailable right now. Click the map to set the centre.');
    }
    return [...mine, ...found];
  }
  function choosePlace(p: Place) {
    const b = p.businessId && saved.find((x) => x.id === p.businessId);
    if (b) applyBusiness(b);
    else {
      setCenterLat(Number(p.lat.toFixed(6)));
      setCenterLng(Number(p.lng.toFixed(6)));
      setAddressQuery(p.sub ? p.label + ', ' + p.sub : p.label);
    }
    typedRef.current = false;
    setPlaces([]);
    setPlaceIdx(-1);
    setSearchNote('');
    mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 12, duration: 600 });
  }
  // Suggestions while typing (debounced); never for text filled in by a saved business.
  useEffect(() => {
    const q = addressQuery.trim();
    if (!typedRef.current || q.length < 3) {
      setPlaces([]);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      setIsGeocoding(true);
      const list = await findPlaces(q);
      if (!live) return;
      setIsGeocoding(false);
      setPlaces(list);
      setPlaceIdx(list.length ? 0 : -1);
      setSearchNote(
        list.length ? '' : `No place matches “${q}”. Small businesses are often missing from map data: try its street address, city or ZIP, or click the map.`,
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressQuery]);
  async function handleGeocodeSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = addressQuery.trim();
    if (!q) return;
    if (places.length) return choosePlace(places[Math.max(0, placeIdx)]);
    setIsGeocoding(true);
    const list = await findPlaces(q);
    setIsGeocoding(false);
    if (list.length) return choosePlace(list[0]);
    setSearchNote(`No place matches “${q}”. Small businesses are often missing from map data: try its street address, city or ZIP, or click the map.`);
  }
  async function handleLaunchScan(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!runKeywords.length || !targetBusiness.trim()) {
      setErrorMsg('Enter the business name and at least one keyword.');
      return;
    }
    if (network !== 'mobile' && ((ispMode === 'single' && ispSelected.length !== 1) || (ispMode === 'mix' && ispSelected.length < 2))) {
      setErrorMsg(ispMode === 'single' ? 'Choose an ISP, or switch to Any ISP.' : 'Choose at least 2 ISPs for a mix.');
      return;
    }
    if (creditBalance < creditSummary.totalCost * runKeywords.length) {
      setIsTopUpOpen(true);
      return;
    }
    setIsSubmitting(true);
    try {
      const baseKey = (submissionKey.current ??= crypto.randomUUID());
      const started: string[] = [];
      for (const [i, kw] of runKeywords.entries()) {
      const res = await fetch('/api/scans/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // One key per keyword, so a retry never starts the same scan twice.
          'Idempotency-Key': runKeywords.length > 1 ? baseKey + ':' + i : baseKey,
        },
        body: JSON.stringify({
          keyword: kw,
          targetBusiness: targetBusiness.trim(),
          centerLat,
          centerLng,
          // Mobile data uses any carrier, so it has no ISP choice.
          ispMode: network === 'mobile' ? 'any' : ispMode,
          isps: network === 'mobile' || ispMode === 'any' ? [] : ispSelected,
          network,
          gridSize,
          spacingKm,
          targetType,
          trackAiOverviews,
          scheduleType,
          skip: shape === 'wealth' ? [] : allSkipped,
          // Top income: the points are the areas' own middles, not grid points.
          ...(shape === 'wealth' ? { points: previewPoints.filter((p) => !p.isCenter && !p.skipped).map((p) => ({ lat: p.lat, lng: p.lng })) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status < 500) submissionKey.current = null;
        throw new Error((started.length ? started.length + ' scan(s) started; then: ' : '') + (data.error ?? 'Failed to launch scan'));
      }
      started.push(data.scanId);
      }
      const cost = creditSummary.totalCost * runKeywords.length;
      setCreditBalance((b) => b - cost);
      setLaunched({
        ids: started,
        points: creditSummary.totalPins * runKeywords.length,
        repeat: scheduleType !== 'once',
        summary: `${creditSummary.totalPins} points × ${runKeywords.length} keyword${runKeywords.length > 1 ? 's' : ''} · ${cost} credits used`,
      });
    } catch (err: any) {
      setErrorMsg(err.message);
      setIsSubmitting(false);
    }
  }
  const askMapsSoon = targetType === 'mobile_maps';
  const runKeywords = picked.length ? picked : [keyword.trim()].filter(Boolean);
  const shownKeywords = [...new Set([...keywordList, ...picked])];
  const points = creditSummary.totalPins;
  const totalCost = creditSummary.totalCost * Math.max(1, runKeywords.length);
  const creditsLeft = creditBalance - totalCost;
  const spacingMi = Number((spacingKm / 1.60934).toFixed(1));
  const spanMi = Number(((gridSize - 1) * spacingMi).toFixed(1));
  const shapeRows = shape === 'custom' ? rows : gridSize, shapeCols = shape === 'custom' ? cols : gridSize;
  const spanW = Number(((shapeCols - 1) * spacingMi).toFixed(1)), spanH = Number(((shapeRows - 1) * spacingMi).toFixed(1));
  // Points on water that are still in the scan, and how many points sit in $100k+ areas.
  const live = previewPoints.filter((p) => !p.out && !p.skipped);
  const onWater = live.filter((p) => !p.isCenter && pointInfo[p.key]?.water).map((p) => p.key);
  const known = live.filter((p) => pointInfo[p.key]?.inc != null);
  const richStat = known.length >= live.length / 2 && known.length > 0 ? { rich: known.filter((p) => (pointInfo[p.key]?.inc ?? 0) >= 100000).length, known: known.length } : null;
  const oddStep = (v: number, d: number) => Math.max(1, Math.min(gridSize, v + d * 2));
  const phoneCount = phones.length;
  // About four minutes a point plus the two-minute rest, one point at a time per phone.
  const minutes = phoneCount ? Math.ceil((points * Math.max(1, runKeywords.length)) / phoneCount) * 6 : 0;
  const eta = !minutes ? '' : minutes < 90 ? `about ${minutes} min` : `about ${(minutes / 60).toFixed(1)} hours`;
  const phoneNames = phones
    .filter((p) => p.model)
    .map((p) => (!p.brand || p.model.toLowerCase().startsWith(p.brand.toLowerCase()) ? p.model : p.brand.charAt(0).toUpperCase() + p.brand.slice(1) + ' ' + p.model));
  const enabledSurfaces = (process.env.NEXT_PUBLIC_ENABLED_SURFACES ?? 'mobile_chrome').split(',').map((x) => x.trim());
  const surfaces = [
    { id: 'mobile_maps', title: 'Maps app', sub: 'Local pack & Ask Maps', note: 'The Maps app list, as a customer sees it.', Icon: MapPin },
    { id: 'mobile_chrome', title: 'Chrome', sub: 'Web + AI Overviews', note: 'The local pack on a Google search, plus the AI Overview and the sites it cites.', Icon: Globe },
    { id: 'mobile_google', title: 'Google app', sub: 'Search in the app', note: 'The Google app search.', Icon: Smartphone },
    ...(process.env.NEXT_PUBLIC_DESKTOP_ENABLED === 'true' ? [{ id: 'desktop_aimode', title: 'Desktop AI', sub: 'AI Mode', note: 'Desktop search in AI Mode.', Icon: Monitor }] : []),
  ].map((x) => ({ ...x, live: enabledSurfaces.includes(x.id) || x.id === 'desktop_aimode' }));
  const pill = (on: boolean) =>
    'min-h-[44px] rounded-lg border px-2 text-[13px] font-semibold transition ' +
    (on ? 'border-emerald-400 bg-emerald-400/15 text-emerald-200' : 'border-slate-700 text-slate-300 hover:border-slate-500');
  const label = 'text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400';
  const field = 'min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white placeholder-slate-500';
  const blockedWhy = !targetBusiness.trim() ? 'Add the business name' : !runKeywords.length ? 'Choose a keyword' : '';
  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col bg-slate-950 text-slate-100 lg:h-[calc(100vh-4rem)] lg:flex-row lg:overflow-hidden">
      {/* LEFT RAIL: the settings scroll if they must; the order bar never leaves the screen. */}
      <form onSubmit={handleLaunchScan} className="flex w-full flex-col border-r border-slate-800 bg-slate-900/95 lg:w-[410px] lg:shrink-0">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 [scrollbar-color:#2a3854_transparent] [scrollbar-width:thin]">
          {errorMsg && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}
          {/* Business and keywords: one card */}
          <section className="space-y-2">
            <label htmlFor="ns-business" className={label}>Business &amp; keywords</label>
            <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950 p-3">
              <select
                id="ns-business"
                value={businessId}
                onChange={(e) => {
                  const b = saved.find((x) => x.id === e.target.value);
                  if (b) applyBusiness(b);
                  else { setBusinessId(''); setTargetBusiness(''); setKeywordList([]); setPicked([]); }
                }}
                className={field + ' font-semibold'}
              >
                <option value="">New business…</option>
                {saved.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}{b.centerLabel ? ' · ' + b.centerLabel : ''}</option>
                ))}
              </select>
              <input
                type="text"
                aria-label="Business name exactly as it appears on Google"
                placeholder="Business name exactly as on Google"
                value={targetBusiness}
                onChange={(e) => setTargetBusiness(e.target.value)}
                className={field}
              />
              {shownKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {shownKeywords.map((k) => (
                    <button key={k} type="button" onClick={() => togglePick(k)} aria-pressed={picked.includes(k)}
                      className={`min-h-[36px] rounded-full border px-3 text-[13px] ${picked.includes(k) ? 'border-emerald-400 bg-emerald-400/15 text-emerald-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>
                      {k}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label="Add a keyword"
                  placeholder="Type a keyword and press Enter"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                  className={field + ' min-w-0 flex-1'}
                />
                <button type="button" onClick={addKeyword} className="min-h-[44px] rounded-lg border border-slate-700 px-3.5 text-[13px] font-semibold text-slate-200 hover:border-emerald-400">Add</button>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span>{runKeywords.length === 0 ? 'Tick or type at least one keyword.' : runKeywords.length === 1 ? '1 keyword: one scan.' : `${runKeywords.length} keywords: one scan each.`}</span>
                <button type="button" onClick={saveBusiness} disabled={!targetBusiness.trim()} className="font-semibold text-emerald-300 underline disabled:opacity-50">
                  {businessId ? 'Update saved business' : 'Save business'}
                </button>
                {businessId && <button type="button" onClick={deleteBusiness} className="underline hover:text-red-300">Delete</button>}
                {saveMsg && <span role="status" className="text-emerald-300">{saveMsg}</span>}
              </div>
            </div>
          </section>
          {/* App surface: one row */}
          <section className="space-y-2">
            <span className={label}>App surface</span>
            <div className={`grid gap-2 ${surfaces.length > 3 ? 'grid-cols-4' : 'grid-cols-3'}`}>
              {surfaces.map(({ id, title, sub, live, Icon }) => (
                <button key={id} type="button" disabled={!live} aria-pressed={targetType === id} onClick={() => live && setTargetType(id as TargetType)}
                  className={`relative flex min-h-[78px] flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition disabled:cursor-not-allowed ${targetType === id ? 'border-emerald-400 bg-emerald-400/15' : 'border-slate-700 hover:border-slate-500'}`}>
                  <Icon className={`h-4 w-4 ${live ? 'text-slate-200' : 'text-slate-500'}`} aria-hidden />
                  <span className={`text-sm font-bold ${live ? 'text-white' : 'text-slate-400'}`}>{title}</span>
                  <span className="text-[11px] leading-tight text-slate-400">{sub}</span>
                  {targetType === id && <span aria-hidden className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-emerald-400" />}
                  {!live && <span className="absolute right-2 top-2 rounded bg-indigo-500/25 px-1.5 py-0.5 text-[10px] font-bold text-indigo-200">Soon</span>}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">{surfaces.find((x) => x.id === targetType)?.note}</p>
            <p className="flex items-center gap-1.5 text-xs text-purple-300">
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {askMapsSoon ? 'A phone video for every point is included.' : 'AI Overviews, cited sites and phone videos included, no extra credits.'}
            </p>
          </section>
          {/* Grid and network */}
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className={label}>Grid &amp; network</span>
              <span className="text-xs font-semibold text-emerald-300">{spanW} × {spanH} mi area · {points} points</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {OFFERED_GRID_SIZES.map((n) => (
                <button key={n} type="button" aria-pressed={gridSize === n} onClick={() => setGridSize(n)}
                  className={`flex flex-col items-center gap-1 rounded-lg border py-2 ${gridSize === n ? 'border-emerald-400 bg-emerald-400/15' : 'border-slate-700 hover:border-slate-500'}`}>
                  <span aria-hidden className="h-7 w-7" style={{ backgroundImage: `radial-gradient(circle, ${gridSize === n ? '#34d399' : '#7c8ba5'} ${n > 6 ? 1 : 1.5}px, transparent ${n > 6 ? 1.4 : 2}px)`, backgroundSize: `${28 / n}px ${28 / n}px` }} />
                  <span className="text-sm font-bold text-white">{n}×{n}</span>
                  <span className="text-[11px] text-slate-400">{n * n * creditSummary.costPerPin} credits</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-slate-300">Points apart</span>
              <div className="grid flex-1 grid-cols-4 gap-1.5">
                {SPACING_OPTIONS.map((sp) => (
                  <button key={sp.km} type="button" aria-pressed={spacingKm === sp.km} onClick={() => setSpacingKm(sp.km)} className={pill(spacingKm === sp.km)}>
                    {sp.short}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-slate-300">Shape</span>
              <div className="grid flex-1 grid-cols-3 gap-1.5" role="radiogroup" aria-label="Grid shape">
                {([['square', 'Square'], ['custom', 'Rectangle'], ['round', 'Round'], ['wealth', 'Top income areas']] as const).map(([id, text]) => (
                  <button key={id} type="button" role="radio" aria-checked={shape === id} onClick={() => setShape(id)} className={pill(shape === id)}>
                    {text}
                  </button>
                ))}
              </div>
            </div>
            {shape === 'wealth' && (
              <p className="text-xs text-slate-300">
                {areas.length
                  ? `One point in the middle of each of the ${areas.length} highest-income census areas inside this ${spanMi + spacingMi} mi box, plus the business. Not a grid.${areas.length < 24 ? ' Make the box bigger (size or spacing) to reach 25.' : ''}`
                  : 'Reading incomes from the map… If nothing appears, make the box bigger with the size or spacing buttons.'}
              </p>
            )}
            {shape === 'custom' && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-300">
                {([['Rows', rows, setRows], ['Columns', cols, setCols]] as const).map(([name, val, set]) => (
                  <span key={name} className="flex items-center gap-1.5">
                    {name}
                    <button type="button" aria-label={`Fewer ${name.toLowerCase()}`} disabled={val <= 1} onClick={() => set(oddStep(val, -1))} className="h-10 w-9 rounded-lg border border-slate-700 text-base text-white disabled:opacity-40">−</button>
                    <span className="w-4 text-center text-sm font-bold text-white">{val}</span>
                    <button type="button" aria-label={`More ${name.toLowerCase()}`} disabled={val >= gridSize} onClick={() => set(oddStep(val, 1))} className="h-10 w-9 rounded-lg border border-slate-700 text-base text-white disabled:opacity-40">+</button>
                  </span>
                ))}
                <span className="text-slate-400">inside the {gridSize}×{gridSize}</span>
              </div>
            )}
            {spanMi > 20 && <p className="text-xs text-amber-300">That is a very wide area for a local search. Most scans stay under 20 miles across.</p>}
            {skipped.length > 0 && (
              <p className="text-xs text-amber-200">
                {skipped.length} point{skipped.length === 1 ? '' : 's'} skipped on the map, not charged.{' '}
                <button type="button" onClick={() => setSkipped([])} className="font-semibold underline">Restore</button>
              </p>
            )}
            {mobileData && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Network">
                  <button type="button" role="radio" aria-checked={network === 'residential'} onClick={() => setNetwork('residential')} className={pill(network === 'residential')}>
                    Home internet · 1 credit/point
                  </button>
                  <button type="button" role="radio" aria-checked={network === 'mobile'} disabled={!mobileData.ready} onClick={() => setNetwork('mobile')} className={pill(network === 'mobile') + ' disabled:opacity-40'}>
                    Mobile data · {mobileData.creditsPerPoint} credits/point
                  </button>
                </div>
                {!mobileData.ready && <p className="text-xs text-amber-300">Mobile data is not set up yet: add the VoidMob login to the worker.</p>}
              </div>
            )}
            {network === 'mobile' ? (
              <p className="rounded-xl border border-slate-700 bg-slate-950/40 p-3.5 text-xs leading-relaxed text-slate-300">
                Every point searches over a mobile carrier’s network (Verizon, AT&amp;T, T-Mobile or a regional carrier) in its own state, the way a phone on 5G would.
              </p>
            ) : (
              <IspSelectorDropdown
                stateCode={detectedState}
                city={detectedCity}
                zip={detectedZip}
                mode={ispMode}
                selected={ispSelected}
                options={ispOptions}
                loading={ispLoading}
                source={proxySource}
                onChange={(mode, selected) => {
                  setIspMode(mode);
                  setIspSelected(selected);
                }}
              />
            )}
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer py-1">Centre coordinates ({detectedCity}, {detectedState})</summary>
              <span className="mt-1 flex gap-2">
                <input aria-label="Center latitude" type="number" step="any" min="-85" max="85" className={field} value={centerLat} onChange={(e) => setCenterLat(Number(e.target.value))} />
                <input aria-label="Center longitude" type="number" step="any" min="-180" max="180" className={field} value={centerLng} onChange={(e) => setCenterLng(Number(e.target.value))} />
              </span>
            </details>
          </section>
        </div>
        {/* ORDER BAR: always on screen, and kept short so the settings above stay usable */}
        <div className="shrink-0 space-y-2 border-t border-slate-700 bg-slate-950/90 px-4 pb-3 pt-2.5 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="leading-tight">
                <span className="text-xl font-extrabold text-white">{totalCost}</span> <span className="text-[13px] text-slate-300">credits</span>
                {creditsLeft >= 0 ? (
                  <span className="text-xs text-slate-400"> · {creditsLeft.toLocaleString()} left</span>
                ) : (
                  <button type="button" onClick={() => setIsTopUpOpen(true)} className="ml-1 text-xs font-semibold text-rose-300 underline">{(-creditsLeft).toLocaleString()} short: top up</button>
                )}
              </p>
              <p className="truncate text-xs text-slate-400">
                {points} points × {Math.max(1, runKeywords.length)} keyword{runKeywords.length > 1 ? 's' : ''}
                {eta ? ` · ${eta}` : ''}
              </p>
            </div>
            <select
              aria-label="Repeat this scan"
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as 'once' | 'daily' | 'weekly')}
              className="min-h-[40px] shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs font-semibold text-slate-200"
            >
              <option value="once">Run once</option>
              <option value="weekly">Every Monday</option>
              <option value="daily">Every day, 8 am ET</option>
            </select>
          </div>
          <button type="submit" disabled={isSubmitting || Boolean(blockedWhy)}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-[15px] font-extrabold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-300">
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Starting…</>
            ) : blockedWhy ? (
              blockedWhy
            ) : creditsLeft < 0 ? (
              'Top up to run'
            ) : (
              <>{runKeywords.length > 1 ? `Launch ${runKeywords.length} real-phone scans` : 'Launch real-phone scan'}<ArrowRight className="h-4 w-4" aria-hidden /></>
            )}
          </button>
        </div>
      </form>
      {/* RIGHT PANEL: the map */}
      <div className="relative min-h-[28rem] flex-1 bg-slate-950">
        <div className="pointer-events-none absolute left-5 right-5 top-5 z-20 flex flex-wrap items-start gap-2">
          <div className="pointer-events-auto w-full max-w-sm">
          <form
            onSubmit={handleGeocodeSearch}
            className="flex items-center overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl"
          >
            <MapPin className="ml-3.5 h-4 w-4 shrink-0 text-emerald-400" />
            <input
              type="text"
              role="combobox"
              aria-expanded={places.length > 0}
              aria-controls="place-suggestions"
              aria-label="Search a saved business, address, city or ZIP"
              placeholder="Search a saved business, address, city or ZIP…"
              value={addressQuery}
              onChange={(e) => {
                typedRef.current = true;
                setAddressQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && places.length) { e.preventDefault(); setPlaceIdx((i) => (i + 1) % places.length); }
                if (e.key === 'ArrowUp' && places.length) { e.preventDefault(); setPlaceIdx((i) => (i - 1 + places.length) % places.length); }
                if (e.key === 'Escape') setPlaces([]);
              }}
              className="w-full bg-transparent px-3 py-3 text-sm text-white placeholder-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isGeocoding}
              aria-label="Search"
              className="border-l border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-emerald-400"
            >
              {isGeocoding ? '...' : <Search className="h-4 w-4" />}
            </button>
          </form>
          {places.length > 0 && (
            <ul id="place-suggestions" role="listbox" className="mt-2 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur">
              {places.map((p, i) => (
                <li key={p.label + p.sub + i} role="option" aria-selected={i === placeIdx}>
                  <button
                    type="button"
                    onMouseEnter={() => setPlaceIdx(i)}
                    onClick={() => choosePlace(p)}
                    className={`flex w-full flex-col items-start px-3.5 py-2.5 text-left ${i === placeIdx ? 'bg-slate-800' : ''}`}
                  >
                    <span className="text-sm font-semibold text-white">{p.label}</span>
                    {p.sub && <span className={`text-xs ${p.businessId ? 'text-emerald-300' : 'text-slate-400'}`}>{p.sub}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {searchNote && !places.length && (
            <p role="status" className="mt-2 rounded-xl border border-slate-700 bg-slate-900/95 px-3.5 py-2.5 text-xs leading-relaxed text-slate-300 shadow-2xl">
              {searchNote}
            </p>
          )}
          </div>
          {CENSUS_VINTAGE && (
            <button type="button" aria-pressed={showWealth} onClick={() => setShowWealth((v) => !v)}
              className={`pointer-events-auto min-h-[46px] rounded-xl border px-3.5 text-[13px] font-semibold shadow-2xl ${showWealth ? 'border-sky-300 bg-sky-950 text-sky-200' : 'border-slate-700 bg-slate-900/95 text-slate-100'}`}>
              Show buying power
            </button>
          )}
          {CENSUS_VINTAGE && showWealth && (
            <span className="pointer-events-auto flex min-h-[46px] flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-1.5 text-xs text-slate-300 shadow-2xl">
              <span className="font-semibold text-slate-200">Median income</span>
              {legend('income').map((b) => (
                <span key={b.label} className="flex items-center gap-1 whitespace-nowrap">
                  <span aria-hidden className="h-3 w-3 rounded-sm border border-sky-300/30" style={{ backgroundColor: b.color }} />
                  {b.label}
                </span>
              ))}
            </span>
          )}
          {onWater.length > 0 && (
            <button type="button" onClick={() => setSkipped((list) => [...new Set([...list, ...onWater])])}
              className="pointer-events-auto min-h-[46px] rounded-xl border border-amber-500/60 bg-amber-950/80 px-3.5 text-[13px] font-semibold text-amber-100 shadow-2xl">
              Skip {onWater.length} point{onWater.length === 1 ? '' : 's'} on water · save {onWater.length * Math.max(1, runKeywords.length)} credit{onWater.length * Math.max(1, runKeywords.length) === 1 ? '' : 's'}
            </button>
          )}
        </div>
        {/* MapLibre's stylesheet makes every map container position: relative, which would cancel
            "absolute inset-0" and collapse the map to zero height: the wrapper fills the panel instead. */}
        <div className="absolute inset-0">
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
        {mapState !== 'ready' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <p className="rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-3 text-sm text-slate-300">
              {mapState === 'error'
                ? 'The map couldn’t load. You can still search a place above or open “Centre coordinates” on the left.'
                : 'Loading map…'}
            </p>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-5 left-5 z-20 max-w-sm rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-3 shadow-2xl backdrop-blur">
          <p className="text-sm font-bold text-white">
            {shape === 'round' ? `Round grid, ${points} points` : shape === 'wealth' ? `Top income areas, ${points} points` : `${shapeRows}×${shapeCols} grid`}{shape === 'wealth' ? '' : ` · points ${spacingMi} mi apart`}
          </p>
          <p className="mt-0.5 text-xs text-slate-300">
            Centre {centerLat.toFixed(5)}, {centerLng.toFixed(5)}
            {detectedCity ? ' · ' + detectedCity + ', ' + detectedState + ' ' + detectedZip : ''}
          </p>
          {showWealth && richStat && (
            <p className="mt-1.5 text-[13px] font-semibold text-sky-300">{richStat.rich} of {richStat.known} points sit in $100k+ income areas</p>
          )}
          <p className="mt-1 text-xs text-slate-400">Click a point to skip it (water, empty land). Drag the storefront, or click the map, to move the grid.</p>
        </div>
      </div>
      {launched && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div role="dialog" aria-modal="true" aria-label="Scan queued" className="w-full max-w-lg space-y-3.5 rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <div>
              <h2 className="text-xl font-extrabold text-white">{launched.ids.length > 1 ? `${launched.ids.length} scans queued` : 'Scan queued'}</h2>
              <p className="mt-1 text-sm text-slate-300">{launched.summary}</p>
            </div>
            {phoneNames.length > 0 && (
              <ul className="space-y-1.5">
                {phoneNames.slice(0, Math.min(phoneNames.length, launched.points)).map((name, i) => (
                  <li key={name + i} className="flex min-h-[40px] items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950 px-3 text-[13px]">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-sky-300" />
                    <span className="flex-1 font-semibold text-white">{name}</span>
                    <span className="text-xs text-slate-400">real Android phone</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[13px] text-slate-300">
              {launched.repeat ? 'This scan repeats on its schedule. ' : ''}First results in a few minutes{eta ? `; everything done in ${eta}` : ''}. Each point records its search, ads, AI Overview and a phone video.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => router.push(launched.ids.length > 1 ? '/scans' : `/scans/${launched.ids[0]}`)}
                className="min-h-[48px] flex-1 rounded-xl bg-emerald-400 px-4 text-[15px] font-extrabold text-slate-950">Watch it run</button>
              <button type="button" onClick={() => { setLaunched(null); setIsSubmitting(false); submissionKey.current = null; setSkipped([]); }}
                className="min-h-[48px] flex-1 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-100">Set up another scan</button>
            </div>
          </div>
        </div>
      )}
      <CreditTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        userId={userId}
        currentBalance={creditBalance}
        onBalanceUpdated={(newBal) => setCreditBalance(newBal)}
      />
    </div>
  );
}
