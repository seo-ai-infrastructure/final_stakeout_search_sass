'use client';
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { circleAround } from '@/lib/pocketInput';

const LOCK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

/**
 * The pocket test's map. In the form: one pin the visitor drags to where they are sitting
 * (onMove). On the result: their finished pin in the centre of the 21-pin circle, the other
 * twenty locked (locked, with the centre's rank as its label).
 */
export default function PocketMap({ lat, lng, onMove, locked, label }: { lat: number; lng: number; onMove?: (lat: number, lng: number) => void; locked?: boolean; label?: string }) {
  const box = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pin = useRef<maplibregl.Marker | null>(null);
  const moved = useRef(onMove);
  moved.current = onMove;

  useEffect(() => {
    if (!box.current) return;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: box.current,
        style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/dark',
        center: [lng, lat],
        zoom: locked ? 11.4 : 15.5,
        attributionControl: { compact: true },
        cooperativeGestures: true,
      });
    } catch {
      return;
    }
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const centre = document.createElement('div');
    centre.className = locked ? 'pk-pin pk-pin-open' : 'pk-pin pk-pin-me';
    if (locked) centre.textContent = label ?? '';
    pin.current = new maplibregl.Marker({ element: centre, draggable: Boolean(onMove) }).setLngLat([lng, lat]).addTo(m);
    if (onMove) pin.current.on('dragend', () => { const p = pin.current!.getLngLat(); moved.current?.(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))); });
    if (locked) {
      const around = circleAround(lat, lng);
      for (const p of around) {
        const el = document.createElement('div');
        el.className = 'pk-pin pk-pin-locked';
        el.innerHTML = LOCK;
        new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m);
      }
    }
    // The whole circle stays in view, whatever size the page gives the map (it is laid out after the map is made).
    const fit = () => {
      m.resize();
      if (!locked) return;
      const around = circleAround(lat, lng);
      const lats = around.map((p) => p.lat), lngs = around.map((p) => p.lng);
      m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 34, animate: false });
    };
    fit();
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    watch?.observe(box.current);
    return () => { watch?.disconnect(); m.remove(); map.current = null; pin.current = null; };
    // The map is made once; a new position moves its pin (below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  useEffect(() => {
    if (locked || !map.current || !pin.current) return;
    const at = pin.current.getLngLat();
    if (Math.abs(at.lat - lat) < 1e-6 && Math.abs(at.lng - lng) < 1e-6) return;
    pin.current.setLngLat([lng, lat]);
    map.current.easeTo({ center: [lng, lat], zoom: Math.max(map.current.getZoom(), 15), duration: 400 });
  }, [lat, lng, locked]);

  return <div ref={box} className="pk-map" role="application" aria-label={locked ? 'Map: your finished pin in the centre and twenty locked pins a mile apart around it' : 'Map: drag the pin to exactly where you are sitting'} />;
}
