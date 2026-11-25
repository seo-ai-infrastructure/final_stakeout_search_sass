'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Spot = { label: string; lat: number; lng: number };

/** "30.2672, -97.7431" typed as coordinates. */
function typedCoordinates(q: string): Spot | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(q);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { label: lat.toFixed(5) + ', ' + lng.toFixed(5), lat, lng } : null;
}

type Business = { id: string; name: string; centerLabel: string; centerLat: number; centerLng: number; keywords: string[]; targetType: string; kgmid?: string | null; domain?: string | null };

/** Admin: run one free point (optionally on one phone) to test a template in minutes. */
export function TestPointCard() {
  const [list, setList] = useState<Business[]>([]);
  const [phones, setPhones] = useState<string[]>([]);
  const [bizId, setBizId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [phone, setPhone] = useState('');
  const [surface, setSurface] = useState('mobile_chrome');
  const [network, setNetwork] = useState('residential');
  const [state, setState] = useState<{ busy: boolean; scanId?: string; error?: string }>({ busy: false });
  // Where the search is made from: the business's centre unless another place is chosen here.
  const [spot, setSpot] = useState<Spot | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [found, setFound] = useState<Spot[]>([]);
  const [placeNote, setPlaceNote] = useState('');
  const [finding, setFinding] = useState(false);
  useEffect(() => {
    fetch('/api/businesses').then((r) => (r.ok ? r.json() : { businesses: [] })).then((d) => {
      setList(d.businesses ?? []);
      const first = d.businesses?.[0];
      if (first) { setBizId(first.id); setKeyword(first.keywords[0] ?? ''); }
    }).catch(() => {});
    fetch('/api/admin/devices', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).then((d: { devices?: { imageId: string; offlineAt?: string | null }[] }) => {
      setPhones(((d.devices ?? []) as { imageId: string; offlineAt?: string | null }[]).filter((x) => !x.offlineAt).map((x) => x.imageId));
    }).catch(() => {});
  }, []);
  const biz = list.find((b) => b.id === bizId);
  async function findPlace() {
    const q = placeQuery.trim();
    if (!q) return;
    setPlaceNote(''); setFound([]);
    const typed = typedCoordinates(q);
    if (typed) { setSpot(typed); setPlaceQuery(''); return; }
    setFinding(true);
    try {
      // The same place search as New scan (US places), nearest the business first.
      const near = biz ? `&lat=${biz.centerLat}&lon=${biz.centerLng}` : '';
      const d = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en${near}`).then((r) => r.json());
      const hits: Spot[] = ((d.features ?? []) as { properties?: Record<string, string>; geometry: { coordinates: [number, number] } }[])
        .filter((f) => f.properties?.countrycode === 'US')
        .slice(0, 5)
        .map((f) => {
          const p = f.properties ?? {};
          const street = [p.housenumber, p.street].filter(Boolean).join(' ');
          const label = [p.name || street, p.name && street, p.city || p.county, [p.state, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
          return { label: label || q, lat: Number(f.geometry.coordinates[1].toFixed(6)), lng: Number(f.geometry.coordinates[0].toFixed(6)) };
        });
      if (hits.length === 1) { setSpot(hits[0]); setPlaceQuery(''); }
      else if (hits.length) setFound(hits);
      else setPlaceNote('No US place found for that. Try a ZIP code, a full address, or coordinates like 30.2672, -97.7431.');
    } catch {
      setPlaceNote('Place search is unavailable right now. Enter coordinates like 30.2672, -97.7431.');
    } finally {
      setFinding(false);
    }
  }
  async function run() {
    if (!biz || !keyword.trim()) return;
    setState({ busy: true });
    const res = await fetch('/api/admin/test-point', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: keyword.trim(), targetBusiness: biz.name, targetKgmid: biz.kgmid ?? undefined, targetDomain: biz.domain ?? undefined, centerLat: spot?.lat ?? biz.centerLat, centerLng: spot?.lng ?? biz.centerLng, targetType: surface, network, imageId: phone || undefined }),
    });
    const d = await res.json().catch(() => ({}));
    setState(res.ok ? { busy: false, scanId: d.scanId } : { busy: false, error: d.error ?? 'Could not start the test point.' });
  }
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="text-base font-bold">Test one point</h2>
      <p className="mt-1 text-sm text-slate-400">One free search, set up exactly like a real scan, at the business’s centre or at any place you choose. Use it to test a template in a few minutes.</p>
      {!list.length ? (
        <p className="mt-4 text-sm text-slate-400">Save a business in New scan first.</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_170px_150px_160px_auto] md:items-end">
          <label className="text-sm text-slate-300">Business
            <select value={bizId} onChange={(e) => { setBizId(e.target.value); setKeyword(list.find((b) => b.id === e.target.value)?.keywords[0] ?? ''); }} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white">
              {list.map((b) => <option key={b.id} value={b.id}>{b.name}{b.centerLabel ? ' · ' + b.centerLabel : ''}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">Keyword
            <input list="test-point-keywords" value={keyword} onChange={(e) => setKeyword(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" />
            <datalist id="test-point-keywords">{biz?.keywords.map((k) => <option key={k} value={k} />)}</datalist>
          </label>
          <label className="text-sm text-slate-300">Surface
            <select value={surface} onChange={(e) => setSurface(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white">
              <option value="mobile_chrome">Google Chrome</option>
              <option value="mobile_maps">Google Maps app</option>
              <option value="mobile_google">Google app</option>
              <option value="mobile_apple">Apple Maps</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">Network
            <select value={network} onChange={(e) => setNetwork(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white">
              <option value="residential">Home internet</option>
              <option value="mobile">Mobile data</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">Phone
            <select value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white">
              <option value="">Any free phone</option>
              {phones.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <button type="button" onClick={run} disabled={state.busy || !keyword.trim()} className="min-h-[42px] rounded-lg bg-emerald-400 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50">
            {state.busy ? 'Starting…' : 'Run test point'}
          </button>
        </div>
      )}
      {list.length > 0 && (
        <div className="mt-4 border-t border-slate-800 pt-4">
          <p className="text-sm text-slate-300">
            Searching from: <span className="font-semibold text-white">{spot ? spot.label : (biz?.centerLabel || 'the business’s centre') + ' (the business’s centre)'}</span>
            {spot && <span className="text-slate-500"> · {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}</span>}
            {spot && (
              <button type="button" onClick={() => { setSpot(null); setFound([]); setPlaceNote(''); }} className="ml-3 text-emerald-300 underline hover:text-emerald-200">Use the business’s centre</button>
            )}
          </p>
          <form onSubmit={(e) => { e.preventDefault(); void findPlace(); }} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="min-w-[240px] flex-1 text-sm text-slate-300">Search from somewhere else
              <input value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} placeholder="ZIP code, address, city, or 30.2672, -97.7431" autoComplete="off" className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white placeholder:text-slate-600" />
            </label>
            <button type="submit" disabled={finding || !placeQuery.trim()} className="min-h-[38px] rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-100 hover:border-slate-500 disabled:opacity-50">{finding ? 'Finding…' : 'Find place'}</button>
          </form>
          {found.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-800 rounded-lg border border-slate-800" aria-label="Places found">
              {found.map((f) => (
                <li key={f.lat + ',' + f.lng}>
                  <button type="button" onClick={() => { setSpot(f); setFound([]); setPlaceQuery(''); }} className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">{f.label}</button>
                </li>
              ))}
            </ul>
          )}
          {placeNote && <p role="alert" className="mt-2 text-sm text-amber-200">{placeNote}</p>}
        </div>
      )}
      {state.scanId && (
        <p role="status" className="mt-3 text-sm text-emerald-300">
          Test point started (free). Results in about 3–6 minutes:{' '}
          <Link className="underline" href={'/scans/' + state.scanId}>open its report</Link>, then the Evidence tab.
        </p>
      )}
      {state.error && <p role="alert" className="mt-3 text-sm text-red-300">{state.error}</p>}
    </section>
  );
}
