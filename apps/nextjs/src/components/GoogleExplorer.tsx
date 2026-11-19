'use client';
import { useEffect, useMemo, useState } from 'react';
import { pct } from '@stakeout/core/googleSite';
import { Spots } from '@/components/InsightBits';
import { DEVICES, GA_DIMENSIONS, GA_SOURCES, GSC_DIMENSIONS, GSC_TYPES, PRESETS, type ExploreRow } from '@stakeout/core/googleExplore';

type Totals = { a: number; b: number; c: number | null };
type Result = { by: string; range: { recent: { from: string; to: string }; before: { from: string; to: string }; days: number }; recent: Totals; before: Totals; rows: ExploreRow[]; appearances?: string[] };
/** What the tab above is showing, so the explorer opens on the same dates and device. */
type Start = { days: number; from: string; to: string; device: string };
type Props = ({ source: 'gsc'; website: string } | { source: 'ga'; property: string }) & { start?: Start };

const field = 'rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-500';
const n = (v: number) => v.toLocaleString('en-US');
const words = (s: string) => { const t = s.replace(/_/g, ' ').toLowerCase(); return t[0].toUpperCase() + t.slice(1); };

function Change({ now, was, lowerIsBetter }: { now: number | null; was: number | null; lowerIsBetter?: boolean }) {
  if (now === null || was === null) return <span className="text-slate-600">new</span>;
  const c = pct(now, was);
  if (c === null) return <span className="text-slate-600">–</span>;
  const good = c === 0 ? null : lowerIsBetter ? c < 0 : c > 0;
  return <span className={good === null ? 'text-slate-500' : good ? 'text-emerald-400' : 'text-rose-400'}>{c > 0 ? '▲' : c < 0 ? '▼' : ''} {Math.abs(c)}%</span>;
}

/**
 * Dig into Search Console or Analytics for one website: pick the dates, what to break the numbers
 * down by, and filters. Every figure is shown against the same number of days before.
 */
export default function GoogleExplorer(props: Props) {
  const gsc = props.source === 'gsc';
  const dims = (gsc ? GSC_DIMENSIONS : GA_DIMENSIONS) as Record<string, string>;
  const [by, setBy] = useState(gsc ? 'query' : 'landingPagePlusQueryString');
  const [days, setDays] = useState(28);
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [f, setF] = useState({ query: '', queryMode: 'contains', page: '', device: '', appearance: '', type: 'web', came: 'all' });
  const [asked, setAsked] = useState(0);
  const [r, setR] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<'a' | 'b' | 'c'>('a');
  const target = gsc ? props.website : props.property;
  // Until something has been asked for here, it follows the tab's dates and device.
  const start = props.start;
  useEffect(() => {
    if (!start || asked) return;
    if (PRESETS.some((p) => p.days === start.days)) { setCustom(false); setDays(start.days); }
    else { setCustom(true); setFrom(start.from); setTo(start.to); }
    setF((x) => ({ ...x, device: start.device }));
  }, [start?.days, start?.from, start?.to, start?.device]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!asked) return;
    let live = true;
    setBusy(true); setError('');
    fetch('/api/admin/google/explore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...props, start: undefined, by, ...(custom ? { from, to } : { days }), ...f }) })
      .then(async (x) => { const j = await x.json().catch(() => ({})); if (!x.ok) throw new Error(j.error || 'Request failed.'); return j as Result; })
      .then((j) => { if (live) setR(j); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Could not read it.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
    // Asked for again whenever "Show" is pressed or the breakdown or dates change; filters wait for "Show".
  }, [asked, by, days, custom && from && to ? from + to : '', target]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (!r) return [];
    if (r.by === 'date') return r.rows;
    // Position sorts best (lowest) first; everything else, most first.
    return [...r.rows].sort((x, y) => (gsc && sort === 'c' ? (x.c ?? 999) - (y.c ?? 999) : (y[sort] ?? 0) - (x[sort] ?? 0)));
  }, [r, sort, gsc]);
  const cols = gsc ? ['Clicks', 'Times shown', 'Position'] : ['Visits', 'Engaged visits', 'Key events'];
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const narrow = (k: 'query' | 'page', v: string) => { setF((x) => ({ ...x, [k]: v, ...(k === 'query' ? { queryMode: 'exact' } : {}) })); setBy(k === 'query' ? (gsc ? 'page' : by) : gsc ? 'query' : 'sessionSourceMedium'); setAsked((x) => x + 1); };

  return (
    <details className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !asked) setAsked(1); }}>
      <summary className="cursor-pointer text-sm font-semibold">Explore <span className="font-normal text-slate-500">by {gsc ? 'search, page, device or date' : 'landing page, source, device or date'}</span></summary>
      <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); setAsked((x) => x + 1); }}>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(dims).map(([k, label]) => <button key={k} type="button" aria-pressed={by === k} onClick={() => { setBy(k); setAsked((x) => x || 1); }} className={'rounded-full border px-2.5 py-1 text-xs ' + (by === k ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-300 hover:border-slate-500')}>{label}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Dates" className={field} value={custom ? 'custom' : String(days)} onChange={(e) => { if (e.target.value === 'custom') setCustom(true); else { setCustom(false); setDays(Number(e.target.value)); } }}>
            {PRESETS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
            <option value="custom">Choose dates…</option>
          </select>
          {custom && <><input type="date" aria-label="From" className={field} value={from} onChange={(e) => setFrom(e.target.value)} /><span className="text-xs text-slate-500">to</span><input type="date" aria-label="To" className={field} value={to} onChange={(e) => setTo(e.target.value)} /></>}
          <select aria-label="Device" className={field} value={f.device} onChange={(e) => set('device', e.target.value)}><option value="">All devices</option>{DEVICES.map((d) => <option key={d} value={d}>{words(d)}</option>)}</select>
          {gsc ? (
            <>
              <select aria-label="Kind of search" className={field} value={f.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(GSC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {(r?.appearances?.length ?? 0) > 0 && <select aria-label="How it appeared" className={field} value={f.appearance} onChange={(e) => set('appearance', e.target.value)}><option value="">Any appearance</option>{r!.appearances!.map((a) => <option key={a} value={a}>{words(a)}</option>)}</select>}
            </>
          ) : (
            <select aria-label="Where visits came from" className={field} value={f.came} onChange={(e) => set('came', e.target.value)}>{Object.entries(GA_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gsc && <>
            <select aria-label="How the search is matched" className={field} value={f.queryMode} onChange={(e) => set('queryMode', e.target.value)}><option value="contains">Search contains</option><option value="exact">Search is exactly</option><option value="without">Search does not contain</option></select>
            <input className={field + ' min-w-0 flex-1'} placeholder="a word or phrase, e.g. botox" value={f.query} onChange={(e) => set('query', e.target.value)} />
          </>}
          <input className={field + ' min-w-0 flex-1'} placeholder={gsc ? 'Page: a full address, or part of one such as /blog/' : 'Landing page contains, e.g. /services'} value={f.page} onChange={(e) => set('page', e.target.value)} />
          <button type="submit" disabled={busy || (custom && (!from || !to))} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{busy ? 'Reading…' : 'Show'}</button>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-amber-300">{error}</p>}
      {r && !error && (
        <div className={'mt-3 ' + (busy ? 'opacity-50' : '')}>
          <p className="text-xs text-slate-400">
            {r.range.recent.from} to {r.range.recent.to}: <span className="text-slate-200">{n(r.recent.a)} {cols[0].toLowerCase()}</span> (<Change now={r.recent.a} was={r.before.a} />), <span className="text-slate-200">{n(r.recent.b)} {cols[1].toLowerCase()}</span> (<Change now={r.recent.b} was={r.before.b} />)
            {gsc ? r.recent.c !== null && <>, average position <span className="text-slate-200">{r.recent.c}</span> (<Spots now={r.recent.c} was={r.before.c} />)</> : <>, <span className="text-slate-200">{n(r.recent.c ?? 0)} key events</span> (<Change now={r.recent.c} was={r.before.c} />)</>}
            <span className="text-slate-500"> · against {r.range.before.from} to {r.range.before.to}</span>
          </p>
          {rows.length === 0 ? <p className="mt-2 text-sm text-slate-400">Nothing for these dates and filters.</p> : (
            <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-900 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">{dims[r.by]}</th>
                    {(['a', 'b', 'c'] as const).map((k, i) => <th key={k} className="px-3 py-2 text-right font-medium"><button type="button" onClick={() => setSort(k)} className={sort === k && r.by !== 'date' ? 'text-emerald-300' : 'hover:text-slate-200'}>{cols[i]}</button></th>)}
                    {r.by !== 'date' && <th className="px-3 py-2 text-right font-medium">{cols[0]} vs before</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {rows.map((x) => (
                    <tr key={x.key} className="hover:bg-slate-800/40">
                      <td className="max-w-[22rem] truncate px-3 py-1.5 text-slate-200" title={x.key}>
                        {(r.by === 'query' || r.by === 'page' || r.by === 'landingPagePlusQueryString') ? <button type="button" onClick={() => narrow(r.by === 'query' ? 'query' : 'page', x.key)} className="max-w-full truncate text-left hover:text-sky-300" title={'Filter to this: ' + x.key}>{x.key}</button> : r.by === 'device' || r.by === 'searchAppearance' ? words(x.key) : x.key}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{n(x.a)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{n(x.b)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{x.c === null ? '–' : gsc ? x.c.toFixed(1) : n(x.c)}</td>
                      {r.by !== 'date' && <td className="px-3 py-1.5 text-right tabular-nums"><Change now={x.a} was={x.wasA} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            Up to 250 rows. Click a {gsc ? 'search or page' : 'landing page'} to filter to it.
            {gsc ? ' Google leaves out searches made by very few people, so rows add up to less than the totals. “How it appeared” lists only the special result types Google reports for this site.' : ' “AI assistants” counts visits a chat assistant’s site or app sent; visits where the assistant passed no referrer show as direct and cannot be told apart.'}
          </p>
        </div>
      )}
    </details>
  );
}
