'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PLANS, dollars, monthlyCents, unitCents, type Plan } from '@stakeout/core/gbpPlans';

type Loc = { id: string; name: string; plan: string | null };
type Profile = { id: string; name: string; status: string; problem: string | null; locations: Loc[] };
type Account = { id: string; profile: string | null; name: string | null };
type Row = { location: string; profile: string; title: string | null; plan: string; status: string; endsAt: string | null; on: boolean };
type Billing = { ready: boolean; listings: Row[]; sub: { status: string; periodEnd: string | null; running: boolean } | null; counts: Record<Plan, number>; monthlyCents: number };

// The plans a customer can buy today.
const ON_SALE = (['MANAGE', 'AGENT'] as Plan[]).filter((p) => PLANS[p].available);
const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const btn = 'rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500 disabled:opacity-40';
const go = 'rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40';
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

async function call<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j as T;
}

/** Sends the browser to Google to connect a Business account. */
export async function connectGoogle() {
  const r = await call<{ url: string }>('/api/gbp/connect', 'POST');
  window.location.assign(r.url);
}

/** Puts one listing on the Manage plan: to Stripe's checkout the first time, straight onto the subscription after that. */
export async function upgradeListing(profile: string, location: string): Promise<boolean> {
  const r = await call<{ url?: string; done?: boolean }>('/api/billing/gbp', 'POST', { add: [{ profile, location, plan: 'MANAGE' }] });
  if (r.url) { window.location.assign(r.url); return false; }
  return true;
}

/** What the free plan gives and what Manage adds, with the price: shown wherever a paid feature is locked. */
export function UpgradeCard({ profile, location, name, what, onDone }: { profile: string; location: string; name: string; what: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [billing, setBilling] = useState<Billing | null>(null);
  useEffect(() => { call<Billing>('/api/billing/gbp').then(setBilling).catch(() => {}); }, []);
  const next = (billing?.counts.MANAGE ?? 0) + 1;
  const running = Boolean(billing?.sub?.running);
  const upgrade = async () => {
    setBusy(true); setError('');
    try { if (await upgradeListing(profile, location)) onDone(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not upgrade.'); } finally { setBusy(false); }
  };
  return (
    <div className={card}>
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Manage plan</p>
      <h3 className="mt-1 text-lg font-semibold">{what} is part of the Manage plan</h3>
      <p className="mt-2 text-sm text-slate-400">Search insights are free on every listing you connect. Manage adds everything that changes a listing:</p>
      <ul className="mt-3 grid gap-1.5 text-sm text-slate-300 sm:grid-cols-2">
        <li>Edit hours, description, services and attributes</li>
        <li>Publish and schedule Google posts</li>
        <li>Read and answer reviews</li>
        <li>A daily check for changes you did not make</li>
        <li>Gaps against the businesses outranking you</li>
        <li>Every edit logged and checked on Google</li>
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={upgrade} disabled={busy || billing?.ready === false} className={go}>{busy ? 'Working…' : `Put ${name} on Manage · ${dollars(unitCents('MANAGE', next))} a month`}</button>
        <span className="text-xs text-slate-500">{running ? 'Added to your subscription; the rest of this month is charged to your card now.' : 'Monthly. Cancel any time; it keeps working until the month you paid for ends.'}</span>
      </div>
      {billing?.ready === false && <p className="mt-2 text-xs text-amber-300">Checkout is being set up. Email sass@stakeoutsearch.com and we will sort it out.</p>}
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </div>
  );
}

/** Plan and billing: the connected Google accounts, which listings are on a paid plan, and what the month costs. */
export default function GbpPlans({ profiles, accounts, onChanged }: { profiles: Profile[]; accounts: Account[]; onChanged: () => void }) {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<Plan>('MANAGE');
  const [find, setFind] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const read = useCallback(() => call<Billing>('/api/billing/gbp').then(setBilling).catch((e) => setError(e.message)), []);
  useEffect(() => { read(); }, [read]);

  const rows = useMemo(() => new Map((billing?.listings ?? []).map((r) => [r.location, r])), [billing]);
  const all = useMemo(() => profiles.flatMap((p) => p.locations.map((l) => ({ ...l, profile: p.id, account: p.name }))), [profiles]);
  const shown = all.filter((l) => l.name.toLowerCase().includes(find.trim().toLowerCase()));
  const counts = billing?.counts ?? { MANAGE: 0, AGENT: 0 };
  const paying = counts.MANAGE + counts.AGENT;
  // What the month costs once the ticked listings are on the chosen plan (one moving up from Manage leaves it).
  const next = { ...counts };
  for (const id of picked) { const r = rows.get(id); if (r?.status === 'ACTIVE' && (r.plan === 'MANAGE' || r.plan === 'AGENT')) next[r.plan]--; next[plan]++; }
  const run = async (key: string, what: () => Promise<void>) => {
    setBusy(key); setError(''); setNote('');
    try { await what(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(''); }
  };

  const add = () => run('add', async () => {
    const add = all.filter((l) => picked.has(l.id)).map((l) => ({ profile: l.profile, location: l.id, plan }));
    const r = await call<Billing & { url?: string }>('/api/billing/gbp', 'POST', { add });
    if (r.url) { window.location.assign(r.url); return; }
    setBilling(r); setPicked(new Set()); setNote(`${add.length} listing${add.length === 1 ? ' is' : 's are'} now on ${PLANS[plan].name}.`); onChanged();
  });
  const remove = (l: { id: string; name: string }) => run(l.id, async () => {
    const until = day(billing?.sub?.periodEnd ?? null);
    if (!window.confirm(`Take ${l.name} off its plan?${until ? ` It keeps working until ${until}.` : ''} Nothing is refunded.`)) return;
    setBilling(await call<Billing>('/api/billing/gbp', 'POST', { remove: l.id })); onChanged();
  });
  const portal = () => run('portal', async () => { window.location.assign((await call<{ url: string }>('/api/billing/gbp', 'POST', { portal: true })).url); });
  const disconnect = (a: Account) => run(a.id, async () => {
    if (!window.confirm(`Disconnect ${a.name ?? 'this Google account'}? Its listings come off their plans and leave this page. Nothing changes on Google.`)) return;
    await call('/api/gbp/connect?account=' + encodeURIComponent(a.id), 'DELETE'); await read(); onChanged();
  });

  const tiers = PLANS.MANAGE.tiers;
  return (
    <div className="space-y-5">
      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Your plan</h2>
          {billing?.sub && <button type="button" onClick={portal} disabled={busy === 'portal'} className={btn}>Card, invoices and cancelling</button>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-500">Connected listings</p><p className="mt-1 text-2xl font-bold tabular-nums">{all.length}</p><p className="text-xs text-slate-500">Search insights free on all of them</p></div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-500">On a plan</p><p className="mt-1 text-2xl font-bold tabular-nums">{paying}</p><p className="text-xs text-slate-500">{paying ? [counts.MANAGE ? `${counts.MANAGE} Manage at ${dollars(unitCents('MANAGE', counts.MANAGE))}` : '', counts.AGENT ? `${counts.AGENT} Agent at ${dollars(unitCents('AGENT', counts.AGENT))}` : ''].filter(Boolean).join(' · ') : 'None yet'}</p></div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-500">This month</p><p className="mt-1 text-2xl font-bold tabular-nums">{dollars(billing?.monthlyCents ?? 0)}</p><p className="text-xs text-slate-500">{billing?.sub?.status === 'past_due' ? <span className="text-rose-300">The last payment failed. Update the card.</span> : billing?.sub?.running && billing.sub.periodEnd ? (paying ? 'Renews ' : 'Ends ') + day(billing.sub.periodEnd) : 'No subscription'}</p></div>
        </div>
        <p className="mt-4 text-sm text-slate-400">Plans are priced per listing per month, and every listing on a plan gets the lower price once you pass a bracket.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-1 pr-3 font-medium">Listings on the plan</th>{tiers.map((t, i) => <th key={i} className="px-2 py-1 text-right font-medium">{t.upTo === null ? `${(tiers[i - 1]?.upTo ?? 0) + 1}+` : `${(tiers[i - 1]?.upTo ?? 0) + 1}–${t.upTo}`}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800">
              {ON_SALE.map((p) => (
                <tr key={p}><td className="py-1.5 pr-3"><span className="font-semibold text-slate-200">{PLANS[p].name}</span> <span className="text-xs text-slate-500">{PLANS[p].blurb}</span></td>{PLANS[p].tiers.map((t, i) => <td key={i} className="px-2 py-1.5 text-right tabular-nums text-slate-200">{dollars(t.cents)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {note && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{note}</p>}
      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Listings</h2>
          {all.length > 8 && <input className="w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-emerald-500" placeholder="Search listings" value={find} onChange={(e) => setFind(e.target.value)} />}
        </div>
        {all.length === 0 ? <p className="mt-2 text-sm text-slate-400">Connect a Google account below to see its listings here.</p> : (
          <ul className="mt-3 divide-y divide-slate-800 rounded-lg border border-slate-800">
            {shown.map((l) => {
              const r = rows.get(l.id);
              const on = Boolean(r?.on);
              return (
                <li key={l.profile + l.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <label className="flex min-w-0 items-center gap-3">
                    <input type="checkbox" className="h-4 w-4 accent-emerald-500" disabled={on && r?.status === 'ACTIVE' && r.plan === plan} checked={picked.has(l.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n; })} />
                    <span className="min-w-0 truncate">{l.name}</span>
                  </label>
                  <span className="flex shrink-0 items-center gap-3">
                    {on && r?.status === 'ACTIVE' && <><span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">{PLANS[r.plan as Plan]?.name ?? r.plan}</span><button type="button" onClick={() => remove(l)} disabled={busy === l.id} className="text-xs text-slate-400 hover:text-rose-300">Take off</button></>}
                    {r?.status === 'ENDING' && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">{PLANS[r.plan as Plan]?.name ?? r.plan} until {day(r.endsAt)}</span>}
                    {r?.status === 'ACTIVE' && !on && <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">Paused: payment needed</span>}
                    {(!r || r.status === 'PENDING') && <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">Free</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {all.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {ON_SALE.length > 1 && <div role="group" aria-label="Plan for the ticked listings" className="inline-flex overflow-hidden rounded-lg border border-slate-700 text-sm">
              {ON_SALE.map((p) => <button key={p} type="button" aria-pressed={plan === p} onClick={() => { setPlan(p); setPicked(new Set()); }} className={'px-3 py-2 ' + (plan === p ? 'bg-slate-700 font-semibold text-white' : 'text-slate-400 hover:text-slate-200')}>{PLANS[p].name}</button>)}
            </div>}
            <button type="button" onClick={add} disabled={!picked.size || busy === 'add' || billing?.ready === false} className={go}>{busy === 'add' ? 'Working…' : picked.size ? `Put ${picked.size} on ${PLANS[plan].name}` : `Tick listings to put on ${PLANS[plan].name}`}</button>
            {picked.size > 0 && <span className="text-sm text-slate-400">Your month becomes <span className="font-semibold text-slate-200">{dollars(monthlyCents(next))}</span>. {billing?.sub?.running ? 'The difference for the rest of this month is charged to your card now.' : 'You pay on the next page.'}</span>}
          </div>
        )}
        {billing?.ready === false && <p className="mt-3 text-xs text-amber-300">Checkout is being set up. Email sass@stakeoutsearch.com and we will sort it out.</p>}
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Google accounts</h2>
          <button type="button" onClick={() => run('connect', connectGoogle)} disabled={busy === 'connect'} className={btn}>{busy === 'connect' ? 'Opening Google…' : 'Connect another Google account'}</button>
        </div>
        <ul className="mt-3 divide-y divide-slate-800 rounded-lg border border-slate-800">
          {accounts.filter((a) => a.profile).map((a) => {
            const p = profiles.find((x) => x.id === a.profile);
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span>{a.name ?? 'Google account'} <span className="text-xs text-slate-500">· {p ? `${p.locations.length} listing${p.locations.length === 1 ? '' : 's'}` : 'not reachable'}{p && (p.status !== 'active' || p.problem) ? <span className="text-amber-300"> · needs reconnecting</span> : null}</span></span>
                <button type="button" onClick={() => disconnect(a)} disabled={busy === a.id} className="text-xs text-slate-400 hover:text-rose-300">Disconnect</button>
              </li>
            );
          })}
          {accounts.filter((a) => a.profile).length === 0 && <li className="px-3 py-2.5 text-sm text-slate-400">No Google account connected yet.</li>}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Connecting is free and read-only until you put a listing on a plan. Disconnecting removes our access; nothing changes on Google.</p>
      </div>
    </div>
  );
}
