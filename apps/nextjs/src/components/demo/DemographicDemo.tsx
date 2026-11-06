'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Map as GLMap, ExpressionSpecification, FilterSpecification, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import demo from '@/data/demographics-demo.json';
import { type DemoPin, type Tract, type MetricKey, type Scenario, visibilityMetrics, pinRank, formatMoney, formatPercent, formatCount, validNumber } from '@/lib/demographics';
import { type MapViewMode, BUILDING_LAYER_ID, BUILDING_SOURCE_ID, BUILDING_ZOOM, BUILDING_PITCH, GRID_BOUNDS, buildingLayer, neighborhoodCamera } from '@/lib/demographic-map-view';
import 'maplibre-gl/dist/maplibre-gl.css';
import './demographic-demo.css';
import DemoSalesSections, { SPRINT_URL } from './DemoSalesSections';

const TRACTS = demo.tracts as Record<string, Tract>;
const PINS = demo.pins as DemoPin[];
const CENTER: [number, number] = [-81.9498, 28.0395];
const METRICS = {
  income: { label: '💰 Household Income', title: 'Median household income', stops: [35000, 65000, 100000, 160000], colors: ['#ede4ac', '#b2d398', '#45a69c', '#23647d'], labels: ['$35k', '$65k', '$100k', '$160k+'] },
  owner_pct: { label: '🏠 Homeowner %', title: 'Owner-occupied share of occupied homes', stops: [25, 50, 75, 95], colors: ['#eee0b6', '#bdcaa9', '#6da8a4', '#306986'], labels: ['25%', '50%', '75%', '95%'] },
  year_built: { label: '🔨 Home Age (Year Built)', title: 'Median year housing units were built', stops: [1955, 1978, 1998, 2018], colors: ['#a889c7', '#a8a1ca', '#8dbcc4', '#c6d9cf'], labels: ['1955', '1978', '1998', '2018'] },
};
const polygonLayers = ['demo-fill', 'demo-border', 'demo-highlight'];
const CompatibilityMap = dynamic(() => import('./DemographicMapFallback'), { ssr: false });
let protocolUsers = 0;
type Selection = { pinId?: string; tractId?: string };

function colorExpression(metric: Exclude<MetricKey, 'none'>): ExpressionSpecification {
  const config = METRICS[metric];
  return ['case', ['==', ['get', metric], null], '#687680', ['interpolate', ['linear'], ['get', metric], ...config.stops.flatMap((stop, i) => [stop, config.colors[i]])]] as unknown as ExpressionSpecification; // null comparison is valid at runtime; maplibre 4's types are stricter than 5's
}

function Estimate({ value, moe, money = false, year = false, annotation = '' }: { value: number | null; moe?: number | null; money?: boolean; year?: boolean; annotation?: string }) {
  return <><strong>{annotation || (money ? formatMoney(value) : year && validNumber(value) ? String(value) : formatCount(value))}</strong>{validNumber(moe) && validNumber(value) && <small>± {money ? formatMoney(moe) : formatCount(moe)} margin of error</small>}</>;
}

export default function DemographicDemo() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [compatibility, setCompatibility] = useState(false);
  const [viewMode, setViewMode] = useState<MapViewMode>('3d');
  const [pitch, setPitch] = useState(BUILDING_PITCH);
  const [resetKey, setResetKey] = useState(0);
  const [focusPinId, setFocusPinId] = useState<string | undefined>();
  const [metric, setMetric] = useState<MetricKey>('income');
  const [opacity, setOpacity] = useState(0.5);
  const [minOwners, setMinOwners] = useState(0);
  const [minIncome, setMinIncome] = useState(0);
  const [scenario, setScenario] = useState<Scenario>('south');
  const [showAI, setShowAI] = useState(true);
  const [locked, setLocked] = useState<Selection>({ pinId: 'R4C4', tractId: PINS.find(p => p.id === 'R4C4')?.tractId ?? undefined });
  const [hovered, setHovered] = useState<Selection | null>(null);
  const metrics = useMemo(() => visibilityMetrics(PINS, TRACTS, scenario, { minOwners, minIncome }), [scenario, minOwners, minIncome]);
  const eligibleIds = useMemo(() => new Set(metrics.eligible.map(p => p.id)), [metrics.eligible]);
  const selection = hovered ?? locked;
  const selectedPin = selection.pinId ? metrics.eligible.find(p => p.id === selection.pinId) : undefined;
  const selectedTract = selectedPin?.tractId ? TRACTS[selectedPin.tractId] : selection.tractId ? TRACTS[selection.tractId] : undefined;
  const config = metric === 'none' ? null : METRICS[metric];
  const state = useRef({ metric, minOwners, minIncome, eligibleIds });
  state.current = { metric, minOwners, minIncome, eligibleIds };

  const pinData = useMemo<FeatureCollection>(() => ({ type: 'FeatureCollection', features: metrics.eligible.map(pin => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] }, properties: { id: pin.id, rank: pinRank(pin, scenario), label: pinRank(pin, scenario) > 20 ? '20+' : String(pinRank(pin, scenario)), aiCited: showAI && pin.aiCited } })) }), [metrics.eligible, scenario, showAI]);

  useEffect(() => {
    let disposed = false;
    let releaseProtocol: (() => void) | undefined;
    let observer: ResizeObserver | undefined;
    async function init() {
      try {
        const [{ default: gl }, pm] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
        if (disposed || !container.current) return;
        if (protocolUsers++ === 0) gl.addProtocol('pmtiles', new pm.Protocol().tile);
        releaseProtocol = () => { if (--protocolUsers === 0) gl.removeProtocol('pmtiles'); };
        const map = new gl.Map({ container: container.current, style: 'https://tiles.openfreemap.org/styles/dark', ...neighborhoodCamera(CENTER), minZoom: 8, maxZoom: 18, maxPitch: 65, cooperativeGestures: true, attributionControl: { compact: true } });
        mapRef.current = map;
        map.addControl(new gl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
        map.addControl(new gl.ScaleControl({ unit: 'imperial' }), 'bottom-left');
        map.on('pitchend', () => { if (!disposed) setPitch(Math.round(map.getPitch())); });
        map.on('movestart', () => setHovered(null));
        observer = new ResizeObserver(() => map.resize()); observer.observe(container.current);
        map.on('error', event => {
          if (!disposed) setMapError(event.error?.message?.includes('WebGL') ? 'Your browser could not start WebGL. The pin selector and Census inspector still work below.' : 'A map resource could not load. Check your connection and reload; the Census inspector still works.');
        });
        map.on('load', () => {
          if (disposed) return;
          map.addSource('demo-census', { type: 'vector', url: `pmtiles://${new URL('/data/polk-acs-2023.pmtiles', window.location.origin)}`, promoteId: 'GEOID' });
          map.addSource('demo-pins', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          const firstLabel = map.getStyle().layers.find(layer => layer.type === 'symbol')?.id;
          map.addLayer({ id: 'demo-fill', type: 'fill', source: 'demo-census', 'source-layer': 'demographics', paint: { 'fill-color': colorExpression('income'), 'fill-opacity': 0.5 } }, firstLabel);
          map.addLayer({ id: 'demo-border', type: 'line', source: 'demo-census', 'source-layer': 'demographics', paint: { 'line-color': '#d7ebe3', 'line-width': 0.8, 'line-opacity': 0.45 } }, firstLabel);
          map.addLayer({ id: 'demo-highlight', type: 'line', source: 'demo-census', 'source-layer': 'demographics', filter: ['==', ['get', 'GEOID'], ''], paint: { 'line-color': '#f5f9ed', 'line-width': 2.5 } }, firstLabel);
          // Reuse the basemap's building source when present; otherwise use the provider's documented TileJSON.
          const existingBuildings = map.getStyle().layers.find(layer => 'source-layer' in layer && layer['source-layer'] === 'building' && 'source' in layer);
          let buildingSource = existingBuildings && 'source' in existingBuildings ? existingBuildings.source : undefined;
          if (!buildingSource) {
            map.addSource(BUILDING_SOURCE_ID, { type: 'vector', url: 'https://tiles.openfreemap.org/planet' });
            buildingSource = BUILDING_SOURCE_ID;
          }
          for (const layer of map.getStyle().layers) {
            if (layer.type === 'fill-extrusion' && layer['source-layer'] === 'building') map.setLayoutProperty(layer.id, 'visibility', 'none');
          }
          map.addLayer(buildingLayer(buildingSource), firstLabel);
          map.setLight({ anchor: 'viewport', color: '#f3f0df', intensity: 0.45, position: [1.5, 210, 35] });
          map.addLayer({ id: 'demo-pin-circles', type: 'circle', source: 'demo-pins', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 10, 13, 17], 'circle-color': ['step', ['get', 'rank'], '#6ce2ac', 4, '#f1d27b', 11, '#ef996f', 21, '#b1b8c1'], 'circle-stroke-width': ['case', ['get', 'aiCited'], 3, 1.5], 'circle-stroke-color': ['case', ['get', 'aiCited'], '#58d8ff', '#142b2d'] } });
          map.addLayer({ id: 'demo-pin-labels', type: 'symbol', source: 'demo-pins', layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#132426' } });
          map.setPaintProperty('demo-pin-circles', 'circle-pitch-alignment', 'viewport');
          map.setPaintProperty('demo-pin-circles', 'circle-pitch-scale', 'viewport');
          map.setLayoutProperty('demo-pin-labels', 'text-pitch-alignment', 'viewport');
          map.setLayoutProperty('demo-pin-labels', 'text-rotation-alignment', 'viewport');
          function inspect(point: { x: number; y: number }): Selection | null {
            const pin = map.queryRenderedFeatures([point.x, point.y], { layers: ['demo-pin-circles'] })[0];
            if (pin) { const p = PINS.find(p => p.id === pin.properties.id); if (p && state.current.eligibleIds.has(p.id)) return { pinId: p.id, tractId: p.tractId ?? undefined }; }
            if (state.current.metric !== 'none') {
              const tract = map.queryRenderedFeatures([point.x, point.y], { layers: ['demo-fill'] })[0];
              if (tract) return { tractId: String(tract.properties.GEOID) };
            }
            return null;
          }
          map.on('mousemove', e => { const hit = inspect(e.point); map.getCanvas().style.cursor = hit ? 'pointer' : ''; setHovered(hit); });
          map.on('click', e => { const hit = inspect(e.point); if (hit) { setLocked(hit); setHovered(null); } });
          map.getCanvas().addEventListener('mouseleave', () => setHovered(null));
          setReady(true);
        });
      } catch (error) {
        if (!disposed) {
          if (!(error instanceof Error) || !/WebGL|webgl/.test(error.message)) console.warn('Using the demographic compatibility map after initialization failed.');
          mapRef.current?.remove(); mapRef.current = null;
          observer?.disconnect(); setMapError(''); setViewMode('2d'); setPitch(0); setCompatibility(true);
        }
      }
    }
    void init();
    return () => { disposed = true; observer?.disconnect(); mapRef.current?.remove(); mapRef.current = null; releaseProtocol?.(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer('demo-fill')) return;
    const filter: FilterSpecification = ['all', ...(minOwners > 0 ? [['>=', ['coalesce', ['get', 'owner_pct'], -1], minOwners]] : []), ...(minIncome > 0 ? [['>=', ['coalesce', ['get', 'income'], -1], minIncome]] : [])] as FilterSpecification;
    for (const layer of polygonLayers) map.setLayoutProperty(layer, 'visibility', metric === 'none' ? 'none' : 'visible');
    for (const layer of ['demo-fill', 'demo-border']) map.setFilter(layer, filter);
    map.setFilter('demo-highlight', ['all', filter, ['==', ['get', 'GEOID'], selectedTract?.GEOID ?? '']] as FilterSpecification);
    if (metric !== 'none') map.setPaintProperty('demo-fill', 'fill-color', colorExpression(metric));
    map.setPaintProperty('demo-fill', 'fill-opacity', opacity);
    (map.getSource('demo-pins') as GeoJSONSource).setData(pinData);
  }, [ready, metric, opacity, minOwners, minIncome, selectedTract?.GEOID, pinData]);

  useEffect(() => {
    setHovered(null);
    setLocked(previous => {
      if (previous.pinId && eligibleIds.has(previous.pinId)) return previous;
      const first = metrics.eligible[0];
      return first ? { pinId: first.id, tractId: first.tractId ?? undefined } : {};
    });
  }, [minOwners, minIncome, eligibleIds, metrics.eligible]);

  const choosePin = (id: string) => {
    const pin = PINS.find(p => p.id === id);
    setFocusPinId(pin?.id);
    setHovered(null); setLocked(pin ? { pinId: pin.id, tractId: pin.tractId ?? undefined } : {});
    if (pin && ready) mapRef.current?.easeTo({ center: [pin.lng, pin.lat], ...(viewMode === '3d' ? { zoom: Math.max(BUILDING_ZOOM, mapRef.current?.getZoom() ?? BUILDING_ZOOM) } : {}), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400 });
  };

  const changeView = (next: MapViewMode) => {
    if (!ready || (compatibility && next === '3d')) return;
    setHovered(null); setViewMode(next);
    const map = mapRef.current;
    if (!map) { setResetKey(key => key + 1); return; }
    map.setLayoutProperty(BUILDING_LAYER_ID, 'visibility', next === '3d' ? 'visible' : 'none');
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650;
    if (next === '2d') {
      map.fitBounds(GRID_BOUNDS, { padding: 45, maxZoom: 11.25, pitch: 0, bearing: 0, duration });
    } else {
      const pin = metrics.eligible.find(p => p.id === locked.pinId);
      const center: [number, number] = pin ? [pin.lng, pin.lat] : [map.getCenter().lng, map.getCenter().lat];
      map.easeTo({ ...neighborhoodCamera(center), duration });
    }
  };

  const rotate = (degrees: number) => {
    const map = mapRef.current;
    if (map) map.easeTo({ bearing: map.getBearing() + degrees, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300 });
  };

  return <main className="demographic-demo">
    <div className="demo-sandbox-banner"><p><b>⚡ LIVE SANDBOX MODE</b> Test-drive the Buying-Power Geo-Grid below with zero credits required. Want a live Android device scan of your market?</p><a href={SPRINT_URL}>Claim 1 of 12 Done-For-You Sprint Spots →</a></div>
    <div className="demo-heading"><div><p className="demo-eyebrow">STAKEOUT SEARCH · BUYING-POWER GEO-GRID™ + AI CITATION TRACKER</p><h1>Stop Chasing Green Pins in Broke Zip Codes.</h1><p>A standard grid gives every coordinate equal weight. Your market isn’t that simple. See U.S. Census income, homeownership and housing age beneath Google Maps and AI visibility scenarios—then bring real Android video receipts into your next client conversation.</p></div><span className="demo-location"><span /> Lakeland, Florida</span></div>
    <div className="demo-disclosure"><b>VERIFIED CENSUS DATA</b><span>{demo.metadata.tractCount} Polk County tracts · Income, homeownership &amp; housing age · 2019–2023 ACS estimates</span><span className="demo-disclosure-divider" /><b>INTERACTIVE SANDBOX</b><span>49 sample pins · Simulated rankings &amp; AI citation rings · Optional 3D buildings · No credits used</span></div>
    <section className="demo-controls" aria-label="Map controls">
      <div className="demo-layer-control"><span className="demo-label">1. Choose Your Buyer Layer</span><div className="demo-segments">{(['income', 'owner_pct', 'year_built', 'none'] as MetricKey[]).map(key => <button key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{key === 'none' ? 'Map Only' : METRICS[key].label}</button>)}</div></div>
      <label className="demo-scenario"><span className="demo-label">2. Compare Territory Value</span><select value={scenario} onChange={e => setScenario(e.target.value as Scenario)}><option value="south">Southside Dominance</option><option value="north">Northside Dominance</option></select></label>
      <label className="demo-opacity"><span className="demo-label">Overlay opacity <b>{Math.round(opacity * 100)}%</b></span><input aria-label="Overlay opacity" type="range" min="0.1" max="0.8" step="0.05" value={opacity} disabled={metric === 'none'} onChange={e => setOpacity(Number(e.target.value))} /></label>
    </section>
    <section className="demo-scoreboard" aria-label="Visibility metrics" aria-live="polite">
      <div><span className="demo-label">What Old Rank Trackers Show <b>Standard SoLV</b></span><strong>{formatPercent(metrics.standard)}</strong><p>{metrics.top3} of {metrics.eligible.length} sample pins rank Top 3. Every pin counts equally, regardless of the neighborhood underneath it.</p></div>
      <div className="demo-weighted"><span className="demo-label">Visibility Where Buying Power Matters <b>Buying-Power SoLV</b> <span className="demo-tag">MODELED VISIBILITY</span></span><strong>{formatPercent(metrics.weighted)} <small>{metrics.delta !== null ? `${metrics.delta >= 0 ? '+' : ''}${metrics.delta.toFixed(1)} pp vs. standard` : '—'}</small></strong><p>Weighted by owner-occupied homes × median household income. See how the same rankings change when neighborhood context counts.</p></div>
      <div className="demo-coverage"><span className="demo-label">Active Target Footprint</span><strong>{metrics.eligible.length}<small> / 49 sample pins</small></strong><p>{metrics.representedTracts} distinct Census tracts · {metrics.weightedPins} pins with usable weights. Filters refine the area you’re comparing.</p></div>
    </section>
    <div className="demo-workspace">
      <section className="demo-map-section" aria-label="Demographic map">
        <div className="demo-map-toolbar"><span><span className="demo-live-dot" /> {config?.title ?? 'Rank pins only'}</span><div className="demo-view-buttons" aria-label="Map perspective"><button aria-pressed={viewMode === '2d'} onClick={() => changeView('2d')} disabled={!ready}>2D grid</button><button aria-pressed={viewMode === '3d' && !compatibility} onClick={() => changeView('3d')} disabled={!ready || compatibility} aria-describedby="demo-view-help">3D buildings</button><button onClick={() => changeView(viewMode)} disabled={!ready}>Reset view ↗</button></div></div>
        <div className="demo-view-help" id="demo-view-help">{compatibility ? '3D buildings require WebGL. This browser is using the 2D map.' : 'Explore a neighborhood in 3D, or return to the full 2D grid. Building heights are approximate.'} Scores cover the entire filtered grid, including pins outside the current view.</div>
        {viewMode === '3d' && !compatibility && <div className="demo-3d-tools" aria-label="3D camera controls"><button aria-label="Rotate map left" onClick={() => rotate(-30)} disabled={!ready}>↶ Rotate</button><button aria-label="Rotate map right" onClick={() => rotate(30)} disabled={!ready}>Rotate ↷</button><label><span>Tilt <b>{pitch}°</b></span><input type="range" min="0" max="65" step="5" value={pitch} aria-label="Map tilt" disabled={!ready} onChange={e => { const value = Number(e.target.value); setPitch(value); mapRef.current?.setPitch(value); }} /></label><span>Use the compass to face north.</span></div>}
        <div className="demo-map-wrap">{compatibility ? <CompatibilityMap tracts={TRACTS} pins={metrics.eligible} scenario={scenario} metric={metric} opacity={opacity} showAI={showAI} filters={{ minOwners, minIncome }} colors={(config ?? METRICS.income).colors} stops={(config ?? METRICS.income).stops} highlightId={selectedTract?.GEOID} focusPinId={focusPinId} resetKey={resetKey} onHover={setHovered} onSelect={setLocked} onReady={() => setReady(true)} /> : <div ref={container} className="demo-map-canvas" role="region" aria-label="Interactive Lakeland map. Use the pin selector for keyboard access to the same data." />}{!ready && !mapError && !compatibility && <div className="demo-map-message" role="status">Loading the map and static Census data…</div>}{mapError && <div className="demo-map-message demo-map-error" role="alert">{mapError}</div>}<div className="demo-map-caption">Hover to inspect. Click a tract or pin to keep it selected.</div></div>
        <div className="demo-legends"><div className="demo-metric-legend">{config ? <><span>{config.title}</span><div className="demo-color-ramp">{config.colors.map((color, i) => <div key={color}><i style={{ background: color }} /><small>{config.labels[i]}</small></div>)}</div><small className="demo-missing-key"><i /> Missing estimate</small></> : <span>Demographic overlay is off. Filters still apply.</span>}</div><div className="demo-rank-legend"><span>Simulated rank</span><div><span><i style={{ background: '#6ce2ac' }} />1–3</span><span><i style={{ background: '#f1d27b' }} />4–10</span><span><i style={{ background: '#ef996f' }} />11–20</span><span><i style={{ background: '#b1b8c1' }} />20+</span></div><label><input type="checkbox" checked={showAI} onChange={e => setShowAI(e.target.checked)} /><i className="demo-ai-ring" /> Simulated AI citation rings</label></div></div>
      </section>
      <aside className="demo-inspector" aria-label="Neighborhood inspector">
        <p className="demo-eyebrow">FORENSIC TERRITORY DOSSIER</p><h2>{selectedPin ? `Grid pin ${selectedPin.id}` : selectedTract ? selectedTract.NAMELSAD : 'No pins match'}</h2>
        <label className="demo-pin-selector"><span className="demo-label">Select a sample pin</span><select value={selectedPin?.id ?? ''} onChange={e => choosePin(e.target.value)}><option value="" disabled>{metrics.eligible.length ? 'Choose a pin' : 'No matching pins'}</option>{metrics.eligible.map(p => <option key={p.id} value={p.id}>{p.id} · Rank {pinRank(p, scenario) > 20 ? '20+' : pinRank(p, scenario)}</option>)}</select></label>
        {selectedPin && <div className="demo-pin-detail"><div><b>#{pinRank(selectedPin, scenario) > 20 ? '20+' : pinRank(selectedPin, scenario)}</b><span>Simulated rank</span></div><p>{selectedPin.lat.toFixed(4)}, {selectedPin.lng.toFixed(4)}{showAI && selectedPin.aiCited && <small><i className="demo-ai-ring" /> Simulated AI citation</small>}</p></div>}
        {selectedTract ? <><div className="demo-tract-title"><b>{selectedTract.NAMELSAD}</b><span>GEOID {selectedTract.GEOID}</span></div><dl className="demo-tract-stats"><div><dt>Median household income</dt><dd><Estimate value={selectedTract.income} moe={selectedTract.income_moe} annotation={selectedTract.income_annotation} money /></dd></div><div><dt>Owner-occupied share</dt><dd><strong>{formatPercent(selectedTract.owner_pct)}</strong><small>{formatCount(selectedTract.owner_units)} of {formatCount(selectedTract.occupied_units)} occupied homes</small></dd></div><div><dt>Median home value</dt><dd><Estimate value={selectedTract.home_value} moe={selectedTract.home_value_moe} annotation={selectedTract.home_value_annotation} money /></dd></div><div><dt>Median year built</dt><dd><Estimate value={selectedTract.year_built} moe={selectedTract.year_built_moe} annotation={selectedTract.year_built_annotation} year /></dd></div></dl><div className="demo-secondary-stats"><span>Poverty rate <b>{formatPercent(selectedTract.poverty_pct)}</b></span><span>Unemployment <b>{formatPercent(selectedTract.unemp_pct)}</b></span></div><div className="demo-territory-context"><b>Why this pin matters</b><p>This tract’s {formatPercent(selectedTract.owner_pct)} homeowner share and {formatMoney(selectedTract.income)} median household income add context to a ranking pin.{validNumber(selectedTract.year_built) && <> Its median housing unit was built in {selectedTract.year_built}—a starting point for a home-service market conversation, not evidence of a roof’s condition.</>}</p></div><p className="demo-inspector-note">ACS estimates describe a tract, not a household, equity or purchase intent. Year built does not establish roof, HVAC or plumbing age. Dollar values are in 2023 dollars; shown margins of error are 90% intervals.</p></> : <p className="demo-inspector-note">{selectedPin ? 'This pin does not intersect a cartographic tract polygon. Its rank is included in Standard SoLV; it is excluded from Weighted SoLV.' : 'Lower the filters to bring sample pins back into view.'}</p>}
        <div className="demo-receipt-note"><span>📱 EVERY DATA POINT COMES WITH A RECEIPT</span><p>Move from a colored pin to what the phone actually displayed. Live Stakeout campaigns pair observations with Android screen recordings, so clients can inspect the captured search result.</p><small>These sample rankings and AI citations are simulated. No phone recordings are attached to this sandbox.</small><a href={SPRINT_URL}>Get a live market audit →</a></div>
      </aside>
    </div>
    <section className="demo-filters" aria-label="Neighborhood filters"><div><h2>Filter Out the Tire-Kickers.</h2><p>Try 70%+ homeowners or $100,000+ median income to focus on your target neighborhoods. Watch the footprint and both visibility scores update instantly.</p></div><label><span className="demo-label">Minimum homeowner share <b>{minOwners}%</b></span><input aria-label="Minimum homeowner share" type="range" min="0" max="90" step="10" value={minOwners} onChange={e => setMinOwners(Number(e.target.value))} /></label><label><span className="demo-label">Minimum tract median income</span><select value={minIncome} onChange={e => setMinIncome(Number(e.target.value))}><option value="0">All income estimates</option><option value="75000">$75,000+</option><option value="100000">$100,000+</option><option value="150000">$150,000+</option></select></label><button className="demo-reset" onClick={() => { setMinOwners(0); setMinIncome(0); }}>Clear filters</button></section>
    <DemoSalesSections />
    <details className="demo-methods"><summary>Sources, score methodology &amp; demo limits <span>+</span></summary><div><section><h3>Real estimates. Matched vintage.</h3><p>{demo.metadata.tractCount} Polk County Census tracts combine <a href="https://www.census.gov/programs-surveys/acs/data/summary-file.Getting_Started.html" target="_blank" rel="noreferrer">2019–2023 ACS 5-year tables</a> with <a href={demo.metadata.sourceUrls[0]} target="_blank" rel="noreferrer">2023 Census cartographic boundaries</a>. Tables: B19013, B25077, B25003, B23025, B17001 and B25035. These historical estimates are not the latest release.</p><p>Coordinates use WGS84; the display uses Web Mercator. Boundaries are generalized at 1:500,000 and simplified in tiles. They are unsuitable for parcel or individual-household decisions. Pin joins use the original cartographic polygons, so a simplified display edge can differ slightly.</p></section><section><h3>What the scores measure</h3><p><b>Standard SoLV:</b> top-3 pins ÷ all filtered sample pins. <b>Weighted SoLV:</b> top-3 weight ÷ total usable weight. Each represented tract receives a modeled weight of owner-occupied homes × median household income, divided equally among its filtered pins to avoid counting that tract repeatedly.</p><p>The difference is in percentage points (pp). Weights describe whole represented tracts, not households inside the grid footprint. Missing or zero weights are excluded, never replaced with guessed values; coverage appears above. Rates use the table’s proper denominator. Ratio and composite-score margins of error are not calculated. Median year built refers to housing units, not residents’ age.</p></section><section><h3>A static pitch sandbox</h3><p>Both ranking patterns and every AI citation ring are simulated. Demographic controls run in your browser. A {(demo.metadata.tileBytes / 1048576).toFixed(2)} MB PMTiles archive supplies polygons through HTTP range requests; there are no Census API or database calls from this map. Base map and 3D buildings: OpenFreeMap, OpenMapTiles and OpenStreetMap contributors. Building heights are approximate, coverage varies, and buildings are separate from the tract-level ACS year-built estimates. Browsers without WebGL use a 2D compatibility view with simplified county geometry plus locally hosted 2023 TIGER/Line roads and water features. This compatibility view makes no requests to external basemap servers.</p><p>Income and homeownership provide neighborhood context, not measured purchasing intent. A homeowner threshold does not identify industrial land or whether someone needs a roof. No demographic data is inferred about Google accounts.</p></section></div></details>
  </main>;
}
