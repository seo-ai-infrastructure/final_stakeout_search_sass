'use client';
import { useEffect, useState } from 'react';
import SearchInsights from '@/components/SearchInsights';

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const KEY = 'stakeout.website';
const bare = (w: string) => w.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/**
 * The free part: Search Console and Analytics for a website, through our own Google sign-in. The
 * visitor picks one of the websites their Google login has in Search Console. Where a listing's
 * own numbers would be, `locked` says what the paid plan adds.
 */
export default function WebsiteInsights({ locked, onUnlock }: { locked?: React.ReactNode; /** For an account with no listing on a plan: the way to one, offered beside its own numbers. */ onUnlock?: () => void }) {
  const [sites, setSites] = useState<string[] | null>(null);
  const [website, setWebsite] = useState('');
  const [typed, setTyped] = useState('');

  useEffect(() => {
    let live = true;
    let kept = '';
    try { kept = window.localStorage.getItem(KEY) ?? ''; } catch { /* private window: nothing is remembered */ }
    fetch('/api/admin/google/sites', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((j: { sites?: string[] }) => {
        if (!live) return;
        const list = j.sites ?? [];
        setSites(list);
        setWebsite(kept && (list.includes(kept) || !list.length) ? kept : list[0] ?? kept);
      })
      .catch(() => { if (live) { setSites([]); setWebsite(kept); } });
    return () => { live = false; };
  }, []);

  const choose = (w: string) => {
    setWebsite(w);
    try { window.localStorage.setItem(KEY, w); } catch { /* not remembered */ }
  };
  const add = () => {
    const w = typed.trim();
    if (!w) return;
    choose(/^https?:\/\//.test(w) ? w : 'https://' + w.replace(/^\/+/, ''));
    setTyped('');
  };

  return (
    <div className="space-y-5">
      {sites !== null && (sites.length > 1 || (sites.length === 0 && website === '')) && (
        <div className={card + ' flex flex-wrap items-center gap-3'}>
          <span className="text-sm font-semibold">Website</span>
          {sites.length > 1 ? (
            <select aria-label="Website" value={website} onChange={(e) => choose(e.target.value)} className="max-w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500">
              {sites.map((s) => <option key={s} value={s}>{bare(s)}</option>)}
            </select>
          ) : (
            <>
              <input aria-label="Your website address" className="w-72 max-w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500" placeholder="yourbusiness.com" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button type="button" onClick={add} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500">Show it</button>
              <span className="text-xs text-slate-500">Once Google is connected, the websites in your Search Console are listed here.</span>
            </>
          )}
        </div>
      )}
      <SearchInsights businessName="" place="" website={website} below={locked} onUnlock={onUnlock} wholeSite />
    </div>
  );
}

/**
 * Where a listing's calls and direction requests would be, for an account with no listing on the
 * paid plan: what is behind the lock, the price, and the way in.
 */
export function LockedListingCard({ onUpgrade, connected }: { onUpgrade: () => void; connected: boolean }) {
  const tick = <svg viewBox="0 0 16 16" width="16" height="16" className="mt-0.5 shrink-0 text-emerald-400" aria-hidden><path fill="currentColor" d="M6.4 11.2 3.3 8.1l1.1-1.1 2 2 5.2-5.2 1.1 1.1z" /></svg>;
  // Whether the $5 first scan is still on offer to this account (it is once, before any purchase).
  const [first, setFirst] = useState<boolean | null>(null);
  useEffect(() => {
    fetch('/api/billing/checkout').then((r) => (r.ok ? r.json() : null)).then((d: { packs?: { key: string }[] } | null) => setFirst(Boolean(d?.packs?.some((p) => p.key === 'welcome')))).catch(() => setFirst(false));
  }, []);
  // The scan offer lives with the Search Console numbers, which know the search to start on. When
  // that section is not on the page (Google not connected yet), the new-scan page opens instead.
  const scan = () => {
    const detail = { handled: false };
    window.dispatchEvent(new CustomEvent('stakeout:scan-offer', { detail }));
    if (!detail.handled) window.location.assign('/new-scan?grid=5&miles=3');
  };
  return (
    <section className={card}>
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100"><Lock /> Google Business Profile</h3>
      <p className="mt-0.5 text-xs text-slate-500">Your listing on Google Maps and Search. Two ways to start:</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/5 p-4">
          <button type="button" onClick={scan} className="w-full rounded-lg bg-emerald-400 px-4 py-3 text-sm font-extrabold text-slate-950 hover:bg-emerald-300">See who is beating you on Google Maps · {first ? '$5 first scan, 25 phone sessions' : '25 phone sessions'}</button>
          <p className="mt-2 text-xs text-slate-400">A 5×5 grid of real phones around your business, each one running your most-shown search in Google and recording the screen: the map pack, the AI Overview, and where you are.</p>
        </div>
        <div className="rounded-lg border border-slate-700 p-4">
          <button type="button" onClick={onUpgrade} className="w-full rounded-lg border border-emerald-400/70 px-4 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/10">{connected ? 'Choose my listing →' : 'Connect my Google Business Profile →'}</button>
          <p className="mt-2 text-xs text-slate-400">Track map calls, see the gaps against rivals, and be told when your listing is edited · $29 a month per location, $22 from 10</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2 text-sm text-slate-200 sm:grid-cols-2">
        {['Calls, direction requests and the exact Maps searches', 'The categories, services and attributes rivals outranking you have and you do not', 'Scheduled Google posts and a review inbox', 'A daily watchdog: told when Google or anyone else alters your listing'].map((t) => <li key={t} className="flex items-start gap-2">{tick}<span>{t}</span></li>)}
      </ul>
    </section>
  );
}

export function Lock() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" className="inline-block shrink-0 text-slate-500" aria-label="Locked" role="img">
      <path d="M8 1.5a3 3 0 0 0-3 3V6H4.5A1.5 1.5 0 0 0 3 7.5v5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.500 6H11V4.500a3 3 0 0 0-3-3Zm1.500 4.500h-3V4.500a1.500 1.500 0 0 1 3 0V6Z" />
    </svg>
  );
}
