'use client';
import { useCallback, useEffect, useState } from 'react';
import type { GbpChange } from '@stakeout/core/gbp';

type Drift = { id: string; locationId: string; profileId: string; title: string | null; field: string; label: string; was: string; now: string; status: string; foundAt: string; resolvedAt: string | null; revert?: GbpChange | null };
type Run = { listings: number; fresh: number; changed: number; found: number; problems: number; at: string };
type State = { open: Drift[]; closed: Drift[]; watching: number; run: Run | null };

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const ONLY_ON_GOOGLE = new Set(['address', 'openStatus']);
const CLOSED: Record<string, string> = { ACCEPTED: 'Kept', REVERTED: 'Put back', GONE: 'Went back by itself' };

async function call<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j as T;
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

/** One value, long ones cut with the rest a click away. */
function Value({ text, tone }: { text: string; tone: string }) {
  const [all, setAll] = useState(false);
  const long = text.length > 160;
  return (
    <p className={'whitespace-pre-line break-words text-sm ' + tone}>
      {long && !all ? text.slice(0, 160) + '…' : text}
      {long && <button type="button" onClick={() => setAll(!all)} className="ml-2 text-xs text-sky-400 hover:underline">{all ? 'less' : 'all'}</button>}
    </p>
  );
}

/**
 * Changes on our Google listings that we did not make: each can be kept (it becomes what we
 * expect) or put back. `onCount` tells the page how many are waiting; `onOpenListing` opens the editor.
 */
export default function GbpWatch({ onCount, onOpenListing }: { onCount: (n: number) => void; onOpenListing: (p: { profile: string; location: string }) => void }) {
  const [s, setS] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await call<State>('/api/admin/gbp/watch');
      setS(r); onCount(r.open.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the changes.');
    }
  }, [onCount]);
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key); setError('');
    try { await work(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(''); }
  };
  const keep = (d: Drift) => act(d.id + 'keep', () => call('/api/admin/gbp/watch', { action: 'keep', id: d.id }));
  // The edit goes through the editor's own route, with all of its checks; then the change is closed.
  const putBack = (d: Drift) => act(d.id + 'back', async () => {
    await call('/api/admin/gbp/update', { profile: d.profileId, location: d.locationId, change: d.revert });
    await call('/api/admin/gbp/watch', { action: 'reverted', id: d.id });
  });
  const checkNow = () => act('check', () => call('/api/admin/gbp/watch', { action: 'check' }));

  return (
    <div className="space-y-5">
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Changes we did not make</p>
            <p className="mt-1 text-xs text-slate-500">
              {s === null ? 'Reading…' : s.watching === 0 ? 'No listing has been checked yet. The first check records each listing as it is now; changes are reported from the second check on.' : (
                <>Watching {s.watching} listing{s.watching === 1 ? '' : 's'}, checked once a day.{s.run && <> Last check {when(s.run.at)}: {s.run.found} change{s.run.found === 1 ? '' : 's'} found{s.run.fresh ? `, ${s.run.fresh} listing${s.run.fresh === 1 ? '' : 's'} recorded for the first time` : ''}{s.run.problems ? <span className="text-amber-300">, {s.run.problems} could not be read</span> : ''}.</>}</>
              )}
            </p>
          </div>
          <button type="button" onClick={checkNow} disabled={Boolean(busy)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500 disabled:opacity-40">{busy === 'check' ? 'Checking every listing…' : 'Check now'}</button>
        </div>
        {busy === 'check' && <p className="mt-2 text-xs text-slate-500">This reads every listing from Google and can take a couple of minutes.</p>}
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      </div>

      {s && s.open.length === 0 && s.watching > 0 && <p className={card + ' text-sm text-slate-400'}>Nothing has changed without you.</p>}

      {s && s.open.length > 0 && (
        <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900">
          {s.open.map((d) => (
            <li key={d.id} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm"><span className="font-semibold text-slate-100">{d.label}</span> <span className="text-slate-500">on</span> <button type="button" onClick={() => onOpenListing({ profile: d.profileId, location: d.locationId })} className="text-sky-400 hover:underline">{d.title ?? 'Listing …' + d.locationId.slice(-5)}</button></p>
                <span className="text-xs text-slate-500">found {when(d.foundAt)}</span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Was</p><Value text={d.was} tone="text-slate-300" /></div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"><p className="text-[11px] uppercase tracking-wide text-amber-300/80">Now on Google</p><Value text={d.now} tone="text-slate-100" /></div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {d.revert
                  ? <button type="button" onClick={() => putBack(d)} disabled={Boolean(busy)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{busy === d.id + 'back' ? 'Putting it back…' : 'Put it back'}</button>
                  : !ONLY_ON_GOOGLE.has(d.field) && <button type="button" onClick={() => onOpenListing({ profile: d.profileId, location: d.locationId })} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500">Open the listing to change it</button>}
                <button type="button" onClick={() => keep(d)} disabled={Boolean(busy)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500 disabled:opacity-40">{busy === d.id + 'keep' ? 'Keeping…' : 'Keep it'}</button>
                {!d.revert && <span className="text-xs text-slate-500">{ONLY_ON_GOOGLE.has(d.field) ? 'This can only be changed on Google itself.' : 'Name, primary category and phone go through the editor’s identity checks.'}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {s && s.closed.length > 0 && (
        <details className={card}>
          <summary className="cursor-pointer text-sm font-semibold">Dealt with ({s.closed.length})</summary>
          <ul className="mt-3 space-y-2 text-xs text-slate-400">
            {s.closed.map((d) => (
              <li key={d.id}><span className="text-slate-300">{CLOSED[d.status] ?? d.status}</span> · {d.title} · {d.label}: “{d.was.slice(0, 80)}” → “{d.now.slice(0, 80)}” · {when(d.resolvedAt)}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
