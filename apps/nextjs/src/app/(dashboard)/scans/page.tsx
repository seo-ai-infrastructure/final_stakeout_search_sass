'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { usePolling } from '@/lib/usePolling';
import { clientKey } from '@stakeout/core/clientNames';

type Run = {
  id: string;
  targetBusiness: string;
  /** The client this scan is filed under: its business name, after any merges. */
  client: string;
  keyword: string;
  createdAt: string;
  status: string;
  scheduleType: string;
  scheduleCron: string | null;
  solv: number | null;
  gridSize: number;
  totalPins: number;
  completedPins: number;
  failedPins: number;
  creditsCharged: number;
  creditsRefunded: number;
  prevScanId: string | null;
};

const DONE = ['COMPLETED', 'PARTIAL'];
const statusText: Record<string, string> = { COMPLETED: 'Completed', PARTIAL: 'Partial', RUNNING: 'Running', QUEUED: 'Queued', FAILED: 'Failed' };
const statusColor = (s: string) => (s === 'COMPLETED' ? 'text-emerald-300' : s === 'RUNNING' || s === 'QUEUED' ? 'text-sky-300' : s === 'PARTIAL' ? 'text-amber-300' : 'text-rose-300');
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const repeatText = (s: Run) => (s.scheduleType === 'once' ? 'Once' : s.scheduleType === 'daily' ? 'Every day' : 'Every week');

export default function ScanList() {
  const [runs, setRuns] = useState<Run[]>([]),
    [merges, setMerges] = useState<Record<string, string>>({}),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false),
    // The client being viewed, by key; '' = all clients.
    [client, setClient] = useState(''),
    [query, setQuery] = useState(''),
    [mergeInto, setMergeInto] = useState('');
  async function load() {
    try {
      const r = await fetch('/api/scans', { cache: 'no-store' }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRuns(d.scans);
      setMerges(d.merges ?? {});
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }
  usePolling(load, 7000);
  async function schedule(s: Run) {
    const r = await fetch('/api/scans/' + s.id, {
      method: 'POST',
      body: JSON.stringify({
        action: s.scheduleCron?.startsWith('PAUSED') ? 'resume' : 'pause',
      }),
    });
    if (r.ok) await load();
    else setError('Schedule update failed.');
  }
  async function merge(from: string, into: string) {
    const r = await fetch('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, into }) });
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error || 'Those clients could not be merged.');
    setMergeInto('');
    setClient(clientKey(into));
    await load();
  }
  async function separate(from: string) {
    const r = await fetch('/api/clients', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from }) });
    if (!r.ok) return setError('That client could not be separated.');
    await load();
  }

  // Clients, newest activity first: one per business name (capitals and spacing ignored, merges applied).
  const clients = useMemo(() => {
    const map = new Map<string, { key: string; name: string; scans: Run[] }>();
    for (const s of runs) {
      const key = clientKey(s.client);
      const c = map.get(key) ?? { key, name: s.client, scans: [] };
      c.scans.push(s);
      map.set(key, c);
    }
    return [...map.values()];
  }, [runs]);
  const current = clients.find((c) => c.key === client) ?? null;
  const q = query.trim().toLowerCase();
  const shown = clients.filter((c) => !q || c.name.toLowerCase().includes(q));
  const list = current ? current.scans : runs;
  // One card per keyword: its latest scan, and the latest finished one for the score and the change.
  const keywords = useMemo(() => {
    if (!current) return [];
    const byKeyword = new Map<string, Run[]>();
    for (const s of current.scans) byKeyword.set(clientKey(s.keyword), [...(byKeyword.get(clientKey(s.keyword)) ?? []), s]);
    return [...byKeyword.values()].map((scans) => {
      const latest = scans[0];
      const finished = scans.filter((s) => DONE.includes(s.status) && s.solv != null);
      const now = finished[0], before = finished[1];
      return { latest, now, before, change: now && before ? Math.round((now.solv! - before.solv!) * 10) / 10 : null, repeats: scans.find((s) => s.scheduleType !== 'once' && !s.scheduleCron?.startsWith('PAUSED')) };
    });
  }, [current]);
  // Names folded into this client by a merge, so each can be separated again.
  const mergedIn = current ? Object.entries(merges).filter(([, into]) => clientKey(into) === current.key).map(([from]) => from) : [];

  return (
    <section className="flex min-h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-3 border-b border-slate-800 bg-slate-900/60 p-4 lg:w-[300px] lg:border-b-0 lg:border-r">
        <label htmlFor="client-search" className="px-1 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Clients</label>
        <input
          id="client-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a client"
          className="min-h-[44px] rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white placeholder-slate-500"
        />
        <div className="flex flex-col gap-1">
          {!q && (
            <button type="button" aria-pressed={!current} onClick={() => setClient('')}
              className={`flex min-h-[52px] items-center gap-2.5 rounded-lg border px-2.5 text-left ${!current ? 'border-emerald-400 bg-emerald-400/10' : 'border-transparent hover:bg-slate-800/60'}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">All clients</span>
                <span className="block text-xs text-slate-400">{clients.length} business{clients.length === 1 ? '' : 'es'}</span>
              </span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300">{runs.length}</span>
            </button>
          )}
          {shown.map((c) => (
            <button key={c.key} type="button" aria-pressed={current?.key === c.key} onClick={() => { setClient(c.key); setMergeInto(''); }}
              className={`flex min-h-[52px] items-center gap-2.5 rounded-lg border px-2.5 text-left ${current?.key === c.key ? 'border-emerald-400 bg-emerald-400/10' : 'border-transparent hover:bg-slate-800/60'}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{c.name}</span>
                <span className="block text-xs text-slate-400">Last scan {day(c.scans[0].createdAt)}</span>
              </span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300">{c.scans.length}</span>
            </button>
          ))}
        </div>
        {q && !shown.length && <p className="px-1 text-sm text-slate-400">No client matches that name.</p>}
        <p className="mt-auto px-1 text-xs text-slate-500">Clients are listed from the business names on your scans. Nothing to set up.</p>
      </aside>

      <div className="min-w-0 flex-1 space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{current ? current.name : 'Scans & schedules'}</h1>
            <p className="text-sm text-slate-400">
              {current
                ? `${keywords.length} keyword${keywords.length === 1 ? '' : 's'} · ${current.scans.length} scan${current.scans.length === 1 ? '' : 's'}`
                : `${clients.length} client${clients.length === 1 ? '' : 's'} · ${runs.length} scan${runs.length === 1 ? '' : 's'}, newest first`}
            </p>
          </div>
          <Link className="rounded-xl bg-emerald-400 px-4 py-2.5 font-bold text-slate-950" href={current ? '/new-scan?from=' + current.scans[0].id : '/new-scan'}>
            {current ? 'New scan for this client' : 'New scan'}
          </Link>
        </div>
        {error && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-sm">{error}</p>}

        {current && (
          <div className="space-y-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Keywords tracked</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {keywords.map(({ latest, now, before, change, repeats }) => (
                <div key={latest.id} className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <p className="text-sm font-semibold text-white">{latest.keyword}</p>
                  <p className="flex items-baseline gap-2.5">
                    <span className="text-3xl font-extrabold text-white">{now ? now.solv + '%' : statusText[latest.status] ?? latest.status}</span>
                    {change != null && (
                      <span className={`text-[13px] font-semibold ${change > 0 ? 'text-emerald-300' : change < 0 ? 'text-rose-300' : 'text-slate-400'}`}>
                        {change > 0 ? `Up ${change}` : change < 0 ? `Down ${-change}` : 'No change'}{change !== 0 ? ' points since the last scan' : ''}
                      </span>
                    )}
                    {now && change == null && <span className="text-[13px] text-slate-400">First scan</span>}
                  </p>
                  <p className="text-xs text-slate-400">
                    Share of local voice · {latest.gridSize}×{latest.gridSize} · {when((now ?? latest).createdAt)} · {repeats ? 'repeats ' + repeatText(repeats).toLowerCase() : 'not scheduled'}
                  </p>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
                    <Link className="text-emerald-300" href={'/scans/' + (now ?? latest).id}>Open latest report</Link>
                    {now && before && <Link className="text-emerald-300" href={'/scans/compare?a=' + before.id + '&b=' + now.id}>Compare with previous</Link>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">{current ? 'All scans for this client' : 'All scans'}</h2>
          {!loaded ? (
            <p>Loading scans…</p>
          ) : !runs.length ? (
            <p>Your first scan will appear here.</p>
          ) : (
            <div className="overflow-auto rounded-xl border border-slate-800 bg-slate-900/60">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-slate-400">
                    {[current ? 'Keyword' : 'Client / keyword', 'Started', 'Progress', 'SoLV', 'Credits', 'Repeats', 'Report'].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => (
                    <tr key={s.id} className="border-t border-slate-800 align-top">
                      <td className="px-4 py-3">
                        {current ? (
                          <strong>{s.keyword}</strong>
                        ) : (
                          <>
                            <button type="button" className="font-bold text-white hover:underline" onClick={() => setClient(clientKey(s.client))}>{s.client}</button>
                            <br />
                            {s.keyword}
                          </>
                        )}
                        <span className="block text-xs text-slate-500">{s.gridSize}×{s.gridSize}{clientKey(s.targetBusiness) !== clientKey(s.client) ? ' · scanned as ' + s.targetBusiness : ''}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{when(s.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className={'font-semibold ' + statusColor(s.status)}>{statusText[s.status] ?? s.status}</span>
                        <span className="block text-xs text-slate-400">{s.completedPins} of {s.totalPins} points{s.failedPins ? ` · ${s.failedPins} failed` : ''}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold">{s.solv == null ? '—' : s.solv + '%'}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {s.creditsCharged}
                        {s.creditsRefunded ? <span className="block text-xs text-slate-400">{s.creditsRefunded} refunded</span> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {repeatText(s)}
                        {s.scheduleType !== 'once' && (
                          <button className="ml-2 underline" onClick={() => schedule(s)}>
                            {s.scheduleCron?.startsWith('PAUSED') ? 'Resume' : 'Pause'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        <Link className="text-emerald-300" href={'/scans/' + s.id}>View</Link>
                        {s.prevScanId && DONE.includes(s.status) && (
                          <Link className="ml-3 text-emerald-300" href={'/scans/compare?a=' + s.prevScanId + '&b=' + s.id}>Compare</Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {current && (
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Same client under another name?</h2>
            {clients.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="merge-into" className="text-slate-300">Merge {current.name} into</label>
                <select id="merge-into" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm text-white">
                  <option value="">Choose a client…</option>
                  {clients.filter((c) => c.key !== current.key).map((c) => (
                    <option key={c.key} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <button type="button" disabled={!mergeInto} onClick={() => merge(current.name, mergeInto)} className="min-h-[40px] rounded-lg border border-slate-600 px-3 font-semibold text-white disabled:opacity-40">
                  Merge these two
                </button>
              </div>
            )}
            {mergedIn.map((from) => (
              <p key={from} className="text-slate-300">
                Includes scans filed as “{runs.find((s) => clientKey(s.targetBusiness) === from)?.targetBusiness ?? from}”.{' '}
                <button type="button" className="underline" onClick={() => separate(from)}>Separate</button>
              </p>
            ))}
            <p className="text-xs text-slate-500">Merging only changes how scans are grouped on this page. The scans and their reports are not altered, and you can separate them again.</p>
          </div>
        )}
      </div>
    </section>
  );
}
