'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { FeatureCollection } from 'geojson';
import { type DemoPin, type Tract, type Scenario, type MetricKey, type Filters, pinRank, matchesFilters, validNumber } from '@/lib/demographics';
import 'leaflet/dist/leaflet.css';

type Selection = { pinId?: string; tractId?: string };
type Props = {
  tracts: Record<string, Tract>; pins: DemoPin[]; scenario: Scenario; metric: MetricKey;
  opacity: number; showAI: boolean; filters: Filters;
  colors: string[]; stops: number[]; highlightId?: string; focusPinId?: string; resetKey: number;
  onHover: (selection: Selection | null) => void; onSelect: (selection: Selection) => void; onReady: () => void;
};

function color(value: number | null | undefined, colors: string[], stops: number[]) {
  if (!validNumber(value)) return '#687680';
  let upper = stops.findIndex(stop => value <= stop);
  if (upper === -1) return colors[colors.length - 1];
  if (upper === 0) return colors[0];
  const fraction = (value - stops[upper - 1]) / (stops[upper] - stops[upper - 1]);
  const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const start = rgb(colors[upper - 1]), end = rgb(colors[upper]);
  return `rgb(${start.map((v, i) => Math.round(v + fraction * (end[i] - v))).join(',')})`;
}

export default function DemographicMapFallback(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const library = useRef<typeof Leaflet | null>(null);
  const polygons = useRef<Leaflet.GeoJSON | null>(null);
  const markers = useRef<Leaflet.LayerGroup | null>(null);
  const current = useRef(props); current.current = props;
  const [geometry, setGeometry] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false; let observer: ResizeObserver | undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        const L = (await import('leaflet')).default;
        if (disposed || !container.current) return;
        library.current = L;
        const m = L.map(container.current, { preferCanvas: false, scrollWheelZoom: false, minZoom: 8, maxZoom: 16, zoomControl: false });
        map.current = m;
        L.control.zoom({ position: 'topright' }).addTo(m);
        L.control.scale({ imperial: true, metric: false, position: 'bottomleft' }).addTo(m);
        const contextPane = m.createPane('census-context');
        contextPane.style.zIndex = '450'; contextPane.style.pointerEvents = 'none';
        m.attributionControl.addAttribution('<a href="https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.2023.html" target="_blank" rel="noreferrer">U.S. Census Bureau · 2023 TIGER/Line</a>');
        m.fitBounds([[27.9855, -82.011], [28.0935, -81.8886]], { padding: [45, 45], maxZoom: 12, animate: false });
        observer = new ResizeObserver(() => m.invalidateSize()); observer.observe(container.current);
        m.on('movestart', () => current.current.onHover(null));
        const responses = await Promise.all(['/data/polk-demographics-fallback.geojson', '/data/lakeland-context-2023.geojson'].map(url => fetch(url, { signal: controller.signal })));
        if (responses.some(response => !response.ok)) throw new Error('Static geometry unavailable');
        const [data, context] = await Promise.all(responses.map(response => response.json())) as [FeatureCollection, FeatureCollection];
        if (disposed) return;
        L.geoJSON(context, { pane: 'census-context', interactive: false, filter: feature => feature.properties.kind !== 'label', style: feature => feature?.properties.kind === 'water' ? { color: '#426e80', weight: 0.6, fillColor: '#173b4b', fillOpacity: 1, opacity: 0.8 } : { color: '#b6c2b6', weight: feature?.properties.class === 'S1100' ? 2 : 1, opacity: 0.55 } }).addTo(m);
        for (const feature of context.features) {
          if (feature.properties?.kind !== 'label' || feature.geometry.type !== 'Point') continue;
          const label = document.createElement('span'); label.textContent = String(feature.properties.name);
          const [lng, lat] = feature.geometry.coordinates;
          L.marker([lat, lng], { pane: 'census-context', interactive: false, keyboard: false, icon: L.divIcon({ className: `demo-context-label ${feature.properties.category === 'city' ? 'demo-context-city' : ''}`, html: label, iconSize: [130, 16], iconAnchor: [65, 8] }) }).addTo(m);
        }
        setGeometry(data); current.current.onReady();
      } catch { if (!disposed) setError('The compatibility map could not load. The pin selector and Census inspector are still available.'); }
    })();
    return () => { disposed = true; controller.abort(); observer?.disconnect(); map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const L = library.current, m = map.current;
    if (!L || !m || !geometry) return;
    polygons.current?.remove(); markers.current?.remove();
    if (props.metric !== 'none') {
      polygons.current = L.geoJSON(geometry, {
        filter: f => matchesFilters(props.tracts[f.properties.GEOID], props.filters),
        style: f => ({ fillColor: color(props.tracts[f?.properties.GEOID]?.[props.metric as Exclude<MetricKey, 'none'>], props.colors, props.stops), fillOpacity: props.opacity, color: '#d7ebe3', opacity: 0.6, weight: 0.8 }),
        onEachFeature: (f, layer) => {
          const selection = { tractId: String(f.properties.GEOID) };
          layer.on('mouseover', () => current.current.onHover(selection));
          layer.on('mouseout', () => current.current.onHover(null));
          layer.on('click', () => { current.current.onSelect(selection); current.current.onHover(null); });
        },
      }).addTo(m);
    } else polygons.current = null;
    const group = L.layerGroup();
    for (const pin of props.pins) {
      const rank = pinRank(pin, props.scenario);
      const background = rank <= 3 ? '#6ce2ac' : rank <= 10 ? '#f1d27b' : rank <= 20 ? '#ef996f' : '#b1b8c1';
      const label = rank > 20 ? '20+' : String(rank);
      const selection = { pinId: pin.id, tractId: pin.tractId ?? undefined };
      const marker = L.marker([pin.lat, pin.lng], { icon: L.divIcon({ className: 'demo-compat-pin', html: `<span style="background:${background};border-color:${props.showAI && pin.aiCited ? '#58d8ff' : '#142b2d'};border-width:${props.showAI && pin.aiCited ? 3 : 1.5}px">${label}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }), title: `${pin.id}: simulated rank ${label}`, alt: `${pin.id}: simulated rank ${label}`, keyboard: true });
      marker.on('mouseover', () => current.current.onHover(selection));
      marker.on('mouseout', () => current.current.onHover(null));
      marker.on('click', () => { current.current.onSelect(selection); current.current.onHover(null); });
      marker.addTo(group);
    }
    markers.current = group.addTo(m);
  }, [geometry, props.pins, props.scenario, props.metric, props.opacity, props.showAI, props.filters.minOwners, props.filters.minIncome, props.tracts, props.colors, props.stops]);

  useEffect(() => {
    polygons.current?.eachLayer(layer => {
      const polygon = layer as Leaflet.Path & { feature?: { properties: { GEOID: string } } };
      const selected = polygon.feature?.properties.GEOID === props.highlightId;
      polygon.setStyle({ color: selected ? '#fffce8' : '#d7ebe3', weight: selected ? 2.5 : 0.8, opacity: selected ? 1 : 0.6 });
      if (selected) polygon.bringToFront();
    });
  }, [geometry, props.highlightId, props.metric, props.opacity, props.filters.minOwners, props.filters.minIncome, props.pins, props.scenario, props.showAI]);

  useEffect(() => {
    if (geometry) map.current?.fitBounds([[27.9855, -82.011], [28.0935, -81.8886]], { padding: [45, 45], maxZoom: 12, animate: false });
  }, [geometry, props.resetKey]);

  useEffect(() => {
    const pin = current.current.pins.find(p => p.id === props.focusPinId);
    if (pin && geometry) map.current?.panTo([pin.lat, pin.lng], { animate: false });
  }, [geometry, props.focusPinId]);

  return <><div className="demo-map-canvas demo-compat-map" ref={container} role="region" aria-label="Interactive 2D Lakeland map" />{!geometry && !error && <div className="demo-map-message" role="status">Loading static Census map…</div>}{error && <div className="demo-map-message demo-map-error" role="alert">{error}</div>}<span className="demo-compat-badge">2D view · Static Census map</span></>;
}
