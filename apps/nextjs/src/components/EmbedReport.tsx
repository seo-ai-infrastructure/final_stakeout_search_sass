'use client';
import { useEffect, useState } from 'react';
import { ACCOUNT_PLANS } from '@stakeout/core/gbpPlans';

type Embed = { token: string; url: string; snippet: string };
type State = { embed: Embed | null; allowed: boolean };

async function call(method: 'GET' | 'POST' | 'DELETE', q: string, body?: unknown): Promise<State> {
  const r = await fetch('/api/embeds' + q, { method, cache: 'no-store', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'That did not work.');
  return d as State;
}

/**
 * A live embed of a scan's report (Agency and up): one iframe for a client dashboard (GoHighLevel,
 * AgencyAnalytics, Notion, a website) that always shows the newest finished scan of this business,
 * keyword and grid.
 */
export default function EmbedReport({ scanId }: { scanId: string }) {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { call('GET', '?scanId=' + encodeURIComponent(scanId)).then(setS).catch((e) => setError(e.message)); }, [scanId]);
  const run = async (key: string, what: () => Promise<void>) => {
    setBusy(key); setError(''); setNote('');
    try { await what(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(''); }
  };
  const box = 'rounded-xl border border-slate-800 bg-slate-900 p-4';
  if (!s) return <div className={box}>{error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : <p className="text-sm text-slate-400">Loading…</p>}</div>;
  const about = 'One iframe for a client dashboard (GoHighLevel, AgencyAnalytics, Notion or any website) that always shows the newest finished scan of this business, keyword and grid. Run the scan again or on a schedule, and the embed updates by itself.';

  if (!s.embed && !s.allowed)
    return (
      <div className={box}>
        <h2 className="font-semibold">Live report embed</h2>
        <p className="mt-1 text-sm text-slate-400">{about} It comes with Agency ({'$' + ACCOUNT_PLANS.P_AGENCY.tiers[0].cents / 100} a month), Scale and Agency Max.</p>
        <a href="/profiles?tab=plan#plans" className="mt-3 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">See plans</a>
      </div>
    );

  if (!s.embed)
    return (
      <div className={box}>
        <h2 className="font-semibold">Live report embed</h2>
        <p className="mt-1 text-sm text-slate-400">{about}</p>
        <button type="button" disabled={busy === 'on'} onClick={() => run('on', async () => setS(await call('POST', '', { scanId })))} className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">{busy === 'on' ? 'Turning on…' : 'Turn on live embed'}</button>
        {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
      </div>
    );

  const e = s.embed;
  return (
    <div className={box}>
      <h2 className="font-semibold">Live report embed</h2>
      <p className="mt-1 text-sm text-slate-400">Paste this where the report should show. It updates when a newer scan of this report finishes. For a dark page, add <code className="font-mono text-slate-300">?theme=dark</code> to the address.</p>
      <label htmlFor="embed-snippet" className="sr-only">Embed code</label>
      <textarea id="embed-snippet" readOnly rows={3} value={e.snippet} onFocus={(ev) => ev.target.select()} className="mt-3 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200" />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => navigator.clipboard.writeText(e.snippet).then(() => setNote('Embed code copied.'))} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Copy embed code</button>
        <a href={e.url} target="_blank" rel="noopener" className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500">Preview</a>
        <button
          type="button"
          disabled={busy === 'off'}
          onClick={() => run('off', async () => {
            if (!window.confirm('Turn this embed off? Wherever it is pasted, it will say the report was turned off. Turning it on again makes a new code.')) return;
            await call('DELETE', '?token=' + encodeURIComponent(e.token));
            setS(await call('GET', '?scanId=' + encodeURIComponent(scanId)));
            setNote('The embed is off.');
          })}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-rose-400 hover:text-rose-200 disabled:opacity-40"
        >
          {busy === 'off' ? 'Turning off…' : 'Turn off'}
        </button>
      </div>
      {note && <p className="mt-3 text-sm text-emerald-300">{note}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    </div>
  );
}
