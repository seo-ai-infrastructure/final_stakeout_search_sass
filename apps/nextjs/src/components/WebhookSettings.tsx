'use client';
import { useEffect, useState } from 'react';
import { ACCOUNT_PLANS } from '@stakeout/core/gbpPlans';

type Delivery = { id: string; scanId: string | null; status: string; attempts: number; lastStatus: number | null; lastError: string | null; createdAt: string; sentAt: string | null };
type State = { allowed: boolean; owner: boolean; endpoint: { url: string; secret: string | null } | null; deliveries: Delivery[]; event: string; test?: { ok: boolean; status: number | null; error: string | null } };

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const btn = 'min-h-[40px] rounded-lg border border-slate-700 px-3 text-sm hover:border-slate-500 disabled:opacity-40';
const field = 'min-h-[40px] min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400 focus:outline-none';

async function call(method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<State> {
  const r = await fetch('/api/integrations/webhook', { method, cache: 'no-store', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'That did not work.');
  return d as State;
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function outcome(d: Delivery): { label: string; tone: string } {
  if (d.status === 'SENT') return { label: `Delivered${d.lastStatus ? ` (${d.lastStatus})` : ''}`, tone: 'text-emerald-300' };
  if (d.status === 'FAILED') return { label: 'Not delivered after 4 tries', tone: 'text-rose-300' };
  if (d.status === 'SKIPPED') return { label: 'Not sent', tone: 'text-slate-400' };
  return d.attempts ? { label: `Trying again (${d.attempts} of 4 tries failed)`, tone: 'text-amber-300' } : { label: 'Sending', tone: 'text-slate-300' };
}

/**
 * Webhooks on the Plan and billing page (Scale and up): the address a finished scan's summary is
 * posted to, its signing secret, a test send and the latest deliveries. Locked below Scale.
 */
export default function WebhookSettings() {
  const [s, setS] = useState<State | null>(null);
  const [url, setUrl] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const show = (d: State) => { setS(d); setUrl(d.endpoint?.url ?? ''); };
  useEffect(() => { call('GET').then(show).catch((e) => setError(e.message)); }, []);
  if (!s) return error ? <div className={card}><p role="alert" className="text-sm text-rose-300">{error}</p></div> : null;
  const run = async (key: string, what: () => Promise<void>) => {
    setBusy(key); setError(''); setNote('');
    try { await what(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(''); }
  };
  const head = (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold">Webhooks</h2>
      <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-xs text-slate-400">Scale and Agency Max</span>
    </div>
  );
  const about = <p className="mt-2 text-sm text-slate-400">When a scan finishes, its summary goes to your address as JSON: the business, keyword and grid, average rank, share of local voice, points in the top 3, the AI Overview, and links to the report (on your white-label domain when you have one). Paste a Zapier, Make or GoHighLevel inbound webhook address to send results on to clients, sheets or CRMs.</p>;

  if (!s.allowed)
    return (
      <div className={card}>
        {head}
        {about}
        {s.endpoint && <p className="mt-3 text-sm text-amber-200">Paused: your plan no longer includes webhooks, so finished scans are not sent to {s.endpoint.url}.</p>}
        {s.owner && <a href="#plans" className="mt-3 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Move up to Scale ({'$' + ACCOUNT_PLANS.P_SCALE.tiers[0].cents / 100} a month)</a>}
      </div>
    );

  if (!s.owner)
    return (
      <div className={card}>
        {head}
        <p className="mt-2 text-sm text-slate-300">{s.endpoint ? `Finished scans are sent to ${s.endpoint.url}.` : 'Webhooks are not set up.'} The account owner changes them.</p>
      </div>
    );

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run('save', async () => {
      const first = !s.endpoint;
      show(await call('POST', { url }));
      setNote(first ? 'Saved. Every scan that finishes from now on is sent there. Send a test to check it.' : 'Address saved.');
    });
  };
  const test = () => run('test', async () => {
    const d = await call('POST', { test: true });
    show(d);
    if (d.test?.ok) setNote(`Test delivered: your address answered ${d.test.status}.`);
    else setError(`Test not delivered: ${d.test?.error ?? 'no answer'}`);
  });
  const rotate = () => run('rotate', async () => {
    if (!window.confirm('Make a new signing secret? Anything checking signatures with the current one stops matching until you update it.')) return;
    show(await call('POST', { rotate: true }));
    setReveal(true);
    setNote('New secret made. Update it wherever you check signatures.');
  });
  const off = () => run('off', async () => {
    if (!window.confirm('Turn webhooks off? Finished scans stop being sent, and the address and secret are deleted.')) return;
    show(await call('DELETE'));
    setReveal(false);
    setNote('Webhooks are off.');
  });
  const secret = s.endpoint?.secret ?? '';

  return (
    <div className={card}>
      {head}
      {about}
      <form onSubmit={save} className="mt-4 flex flex-wrap gap-2">
        <label htmlFor="webhook-url" className="sr-only">Webhook address</label>
        <input id="webhook-url" type="url" inputMode="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/…" autoComplete="off" spellCheck={false} className={field} />
        <button type="submit" disabled={busy === 'save' || !url.trim() || url.trim() === s.endpoint?.url} className="min-h-[40px] rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">{busy === 'save' ? 'Saving…' : s.endpoint ? 'Save address' : 'Turn on webhooks'}</button>
      </form>
      {s.endpoint && (
        <>
          <div className="mt-4 rounded-lg border border-slate-800 px-4 py-3">
            <p className="text-sm font-medium text-slate-200">Signing secret</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-slate-950 px-2 py-1.5 font-mono text-sm text-slate-200">{reveal ? secret : secret.slice(0, 6) + '•'.repeat(24)}</code>
              <button type="button" onClick={() => setReveal((v) => !v)} className={btn}>{reveal ? 'Hide' : 'Show'}</button>
              <button type="button" onClick={() => navigator.clipboard.writeText(secret).then(() => setNote('Secret copied.'))} className={btn}>Copy</button>
              <button type="button" onClick={rotate} disabled={busy === 'rotate'} className={btn}>{busy === 'rotate' ? 'Working…' : 'New secret'}</button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={test} disabled={busy === 'test'} className={btn}>{busy === 'test' ? 'Sending…' : 'Send test'}</button>
            <button type="button" onClick={off} disabled={busy === 'off'} className={btn + ' hover:border-rose-400 hover:text-rose-200'}>{busy === 'off' ? 'Working…' : 'Turn off'}</button>
          </div>
        </>
      )}
      {note && <p className="mt-3 text-sm text-emerald-300">{note}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
      {s.deliveries.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-200">Latest deliveries</h3>
          <ul className="mt-2 divide-y divide-slate-800 rounded-lg border border-slate-800">
            {s.deliveries.map((d) => {
              const o = outcome(d);
              return (
                <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className={o.tone}>{o.label}</span>
                  <span className="text-slate-500">{d.scanId ? <a className="underline hover:text-slate-300" href={'/scans/' + d.scanId}>Scan of {when(d.createdAt)}</a> : when(d.createdAt)}</span>
                  {d.status !== 'SENT' && d.lastError && <span className="basis-full text-xs text-slate-500">{d.lastError}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <details className="mt-5 text-sm text-slate-400">
        <summary className="cursor-pointer text-slate-300">How deliveries work and how to check the signature</summary>
        <div className="mt-2 space-y-2">
          <p>Each delivery is a POST with a JSON body: <code className="font-mono text-slate-300">id</code>, <code className="font-mono text-slate-300">event</code> ({s.event}), <code className="font-mono text-slate-300">attempt</code> and the scan&rsquo;s summary under <code className="font-mono text-slate-300">data</code>. A 2xx answer within 10 seconds counts as delivered; otherwise it is tried again after 1, 5 and 30 minutes. A retry keeps the same id (also in the <code className="font-mono text-slate-300">Stakeout-Delivery</code> header), so you can skip repeats.</p>
          <p>The <code className="font-mono text-slate-300">Stakeout-Signature</code> header reads <code className="font-mono text-slate-300">t=&lt;unix time&gt;,v1=&lt;signature&gt;</code>. To check it, compute HMAC-SHA256 of <code className="font-mono text-slate-300">&lt;t&gt;.&lt;raw body&gt;</code> with your secret, in hex, and compare it with v1. Zapier and Make can skip this step.</p>
          <p>The summary under <code className="font-mono text-slate-300">data</code> has scanId, businessName, keyword, gridSize, location, points, rank (averageRank, shareOfLocalVoice, top3Points, foundPoints, bestRank), aiOverview (status, shownAtPoints, citesBusinessAtPoints), reportUrl, visibilityReportUrl and completedAt. Re-running a scan&rsquo;s failed points sends it again with the newer numbers and <code className="font-mono text-slate-300">updated: true</code>. A test send has <code className="font-mono text-slate-300">test: true</code> and never shares a scan.</p>
          <p>Only public HTTPS addresses are accepted, and redirects are not followed.</p>
        </div>
      </details>
    </div>
  );
}
