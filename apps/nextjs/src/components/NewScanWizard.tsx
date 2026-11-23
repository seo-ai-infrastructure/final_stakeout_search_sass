// apps/nextjs/src/components/NewScanWizard.tsx
'use client';
import { OFFERED_GRID_SIZES, shapeSkips, type GridShape } from '@stakeout/core/gridSizes';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@/lib/mapWorker';
import { Protocol } from 'pmtiles';
import { declutterBasemap, quietBasemap, liftAboveShading, fillColor, legend, CENSUS_VINTAGE, SETUP_INCOME_PALETTE } from '../lib/censusLayer';
import {
  Smartphone,
  Monitor,
  AlertCircle,
  Loader2,
  MapPin,
  Search,
  Globe,
} from 'lucide-react';
import { type IspMode, type IspOption } from '@/components/IspSelectorDropdown';
import { NETWORK_LABELS, pinNetwork, placedLayout, type ScanNetwork } from '@stakeout/core/network';
import { CreditTopUpModal } from '@/components/CreditTopUpModal';
import { stateTimezone } from '@stakeout/core/fleetHealth';
import { SCHEDULE_LEAD_MS, zonedMoment } from '@stakeout/core/speed';
import { GOOGLE_ID_HELP, googleIdOf, googleShortLink } from '@stakeout/core/businessIds';
import { siteDomain } from '@stakeout/core/businessSite';
import { scanKeywords } from '@/lib/scanKeywords';
import styles from './NewScanWizard.module.css';
import { Crosshair, Layers, RotateCcw, Save, Clock3, Info, ChevronDown, Check, Minus, Plus, SlidersHorizontal } from 'lucide-react';
type TargetType =
  'mobile_maps' | 'mobile_chrome' | 'mobile_google' | 'desktop_aimode';
/** A size carried over from an older scan or a saved business that is no longer offered falls back to 5×5. */
const offeredSize = (n: number) => (OFFERED_GRID_SIZES.includes(n) ? n : 5);
const SPACING_OPTIONS = [
  { label: '0.5 Miles', short: '0.5 mi', km: 0.80467 },
  { label: '1.0 Mile', short: '1 mi', km: 1.60934 },
  { label: '2.0 Miles', short: '2 mi', km: 3.21868 },
  { label: '3.0 Miles', short: '3 mi', km: 4.82802 },
  { label: '5.0 Miles', short: '5 mi', km: 8.04672 },
];
export function NewScanWizard() {
  const router = useRouter();
  // All 8 User Inputs
  const [targetType, setTargetType] = useState<TargetType>('mobile_chrome');
  // The keyword being typed; chosen keywords live in `picked`.
  const [keyword, setKeyword] = useState('');
  const [targetBusiness, setTargetBusiness] = useState('');
  // Optional: the business's own website, so the report can tell when an AI answer cites it.
  const [website, setWebsite] = useState('');
  // Optional: Google's ID for the business (/g/…), from its Share link or the ID itself. Google's AI
  // answers link each business they name to its Google listing, so the report finds it by this.
  const [googleId, setGoogleId] = useState('');
  const [googleIdNote, setGoogleIdNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [googleIdBusy, setGoogleIdBusy] = useState(false);
  // Set when the website or ID was filled in from the account's earlier scans of the business.
  const [identityNote, setIdentityNote] = useState('');
  // The business the last such lookup was for (a late answer for another one is dropped).
  const rememberedFor = useRef('');
  const [centerLat, setCenterLat] = useState<number>(28.039465);
  const [centerLng, setCenterLng] = useState<number>(-81.949804);
  const [gridSize, setGridSize] = useState<number>(5);
  const [spacingKm, setSpacingKm] = useState<number>(1.60934);
  const [trackAiOverviews, setTrackAiOverviews] = useState<boolean>(true);
  const [scheduleType, setScheduleType] = useState<'once' | 'daily' | 'weekly'>(
    'once',
  );
  // Scan Now (first in line) or scheduled at a day and hour, once or repeating: one phone session a grid point either way.
  const [speed, setSpeed] = useState<'now' | 'scheduled'>('now');
  // Seat holders start on Scheduled; a first audit or a prospect audit starts on Scan Now.
  const speedPicked = useRef(false);
  const [repeat, setRepeat] = useState<'once' | 'weekly' | 'biweekly'>('weekly');
  const [runDate, setRunDate] = useState(() => { const d = new Date(Date.now() + 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [runTime, setRunTime] = useState('09:00');
  // A scheduled scan runs as soon as possible (right away when the phones are free, else at the end of the line) or at a day and hour picked 2+ hours ahead.
  const [when, setWhen] = useState<'asap' | 'pick'>('asap');
  // Market & ISP State
  const [detectedZip, setDetectedZip] = useState('33801');
  const [detectedCity, setDetectedCity] = useState('Lakeland');
  const [detectedState, setDetectedState] = useState('FL');
  const [ispMode, setIspMode] = useState<IspMode>('any');
  // Which network the searches go out on: residential, mobile, or a mix of both (no ISP choice).
  const [network, setNetwork] = useState<ScanNetwork>('residential');
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
    kgmid?: string | null; domain?: string | null;
  };
  const [saved, setSaved] = useState<SavedBusiness[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [keywordList, setKeywordList] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [saveMsg, setSaveMsg] = useState('');
  const [moreOptions, setMoreOptions] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [businessEditing, setBusinessEditing] = useState(true);
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
  const [launched, setLaunched] = useState<{ ids: string[]; summary: string; points: number; repeat: boolean; scheduled?: string; asap?: boolean } | null>(null);
  const incoming = useRef<string[]>([]);
  function addKeyword() {
    if (!keyword.trim()) return;
    setKeywordList((list) => scanKeywords(list, keyword));
    setPicked((list) => scanKeywords(list, keyword));
    setKeyword('');
  }
  function applyBusiness(b: SavedBusiness) {
    setBusinessEditing(false);
    setBusinessId(b.id);
    setTargetBusiness(b.name);
    setWebsite(b.domain ?? '');
    setGoogleId(b.kgmid ?? '');
    setGoogleIdNote(null);
    setIdentityNote('');
    // Saved before the business kept them: what its earlier scans used fills the gap.
    void fillRemembered(b.name, b.centerLat, b.centerLng, { site: Boolean(b.domain), id: Boolean(b.kgmid) });
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
    // A business saved as repeating is scheduled weekly by default.
    if (b.scheduleType !== 'once') { speedPicked.current = true; setSpeed('scheduled'); setWhen('pick'); setRepeat('weekly'); }
    // Keywords that arrived with the page (from a Google profile's search terms) stay picked whichever business is chosen.
    setKeywordList([...new Set([...b.keywords, ...incoming.current])]);
    setPicked(incoming.current.length ? incoming.current : b.keywords.slice(0, 1));
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
      let q = new URLSearchParams(window.location.search);
      // Back from paying for a scan offered elsewhere: what it was for is waiting here (kept an hour).
      try {
        const kept = window.sessionStorage.getItem('stakeout.scanPrefill');
        if (kept) {
          window.sessionStorage.removeItem('stakeout.scanPrefill');
          const k = JSON.parse(kept) as { q?: string; at?: number };
          if (!q.getAll('kw').length && !q.get('business') && !q.get('from') && typeof k.q === 'string' && Date.now() - Number(k.at) < 3600000) q = new URLSearchParams(k.q);
        }
      } catch { /* nothing kept */ }
      const b = q.get('business') && list.find((x) => x.id === q.get('business'));
      if (b) return applyBusiness(b);
      // From a Google profile's search terms (?name=…&kw=…&kw=…[&lat=&lng=&grid=&miles=]): the saved business of that name if
      // there is one, with those keywords added and picked. Without one, the keywords wait in the list
      // while the business is searched for as usual.
      const kws = [...new Set(q.getAll('kw').map((k) => k.trim().slice(0, 120)).filter(Boolean))].slice(0, 10);
      if (kws.length) {
        const name = (q.get('name') ?? '').trim().toLowerCase();
        const match = name ? list.find((x) => x.name.trim().toLowerCase() === name) : undefined;
        incoming.current = kws;
        if (match) applyBusiness(match);
        else {
          setKeywordList(kws);
          setPicked(kws);
          // From a listing with a place on the map (&lat=&lng=): the scan starts there, under the listing's name.
          const lat = Number(q.get('lat')), lng = Number(q.get('lng'));
          if (q.get('lat') && q.get('lng') && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (q.get('name') ?? '').trim()) {
            setTargetBusiness((q.get('name') ?? '').trim().slice(0, 200));
            setCenterLat(lat);
            setCenterLng(lng);
          }
        }
        if (q.get('grid')) setGridSize(offeredSize(Number(q.get('grid'))));
        const km = ({ '0.5': 0.80467, '1': 1.60934, '2': 3.21868, '3': 4.82802, '5': 8.04672 } as Record<string, number>)[q.get('miles') ?? ''];
        if (km) setSpacingKm(km);
        return;
      }
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
        // The network is not carried over: every new scan starts on home internet (the cheaper
        // data), and mobile or the mix is chosen on purpose each time.
        setTrackAiOverviews(Boolean(sc.trackAiOverviews));
        const match = list.find((x) => x.name === sc.targetBusiness);
        if (match) setBusinessId(match.id);
        setGoogleId(sc.targetKgmid ?? match?.kgmid ?? '');
        setWebsite(sc.targetDomain ?? match?.domain ?? '');
        setKeywordList([...new Set([...(match?.keywords ?? []), sc.keyword])]);
        setPicked([sc.keyword]);
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // From a town in Analytics (?near=Lakeland, Florida): the scan is centred there. It waits a moment so a saved business's own centre does not replace it.
  useEffect(() => {
    const near = (new URLSearchParams(window.location.search).get('near') ?? '').trim().slice(0, 120);
    if (!near) return;
    let live = true;
    const t = setTimeout(() => {
      fetch('https://photon.komoot.io/api/?q=' + encodeURIComponent(near) + '&limit=1&lang=en')
        .then((r) => r.json())
        .then((d) => {
          const c = d?.features?.[0]?.geometry?.coordinates;
          if (!live || !Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return;
          setCenterLng(c[0]); setCenterLat(c[1]); setAddressQuery(near);
          mapRef.current?.flyTo({ center: [c[0], c[1]], zoom: 11, duration: 600 });
        })
        .catch(() => {});
    }, 1200);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A business typed by name (not picked from the saved list): its website and Google ID from the
  // account's saved businesses and earlier scans (the place nearest this grid), into whichever of
  // the two fields is still empty.
  function rememberIdentity() {
    if (!businessId) void fillRemembered(targetBusiness.trim(), centerLat, centerLng, { site: Boolean(website.trim()), id: Boolean(googleId.trim()) });
  }
  async function fillRemembered(name: string, lat: number, lng: number, have: { site: boolean; id: boolean }) {
    rememberedFor.current = name;
    if (!name || (have.site && have.id)) return;
    const q = new URLSearchParams({ name, lat: String(lat), lng: String(lng) });
    const r = (await fetch('/api/businesses/remembered?' + q)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)) as { domain?: string | null; kgmid?: string | null } | null;
    // Another business was picked or typed meanwhile: this answer is not for it.
    if (rememberedFor.current !== name) return;
    const site = !have.site && r?.domain ? r.domain : '';
    const id = !have.id && r?.kgmid ? r.kgmid : '';
    if (site) setWebsite((w) => (w.trim() ? w : site));
    if (id) setGoogleId((g) => (g.trim() ? g : id));
    if (site || id) setIdentityNote('Filled in from your earlier scans of this business: check it is the right location.');
  }
  // The Google ID field, checked when it is left: an ID is tidied, a pasted Google link is looked
  // up on the server (it follows the link to the ID), anything else is explained.
  async function checkGoogleId() {
    const typed = googleId.trim();
    setGoogleIdNote(null);
    if (!typed) return;
    const id = googleIdOf(typed);
    if (id) return setGoogleId(id);
    if (!googleShortLink(typed)) return setGoogleIdNote({ ok: false, text: GOOGLE_ID_HELP });
    setGoogleIdBusy(true);
    const r = await fetch('/api/google-id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: typed }) })
      .then(async (res) => ({ ok: res.ok, d: (await res.json().catch(() => ({}))) as { id?: string; error?: string } }))
      .catch(() => ({ ok: false, d: {} as { id?: string; error?: string } }));
    setGoogleIdBusy(false);
    if (r.ok && r.d.id) {
      setGoogleId(r.d.id);
      setGoogleIdNote({ ok: true, text: 'Found the business’s Google ID: ' + r.d.id });
    } else setGoogleIdNote({ ok: false, text: r.d.error ?? GOOGLE_ID_HELP });
  }
  async function saveBusiness() {
    setSaveMsg('');
    const keywords = scanKeywords([...keywordList, ...picked], keyword);
    const body = {
      name: targetBusiness, centerLabel: addressQuery || [detectedCity, detectedState, detectedZip].filter(Boolean).join(' '),
      centerLat, centerLng, keywords, targetType, gridSize, spacingKm, ispMode: 'any', isps: [],
      trackAiOverviews, scheduleType: speed === 'scheduled' && when === 'pick' && repeat !== 'once' ? 'weekly' : 'once',
      kgmid: googleId.trim(), domain: website.trim(),
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
    fetch('/api/billing/gbp', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Number(d?.seats) > 0 && !speedPicked.current) setSpeed('scheduled'); })
      .catch(() => {});
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
  // 4. Point cost: one point per grid point (before the Scan Now ×2). AI Overview tracking is included.
  const creditSummary = useMemo(() => {
    const totalPins = shape === 'wealth' ? previewPoints.filter((p) => !p.skipped).length : gridSize * gridSize - allSkipped.length;
    const isDesktop = targetType.startsWith('desktop_');
    const mobilePrice = mobileData?.creditsPerPoint ?? 1;
    // Mobile points cost the mobile price, residential ones 1. In a mix the points alternate like a
    // checkerboard (the same rule the server charges by, with the same rows for placed points).
    const kept = shape === 'wealth'
      ? placedLayout(previewPoints.filter((p) => !p.skipped), OFFERED_GRID_SIZES).cells
      : previewPoints.filter((p) => !p.skipped && !p.out).map((p) => { const [r, c] = p.key.split('_').map(Number); return { rowIdx: r, colIdx: c }; });
    const mobilePins = network === 'residential' ? 0 : kept.filter((p) => pinNetwork(network, p.rowIdx, p.colIdx) === 'mobile').length;
    // One phone session a pin, across the board (a mobile-data point at the admin setting's price, 1 by default).
    const totalCost = isDesktop ? totalPins : totalPins - mobilePins + mobilePins * mobilePrice;
    const costPerPin = isDesktop ? 1 : network === 'mobile' ? mobilePrice : 1;
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
    } catch (error) {
      console.error('Unable to initialize the scan map', error);
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
            map.setPaintProperty(l.id, 'fill-color', '#0d2238');
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
            { id: 'setup-income', type: 'fill', source: 'census', 'source-layer': 'tract', paint: { 'fill-color': fillColor('income', null, SETUP_INCOME_PALETTE) as never, 'fill-opacity': 0.01 } },
            beforeLabels,
          );
          liftAboveShading(map, beforeLabels);
        } catch (e) {
          console.error('[census layer]', e);
        }
      }
      // The grid's outline and the lines between its points.
      map.addSource('grid-frame', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'grid-lines', type: 'line', source: 'grid-frame', filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': '#ff5a1f', 'line-opacity': 0.25, 'line-width': 1, 'line-dasharray': [2, 4] } });
      map.addLayer({ id: 'grid-ring', type: 'line', source: 'grid-frame', filter: ['==', ['get', 'kind'], 'ring'], paint: { 'line-color': '#e2e8f0', 'line-opacity': 0.35, 'line-width': 1.2, 'line-dasharray': [4, 4] } });
      map.addLayer({ id: 'grid-fill', type: 'fill', source: 'grid-frame', filter: ['==', ['get', 'kind'], 'box'], paint: { 'fill-color': '#ff5a1f', 'fill-opacity': 0.025 } });
      map.addLayer({ id: 'grid-box', type: 'line', source: 'grid-frame', filter: ['==', ['get', 'kind'], 'box'], paint: { 'line-color': '#ff5a1f', 'line-opacity': 0.75, 'line-width': 1.3 } });
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
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
    const dot = gridSize <= 5 ? 18 : gridSize <= 7 ? 15 : 12;
    const add = (el: HTMLElement, lng: number, lat: number, draggable = false, offset: [number, number] = [0, 0]) => {
      const marker = new maplibregl.Marker({ element: el, draggable, anchor: 'center', offset }).setLngLat([lng, lat]).addTo(map);
      previewMarkersRef.current.push(marker);
      return marker;
    };
    const inShape = previewPoints.filter((pt) => !pt.out);
    inShape.forEach((pt) => {
      bounds.extend([pt.lng, pt.lat]);
      if (pt.isCenter) {
        const el = document.createElement('div');
        el.className = styles.centerPin;
        el.setAttribute('aria-label', 'Grid center: drag to move the scan territory');
        el.title = 'Drag to move the scan territory';
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
      // Setup dots are capture locations, not rank scores. Keep them quiet and unnumbered.
      el.className = styles.gridPin + (pt.skipped ? ' ' + styles.skippedPin : '') + (rich ? ' ' + styles.incomePin : '');
      el.style.fontSize = (dot >= 26 ? 11 : dot >= 22 ? 10 : 8) + 'px';
      el.textContent = pt.skipped ? '−' : '';
      el.setAttribute('aria-pressed', String(!pt.skipped));
      el.setAttribute('aria-label', `Point ${pt.n}: ${pt.skipped ? 'excluded, click to include' : 'active, click to exclude'}${info?.water ? ', on water' : ''}`);
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
    const lats = inShape.map((p) => p.lat), lngs = inShape.map((p) => p.lng);
    const top = Math.max(...lats), bottom = Math.min(...lats), west = Math.min(...lngs), east = Math.max(...lngs);
    const stepLat = Math.abs(previewPoints[0].lat - previewPoints[gridSize].lat), stepLng = Math.abs(previewPoints[1].lng - previewPoints[0].lng);
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
      src.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { kind: 'box' }, geometry: { type: 'Polygon', coordinates: [ring] } }, ...lines],
      });
    }
    }
    // Refit only when the grid itself moved or changed size, not when a point is skipped.
    const fitKey = [centerLat, centerLng, gridSize, spacingKm, shape, rows, cols].join('|');
    if ((inShape.length > 1 || shape === 'wealth') && fitKey !== lastFit.current) {
      lastFit.current = fitKey;
      const narrow = map.getContainer().clientWidth < 760;
      map.fitBounds(bounds, { padding: { top: narrow ? 145 : 110, bottom: narrow ? 145 : 160, left: narrow ? 44 : 420, right: narrow ? 44 : 105 }, maxZoom: 14, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400 });
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
    if (map && mapState === 'ready' && map.getLayer('setup-income')) map.setPaintProperty('setup-income', 'fill-opacity', showWealth ? 0.38 : 0.01);
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
    if (googleId.trim() && !googleIdOf(googleId) && !googleShortLink(googleId)) {
      setErrorMsg('Google listing: ' + GOOGLE_ID_HELP);
      return;
    }
    if (creditBalance < creditSummary.totalCost * runKeywords.length * speedX) {
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
          'Idempotency-Key': runKeywords.length > 1 ? baseKey + '-' + i : baseKey,
        },
        body: JSON.stringify({
          keyword: kw,
          targetBusiness: targetBusiness.trim(),
          ...(website.trim() ? { targetDomain: website.trim() } : {}),
          ...(googleId.trim() ? { targetKgmid: googleId.trim() } : {}),
          centerLat,
          centerLng,
          // No ISP targeting: the network choice replaces it.
          ispMode: 'any',
          isps: [],
          network,
          gridSize,
          spacingKm,
          targetType,
          trackAiOverviews,
          scheduleType: 'once',
          speed,
          ...(speed === 'scheduled' ? (when === 'asap' ? { when: 'asap' } : { repeat, scheduleDate: runDate, scheduleAt: runTime, scheduleTimezone: businessTz }) : {}),
          skip: shape === 'wealth' ? [] : allSkipped,
          // Top income: the points are the areas' own middles, not grid points.
          ...(shape === 'wealth' ? { points: previewPoints.filter((p) => !p.isCenter && !p.skipped).map((p) => ({ lat: p.lat, lng: p.lng })) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // A rejected launch gets a fresh key, so it can be fixed and sent again; but once some of the
        // keywords' scans have started, the key is kept, so pressing Launch again only starts the rest.
        if (res.status < 500 && !started.length) submissionKey.current = null;
        throw new Error((started.length ? started.length + ' scan(s) started; then: ' : '') + (data.error ?? 'Failed to launch scan'));
      }
      started.push(data.scanId);
      }
      const cost = creditSummary.totalCost * runKeywords.length * speedX;
      setCreditBalance((b) => b - cost);
      // The saved business keeps the website and Google ID it was just scanned with, so they are
      // filled in next time without pressing save (its keywords and centre are left as they were).
      const sb = businessId ? saved.find((x) => x.id === businessId) : undefined;
      const site = siteDomain(website) ?? '', gid = googleIdOf(googleId);
      if (sb && ((site && site !== (sb.domain ?? '')) || (gid && gid !== (sb.kgmid ?? '')))) {
        fetch('/api/businesses/' + sb.id + '/identity', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: site || sb.domain || '', kgmid: gid || sb.kgmid || '' }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((d: { business?: SavedBusiness } | null) => d?.business && setSaved((list) => list.map((x) => (x.id === sb.id ? d.business! : x))))
          .catch(() => {});
      }
      setLaunched({
        ids: started,
        points: creditSummary.totalPins * runKeywords.length,
        repeat: speed === 'scheduled' && when === 'pick' && repeat !== 'once',
        scheduled: speed === 'scheduled' && when === 'pick' ? runWhen : undefined,
        asap: speed === 'scheduled' && when === 'asap',
        summary: `${creditSummary.totalPins} grid points × ${runKeywords.length} keyword${runKeywords.length > 1 ? 's' : ''} · ${cost.toLocaleString()} phone session${cost === 1 ? '' : 's'} used`,
      });
    } catch (err: any) {
      setErrorMsg(err.message);
      setIsSubmitting(false);
    }
  }
  const runKeywords = scanKeywords(picked, keyword);
  const shownKeywords = [...new Set([...keywordList, ...picked])];
  const points = creditSummary.totalPins;
  // Scan Now and scheduled scans cost the same: one phone session a grid point.
  const speedX = 1;
  const businessTz = stateTimezone(detectedState || 'FL');
  const runWhen = (() => { const [y, m, d] = runDate.split('-').map(Number); const [h, mi] = runTime.split(':').map(Number); const dt = new Date(y, (m || 1) - 1, d || 1, h || 0, mi || 0); return `${dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} (${businessTz.replace('America/', '').replace('_', ' ')} time)`; })();
  const runDay = Number(runDate.slice(8, 10)) || 1;
  const repeatDays = repeat === 'weekly' ? [0, 7, 14, 21].map((n) => ((runDay - 1) % 7) + 1 + n) : repeat === 'biweekly' ? [0, 14].map((n) => ((runDay - 1) % 14) + 1 + n) : [];
  const ord = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const repeatNote = repeat === 'once' ? '' : `Then on the ${repeatDays.slice(0, -1).map(ord).join(', ')} and ${ord(repeatDays[repeatDays.length - 1])} of each month.`;
  // A picked time has to be at least 2 hours away (the server allows a few minutes more for sending the form).
  const picking = speed === 'scheduled' && when === 'pick';
  const runMoment = picking ? zonedMoment(runDate, runTime, businessTz) : null;
  const scheduleProblem = !picking || !runMoment
    ? ''
    : !(runMoment instanceof Date)
      ? runMoment.problem
      : runMoment.getTime() < Date.now() + SCHEDULE_LEAD_MS - 60000
        ? 'Pick a time at least 2 hours from now, or choose As soon as possible.'
        : repeat !== 'once' && runDay > 28
          ? 'A repeating scan starts on the 1st to the 28th.'
          : '';
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const totalCost = creditSummary.totalCost * Math.max(1, runKeywords.length) * speedX;
  const creditsLeft = creditBalance - totalCost;
  const spacingMi = Number((spacingKm / 1.60934).toFixed(1));
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
  const phoneName = (p: { brand: string; model: string }) =>
    !p.brand || p.model.toLowerCase().startsWith(p.brand.toLowerCase()) ? p.model : p.brand.charAt(0).toUpperCase() + p.brand.slice(1) + ' ' + p.model;
  /** Each phone model once (a small scan only uses as many phones as it has points), A to Z. */
  const phoneModels = (count: number) =>
    [...new Map(phones.filter((p) => p.model).slice(0, count).map((p) => [phoneName(p).toLowerCase(), phoneName(p)])).values()].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
    );
  const enabledSurfaces = (process.env.NEXT_PUBLIC_ENABLED_SURFACES ?? 'mobile_chrome').split(',').map((x) => x.trim());
  const surfaces = [
    { id: 'mobile_maps', title: 'Maps app', sub: 'Local pack & Ask Maps', note: 'The Maps app list, as a customer sees it.', Icon: MapPin },
    { id: 'mobile_chrome', title: 'Chrome', sub: 'Web + AI Overviews', note: 'The local pack on a Google search, plus the AI Overview and the sites it cites.', Icon: Globe },
    { id: 'mobile_google', title: 'Google app', sub: 'Search in the app', note: 'The Google app search.', Icon: Smartphone },
    ...(process.env.NEXT_PUBLIC_DESKTOP_ENABLED === 'true' ? [{ id: 'desktop_aimode', title: 'Desktop AI', sub: 'AI Mode', note: 'Desktop search in AI Mode.', Icon: Monitor }] : []),
  ].map((x) => ({ ...x, live: enabledSurfaces.includes(x.id) || x.id === 'desktop_aimode' })).sort((a, b) => Number(b.live) - Number(a.live));
  // The map opens on a default spot. Until the pin has been moved off it (a search result picked,
  // the map clicked, the pin dragged, a saved business or a past scan loaded), no scan can start:
  // a scan around the wrong town is worthless and still costs points.
  const placed = centerLat !== 28.039465 || centerLng !== -81.949804;
  const blockedWhy = !targetBusiness.trim() ? 'Step 1: add the business name' : !placed ? 'Step 2: put the pin on the business' : !runKeywords.length ? 'Step 3: add a keyword' : '';
  return (
    <div className={styles.workspace}>
      <section className={styles.mapPane} aria-label="Scan territory map">
        <div className={styles.mapFill}><div ref={mapContainerRef} className={styles.mapCanvas} /></div>
        {mapState !== 'ready' && (
          <div className={styles.mapLoading} role="status">
            {mapState === 'error' ? 'Map unavailable. Search a place or enter center coordinates in More options.' : 'Loading map…'}
          </div>
        )}

        <div className={styles.mapControls}>
        <div className={styles.mapToolbar} aria-label="Grid controls">
          <div className={styles.shapeGroup} role="radiogroup" aria-label="Grid shape">
            {([['square', 'Square'], ['round', 'Round'], ['custom', 'Rectangle']] as const).map(([id, text]) => (
              <button key={id} type="button" role="radio" aria-checked={shape === id} onClick={() => setShape(id)}>{text}</button>
            ))}
            {shape === 'wealth' && <button type="button" role="radio" aria-checked="true">Income areas</button>}
          </div>
          <span className={styles.toolDivider} />
          <label className={styles.compactField}><span className={styles.srOnly}>Grid size</span>
            <select aria-label="Grid size" value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))}>
              {OFFERED_GRID_SIZES.map((n) => <option key={n} value={n}>{n} × {n}</option>)}
            </select>
          </label>
          <span className={styles.toolDivider} />
          <label className={styles.compactField}><span>Spacing</span>
            <select aria-label="Distance between pins" value={spacingKm} onChange={(e) => setSpacingKm(Number(e.target.value))}>
              {SPACING_OPTIONS.map((sp) => <option key={sp.km} value={sp.km}>{sp.short}</option>)}
            </select>
          </label>
          <span className={styles.toolDivider} />
          <button type="button" className={styles.waterAction} disabled={!onWater.length} onClick={() => setSkipped((list) => [...new Set([...list, ...onWater])])}
            title={onWater.length ? `Exclude ${onWater.length} point${onWater.length === 1 ? '' : 's'} currently on water. They will not be charged.` : 'No active points on water in the loaded map tiles.'}>
            <span className={styles.tinyDot} />Water{onWater.length ? ` · ${onWater.length}` : ''}
          </button>
          <button type="button" className={styles.quietTool} onClick={() => setSkipped([])} disabled={!skipped.length} title="Restore excluded pins"><RotateCcw size={14} />Reset pins</button>
        </div>
        {shape === 'custom' && (
          <div className={styles.rectangleControls}>
            {([['Rows', rows, setRows], ['Columns', cols, setCols]] as const).map(([name, value, set]) => (
              <div key={name}><span>{name}</span><button type="button" aria-label={`Fewer ${name.toLowerCase()}`} disabled={value <= 1} onClick={() => set(oddStep(value, -1))}><Minus size={13} /></button><strong>{value}</strong><button type="button" aria-label={`More ${name.toLowerCase()}`} disabled={value >= gridSize} onClick={() => set(oddStep(value, 1))}><Plus size={13} /></button></div>
            ))}
          </div>
        )}
        </div>

        <details className={styles.layers}>
          <summary><Layers size={16} />Layers<ChevronDown size={13} /></summary>
          <div className={styles.layersBody}>
            {CENSUS_VINTAGE ? <>
              <label><input type="checkbox" checked={showWealth} onChange={(e) => setShowWealth(e.target.checked)} />Household income</label>
              <p>Median household income from census areas.</p>
              <button type="button" onClick={() => { setShape(shape === 'wealth' ? 'square' : 'wealth'); setShowWealth(true); }} aria-pressed={shape === 'wealth'}>{shape === 'wealth' ? 'Use a standard grid' : 'Place pins in top income areas'}</button>
            </> : <p>Demographic layers are not available in this market.</p>}
          </div>
        </details>

        <div className={styles.mapNotes}>
          {showWealth && CENSUS_VINTAGE && <div className={styles.incomeLegend}>
            <span>Median household income</span>
            <div>{legend('income', null, SETUP_INCOME_PALETTE).map((band) => <span key={band.label}><i style={{ backgroundColor: band.color }} />{band.label}</span>)}</div>
            {richStat && <small>{richStat.rich} of {richStat.known} known points in $100k+ areas</small>}
          </div>}
          <div className={styles.telemetry} aria-live="polite">
            <span className={styles.tinyDot} /><strong>{points}</strong> active
            {skipped.length > 0 && <><span className={styles.telemetryDivider} /><span>{skipped.filter((key) => !outOfShape.includes(key)).length} excluded</span></>}
            <span className={styles.telemetryDivider} /><span>{spanW} × {spanH} mi</span>
          </div>
        </div>
      </section>

      <form onSubmit={handleLaunchScan} className={styles.dock} aria-label="New scan setup">
        <header className={styles.dockHeader}>
          <div className={styles.dockTitle}><span className={styles.brandMark}><Crosshair size={16} /></span><h1>New scan</h1></div>
          <select id="ns-business" aria-label="Load a saved business setup" value={businessId} onChange={(e) => {
            const business = saved.find((item) => item.id === e.target.value);
            if (business) applyBusiness(business);
            else { rememberedFor.current = ''; setBusinessEditing(true); setBusinessId(''); setTargetBusiness(''); setWebsite(''); setGoogleId(''); setGoogleIdNote(null); setIdentityNote(''); setKeywordList(incoming.current); setPicked(incoming.current); }
          }}><option value="">Load setup</option>{saved.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select>
        </header>

        <div className={styles.dockBody}>
          {errorMsg && <div role="alert" className={styles.error}><AlertCircle size={16} /><span>{errorMsg}</span></div>}

          <section className={styles.section}>
            {businessEditing || !targetBusiness.trim() ? <>
            <label htmlFor="ns-name" className={styles.sectionLabel}>Business</label>
            <input id="ns-name" className={styles.field} type="text" placeholder="Business name as it appears on Google" value={targetBusiness} onChange={(e) => setTargetBusiness(e.target.value)} onBlur={rememberIdentity} autoComplete="organization" />
            <div className={styles.placeSearch}>
              <MapPin size={15} />
              <input type="text" role="combobox" aria-expanded={places.length > 0} aria-controls="place-suggestions" aria-label="Search business, address, city or ZIP" placeholder="Search an address, city or ZIP" value={addressQuery} onChange={(e) => { typedRef.current = true; setAddressQuery(e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { void handleGeocodeSearch(e); } if (e.key === 'ArrowDown' && places.length) { e.preventDefault(); setPlaceIdx((i) => (i + 1) % places.length); } if (e.key === 'ArrowUp' && places.length) { e.preventDefault(); setPlaceIdx((i) => (i - 1 + places.length) % places.length); } if (e.key === 'Escape') setPlaces([]); }} />
              <button type="button" onClick={handleGeocodeSearch} disabled={isGeocoding} aria-label="Search location">{isGeocoding ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}</button>
            </div>
            {places.length > 0 && <ul id="place-suggestions" role="listbox" className={styles.places}>
              {places.map((place, i) => <li key={place.label + place.sub + i} role="option" aria-selected={i === placeIdx}><button type="button" onMouseEnter={() => setPlaceIdx(i)} onClick={() => choosePlace(place)}><strong>{place.label}</strong>{place.sub && <span>{place.sub}</span>}</button></li>)}
            </ul>}
            {searchNote && !places.length && <p role="status" className={styles.hint}>{searchNote}</p>}
            {!placed && <p className={styles.hint}>Choose a location to place your grid.</p>}
            <details className={styles.identity} open={identityOpen} onToggle={(e) => setIdentityOpen(e.currentTarget.open)}>
              <summary>Website &amp; Google listing <span>Optional</span><ChevronDown size={13} /></summary>
              <div>
                <label htmlFor="ns-website">Website</label><input id="ns-website" type="text" inputMode="url" autoCapitalize="none" className={styles.field} placeholder="example.com" value={website} onChange={(e) => { setWebsite(e.target.value); setIdentityNote(''); }} />
                <label htmlFor="ns-google-id">Google business ID or Share link</label><input id="ns-google-id" type="text" autoCapitalize="none" spellCheck={false} className={styles.field} placeholder="Google Maps Share link or /g/…" value={googleId} aria-invalid={googleIdNote?.ok === false} onChange={(e) => { setGoogleId(e.target.value); setGoogleIdNote(null); setIdentityNote(''); }} onBlur={checkGoogleId} />
                <p className={googleIdNote?.ok === false ? styles.errorText : styles.hint}>{googleIdBusy ? 'Looking up the link…' : googleIdNote?.text || identityNote || 'Links AI business citations to the correct listing and website.'}</p>
              </div>
            </details>
            {targetBusiness.trim() && placed && <button type="button" className={styles.finishBusiness} onClick={() => setBusinessEditing(false)}>Done editing</button>}
            </> : <button type="button" className={styles.businessCard} onClick={() => setBusinessEditing(true)} aria-label={`Change business: ${targetBusiness}`}>
              <span className={styles.tinyDot} /><span><strong>{targetBusiness}</strong><small>{addressQuery || [detectedCity, detectedState].filter(Boolean).join(', ')}</small></span><span>Change</span>
            </button>}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}><label htmlFor="ns-keywords" className={styles.sectionLabel}>Keywords</label><span className={styles.mono}>{runKeywords.length}</span></div>
            <div className={styles.keywordBox}>
              {shownKeywords.length > 0 && <div className={styles.keywordChips}>{shownKeywords.map((word) => <button key={word} type="button" aria-pressed={picked.includes(word)} title={`${picked.includes(word) ? 'Exclude' : 'Include'} this keyword`} onClick={() => togglePick(word)}>{word}{picked.includes(word) && <Check size={12} />}</button>)}</div>}
              <textarea id="ns-keywords" placeholder="Paste keywords, one per line…" rows={1} value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addKeyword(); } }} />
            </div>
            <div className={styles.keywordHelper}><span title="Commas, semicolons and new lines split keywords. Duplicate entries count once.">Comma or new line · duplicates removed</span><button type="button" onClick={addKeyword} disabled={!keyword.trim()} title="Add the pasted keywords to the list (Ctrl+Enter)">Apply</button></div>
            {runKeywords.length > 10 && <p className={styles.hint}>Large batch: {runKeywords.length} scans · {totalCost.toLocaleString()} phone sessions.</p>}
          </section>

          <section className={styles.section}>
            <span className={styles.sectionLabel}>Capture surface</span>
            <div className={styles.surfaces} role="radiogroup" aria-label="Capture surface">{surfaces.map(({ id, title, sub, live }) => <button key={id} type="button" role="radio" aria-checked={targetType === id} disabled={!live} onClick={() => live && setTargetType(id as TargetType)}>
              <span className={styles.radioIndicator}>{targetType === id && <span />}</span><span className={styles.surfaceText}><strong>{id === 'mobile_chrome' ? 'Mobile Search' : title}</strong><small>{id === 'mobile_chrome' ? 'Local Pack + AI Overviews' : sub}</small></span>{!live && <span className={styles.surfaceBadge}>Soon</span>}
            </button>)}</div>
            <p className={styles.captureNote}><Smartphone size={13} />{targetType.startsWith('desktop_') ? 'Desktop' : 'Real Android'}<span>·</span>{detectedCity || 'Grid'} GPS<Info size={12}><title>AI Overviews and phone videos are included in supported mobile captures.</title></Info></p>
          </section>

          <section className={styles.moreOptions}>
            <button type="button" aria-expanded={moreOptions} aria-controls="ns-more-options" onClick={() => setMoreOptions((value) => !value)} className={styles.moreToggle}><span><SlidersHorizontal size={14} />More options</span><span>{speed === 'now' ? 'Priority' : when === 'asap' ? 'Standard' : repeat === 'once' ? 'Scheduled' : repeat === 'weekly' ? 'Weekly' : 'Biweekly'}<ChevronDown size={14} /></span></button>
            {moreOptions && <div id="ns-more-options" className={styles.moreBody}>
              <fieldset><legend>Schedule</legend>
                <div className={styles.segmented} role="group" aria-label="Run priority"><button type="button" aria-pressed={speed === 'scheduled'} onClick={() => { speedPicked.current = true; setSpeed('scheduled'); }}>Scheduled</button><button type="button" aria-pressed={speed === 'now'} onClick={() => { speedPicked.current = true; setSpeed('now'); }}>Scan Now</button></div>
                {speed === 'scheduled' ? <>
                  <div className={styles.segmented} role="group" aria-label="When the scheduled scan runs"><button type="button" aria-pressed={when === 'asap'} onClick={() => setWhen('asap')}>When available</button><button type="button" aria-pressed={when === 'pick'} onClick={() => setWhen('pick')}>Choose a time</button></div>
                  {when === 'pick' ? <>
                    <div className={styles.dateFields}><label>First run<input id="run-date" type="date" min={today} value={runDate} onChange={(e) => setRunDate(e.target.value)} /></label><label>Time<input id="run-time" type="time" step={900} value={runTime} onChange={(e) => setRunTime(e.target.value)} /></label></div>
                    <label className={styles.stackLabel}>Repeat<select id="run-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as 'once' | 'weekly' | 'biweekly')}><option value="once">Just once</option><option value="weekly">Weekly · 4 runs per month</option><option value="biweekly">Every other week · 2 per month</option></select></label>
                    <p className={styles.hint}>{runWhen}. {repeatNote} Choose at least 2 hours ahead; results within 3 hours of that time.</p>
                  </> : <p className={styles.hint}>Starts when phones are available, behind priority scans.</p>}
                </> : <p className={styles.hint}>First in line, at the same one phone session a grid point.</p>}
                {scheduleProblem && <p className={styles.errorText}>{scheduleProblem}</p>}
              </fieldset>
              {mobileData && <fieldset><legend>Network</legend><div className={styles.networkOptions} role="radiogroup" aria-label="Network">{(['residential', 'mobile', 'mix'] as const).map((id) => <button key={id} type="button" role="radio" aria-checked={network === id} disabled={id !== 'residential' && !mobileData.ready} onClick={() => setNetwork(id)}><span>{NETWORK_LABELS[id]}</span><small>{id === 'residential' || mobileData.creditsPerPoint === 1 ? '1' : id === 'mobile' ? mobileData.creditsPerPoint : `1–${mobileData.creditsPerPoint}`} session / pin</small></button>)}</div>{!mobileData.ready && <p className={styles.hint}>Mobile network currently unavailable.</p>}</fieldset>}
              <fieldset><legend>Grid center</legend><div className={styles.dateFields}><label>Latitude<input aria-label="Center latitude" type="number" step="any" min="-85" max="85" value={centerLat} onChange={(e) => setCenterLat(Number(e.target.value))} /></label><label>Longitude<input aria-label="Center longitude" type="number" step="any" min="-180" max="180" value={centerLng} onChange={(e) => setCenterLng(Number(e.target.value))} /></label></div><p className={styles.hint}>You can also drag the orange center marker on the map.</p></fieldset>
              {businessId && <button type="button" className={styles.deleteBusiness} onClick={deleteBusiness}>Delete saved setup</button>}
            </div>}
          </section>
          <p className={styles.tagline}>Every data point comes with a receipt.</p>
        </div>

        <footer className={styles.dockFooter}>
          <div className={styles.estimateHeading}><span className={styles.mono}>{points} pins × {runKeywords.length} {runKeywords.length === 1 ? 'keyword' : 'keywords'}</span><strong title={`One phone session a pin: ${creditSummary.totalCost.toLocaleString()} per keyword. AI Overview tracking is included.`}>{(runKeywords.length ? totalCost : 0).toLocaleString()} <span>phone sessions</span></strong></div>
          <div className={styles.estimateMeta}><button type="button" className={styles.priorityLink} onClick={() => setMoreOptions(true)} title="Change timing and priority in More options">{speed === 'now' ? 'Scan Now' : 'Scheduled'}</button>{creditsLeft >= 0 ? <span title="Balance after this scan">{(runKeywords.length ? creditsLeft : creditBalance).toLocaleString()} left</span> : <button type="button" onClick={() => setIsTopUpOpen(true)}>{(-creditsLeft).toLocaleString()} short · Top up</button>}{eta && runKeywords.length > 0 && <span title="Estimate based on available phone models; queue time varies."><Clock3 size={12} />{eta}</span>}</div>
          {blockedWhy && <p className={styles.launchHint} role="status">{blockedWhy.replace(/^Step \d: /, '')}</p>}
          <div className={styles.launchActions}><button type="button" className={styles.saveButton} onClick={saveBusiness} disabled={!targetBusiness.trim()} title={businessId ? 'Update this saved business setup' : 'Save this business and its scan settings'}><Save size={15} />Save</button><button type="submit" className={styles.launchButton} disabled={isSubmitting || Boolean(blockedWhy) || Boolean(scheduleProblem)}>{isSubmitting ? <><Loader2 size={15} className="animate-spin" />Starting…</> : creditsLeft < 0 ? 'Get points to run' : speed === 'scheduled' && when === 'pick' ? 'Schedule scan' : 'Launch scan'}</button></div>
          {saveMsg && <p role="status" className={styles.hint}>{saveMsg}</p>}
        </footer>
      </form>
      {launched && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div role="dialog" aria-modal="true" aria-label="Scan queued" className="w-full max-w-lg space-y-3.5 rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <div>
              <h2 className="text-xl font-extrabold text-white">{launched.scheduled ? (launched.ids.length > 1 ? `${launched.ids.length} scans scheduled` : 'Scan scheduled') : launched.ids.length > 1 ? `${launched.ids.length} scans queued` : 'Scan queued'}</h2>
              <p className="mt-1 text-sm text-slate-300">{launched.summary}</p>
            </div>
            {phoneModels(launched.points).length > 0 && (
              <div>
                <p className="text-xs text-slate-400">Real Android phones running it</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {phoneModels(launched.points).map((name) => (
                    <li key={name} className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 text-[13px] font-semibold text-white">
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[13px] text-slate-300">
              {launched.scheduled
                ? `It runs ${launched.scheduled}, with results within 3 hours. ${launched.repeat ? 'It then repeats on its schedule. ' : ''}`
                : launched.asap
                  ? 'It starts right away if the phones are free. If other scans are running, it waits at the end of the line. '
                  : `First results in a few minutes${eta ? `; everything done in ${eta}` : ''}. `}
              Each point records its search, ads, AI Overview and a phone video.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => router.push(launched.ids.length > 1 ? '/scans' : `/scans/${launched.ids[0]}`)}
                className={styles.successAction}>{launched.scheduled ? 'See your scans' : 'Watch it run'}</button>
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
