'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import TeamSeats from './TeamSeats';
import { ACCOUNT_PLANS, ACCOUNT_PLAN_ORDER, ANNUAL_MONTHS_PAID, FOUNDING, FOUNDING_PLANS, LINES, SEATS, addedCents, dollars, lineCents, monthlyCents, monthlyPoints, rolloverMonths, yearCents, type AccountPlan, type Line, type Plan } from '@stakeout/core/gbpPlans';

type Loc = { id: string; name: string; plan: string | null };
type Profile = { id: string; name: string; status: string; problem: string | null; locations: Loc[] };
type Account = { id: string; profile: string | null; name: string | null };
type Row = { location: string; profile: string; title: string | null; plan: string; status: string; endsAt: string | null; on: boolean };
type Billing = { ready: boolean; listings: Row[]; sub: { status: string; periodEnd: string | null; running: boolean } | null; counts: Record<Line, number>; seats: number; pointsPerMonth: number; monthlyCents: number; newPlans?: boolean; legacy?: boolean; plan?: AccountPlan | null; briefs?: { plan: number; carry: number; bought: number; left: number; perMonth: number }; interval?: 'month' | 'year'; periodCents?: number; founding?: number | null; foundingLeft?: number; /** Signed in as a team member: the plan is shown, not changed. */ teamMember?: boolean };

/** The seats a listing can be put on before the account plans. */
const LISTING_SEATS: Plan[] = ['COMMAND', 'DOMINATOR'];
/** What a listing can be put on for this account: the listing add-on with the account plans (seats too for an account that has them). */
const listingSeats = (b: Billing | null): Plan[] => (!b?.newPlans ? LISTING_SEATS : b.legacy ? (b.plan ? ['LISTING', ...LISTING_SEATS] : LISTING_SEATS) : ['LISTING']);
const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
/** What happens to a plan's unused sessions at the month's end, as it is billed. */
const rolloverText = (p: AccountPlan, year: boolean) => { const m = rolloverMonths(p, year ? 'year' : 'month'); return m === 0 ? `Unused sessions reset each month${ACCOUNT_PLANS[p].rollover.year ? ' (one month rolls over when paid yearly)' : ''}` : `Unused sessions roll over for ${m === 1 ? 'one month' : m === 2 ? 'two months' : m + ' months'}`; };
const foundingNames = FOUNDING_PLANS.map((p) => ACCOUNT_PLANS[p].name).join(', ').replace(/, ([^,]*)$/, ' or $1');
/** The listing add-on's price as this account pays it: a yearly plan's add-ons are billed with it, yearly. */
const addonPrice = (b: Billing | null) => (b?.interval === 'year' ? `${dollars(LINES.LISTING.tiers[0].cents * ANNUAL_MONTHS_PAID)} a year` : `${dollars(LINES.LISTING.tiers[0].cents)} a month`);
const btn = 'rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500 disabled:opacity-40';
const go = 'rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40';
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
const EMPTY: Record<Line, number> = { DOMINATOR: 0, COMMAND: 0, SCOUT: 0, MANAGE: 0, AGENT: 0, LISTING: 0, P_SCOUT: 0, P_AGENCY: 0, P_SCALE: 0, P_MAX: 0 };

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

/** Puts one listing on a Command seat: to Stripe's checkout the first time, straight onto the subscription after that. */
export async function upgradeListing(profile: string, location: string, plan: Plan = 'COMMAND'): Promise<boolean> {
  const r = await call<{ url?: string; done?: boolean }>('/api/billing/gbp', 'POST', { add: [{ profile, location, plan }] });
  if (r.url) { window.location.assign(r.url); return false; }
  return true;
}

/** What the free plan gives and what a Command seat adds, with the price: shown wherever a paid feature is locked. */
export function UpgradeCard({ profile, location, name, what, onDone }: { profile: string; location: string; name: string; what: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [billing, setBilling] = useState<Billing | null>(null);
  useEffect(() => { call<Billing>('/api/billing/gbp').then(setBilling).catch(() => {}); }, []);
  const running = Boolean(billing?.sub?.running);
  const addon = Boolean(billing?.newPlans && !billing.legacy);
  const upgrade = async () => {
    setBusy(true); setError('');
    try { if (await upgradeListing(profile, location, addon ? 'LISTING' : 'COMMAND')) onDone(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not upgrade.'); } finally { setBusy(false); }
  };
  if (addon) return (
    <div className={card}>
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Listing add-on</p>
      <h3 className="mt-1 text-lg font-semibold">{what} comes with the listing add-on</h3>
      <p className="mt-2 text-sm text-slate-400">Your website’s Search Console and Analytics are free. The listing add-on is everything about the Google listing itself, with AI agents, {LINES.LISTING.points} phone sessions and {LINES.LISTING.briefs} brief credit a month, for {addonPrice(billing)} per listing on top of your plan:</p>
      <ul className="mt-3 grid gap-1.5 text-sm text-slate-300 sm:grid-cols-2">
        <li>Calls, directions and searches, straight from Google</li>
        <li>Edit hours, description, services and attributes</li>
        <li>Publish and schedule posts</li>
        <li>Review alerts and replies</li>
        <li>A daily check for changes you did not make</li>
        <li>AI agents that can work on the listing</li>
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {billing?.plan
          ? <button type="button" onClick={upgrade} disabled={busy || billing?.ready === false} className={go}>{busy ? 'Working…' : `Add ${name} · ${addonPrice(billing)}`}</button>
          : <a href="/profiles?tab=plan" className={go}>Choose a plan first</a>}
        <span className="text-xs text-slate-500">{billing?.plan ? (running ? 'Added to your subscription; the rest of this month is charged to your card now.' : 'Monthly. Cancel any time.') : 'The add-on goes on top of Scout, Agency or Scale.'}</span>
      </div>
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </div>
  );
  return (
    <div className={card}>
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Command seat</p>
      <h3 className="mt-1 text-lg font-semibold">{what} comes with a Command seat</h3>
      <p className="mt-2 text-sm text-slate-400">Your website’s Search Console and Analytics are free. A Command seat is everything about the Google listing itself, plus 550 phone sessions a month for its scans:</p>
      <ul className="mt-3 grid gap-1.5 text-sm text-slate-300 sm:grid-cols-2">
        <li>Calls, directions and searches, straight from Google</li>
        <li>Edit hours, description, services and attributes</li>
        <li>Publish and schedule posts</li>
        <li>Review alerts and replies</li>
        <li>A daily check for changes you did not make</li>
        <li>Gaps against the businesses outranking you</li>
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={upgrade} disabled={busy || billing?.ready === false} className={go}>{busy ? 'Working…' : `Put ${name} on Command · ${dollars(addedCents('COMMAND', billing?.counts.COMMAND ?? 0))} a month`}</button>
        <span className="text-xs text-slate-500">{running ? 'Added to your subscription; the rest of this month is charged to your card now.' : 'Monthly. Cancel any time; it keeps working until the month you paid for ends.'}</span>
      </div>
      {billing?.ready === false && <p className="mt-2 text-xs text-amber-300">Checkout is being set up. Email sass@stakeoutsearch.com and we will sort it out.</p>}
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </div>
  );
}

/**
 * Straight after a Google account is connected: the listings found in it, to tick the ones to put
 * on a seat. One listing comes ticked; several come with "select all" and a search. The price
 * follows the ticks.
 */
export function GbpPicker({ profiles, onClose, onDone }: { profiles: Profile[]; onClose: () => void; onDone: (note: string) => void }) {
  const [billing, setBilling] = useState<Billing | null>(null);
  const all = useMemo(() => profiles.flatMap((p) => p.locations.filter((l) => l.plan === null).map((l) => ({ ...l, profile: p.id }))), [profiles]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(all.length === 1 ? [all[0].id] : []));
  const [plan, setPlan] = useState<Plan>('COMMAND');
  const [find, setFind] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pay, setPay] = useState<string | null | undefined>(undefined);
  useEffect(() => { call<Billing>('/api/billing/gbp').then((b) => { setBilling(b); setPlan(listingSeats(b)[0]); }).catch(() => {}); }, []);
  const needsPlan = Boolean(billing?.newPlans && !billing.legacy && !billing.plan);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onClose]);

  const have = billing?.counts[plan] ?? 0;
  const more = addedCents(plan, have, picked.size);
  const shown = all.filter((l) => l.name.toLowerCase().includes(find.trim().toLowerCase()));
  const allOn = shown.length > 0 && shown.every((l) => picked.has(l.id));
  const tick = (id: string, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const activate = async () => {
    setBusy(true); setError('');
    try {
      const add = all.filter((l) => picked.has(l.id)).map((l) => ({ profile: l.profile, location: l.id, plan }));
      const r = await call<{ url?: string; pay?: string | null }>('/api/billing/gbp', 'POST', { add });
      if (r.url) { window.location.assign(r.url); return; }
      if (r.pay !== undefined) { setPay(r.pay); return; }
      onDone(`${add.length} listing${add.length === 1 ? ' is' : 's are'} now on ${LINES[plan].name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <section role="dialog" aria-modal="true" aria-label="Choose listings to activate" onClick={(e) => e.stopPropagation()} className="w-full max-w-lg space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Google account connected</p>
              <h2 className="mt-1 text-lg font-semibold">{all.length === 0 ? 'No listings to activate' : all.length === 1 ? 'We found your Google Business listing' : `We found ${all.length} Google Business listings`}</h2>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">Not now</button>
          </div>
          {pay !== undefined ? (
            <>
              <p className="text-sm text-slate-300">Your bank wants you to confirm this charge. The listings switch on as soon as it goes through; nothing is activated until then.</p>
              {pay ? <a href={pay} target="_blank" rel="noreferrer" className={go + ' inline-block'}>Confirm the payment</a> : <p className="text-sm text-amber-300">Open “Card, invoices and cancelling” on the Plan and billing tab to finish the payment.</p>}
              <button type="button" onClick={() => onDone('Waiting for the payment to be confirmed. Your listings switch on as soon as it is.')} className="block text-sm text-slate-400 hover:text-slate-200">Done</button>
            </>
          ) : all.length === 0 ? (
            <p className="text-sm text-slate-400">{profiles.some((p) => p.locations.length) ? 'Every listing in your connected accounts is already on a seat.' : 'That Google login manages no Business Profiles. Connect the login that does, from the Plan and billing tab.'}</p>
          ) : (
            <>
              <div role="group" aria-label="Seat for the ticked listings" className="inline-flex overflow-hidden rounded-lg border border-slate-700 text-sm">
                {listingSeats(billing).map((p) => <button key={p} type="button" aria-pressed={plan === p} onClick={() => setPlan(p)} className={'px-3 py-2 ' + (plan === p ? 'bg-slate-700 font-semibold text-white' : 'text-slate-400 hover:text-slate-200')}>{LINES[p].name} · {dollars(LINES[p].tiers[0].cents)}</button>)}
              </div>
              <p className="text-sm text-slate-400">{LINES[plan].blurb} {plan === 'LISTING' ? `${addonPrice(billing)} per listing.` : `${LINES[plan].points.toLocaleString()} phone sessions a month per listing.`}</p>
              {needsPlan && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">The listing add-on goes on top of a plan. <a href="/profiles?tab=plan" className="font-semibold underline">Choose Scout, Agency or Scale</a> first, then come back to switch listings on.</p>}
              {all.length > 1 && (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={allOn} onChange={(e) => setPicked((s) => { const n = new Set(s); for (const l of shown) { if (e.target.checked) n.add(l.id); else n.delete(l.id); } return n; })} /> Select all{find.trim() ? ' shown' : ''}</label>
                  <input className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-emerald-500" placeholder="Search listings" value={find} onChange={(e) => setFind(e.target.value)} />
                </div>
              )}
              <ul className="max-h-[40vh] divide-y divide-slate-800 overflow-y-auto rounded-lg border border-slate-800">
                {shown.map((l) => (
                  <li key={l.profile + l.id}><label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-800/50"><input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={picked.has(l.id)} onChange={(e) => tick(l.id, e.target.checked)} /><span className="min-w-0 truncate">{l.name}</span></label></li>
                ))}
                {!shown.length && <li className="px-3 py-2.5 text-sm text-slate-400">No listing matches that.</li>}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={activate} disabled={busy || !picked.size || billing?.ready === false || needsPlan} className={go}>{busy ? 'Working…' : picked.size ? `Activate ${picked.size} on ${LINES[plan].name} · ${dollars(more)} a month${have ? ' more' : ''}` : 'Tick the listings to activate'}</button>
                {picked.size > 0 && <span className="text-xs text-slate-500">{billing?.sub?.running ? 'The rest of this month is charged to your card now.' : 'You pay on the next page. Cancel any time.'}</span>}
              </div>
              {billing?.ready === false && <p className="text-xs text-amber-300">Checkout is being set up. Email sass@stakeoutsearch.com and we will sort it out.</p>}
              <p className="text-xs text-slate-500">If no listing is put on a seat within the hour, the connection is removed; connecting again takes a minute. Nothing changes on Google either way.</p>
            </>
          )}
          {error && <p className="text-sm text-rose-300">{error}</p>}
        </section>
      </div>
    </div>
  );
}

/** Plan and billing: the seats (Scout by number, Command and Dominator per listing), what the month costs, and the connected Google accounts. */
export default function GbpPlans({ profiles, accounts, onChanged }: { profiles: Profile[]; accounts: Account[]; onChanged: () => void }) {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<Plan>('COMMAND');
  const [scout, setScout] = useState<number | null>(null);
  const [find, setFind] = useState('');
  // Monthly or yearly, for the first checkout (a running plan keeps how it is billed). A link from the pricing page can ask for yearly.
  const [yearly, setYearly] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('billing') === 'annual') setYearly(true); }, []);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // Set when the bank wants a charge confirmed: the page where that is done ('' when Stripe gave none).
  const [payLink, setPayLink] = useState<string | null>(null);

  const read = useCallback(() => call<Billing>('/api/billing/gbp').then((b) => { setBilling(b); setScout(b.counts.SCOUT ?? 0); setPlan(listingSeats(b)[0]); }).catch((e) => setError(e.message)), []);
  useEffect(() => { read(); }, [read]);

  const rows = useMemo(() => new Map((billing?.listings ?? []).map((r) => [r.location, r])), [billing]);
  const all = useMemo(() => profiles.flatMap((p) => p.locations.map((l) => ({ ...l, profile: p.id, account: p.name }))), [profiles]);
  const shown = all.filter((l) => l.name.toLowerCase().includes(find.trim().toLowerCase()));
  const counts = billing?.counts ?? EMPTY;
  // What the month costs once the ticked listings are on the chosen seat (one moving from another seat leaves it).
  const next: Record<Line, number> = { ...counts };
  for (const id of picked) { const r = rows.get(id); if (r?.status === 'ACTIVE' && r.plan in next) next[r.plan as Line]--; next[plan]++; }
  const scoutWant = scout ?? counts.SCOUT;
  const withScout: Record<Line, number> = { ...counts, SCOUT: scoutWant };
  const run = async (key: string, what: () => Promise<void>) => {
    setBusy(key); setError(''); setNote('');
    try { await what(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(''); }
  };

  const add = () => run('add', async () => {
    const add = all.filter((l) => picked.has(l.id)).map((l) => ({ profile: l.profile, location: l.id, plan }));
    const r = await call<Billing & { url?: string; pay?: string | null }>('/api/billing/gbp', 'POST', { add });
    if (r.url) { window.location.assign(r.url); return; }
    if (r.pay !== undefined) { setBilling(r); setPicked(new Set()); setPayLink(r.pay ?? ''); onChanged(); return; }
    setBilling(r); setPicked(new Set()); setNote(`${add.length} listing${add.length === 1 ? ' is' : 's are'} now on ${LINES[plan].name}.`); onChanged();
  });
  const saveScout = () => run('scout', async () => {
    const n = Math.max(0, Math.min(500, Math.round(scoutWant)));
    if (n < counts.SCOUT && !window.confirm(`Go down to ${n} Scout seat${n === 1 ? '' : 's'}? The change is immediate and nothing is refunded; the phone sessions already added this month stay.`)) return;
    const r = await call<Billing & { url?: string; pay?: string | null }>('/api/billing/gbp', 'POST', { scout: n });
    if (r.url) { window.location.assign(r.url); return; }
    if (r.pay !== undefined) { setBilling(r); setPayLink(r.pay ?? ''); return; }
    setBilling(r); setScout(r.counts.SCOUT); setNote(`You have ${r.counts.SCOUT} Scout seat${r.counts.SCOUT === 1 ? '' : 's'}.`);
  });
  const remove = (l: { id: string; name: string }) => run(l.id, async () => {
    const until = day(billing?.sub?.periodEnd ?? null);
    if (!window.confirm(`Take ${l.name} off its seat?${until ? ` It keeps working until ${until}.` : ''} Nothing is refunded.`)) return;
    setBilling(await call<Billing>('/api/billing/gbp', 'POST', { remove: l.id })); onChanged();
  });
  const portal = () => run('portal', async () => { window.location.assign((await call<{ url: string }>('/api/billing/gbp', 'POST', { portal: true })).url); });
  // The account plan: chosen (Stripe's checkout the first time), switched, or taken off.
  const choosePlan = (want: AccountPlan | null) => run('plan', async () => {
    const now = billing?.plan ?? null;
    const price = (p: AccountPlan) => ACCOUNT_PLANS[p].tiers[0].cents;
    const year = billing?.interval === 'year';
    const priced = (p: AccountPlan) => (year ? `${dollars(yearCents(p))} a year` : `${dollars(price(p))} a month`);
    if (now && want && !window.confirm(price(want) > price(now)
      ? `Switch to ${ACCOUNT_PLANS[want].name} (${priced(want)})? The difference for the rest of this ${year ? 'year' : 'month'} is charged to your card now.`
      : `Switch to ${ACCOUNT_PLANS[want].name} (${priced(want)})? It takes effect now; ${year ? 'the unused part of this year comes off your next renewal' : 'nothing is refunded'}.`)) return;
    if (now && !want && !window.confirm(`End your ${ACCOUNT_PLANS[now].name} plan? It keeps working until the ${year ? 'year' : 'month'} you paid for ends; nothing is refunded.`)) return;
    const r = await call<Billing & { url?: string; pay?: string | null }>('/api/billing/gbp', 'POST', { plan: want, ...(now || !want || billing?.sub?.running ? {} : { interval: yearly ? 'year' : 'month' }) });
    if (r.url) { window.location.assign(r.url); return; }
    if (r.pay !== undefined) { setBilling(r); setPayLink(r.pay ?? ''); return; }
    setBilling(r); setNote(want ? `You are on ${ACCOUNT_PLANS[want].name}.` : 'Your plan ends with the month already paid for.'); onChanged();
  });
  const disconnect = (a: Account) => run(a.id, async () => {
    if (!window.confirm(`Disconnect ${a.name ?? 'this Google account'}? Its listings come off their seats and leave this page. Nothing changes on Google.`)) return;
    await call('/api/gbp/connect?account=' + encodeURIComponent(a.id), 'DELETE'); await read(); onChanged();
  });

  const tiers = LINES.COMMAND.tiers;
  const seatLabel = (l: Line) => `${counts[l]} ${LINES[l].name}`;
  const newPlans = Boolean(billing?.newPlans);
  const onSeats = !newPlans || Boolean(billing?.legacy);
  const addon = newPlans && !billing?.legacy;
  return (
    <div className="space-y-5">
      {newPlans && (
        <div className={card} id="plans">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">{billing?.teamMember ? 'The account’s plan' : 'Your plan'}</h2>
            {billing?.sub && !billing.teamMember && <button type="button" onClick={portal} disabled={busy === 'portal'} className={btn}>Card, invoices and cancelling</button>}
          </div>
          {billing?.teamMember && <p className="mt-2 text-sm text-slate-400">You work in this account as a team member: the owner chooses and pays for the plan.</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-500">Plan</p><p className="mt-1 text-2xl font-bold">{billing?.plan ? ACCOUNT_PLANS[billing.plan].name : 'None yet'}</p><p className="text-xs text-slate-500">{counts.LISTING ? `${counts.LISTING} listing add-on${counts.LISTING === 1 ? '' : 's'}` : 'No listing add-ons'}</p></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-500">Phone sessions a month</p><p className="mt-1 text-2xl font-bold tabular-nums">{(billing?.pointsPerMonth ?? 0).toLocaleString()}</p><p className="text-xs text-slate-500">{billing?.founding && billing.plan && ACCOUNT_PLANS[billing.plan].founding ? `Founding member #${billing.founding}: ${FOUNDING.bonus * 100}% more plan sessions` : billing?.plan ? rolloverText(billing.plan, billing.interval === 'year') : 'Pick a plan below'}</p></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-500">Brief credits left</p><p className="mt-1 text-2xl font-bold tabular-nums">{billing?.briefs?.left ?? 0}</p><p className="text-xs text-slate-500">{billing?.briefs?.perMonth ? `${billing.briefs.perMonth} a month` : 'None a month'}{billing?.briefs?.bought ? ` · ${billing.briefs.bought} bought` : ''}</p></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-500">{billing?.interval === 'year' ? 'This year' : 'This month'}</p><p className="mt-1 text-2xl font-bold tabular-nums">{dollars(billing?.periodCents ?? billing?.monthlyCents ?? 0)}</p><p className="text-xs text-slate-500">{billing?.sub?.periodEnd && billing.sub.running ? `Renews ${day(billing.sub.periodEnd)}` : 'Monthly or yearly, cancel any time'}</p></div>
          </div>
          {!billing?.plan && (billing?.foundingLeft ?? 0) > 0 && (
            <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-100">
              <span className="font-semibold">Founding members:</span> the first {FOUNDING.seats} accounts to start {foundingNames} get {FOUNDING.bonus * 100}% more phone sessions every month, for as long as they stay on one of them. {billing?.foundingLeft} of {FOUNDING.seats} spots left.
            </p>
          )}
          {!billing?.sub?.running && !billing?.teamMember && (
            <div role="group" aria-label="Billing" className="mt-4 inline-flex rounded-lg border border-slate-700 p-1 text-sm">
              <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)} className={'rounded-md px-3 py-1.5 ' + (!yearly ? 'bg-slate-700 font-semibold text-white' : 'text-slate-300 hover:text-white')}>Monthly</button>
              <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)} className={'rounded-md px-3 py-1.5 ' + (yearly ? 'bg-slate-700 font-semibold text-white' : 'text-slate-300 hover:text-white')}>Yearly: 2 months free</button>
            </div>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {ACCOUNT_PLAN_ORDER.map((p) => {
              const d = ACCOUNT_PLANS[p];
              const mine = billing?.plan === p;
              // Prices as this account would pay them: a running plan's own billing, otherwise the switch.
              const year = billing?.sub?.running ? billing.interval === 'year' : yearly;
              // The founding bonus on this plan: for a founding member, or while spots are left for an account not yet on a plan.
              const founding = d.founding && (Boolean(billing?.founding) || (!billing?.plan && (billing?.foundingLeft ?? 0) > 0));
              const more = monthlyPoints({ [p]: 1 }, true);
              return (
                <div key={p} className={'rounded-lg border p-4 ' + (mine ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-slate-800 bg-slate-950')}>
                  <div className="flex items-baseline justify-between gap-2"><p className="font-semibold text-slate-100">{d.name}</p><p className="text-lg font-bold tabular-nums">{year ? dollars(yearCents(p)) : dollars(d.tiers[0].cents)}<span className="text-xs font-normal text-slate-500">{year ? ' a year' : ' a month'}</span></p></div>
                  <p className="mt-1 text-xs text-slate-500">{year ? `${dollars(Math.round(yearCents(p) / 12))} a month, ${12 - ANNUAL_MONTHS_PAID} months free · ` : ''}{d.bestFor}</p>
                  <ul className="mt-3 space-y-1 text-sm text-slate-300">
                    <li>{founding && billing?.founding ? `${more.toLocaleString()} phone sessions a month (founding)` : `${d.points.toLocaleString()} phone sessions a month (${Math.floor(d.points / 25)} 5×5 scans)`}{founding && !billing?.founding ? `, ${more.toLocaleString()} as a founding member` : ''}</li>
                    <li>{d.briefs} brief credit{d.briefs === 1 ? '' : 's'} a month</li>
                    <li>{d.whiteLabel ? 'White-label reports: your logo, name and color, on your own domain' : 'Share links with the Stakeout badge'}</li>
                    <li>{d.seats === null ? 'Unlimited team seats' : d.seats === 1 ? 'One seat (just you)' : `${d.seats} team seats, you included`}</li>
                    <li>{rolloverText(p, year)}</li>
                  </ul>
                  <div className="mt-3">
                    {mine
                      ? <span className="text-sm font-semibold text-emerald-300">{billing?.teamMember ? 'This account’s plan' : 'Your plan'}</span>
                      : billing?.teamMember ? null
                      : <button type="button" onClick={() => choosePlan(p)} disabled={busy === 'plan' || billing?.ready === false} className={billing?.plan ? btn : go}>{busy === 'plan' ? 'Working…' : billing?.plan ? `Switch to ${d.name}` : `Choose ${d.name}`}</button>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">Every phone session is one real phone run at one grid point, with the map results, the AI Overview, the ads and a screen recording. Yearly plans are paid once a year ({ANNUAL_MONTHS_PAID} months’ price for 12); their phone sessions and brief credits still come every month. Add the listing add-on ({dollars(LINES.LISTING.tiers[0].cents)} a month per Google listing) for the listing tools, AI agents, {LINES.LISTING.points} more phone sessions and {LINES.LISTING.briefs} more brief credit a month.{billing?.plan && !billing.teamMember ? ' ' : ''}{billing?.plan && !billing.teamMember && <button type="button" onClick={() => choosePlan(null)} disabled={busy === 'plan'} className="text-slate-400 underline hover:text-rose-300">End my plan</button>}</p>
        </div>
      )}
      {newPlans && <TeamSeats />}
      {onSeats && <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Your seats</h2>
          {billing?.sub && <button type="button" onClick={portal} disabled={busy === 'portal'} className={btn}>Card, invoices and cancelling</button>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-500">Client seats</p><p className="mt-1 text-2xl font-bold tabular-nums">{billing?.seats ?? 0}</p><p className="text-xs text-slate-500">{billing?.seats ? SEATS.filter((l) => counts[l]).map(seatLabel).join(' · ') : 'None yet'}</p></div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-500">Phone sessions a month</p><p className="mt-1 text-2xl font-bold tabular-nums">{(billing?.pointsPerMonth ?? 0).toLocaleString()}</p><p className="text-xs text-slate-500">Unused sessions roll over for one month</p></div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4"><p className="text-xs text-slate-500">This month</p><p className="mt-1 text-2xl font-bold tabular-nums">{dollars(billing?.monthlyCents ?? 0)}</p><p className="text-xs text-slate-500">{billing?.sub?.status === 'past_due' ? <span className="text-rose-300">The last payment failed. Update the card.</span> : billing?.sub?.running && billing.sub.periodEnd ? (billing.seats ? 'Renews ' : 'Ends ') + day(billing.sub.periodEnd) : 'No subscription'}</p></div>
        </div>
        <p className="mt-4 text-sm text-slate-400">Seats are priced per client per month. Each bracket’s price applies only to the clients inside it. White-label is free from 10 client seats.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-1 pr-3 font-medium">Seat</th>{tiers.map((t, i) => <th key={i} className="px-2 py-1 text-right font-medium">{t.upTo === null ? `${(tiers[i - 1]?.upTo ?? 0) + 1}+` : `${(tiers[i - 1]?.upTo ?? 0) + 1}–${t.upTo}`}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800">
              {SEATS.map((l) => (
                <tr key={l}><td className="py-1.5 pr-3"><span className="font-semibold text-slate-200">{LINES[l].name}</span> <span className="text-xs text-slate-500">{LINES[l].points.toLocaleString()} phone sessions a month{l === 'SCOUT' ? ', by number' : ', per Google listing'}</span></td>{LINES[l].tiers.map((t, i) => <td key={i} className="px-2 py-1.5 text-right tabular-nums text-slate-200">{dollars(t.cents)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {note && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{note}</p>}
      {payLink !== null && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">Your bank wants you to confirm this charge. The seats switch on as soon as it goes through. {payLink ? <a href={payLink} target="_blank" rel="noreferrer" className="font-semibold underline">Confirm the payment</a> : 'Open “Card, invoices and cancelling” to finish it.'}</p>}
      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

      {onSeats && (!newPlans || counts.SCOUT > 0) && <div className={card}>
        <h2 className="text-lg font-semibold">Scout seats</h2>
        <p className="mt-1 text-sm text-slate-400">{LINES.SCOUT.blurb} Bought by number, for clients whose Google listing is not managed here.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label htmlFor="scout-seats" className="text-sm text-slate-300">Scout seats</label>
          <input id="scout-seats" type="number" min={0} max={500} value={scoutWant} onChange={(e) => setScout(Math.max(0, Math.min(500, Number(e.target.value) || 0)))} className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm tabular-nums outline-none focus:border-emerald-500" />
          <button type="button" onClick={saveScout} disabled={busy === 'scout' || scoutWant === counts.SCOUT || billing?.ready === false} className={go}>{busy === 'scout' ? 'Working…' : scoutWant > counts.SCOUT ? `Add ${scoutWant - counts.SCOUT} · ${dollars(lineCents('SCOUT', scoutWant) - lineCents('SCOUT', counts.SCOUT))} a month more` : scoutWant < counts.SCOUT ? `Go down to ${scoutWant}` : 'Save'}</button>
          {scoutWant !== counts.SCOUT && <span className="text-sm text-slate-400">Your month becomes <span className="font-semibold text-slate-200">{dollars(monthlyCents(withScout))}</span>. {billing?.sub?.running ? (scoutWant > counts.SCOUT ? 'The rest of this month is charged now, with its share of the phone sessions.' : 'Nothing is refunded.') : 'You pay on the next page.'}</span>}
        </div>
      </div>}

      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Google listings</h2>
          {all.length > 8 && <input className="w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-emerald-500" placeholder="Search listings" value={find} onChange={(e) => setFind(e.target.value)} />}
        </div>
        <p className="mt-1 text-sm text-slate-400">{addon ? `The listing add-on puts a Google listing to work: edits, posts, review alerts and replies, the change watchdog, rival gaps and AI agents, with ${LINES.LISTING.points} phone sessions and ${LINES.LISTING.briefs} brief credit a month, for ${addonPrice(billing)} per listing on top of your plan.` : 'A listing on Command or Dominator is a client seat with the listing tools: edits, posts, review alerts and replies, the change watchdog, rival gaps and AI agents.'}</p>
        {addon && !billing?.plan && all.length > 0 && <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">Choose a plan above first: the listing add-on goes on top of it.</p>}
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
                    {on && r?.status === 'ACTIVE' && <><span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">{LINES[r.plan as Line]?.name ?? r.plan}</span><button type="button" onClick={() => remove(l)} disabled={busy === l.id} className="text-xs text-slate-400 hover:text-rose-300">Take off</button></>}
                    {r?.status === 'ENDING' && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">{LINES[r.plan as Line]?.name ?? r.plan} until {day(r.endsAt)}</span>}
                    {r?.status === 'ACTIVE' && !on && <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">Paused: payment needed</span>}
                    {r?.status === 'PENDING' && billing?.sub?.running && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">Waiting for payment</span>}
                    {(!r || (r.status === 'PENDING' && !billing?.sub?.running)) && <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">Free</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {all.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Seat for the ticked listings" className="inline-flex overflow-hidden rounded-lg border border-slate-700 text-sm">
              {listingSeats(billing).map((p) => <button key={p} type="button" aria-pressed={plan === p} onClick={() => { setPlan(p); setPicked(new Set()); }} className={'px-3 py-2 ' + (plan === p ? 'bg-slate-700 font-semibold text-white' : 'text-slate-400 hover:text-slate-200')}>{LINES[p].name}</button>)}
            </div>
            <button type="button" onClick={add} disabled={!picked.size || busy === 'add' || billing?.ready === false || (addon && !billing?.plan)} className={go}>{busy === 'add' ? 'Working…' : picked.size ? `Put ${picked.size} on ${LINES[plan].name}` : `Tick listings to put on ${LINES[plan].name}`}</button>
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
        <p className="mt-2 text-xs text-slate-500">A newly connected account with no listing put on a seat within the hour is removed, and one whose seat has ended is removed after 7 days; connecting again takes a minute. Disconnecting removes our access; nothing changes on Google.</p>
      </div>
    </div>
  );
}
