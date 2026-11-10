// apps/nextjs/src/components/NewScanWizard.tsx
'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { declutterBasemap } from '../lib/censusLayer';
import {
  Smartphone,
  Monitor,
  Sparkles,
  Calendar,
  Coins,
  AlertCircle,
  ArrowRight,
  Loader2,
  MapPin,
  Search,
  Cpu,
} from 'lucide-react';
import { IspSelectorDropdown, type IspMode, type IspOption } from '@/components/IspSelectorDropdown';
import { CreditTopUpModal } from '@/components/CreditTopUpModal';
type TargetType =
  'mobile_maps' | 'mobile_chrome' | 'mobile_google' | 'desktop_aimode';
const GRID_SIZES = [
  { size: 3, label: '3×3 (9 Pins)' },
  { size: 5, label: '5×5 (25 Pins)' },
  { size: 7, label: '7×7 (49 Pins)' },
  { size: 9, label: '9×9 (81 Pins)' },
  { size: 11, label: '11×11 (121 Pins)' },
];
const SPACING_OPTIONS = [
  { label: '0.5 Miles', km: 0.80467 },
  { label: '1.0 Mile', km: 1.60934 },
  { label: '2.0 Miles', km: 3.21868 },
  { label: '5.0 Miles', km: 8.04672 },
];
export function NewScanWizard() {
  const router = useRouter();
  // All 8 User Inputs
  const [targetType, setTargetType] = useState<TargetType>('mobile_chrome');
  const [keyword, setKeyword] = useState('emergency plumber');
  const [targetBusiness, setTargetBusiness] = useState('');
  const [centerLat, setCenterLat] = useState<number>(28.039465);
  const [centerLng, setCenterLng] = useState<number>(-81.949804);
  const [gridSize, setGridSize] = useState<number>(7);
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
  const [ispSelected, setIspSelected] = useState<string[]>([]);
  const [ispOptions, setIspOptions] = useState<IspOption[]>([]);
  const [ispLoading, setIspLoading] = useState(false);
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
  function applyBusiness(b: SavedBusiness) {
    setBusinessId(b.id);
    setTargetBusiness(b.name);
    setCenterLat(b.centerLat);
    setCenterLng(b.centerLng);
    setAddressQuery(b.centerLabel);
    setTargetType(b.targetType);
    setGridSize(b.gridSize);
    setSpacingKm(b.spacingKm);
    setIspMode(b.ispMode);
    setIspSelected(b.isps ?? []);
    setTrackAiOverviews(b.trackAiOverviews);
    setScheduleType(b.scheduleType);
    setKeywordList(b.keywords);
    setPicked(b.keywords.slice(0, 1));
    setKeyword(b.keywords[0] ?? '');
    setSaveMsg('');
  }
  function togglePick(k: string) {
    const next = picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k];
    setPicked(next);
    if (next[0]) setKeyword(next[0]);
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
        setKeyword(sc.keyword);
        setCenterLat(sc.centerLat);
        setCenterLng(sc.centerLng);
        if (sc.targetType) setTargetType(sc.targetType);
        if (sc.gridSize) setGridSize(sc.gridSize);
        if (sc.spacingKm) setSpacingKm(sc.spacingKm);
        setTrackAiOverviews(Boolean(sc.trackAiOverviews));
        const match = list.find((x) => x.name === sc.targetBusiness);
        if (match) { setBusinessId(match.id); setKeywordList(match.keywords); setPicked(match.keywords.includes(sc.keyword) ? [sc.keyword] : []); }
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
        }
      } catch {}
    }
    loadUser();
  }, []);
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
    const pts = [];
    for (let r = -half; r <= half; r++) {
      for (let c = -half; c <= half; c++) {
        pts.push({
          lat: Number((centerLat - r * latDelta).toFixed(6)),
          lng: Number((centerLng + c * lngDelta).toFixed(6)),
          isCenter: r === 0 && c === 0,
        });
      }
    }
    return pts;
  }, [centerLat, centerLng, gridSize, spacingKm]);
  // 4. Credit Cost Calculation (Base + AI Overview Add-on)
  const creditSummary = useMemo(() => {
    const totalPins = gridSize * gridSize;
    const isDesktop = targetType.startsWith('desktop_');
    const baseCost = isDesktop ? 2 : 1;
    const aiAddon = !isDesktop && targetType !== 'mobile_maps' && trackAiOverviews ? 1 : 0;
    const costPerPin = baseCost + aiAddon;
    const totalCost = totalPins * costPerPin;
    const spanMiles = ((gridSize - 1) * spacingKm * 0.621371).toFixed(1);
    return {
      totalPins,
      costPerPin,
      totalCost,
      spanMiles,
      hasEnoughCredits: creditBalance >= totalCost,
    };
  }, [gridSize, spacingKm, targetType, trackAiOverviews, creditBalance]);
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
    map.on('load', () => declutterBasemap(map));
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
  // 6. Render Preview Pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    previewMarkersRef.current.forEach((m) => m.remove());
    previewMarkersRef.current = [];
    const bounds = new maplibregl.LngLatBounds();
    previewPoints.forEach((pt) => {
      bounds.extend([pt.lng, pt.lat]);
      const el = document.createElement('div');
      if (pt.isCenter) {
        el.className =
          'flex h-7 w-7 cursor-grab items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-xs';
        el.innerText = '★';
      } else {
        el.className =
          'flex h-4 w-4 items-center justify-center rounded-full border border-emerald-400/70 bg-emerald-500/25';
      }
      const marker = new maplibregl.Marker({
        element: el,
        draggable: pt.isCenter,
        anchor: 'center',
      })
        .setLngLat([pt.lng, pt.lat])
        .addTo(map);
      if (pt.isCenter) {
        marker.on('dragend', () => {
          const lngLat = marker.getLngLat();
          setCenterLat(Number(lngLat.lat.toFixed(6)));
          setCenterLng(Number(lngLat.lng.toFixed(6)));
        });
      }
      previewMarkersRef.current.push(marker);
    });
    if (previewPoints.length > 1) {
      map.fitBounds(bounds, { padding: 65, maxZoom: 14, duration: 400 });
    }
  }, [previewPoints]);
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
    if (!keyword.trim() || !targetBusiness.trim()) {
      setErrorMsg('Enter both a target business name and search query.');
      return;
    }
    if ((ispMode === 'single' && ispSelected.length !== 1) || (ispMode === 'mix' && ispSelected.length < 2)) {
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
          ispMode,
          isps: ispMode === 'any' ? [] : ispSelected,
          gridSize,
          spacingKm,
          targetType,
          trackAiOverviews,
          scheduleType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status < 500) submissionKey.current = null;
        throw new Error((started.length ? started.length + ' scan(s) started; then: ' : '') + (data.error ?? 'Failed to launch scan'));
      }
      started.push(data.scanId);
      }
      router.push(started.length > 1 ? '/scans' : `/scans/${started[0]}`);
    } catch (err: any) {
      setErrorMsg(err.message);
      setIsSubmitting(false);
    }
  }
  const runKeywords = picked.length ? picked : [keyword.trim()].filter(Boolean);
  const isDesktop = targetType === 'desktop_aimode';
  const askMapsSoon = targetType === 'mobile_maps';
  const aiAddonLabel = askMapsSoon
    ? 'Track "Ask Maps" AI answers (coming soon)'
    : 'Track Google AI Overviews & Citations (+1 Cr/Pin)';
  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col lg:h-[calc(100vh-4rem)] lg:overflow-hidden bg-slate-950 text-slate-100 lg:flex-row">
      {/* LEFT PANEL: ALL 8 CONFIGURATION INPUTS */}
      <div className="flex w-full flex-col justify-between overflow-y-auto lg:w-[430px] lg:shrink-0 border-r border-slate-800 bg-slate-900/95">
        <form onSubmit={handleLaunchScan} className="space-y-5 p-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h1 className="text-lg font-extrabold text-white">
                New scan
              </h1>
              <p className="text-xs text-slate-400">
                Real phones · local residential IPs · AI Overviews
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsTopUpOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-3 py-1.5"
            >
              <Coins className="h-4 w-4 text-emerald-400" />
              <div>
                <div className="text-[10px] uppercase text-emerald-400">
                  {creditBalance.toLocaleString()} Credits
                </div>
                <div className="text-xs font-bold text-white underline">
                  + Top Up
                </div>
              </div>
            </button>
          </div>
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
          {/* Saved business: fills every field */}
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
            <label className="block text-sm font-semibold text-slate-200">
              Saved business
              <select
                value={businessId}
                onChange={(e) => {
                  const b = saved.find((x) => x.id === e.target.value);
                  if (b) applyBusiness(b);
                  else { setBusinessId(''); setKeywordList([]); setPicked([]); }
                }}
                className="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm normal-case tracking-normal text-white"
              >
                <option value="">{saved.length ? '— New business —' : 'No saved businesses yet'}</option>
                {saved.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}{b.centerLabel ? ' · ' + b.centerLabel : ''} ({b.keywords.length} keyword{b.keywords.length === 1 ? '' : 's'})</option>
                ))}
              </select>
            </label>
            {keywordList.length > 0 && (
              <div>
                <p className="text-[11px] text-slate-400">Keywords to run ({picked.length} selected · one scan each)</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {keywordList.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => togglePick(k)}
                      aria-pressed={picked.includes(k)}
                      className={`rounded-full border px-2.5 py-1 text-xs ${picked.includes(k) ? 'border-emerald-400 bg-emerald-400/15 text-emerald-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* 1. Target App */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-200">
              1. Target Mobile App Surface
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  id: 'mobile_maps',
                  title: 'Google Maps App',
                  sub: 'Local Pack & Ask Maps',
                },
                {
                  id: 'mobile_chrome',
                  title: 'Google Chrome',
                  sub: 'Mobile Web + AI Overviews',
                },
                {
                  id: 'mobile_google',
                  title: 'Google App',
                  sub: 'Search Widget + AI Overviews',
                },
                {
                  id: 'desktop_aimode',
                  title: 'Desktop + AI Mode',
                  sub: 'CloakBrowser (&udm=50)',
                },
              ]
                .filter(
                  (item) =>
                    item.id !== 'desktop_aimode' ||
                    process.env.NEXT_PUBLIC_DESKTOP_ENABLED === 'true',
                )
                .map((item) => {
                  // Surfaces without a working search template are shown but cannot be picked.
                  const live = (process.env.NEXT_PUBLIC_ENABLED_SURFACES ?? 'mobile_chrome').split(',').map((x) => x.trim()).includes(item.id) || item.id === 'desktop_aimode';
                  return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!live}
                    title={live ? undefined : 'Coming soon'}
                    onClick={() => live && setTargetType(item.id as TargetType)}
                    className={`rounded-lg border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      targetType === item.id
                        ? 'border-emerald-500 bg-emerald-500/15 text-white'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold text-slate-100">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-400">{live ? item.sub : 'Coming soon'}</div>
                  </button>
                  );
                })}
            </div>
          </div>
          {/* 2. Search Query & Business Name */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-slate-200">
                2A. Exact Business Name (GBP)
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Polk Rapid Plumbing"
                value={targetBusiness}
                onChange={(e) => setTargetBusiness(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-200">
                2B. Search Query
              </label>
              <input
                type="text"
                required
                placeholder="e.g., plumber near me"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>
          </div>
          {/* 4. Size of Map Grid & Spacing */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-200">
                4. Grid Matrix Size
              </label>
              <select
                value={gridSize}
                onChange={(e) => setGridSize(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                {GRID_SIZES.map((g) => (
                  <option key={g.size} value={g.size}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-200">
                Pin Spacing
              </label>
              <select
                value={spacingKm}
                onChange={(e) => setSpacingKm(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                {SPACING_OPTIONS.map((s) => (
                  <option key={s.label} value={s.km}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {/* Residential ISP Selector */}
          <IspSelectorDropdown
            stateCode={detectedState}
            city={detectedCity}
            zip={detectedZip}
            mode={ispMode}
            selected={ispSelected}
            options={ispOptions}
            loading={ispLoading}
            onChange={(mode, selected) => {
              setIspMode(mode);
              setIspSelected(selected);
            }}
          />
          {/* 7. Add-On: Track AI Overviews / Ask Maps */}
          <div className="rounded-xl border border-purple-500/30 bg-purple-950/15 p-3.5">
            <label className="flex cursor-pointer items-center justify-between">
              <div className="space-y-0.5 pr-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-purple-200">
                  <Sparkles className="h-4 w-4 text-purple-400" />
                  5. {aiAddonLabel}
                </div>
                <div className="text-[11px] text-slate-400">
                  {askMapsSoon
                    ? 'Maps scans track the Maps results list. Ask Maps answers are coming soon, and are not charged.'
                    : 'Capture the AI panel, its text, and visible sources at each grid point.'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={askMapsSoon ? false : trackAiOverviews}
                disabled={askMapsSoon}
                onChange={(e) => setTrackAiOverviews(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-purple-500 disabled:opacity-40"
              />
            </label>
          </div>
          {/* 8. Automation Schedule */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-200">
              6. Search Execution Schedule
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'once', label: 'Run Once Now' },
                { id: 'daily', label: 'Daily (8 AM EST)' },
                { id: 'weekly', label: 'Weekly (Mondays)' },
              ].map((sch) => (
                <button
                  key={sch.id}
                  type="button"
                  onClick={() => setScheduleType(sch.id as any)}
                  className={`rounded-lg border py-2 px-2.5 text-xs font-bold transition ${
                    scheduleType === sch.id
                      ? 'border-emerald-500 bg-emerald-500/20 text-white'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {sch.label}
                </button>
              ))}
            </div>
          </div>
          {/* 3. Center Coordinates Display & Launch Button */}
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                3. Center Lat/Lng ({detectedCity}, {detectedState}):
              </span>
              <span className="flex gap-1">
                <input
                  aria-label="Center latitude"
                  type="number"
                  step="any"
                  min="-85"
                  max="85"
                  className="w-24 bg-slate-800 p-1"
                  value={centerLat}
                  onChange={(e) => setCenterLat(Number(e.target.value))}
                />
                <input
                  aria-label="Center longitude"
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  className="w-24 bg-slate-800 p-1"
                  value={centerLng}
                  onChange={(e) => setCenterLng(Number(e.target.value))}
                />
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-800 pt-2.5">
              <span className="text-sm font-bold text-white">
                Total Cost ({creditSummary.totalPins} pins ×{' '}
                {creditSummary.costPerPin} cr{runKeywords.length > 1 ? ' × ' + runKeywords.length + ' keywords' : ''}):
              </span>
              <span className="text-base font-extrabold text-emerald-400">
                {creditSummary.totalCost * runKeywords.length} Credits
              </span>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Provisioning {creditSummary.totalPins} Pins...
                </>
              ) : creditBalance >= creditSummary.totalCost * runKeywords.length ? (
                <>
                  Launch {runKeywords.length > 1 ? runKeywords.length + ' ' : ''}{gridSize}×{gridSize} Stakeout Scan{runKeywords.length > 1 ? 's' : ''} (
                  {creditSummary.totalCost * runKeywords.length} Cr)
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Top Up Credits to Launch ({creditSummary.totalCost * runKeywords.length} Cr Needed)
                </>
              )}
            </button>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={saveBusiness}
                disabled={!targetBusiness.trim()}
                className="min-h-[40px] rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-200 hover:border-emerald-400 disabled:opacity-50"
              >
                {businessId ? 'Update saved business' : 'Save as business'}
              </button>
              {businessId && (
                <button type="button" onClick={deleteBusiness} className="text-xs text-slate-400 underline hover:text-red-300">
                  Delete
                </button>
              )}
              {saveMsg && <span role="status" className="text-xs text-emerald-300">{saveMsg}</span>}
            </div>
          </div>
        </form>
      </div>
      {/* RIGHT PANEL: INTERACTIVE MAPLIBRE CANVAS */}
      <div className="relative min-h-80 flex-1 bg-slate-950">
        <div className="pointer-events-auto absolute left-5 right-5 top-5 z-20 max-w-md">
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
        {/* MapLibre's stylesheet makes every map container position: relative, which would cancel
            "absolute inset-0" and collapse the map to zero height: the wrapper fills the panel instead. */}
        <div className="absolute inset-0">
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
        {mapState !== 'ready' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <p className="rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-3 text-sm text-slate-300">
              {mapState === 'error'
                ? 'The map couldn’t load. You can still search a place above or type the centre coordinates.'
                : 'Loading map…'}
            </p>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-5 left-5 z-20 max-w-sm rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-3 shadow-2xl backdrop-blur">
          <p className="text-sm font-bold text-white">
            {gridSize}×{gridSize} grid · {(spacingKm / 1.60934).toFixed(spacingKm % 1.60934 === 0 ? 0 : 1)} mi spacing
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Centre {centerLat.toFixed(5)}, {centerLng.toFixed(5)}
            {detectedCity ? ' · ' + detectedCity + ', ' + detectedState + ' ' + detectedZip : ''}
          </p>
          <p className="mt-1 text-[11px] text-emerald-300">Click the map or drag ★ to move the grid.</p>
        </div>
      </div>
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
