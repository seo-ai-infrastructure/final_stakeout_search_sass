'use client';
import { useCallback, useEffect, useState } from 'react';
import { PLAYBOOKS, TOOLS, WRITES, playbookText } from '@stakeout/core/agentTools';
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
export default function GbpAgents({ admin, addon = false }: { admin: boolean; addon?: boolean }) {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Customers: whether the AI agents add-on is on (admins always have access), and how to pay for it.
  type Addon = { ready: boolean; counts?: { MANAGE: number; AGENT: number }; addon?: { on: boolean; cents: number }; sub?: { running: boolean; periodEnd: string | null } | null };
  const [bill, setBill] = useState<Addon | null>(null);
  const [payLink, setPayLink] = useState<string | null>(null);
  useEffect(() => { if (!admin) call<Addon>('/api/billing/gbp').then(setBill).catch(() => {}); }, [admin]);
  // Any listing on a paid plan brings agent access with it; the add-on is for an account without one.
  const listed = (bill?.counts?.MANAGE ?? 0) + (bill?.counts?.AGENT ?? 0) > 0;
  const open = admin || listed || Boolean(bill?.addon?.on);
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
  // How many scan credits this account's agents may spend in a month, and how many they have.
  type Budget = { cap: number; used: number; left: number; month: string };
  const [budget, setBudget] = useState<Budget | null>(null);
  const [cap, setCap] = useState('');
  useEffect(() => { call<Budget>('/api/agent/limits').then((b) => { setBudget(b); setCap(String(b.cap)); }).catch(() => {}); }, []);
  const saveCap = async () => {
    setBusy(true); setError('');
    try { const b = await call<Budget>('/api/agent/limits', 'POST', { cap: Number(cap) }); setBudget(b); setCap(String(b.cap)); setCopied('cap'); setTimeout(() => setCopied(''), 1500); } catch (e) { setError(e instanceof Error ? e.message : 'The limit was not saved.'); } finally { setBusy(false); }
  };
  // Apps that were connected by signing in (Claude, ChatGPT and the like), each of which can be disconnected.
  type App = { id: string; name: string; from: string | null; createdAt: string; lastUsedAt: string | null };
  const [apps, setApps] = useState<App[] | null>(null);
  const readApps = useCallback(() => call<{ apps: App[] }>('/api/oauth/grants').then((r) => setApps(r.apps)).catch(() => setApps([])), []);
  useEffect(() => { readApps(); }, [readApps]);
  const disconnect = async (a: App) => {
    if (!window.confirm(`Disconnect “${a.name}”? It stops working at once and has to be approved again to come back.`)) return;
    try { await call('/api/oauth/grants?id=' + encodeURIComponent(a.id), 'DELETE'); await readApps(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not disconnect it.'); }
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
        <p className="mt-2 text-sm text-slate-400">Stakeout speaks MCP, so an agent you already use (Claude Code, Cursor, or one you built) can read your scans and listings and do the everyday work on them. It connects by signing you in here, or with a key from this page.{!admin && ' It is included with any listing on a Command or Dominator seat, and works on every listing you have on one, your scans, Search Console and Analytics.'}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-emerald-300">{url}</code>
          <button type="button" onClick={() => copy('url', url)} className={btn}>{copied === 'url' ? 'Copied' : 'Copy address'}</button>
        </div>
        <p className="mt-3 text-xs text-slate-500">An agent can never change a listing’s name, categories, phone, website or address. Every edit it makes is logged with the listing as it was, the same as an edit made here.</p>
      </div>

      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
      {!admin && bill && !open && (
        <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Two ways to switch it on</p>
          <h2 className="mt-1 text-lg font-semibold">Included with Command and Dominator</h2>
          <p className="mt-2 text-sm text-slate-300">{addon ? 'Add the listing add-on to any Google listing' : 'Put any Google listing on a Command seat'} and agent access comes with it at no extra cost: your agent can then do the everyday work on that listing (posts, review replies, hours, descriptions, services and attributes) as well as run scans and read Search Console and Analytics. <a href="/profiles?tab=plan" className="font-semibold text-emerald-300 underline">{addon ? 'Add the listing add-on' : 'Put a listing on Command'}</a></p>
          <p className="mt-3 text-sm text-slate-400">No listing to manage? The add-on gives your agent your scans, Search Console and Analytics for {dollars(AGENT_ADDON.cents)} a month.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={buy} disabled={busy || bill.ready === false} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">{busy ? 'Working…' : `Add AI agents · ${dollars(AGENT_ADDON.cents)} a month`}</button>
            <span className="text-xs text-slate-500">{bill.sub?.running ? 'Added to your subscription; the rest of this month is charged to your card now.' : 'Monthly. You pay on the next page; cancel any time.'}</span>
          </div>
          {payLink !== null && <p className="mt-3 text-sm text-amber-200">Your bank wants you to confirm this charge; the add-on switches on as soon as it goes through. {payLink ? <a href={payLink} target="_blank" rel="noreferrer" className="font-semibold underline">Confirm the payment</a> : 'Open “Card, invoices and cancelling” on the Plan and billing tab to finish it.'}</p>}
          {bill.ready === false && <p className="mt-2 text-xs text-amber-300">Checkout is being set up. Email sass@stakeoutsearch.com and we will sort it out.</p>}
        </div>
      )}
      {!admin && listed && !bill?.addon?.on && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{addon ? 'Agent access is included with your listings that have the listing add-on.' : 'Agent access is included with your listings on Command and Dominator.'} Make a key below.</p>}
      {!admin && bill?.addon?.on && listed && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">Agent access now comes with your listings on Command and Dominator, so you no longer need the add-on. Take it off below to stop paying for it.</p>}
      {!admin && bill?.addon?.on && <p className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"><span>The AI agents add-on is on: {dollars(AGENT_ADDON.cents)} a month.</span><button type="button" onClick={drop} disabled={busy} className="text-xs text-slate-300 hover:text-rose-300">Take it off</button></p>}

      <div className={card}>
        <h2 className="text-lg font-semibold">Connect Claude or ChatGPT by signing in</h2>
        <p className="mt-2 text-sm text-slate-400">No key to copy. Add Stakeout to your AI app as a custom connector with the address below. The app sends you here to sign in and approve it, and stays connected until you disconnect it.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="break-all rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100">{url}</code>
          <button type="button" onClick={() => copy('url', url)} className={btn}>{copied === 'url' ? 'Copied' : 'Copy address'}</button>
        </div>
        <h3 className="mt-5 text-sm font-semibold text-slate-200">Connected apps</h3>
        <ul className="mt-2 divide-y divide-slate-800 rounded-lg border border-slate-800">
          {apps === null ? <li className="px-3 py-2.5 text-sm text-slate-400">Loading…</li> : apps.length === 0 ? <li className="px-3 py-2.5 text-sm text-slate-400">No apps connected yet.</li> : apps.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0 break-words">{a.name}{a.from && <span className="ml-1 text-xs text-slate-500">{a.from}</span>}</span>
              <span className="flex items-center gap-4 text-xs text-slate-500">connected {day(a.createdAt)} · last used {day(a.lastUsedAt)}<button type="button" onClick={() => disconnect(a)} className="rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:border-rose-400 hover:text-rose-300">Disconnect</button></span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">A connected app acts as your account, within the limits below. It never sees your password.</p>
      </div>

      {open && <div className={card}>
        <h2 className="text-lg font-semibold">Keys</h2>
        <p className="mt-1 text-sm text-slate-400">For an agent that cannot sign in through a browser, or one you built yourself.</p>
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

      {open && budget && <div className={card}>
        <h2 className="text-lg font-semibold">Limits on what an agent does by itself</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          <li><span className="font-semibold text-slate-100">Scans.</span> An agent’s scan is a 5×5 grid (25 phone sessions) unless it asks for a larger one by name, and all of its scans together stop at the monthly limit below. Scans you start yourself do not count.</li>
          <li><span className="font-semibold text-slate-100">Low-rated reviews.</span> A reply to a review of 3 stars or fewer is never sent by an agent. It waits as a draft in your review inbox for you to read and send.</li>
          <li><span className="font-semibold text-slate-100">Changes someone else made.</span> An agent can keep or undo a change to a description or to hours. A change to a name, category, phone, website or address is left for you.</li>
          <li><span className="font-semibold text-slate-100">Services.</span> An agent adds, edits or removes the services it names. The rest of the list is never touched.</li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="agent-cap" className="text-sm text-slate-300">Phone sessions agents may spend on scans a month</label>
          <input id="agent-cap" type="number" min={0} max={20000} step={25} inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500" />
          <button type="button" onClick={saveCap} disabled={busy || cap === '' || Number(cap) === budget.cap} className={btn}>{copied === 'cap' ? 'Saved' : 'Save'}</button>
          <span className="text-xs text-slate-500">{budget.used} used so far this month · {budget.left} left · 0 stops agent scans</span>
        </div>
      </div>}

      <div className={card}>
        <h2 className="text-lg font-semibold">Ready-made jobs</h2>
        <p className="mt-1 text-sm text-slate-400">Four jobs to hand your agent. An agent connected here finds them by itself, as prompts. In any other chat, copy one and paste it in.</p>
        <ul className="mt-3 grid gap-3 lg:grid-cols-2">
          {PLAYBOOKS.map((b) => (
            <li key={b.name} className="flex flex-col rounded-lg border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="font-semibold text-slate-100">{b.title}</p><p className="mt-0.5 text-xs text-slate-500">{b.description}</p></div>
                <button type="button" onClick={() => copy(b.name, playbookText(b))} className={btn + ' shrink-0'}>{copied === b.name ? 'Copied' : 'Copy'}</button>
              </div>
              <p className="mt-2 line-clamp-3 text-xs text-slate-400">{playbookText(b)}</p>
            </li>
          ))}
        </ul>
      </div>

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
