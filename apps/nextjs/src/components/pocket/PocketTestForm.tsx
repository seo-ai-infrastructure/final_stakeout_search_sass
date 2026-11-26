'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { LocateFixed } from 'lucide-react';
import './pocket.css';

const PocketMap = dynamic(() => import('./PocketMap'), { ssr: false, loading: () => <div className="pk-map pk-map-wait">Loading the map…</div> });

type Spot = { lat: number; lng: number; label: string };
type Hit = { properties?: Record<string, string>; geometry: { coordinates: [number, number] } };
const labelOf = (p: Record<string, string>) => [[p.housenumber, p.street].filter(Boolean).join(' ') || p.name, p.city || p.county, [p.state, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');

/**
 * The $1 pocket test's form: the search to test, the business to look for, exactly where the
 * visitor is sitting, and where to send the result. "Run" opens Stripe's $1 checkout.
 */
export default function PocketTestForm({ cancelled }: { cancelled?: boolean }) {
  const [keyword, setKeyword] = useState('');
  const [business, setBusiness] = useState('');
  const [email, setEmail] = useState('');
  const [spot, setSpot] = useState<Spot | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Spot[]>([]);
  const [locating, setLocating] = useState(false);
  const [placeNote, setPlaceNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(cancelled ? 'Checkout was closed before paying, so nothing ran. Your details are below when you are ready.' : '');

  function useMine() {
    setPlaceNote(''); setHits([]);
    if (!navigator.geolocation) { setPlaceNote('This browser cannot share its location. Search for your address instead.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6)), lng = Number(pos.coords.longitude.toFixed(6));
        setSpot({ lat, lng, label: 'Your current location' });
        setLocating(false);
        // A readable name for the spot, when the place search has one.
        fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`).then((r) => r.json()).then((d: { features?: Hit[] }) => {
          const p = d.features?.[0]?.properties;
          if (p) setSpot((s) => (s && s.lat === lat && s.lng === lng ? { ...s, label: 'Near ' + labelOf(p) } : s));
        }).catch(() => {});
      },
      (e) => {
        setLocating(false);
        setPlaceNote(e.code === e.PERMISSION_DENIED ? 'Location is blocked for this site. Search for your address or ZIP code instead.' : 'Your location could not be read. Search for your address or ZIP code instead.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function find() {
    const q = query.trim();
    if (!q) return;
    setPlaceNote(''); setHits([]);
    try {
      const d = (await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`).then((r) => r.json())) as { features?: Hit[] };
      const found = (d.features ?? []).filter((f) => f.properties?.countrycode === 'US').slice(0, 5).map((f) => ({ lat: Number(f.geometry.coordinates[1].toFixed(6)), lng: Number(f.geometry.coordinates[0].toFixed(6)), label: labelOf(f.properties ?? {}) || q }));
      if (found.length === 1) { setSpot(found[0]); setQuery(''); }
      else if (found.length) setHits(found);
      else setPlaceNote('No US address found for that. Try a street address with its city, or a ZIP code.');
    } catch {
      setPlaceNote('Address search is unavailable right now. Use your current location instead.');
    }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!spot) { setError('Set where you are sitting first: use your current location or search for your address.'); return; }
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/pocket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyword, business, email, lat: spot.lat, lng: spot.lng, placeLabel: spot.label }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(d.error || 'The test could not be started. Try again.');
      window.location.assign(d.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The test could not be started. Try again.');
      setBusy(false);
    }
  }

  return (
    <form className="pk-form" onSubmit={run} noValidate>
      <label className="pk-field">Search to test
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="emergency plumber near me" maxLength={80} required autoComplete="off" />
      </label>
      <label className="pk-field">Business name <span className="pk-optional">(optional, to highlight your rank)</span>
        <input value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Stuart’s Plumbing" maxLength={100} autoComplete="organization" />
      </label>

      <fieldset className="pk-where">
        <legend>Where you are sitting right now</legend>
        <button type="button" className="pk-locate" onClick={useMine} disabled={locating}><LocateFixed size={17} aria-hidden="true" /> {locating ? 'Finding you…' : 'Use my exact current location'}</button>
        <div className="pk-search">
          <label className="pk-sr" htmlFor="pk-address">Or search for an address or ZIP code</label>
          <input id="pk-address" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void find(); } }} placeholder="Or type an address or ZIP code" autoComplete="off" />
          <button type="button" onClick={() => void find()} disabled={!query.trim()}>Find</button>
        </div>
        {hits.length > 0 && (
          <ul className="pk-hits" aria-label="Addresses found">
            {hits.map((h) => <li key={h.lat + ',' + h.lng}><button type="button" onClick={() => { setSpot(h); setHits([]); setQuery(''); }}>{h.label}</button></li>)}
          </ul>
        )}
        {placeNote && <p className="pk-note" role="alert">{placeNote}</p>}
        {spot && (
          <>
            <PocketMap lat={spot.lat} lng={spot.lng} onMove={(lat, lng) => setSpot({ lat, lng, label: 'Pin placed by hand' })} />
            <p className="pk-spot"><strong>{spot.label}</strong> <span>{spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}</span></p>
          </>
        )}
        <p className="pk-tip">Drop the pin where you are sitting right now, not at your storefront across town, so it matches the phone in your hand. Drag it to adjust.</p>
      </fieldset>

      <label className="pk-field">Email for your result link
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@agency.com" maxLength={254} required autoComplete="email" />
      </label>

      {error && <p className="pk-error" role="alert">{error}</p>}
      <button type="submit" className="pk-run" disabled={busy || !keyword.trim() || !email.trim()}>{busy ? 'Opening checkout…' : 'Run my pocket test · $1'}</button>
      <p className="pk-pay">Pay on Stripe with Apple Pay, Google Pay, Link or a card. One search, one dollar, no subscription. It takes about five minutes.</p>
      <p className="pk-guarantee"><strong>The receipt-for-receipt guarantee.</strong> Watch a real Android phone search your keyword on video. Pull out your own phone, on cellular and in a private tab, and check us side by side. If our results aren’t even close, email an uncropped screenshot of your phone within 10 minutes of your scan and we’ll refund your $1.</p>
    </form>
  );
}
