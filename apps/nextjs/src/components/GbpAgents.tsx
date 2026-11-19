'use client';
import { useCallback, useEffect, useState } from 'react';
import { TOOLS, WRITES } from '@stakeout/core/agentTools';
import { AGENT_ADDON, dollars } from '@stakeout/core/gbpPlans';

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };
const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const btn = 'rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500 disabled:opacity-40';
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'never');

async function call<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j as T;
}

/** AI agents: the address of the MCP server, the keys an agent signs in with, and what an agent can do. */
export default function GbpAgents({ admin }: { admin: boolean }) {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Customers: whether the AI agents add-on is on (admins always have access), and how to pay for it.
  type Addon = { ready: boolean; addon?: { on: boolean; cents: number }; sub?: { running: boolean; periodEnd: string | null } | null };
  const [bill, setBill] = useState<Addon | null>(null);
  const [payLink, setPayLink] = useState<string | null>(null);
  useEffect(() => { if (!admin) call<Addon>('/api/billing/gbp').then(setBill).catch(() => {}); }, [admin]);
  const open = admin || Boolean(bill?.addon?.on);
  const buy = async () => {
    setBusy(true); setError('');
    try {
      const r = await call<Addon & { url?: string; pay?: string | null }>('/api/billing/gbp', 'POST', { addon: true });
      if (r.url) { window.location.assign(r.url); return; }
      if (r.pay !== undefined) { setPayLink(r.pay ?? ''); return; }
      setBill(r);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add it.'); } finally { setBusy(false); }
  };
  const drop = async () => {
    if (!window.confirm('Take the AI agents add-on off? Your keys stop working. Nothing is refunded.')) return;
    setBusy(true); setError('');
    try { setBill(await call<Addon>('/api/billing/gbp', 'POST', { addon: false })); } catch (e) { setError(e instanceof Error ? e.message : 'Could not remove it.'); } finally { setBusy(false); }
  };
  const read = useCallback(() => call<{ keys: Key[] }>('/api/keys').then((r) => setKeys(r.keys)).catch((e) => setError(e.message)), []);
  useEffect(() => { read(); }, [read]);
  const url = typeof window === 'undefined' ? '' : window.location.origin + '/api/mcp';
  const config = JSON.stringify({ mcpServers: { stakeout: { type: 'http', url, headers: { Authorization: 'Bearer ' + (fresh?.key ?? 'stk_YOUR_KEY') } } } }, null, 2);

  const make = async () => {
    setBusy(true); setError('');
    try { const r = await call<{ key: string; name: string }>('/api/keys', 'POST', { name }); setFresh(r); setName(''); await read(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not make a key.'); } finally { setBusy(false); }
  };
  const revoke = async (k: Key) => {
    if (!window.confirm(`Revoke “${k.name}”? Any agent using it stops working at once.`)) return;
    try { await call('/api/keys?id=' + encodeURIComponent(k.id), 'DELETE'); if (fresh) setFresh(null); await read(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not revoke.'); }
  };
  const copy = (what: string, text: string) => navigator.clipboard.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(''), 1500); }).catch(() => {});

  return (
    <div className="space-y-5">
      <div className={card}>
        <h2 className="text-lg font-semibold">Connect your own AI agent</h2>
        <p className="mt-2 text-sm text-slate-400">Stakeout speaks MCP, so an agent you already use (Claude Code, Cursor, or one you built) can read your scans and listings and do the everyday work on them. It signs in with a key from this page.{!admin && ' It works on every listing you have on the Manage plan, and on your scans, Search Console and Analytics.'}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-emerald-300">{url}</code>
          <button type="button" onClick={() => copy('url', url)} className={btn}>{copied === 'url' ? 'Copied' : 'Copy address'}</button>
        </div>
        <p className="mt-3 text-xs text-slate-500">An agent can never change a listing’s name, categories, phone, website or address. Every edit it makes is logged with the listing as it was, the same as an edit made here.</p>
      </div>

      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
      {!admin && bill && !bill.addon?.on && (
        <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Add-on</p>
          <h2 className="mt-1 text-lg font-semibold">AI agents · {dollars(AGENT_ADDON.cents)} a month</h2>
          <p className="mt-2 text-sm text-slate-300">One flat price for the whole account, however many listings you have. Your agent can run and read scans, read Search Console and Analytics, and do the everyday work on every listing that is on the Manage plan: posts, review replies, hours, descriptions, services and attributes.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={buy} disabled={busy || bill.ready === false} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">{busy ? 'Working…' : `Add AI agents · ${dollars(AGENT_ADDON.cents)} a month`}</button>
            <span className="text-xs text-slate-500">{bill.sub?.running ? 'Added to your subscription; the rest of this month is charged to your card now.' : 'Monthly. You pay on the next page; cancel any time.'}</span>
          </div>
          {payLink !== null && <p className="mt-3 text-sm text-amber-200">Your bank wants you to confirm this charge; the add-on switches on as soon as it goes through. {payLink ? <a href={payLink} target="_blank" rel="noreferrer" className="font-semibold underline">Confirm the payment</a> : 'Open “Card, invoices and cancelling” on the Plan and billing tab to finish it.'}</p>}
          {bill.ready === false && <p className="mt-2 text-xs text-amber-300">Checkout is being set up. Email sass@stakeoutsearch.com and we will sort it out.</p>}
        </div>
      )}
      {!admin && bill?.addon?.on && <p className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"><span>The AI agents add-on is on: {dollars(AGENT_ADDON.cents)} a month.</span><button type="button" onClick={drop} disabled={busy} className="text-xs text-slate-300 hover:text-rose-300">Take it off</button></p>}

      {open && <div className={card}>
        <h2 className="text-lg font-semibold">Keys</h2>
        {fresh && (
          <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="text-sm font-semibold text-emerald-200">Copy this key now. It is not shown again.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100">{fresh.key}</code>
              <button type="button" onClick={() => copy('key', fresh.key)} className={btn}>{copied === 'key' ? 'Copied' : 'Copy key'}</button>
            </div>
            <p className="mt-3 text-xs text-slate-400">For an agent that reads an MCP settings file:</p>
            <pre className="mt-1 overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-300">{config}</pre>
            <button type="button" onClick={() => copy('config', config)} className={btn + ' mt-2'}>{copied === 'config' ? 'Copied' : 'Copy settings'}</button>
          </div>
        )}
        <ul className="mt-3 divide-y divide-slate-800 rounded-lg border border-slate-800">
          {keys === null ? <li className="px-3 py-2.5 text-sm text-slate-400">Loading…</li> : keys.length === 0 ? <li className="px-3 py-2.5 text-sm text-slate-400">No keys yet.</li> : keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span>{k.name} <span className="ml-1 font-mono text-xs text-slate-500">{k.prefix}…</span></span>
              <span className="flex items-center gap-4 text-xs text-slate-500">made {day(k.createdAt)} · last used {day(k.lastUsedAt)}<button type="button" onClick={() => revoke(k)} className="text-slate-400 hover:text-rose-300">Revoke</button></span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500" placeholder="What is it for? e.g. Claude Code" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && make()} />
          <button type="button" onClick={make} disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">{busy ? 'Making…' : 'Make a key'}</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">A key acts as your account. Keep it out of shared documents, and revoke it the moment it might have leaked. Each key is limited to 60 requests a minute.</p>
      </div>}

      <div className={card}>
        <h2 className="text-lg font-semibold">What an agent can do</h2>
        <ul className="mt-3 divide-y divide-slate-800 rounded-lg border border-slate-800">
          {TOOLS.map((t) => (
            <li key={t.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <code className="shrink-0 text-emerald-300">{t.name}</code>
              <span className={'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ' + (WRITES.has(t.name) ? 'border-amber-500/40 text-amber-300' : 'border-slate-700 text-slate-500')}>{WRITES.has(t.name) ? 'changes' : 'reads'}</span>
              <span className="min-w-0 flex-1 basis-64 text-slate-400">{t.description}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
