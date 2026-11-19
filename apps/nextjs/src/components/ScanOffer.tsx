'use client';
import { useEffect, useState } from 'react';

type Item = { key: string; name: string; credits: number; cents: number };
const usd = (cents: number) => '$' + (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));
/** Where the new-scan page finds what to fill in after a payment, since the address comes back bare. */
export const SCAN_PREFILL = 'stakeout.scanPrefill';
const POINTS = 25;

/** The new-scan address for one search: a 5×5 grid, 3 miles between points. */
export const offerQuery = (query: string, businessName: string) => new URLSearchParams([...(businessName ? [['name', businessName]] : []), ['kw', query], ['grid', '5'], ['miles', '3']]).toString();

/**
 * From a search the account's own numbers single out: what a scan of it shows, what it costs, and
 * the way straight into one. With enough credits it opens the new scan; without, the cheapest pack
 * is paid for first (the welcome pack for a first purchase) and the scan is waiting on the way back.
 */
export default function ScanOffer({ query, businessName, why, onClose }: { query: string; businessName: string; why: string; onClose: () => void }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetch('/api/user/me', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setBalance(Number(j.creditBalance) || 0); }).catch(() => {});
    fetch('/api/billing/checkout').then((r) => r.json()).then((d) => {
      if (!live) return;
      const all: Item[] = d.packs ?? [];
      // A first purchase gets the welcome pack; after that, the two smallest packs.
      const welcome = all.find((i) => i.key === 'welcome');
      const list = welcome ? [welcome] : all.filter((i) => i.key === 'pack-25' || i.key === 'pack-100');
      setItems(d.ready === false ? [] : list);
      setPick(list[0]?.key ?? '');
    }).catch(() => { if (live) setItems([]); });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { live = false; window.removeEventListener('keydown', esc); };
  }, [onClose]);

  const q = offerQuery(query, businessName);
  const enough = balance !== null && balance >= POINTS;
  const chosen = items?.find((i) => i.key === pick);
  async function pay() {
    setBusy(true); setError('');
    try {
      try { window.sessionStorage.setItem(SCAN_PREFILL, JSON.stringify({ q, at: Date.now() })); } catch { /* the scan can still be set up by hand */ }
      const r = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: pick, returnTo: '/new-scan' }) });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || 'Checkout could not start.');
      window.location.assign(d.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Scan this search" onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-slate-800 bg-slate-900 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">See it on a real phone</p>
            <h3 className="mt-1 break-words text-lg font-bold text-slate-100">“{query}”</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">Close</button>
        </div>
        <p className="text-sm text-slate-300">{why}</p>
        <p className="text-sm text-slate-400">Search Console says where your page ranks, not what sits above it. A scan sends real Android phones to {POINTS} points around the business, runs this search in Google on each, and records the screen: the map pack, the AI Overview, the ads, and where you are among them.</p>
        <dl className="grid grid-cols-3 gap-2 text-center text-xs">
          {[['Grid', '5 × 5'], ['Between points', '3 miles'], ['Cost', `${POINTS} credits`]].map(([k, v]) => <div key={k} className="rounded-lg border border-slate-800 bg-slate-950 p-2"><dt className="text-slate-500">{k}</dt><dd className="mt-0.5 font-semibold text-slate-100">{v}</dd></div>)}
        </dl>
        {balance === null || items === null ? <div className="h-24 animate-pulse rounded-lg bg-slate-800/50" /> : enough ? (
          <>
            <p className="text-sm text-slate-400">You have {balance.toLocaleString()} credits.</p>
            <a href={'/new-scan?' + q} className="rounded-xl bg-emerald-400 px-4 py-3 text-center text-[15px] font-extrabold text-slate-950 hover:bg-emerald-300">Set up the scan · {POINTS} credits</a>
          </>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-400">Checkout is being set up. Email sass@stakeoutsearch.com and we will sort it out.</p>
        ) : (
          <>
            <p className="text-sm text-slate-400">You have {balance.toLocaleString()} credit{balance === 1 ? '' : 's'}; this scan takes {POINTS}.</p>
            <div role="radiogroup" aria-label="Credits to buy" className="space-y-2">
              {items.map((i) => (
                <label key={i.key} className={'flex cursor-pointer items-center gap-3 rounded-lg border p-3 ' + (pick === i.key ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 hover:bg-slate-800')}>
                  <input type="radio" name="offer-pack" checked={pick === i.key} onChange={() => setPick(i.key)} />
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-100">{i.name}</span><span className="block text-xs text-slate-400">{i.credits} credits{i.key === 'welcome' ? ' · your first purchase, once' : i.credits > POINTS ? ` · this scan and ${Math.floor(i.credits / POINTS) - 1} more like it` : ' · this scan'}</span></span>
                  <span className="shrink-0 font-bold text-slate-100">{usd(i.cents)}</span>
                </label>
              ))}
            </div>
            <button type="button" onClick={pay} disabled={busy || !chosen} className="rounded-xl bg-emerald-400 px-4 py-3 text-[15px] font-extrabold text-slate-950 hover:bg-emerald-300 disabled:opacity-60">{busy ? 'Opening secure checkout…' : chosen ? `Pay ${usd(chosen.cents)} and set up the scan` : 'Choose a pack'}</button>
            <p className="text-center text-xs text-slate-500">Card payment on Stripe’s secure page. You come back to the scan, filled in.</p>
          </>
        )}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      </aside>
    </div>
  );
}
