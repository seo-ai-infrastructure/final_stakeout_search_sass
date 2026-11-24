'use client';
import { Fragment, useEffect, useState } from 'react';
import { ACCOUNT_PLANS, ACCOUNT_PLAN_ORDER, type AccountPlan } from '@stakeout/core/gbpPlans';

/** The price list in groups, each under its own heading. */
const groupOf = (key?: string) => (!key ? '' : key === 'welcome' ? 'welcome' : key === 'closer' ? 'closer' : key === 'boost-250' ? 'boost' : key.startsWith('sessions-') ? 'sessions' : key.startsWith('briefs-') ? 'briefs' : key.startsWith('prospect') ? 'prospect' : key.startsWith('topup') ? 'topup' : key === 'white-label' ? 'extra' : key === 'admin-test' ? 'test' : 'other');
const GROUPS: Record<string, string> = {
  welcome: 'Your first audit · one time',
  prospect: 'Prospect audits · no subscription, valid 90 days',
  topup: 'More phone sessions · for seat holders, never expire',
  closer: 'Live 5G Proof Pack · no subscription, one per account',
  boost: 'Boost · for plan holders running low this month',
  sessions: 'Phone sessions · every surface in one run, never expire',
  briefs: 'Brief credits · one compiles a revenue brief or updates one',
  extra: 'Extras',
  test: 'Admin',
  other: 'Other',
};
type Item = { key: string; name: string; credits: number; cents: number; blurb: string; briefs?: number; featured?: boolean };
const usd = (cents: number) => '$' + (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));
const many = (n: number, one: string) => `${n.toLocaleString('en-US')} ${one}${n === 1 ? '' : 's'}`;
/** The plan's month and the Boost, from the price list (see boostOffer): a second Boost in a month is met with the upgrade's figures first. */
type BoostInfo = { eligible: boolean; left: number; monthly: number; boosts: number; upgrade: { to: AccountPlan; name: string; chargeCents: number; sessionsNow: number; boostCents: number; savingsCents: number; monthlyAfter: number; priceAfter: string } | null };
/** The plans in one line: price, sessions and brief credits a month. */
const PLAN_LINE = ACCOUNT_PLAN_ORDER.map((p) => `${ACCOUNT_PLANS[p].name} ${usd(ACCOUNT_PLANS[p].tiers[0].cents)} (${ACCOUNT_PLANS[p].points.toLocaleString('en-US')} phone sessions, ${many(ACCOUNT_PLANS[p].briefs, 'brief credit')} a month)`).join(', ');
type Props = {
  isOpen: boolean;
  /** The item to start on, by its price list key, when it is on offer. */
  want?: string;
  onClose: () => void;
  userId: string;
  currentBalance: number;
  onBalanceUpdated: (n: number) => void;
};

/** Buying points once (first audit, prospect audits, top-ups) and the way to monthly seats. */
export function CreditTopUpModal(p: Props) {
  const [items, setItems] = useState<Item[]>([]),
    [pick, choose] = useState(''),
    [accountPlan, setAccountPlan] = useState<AccountPlan | null>(null),
    [briefs, setBriefs] = useState<number | null>(null),
    [boost, setBoost] = useState<BoostInfo | null>(null),
    // The upgrade shown in place of a second Boost this month, until the buyer chooses.
    [intercept, setIntercept] = useState(false),
    [ready, setReady] = useState(true),
    [loaded, setLoaded] = useState(false),
    [going, setGoing] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (p.isOpen)
      fetch('/api/billing/checkout')
        .then((r) => r.json())
        .then((d) => {
          // The item asked for, if it is on offer; else the first audit (a first purchase); on a plan running low the
          // Boost; the Proof Pack while it can be bought; else a top-up, brief credits, or 5 prospect audits.
          const list: Item[] = d.packs ?? [];
          setBoost(d.boost ?? null);
          setIntercept(false);
          setItems(list);
          setReady(d.ready !== false);
          setLoaded(true);
          setAccountPlan(d.accountPlan ?? null);
          setBriefs(typeof d.briefs === 'number' ? d.briefs : null);
          choose((list.find((k) => k.key === p.want) ?? list.find((k) => k.key === 'welcome') ?? list.find((k) => k.key === 'boost-250') ?? list.find((k) => k.key === 'closer') ?? list.find((k) => k.key.startsWith('topup')) ?? list.find((k) => k.key === 'prospect-5') ?? list[0])?.key ?? '');
        })
        .catch(() => { setLoaded(true); setError('Unable to load the price list.'); });
  }, [p.isOpen, p.want]);
  if (!p.isOpen) return null;
  /** To Stripe's payment page for the chosen item; the buyer comes back to this page afterwards. */
  async function pay(anyway = false) {
    // A second Boost this month: what moving up one plan would cost instead, first.
    if (!anyway && pick === 'boost-250' && boost?.upgrade && boost.boosts >= 1 && !intercept) { setIntercept(true); return; }
    setError('');
    setGoing(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: pick, returnTo: window.location.pathname }),
      });
      const d = await res.json();
      if (!res.ok || !d.url) throw new Error(d.error || 'Checkout could not start.');
      window.location.assign(d.url);
    } catch (e) {
      // The server's own reason (a setting, an unavailable item), not a generic failure.
      setError((e as Error).message || 'Checkout could not start.');
      setGoing(false);
    }
  }
  /** Moves the plan up one (the rest of the period is charged to the card on file now), then reloads the page with the new balance. */
  async function upgrade() {
    if (!boost?.upgrade) return;
    setError('');
    setGoing(true);
    try {
      const res = await fetch('/api/billing/gbp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: boost.upgrade.to }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'The upgrade did not go through.');
      if (d.url) { window.location.assign(d.url); return; }
      // The bank wants the charge confirmed: its page, where the upgrade finishes.
      if (d.pay) { window.location.assign(d.pay); return; }
      window.location.reload();
    } catch (e) {
      setError((e as Error).message || 'The upgrade did not go through.');
      setGoing(false);
    }
  }
  const chosen = items.find((k) => k.key === pick);
  // Sold the account plans: the window speaks of sessions and briefs, and plans rather than seats.
  const plans = items.some((k) => k.key === 'closer' || k.key === 'boost-250' || k.key.startsWith('sessions-') || k.key.startsWith('briefs-')) || Boolean(accountPlan);
  const up = intercept ? boost?.upgrade ?? null : null;
  return (
    // The overlay scrolls: the price list is taller than a small screen.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75">
      <div className="flex min-h-full items-center justify-center p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={plans ? 'Add phone sessions and brief credits' : 'Get phone sessions'}
        className="w-full max-w-md space-y-5 rounded-xl bg-slate-900 p-6"
      >
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">{plans ? 'Add phone sessions and brief credits' : 'Get phone sessions'}</h2>
          <button type="button" onClick={p.onClose} className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Close</button>
        </div>
        <p>Your balance · {p.currentBalance.toLocaleString()} phone sessions{plans && briefs !== null ? ` · ${briefs} brief credit${briefs === 1 ? '' : 's'}` : ''}</p>
        <p className="text-sm text-slate-400">
          A phone session is one real phone run at one grid point: a 5×5 scan is 25.{' '}
          <a href="/pricing" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">Pricing</a>
        </p>
        {/* Until the price list is in, it is not known whether this account is sold plans or seats. */}
        {loaded && <a href="/profiles?tab=plan" className="block rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-100 hover:bg-emerald-500/20">
          {plans
            ? <><span className="font-semibold">{accountPlan ? 'Need more every month?' : 'Plans are the best value:'}</span> {PLAN_LINE}. <span className="font-semibold underline">Plan and billing</span></>
            : <><span className="font-semibold">Monthly seats are the best value:</span> Scout from $39, Command from $59, Dominator from $99 per client, with 250 to 1,250 phone sessions a month each. <span className="font-semibold underline">Plan and billing</span></>}
        </a>}
        {loaded && accountPlan && boost && !boost.eligible && (
          <p className="rounded-lg border border-slate-700 px-3 py-2.5 text-sm text-slate-300">
            {boost.left.toLocaleString()} of this month’s {boost.monthly.toLocaleString()} plan sessions are left. The Boost (250 sessions for $39) opens when less than 15% are left.
          </p>
        )}
        {up ? (
          <div className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-50">
            <p className="text-base font-bold text-white">Move up to {up.name} instead?</p>
            <p>
              This would be your second Boost this month. Moving up to {up.name} now costs about {usd(up.chargeCents)} for the rest of this billing period and adds about {up.sessionsNow.toLocaleString()} sessions this month
              {up.savingsCents > 0 ? <>, which would cost {usd(up.boostCents)} in Boosts: <span className="font-semibold">about {usd(up.savingsCents)} less</span>.</> : '.'}
            </p>
            <p className="text-emerald-100/80">After that: {up.monthlyAfter.toLocaleString()} sessions a month for {up.priceAfter}. Stripe works out the exact charge.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={upgrade} disabled={going} className="min-h-[44px] flex-1 rounded-xl bg-emerald-400 px-4 font-extrabold text-slate-950 disabled:opacity-60">{going ? 'Working…' : `Move up to ${up.name}`}</button>
              <button type="button" onClick={() => pay(true)} disabled={going} className="min-h-[44px] flex-1 rounded-xl border border-slate-500 px-4 font-semibold text-slate-100 disabled:opacity-60">Buy the Boost anyway</button>
            </div>
          </div>
        ) : !loaded ? (
          <p className="text-sm text-slate-400">Loading prices…</p>
        ) : ready && items.length > 0 ? (
          <>
            <div role="radiogroup" aria-label="What to buy" className="space-y-2">
              {items.map((k, i) => (
                <Fragment key={k.key}>
                {groupOf(k.key) !== groupOf(items[i - 1]?.key) && (
                  <p className="pt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">{GROUPS[groupOf(k.key)]}</p>
                )}
                <label
                  className={'flex cursor-pointer items-start gap-3 rounded-lg border p-3 ' + (pick === k.key ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 hover:bg-slate-800')}
                >
                  <input type="radio" name="pack" className="mt-1" checked={pick === k.key} onChange={() => choose(k.key)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">{k.name}</span>
                      <span className="shrink-0 font-bold">USD {(k.cents / 100).toFixed(2)}</span>
                    </span>
                    <span className="block text-sm text-slate-400">{k.blurb}{k.credits && !k.key.startsWith('sessions-') && k.key !== 'closer' && k.key !== 'boost-250' ? ` ${k.credits.toLocaleString()} phone sessions.` : ''}</span>
                  </span>
                </label>
                </Fragment>
              ))}
            </div>
            <button
              type="button"
              onClick={() => pay()}
              disabled={going || !chosen}
              className="min-h-[48px] w-full rounded-xl bg-emerald-400 px-4 text-[15px] font-extrabold text-slate-950 disabled:opacity-60"
            >
              {going ? 'Working…' : !chosen ? 'Choose what to buy' : `Pay USD ${(chosen.cents / 100).toFixed(2)}`}
            </button>
            <p className="text-center text-xs text-slate-500">Card payment on Stripe’s secure page. You come straight back here.</p>
          </>
        ) : (
          <p>Checkout is being set up. Email sass@stakeoutsearch.com and we will sort it out.</p>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
      </div>
    </div>
  );
}
