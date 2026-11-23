'use client';
import { Fragment, useEffect, useState } from 'react';

/** The price list in groups, each under its own heading. */
const groupOf = (key?: string) => (!key ? '' : key === 'welcome' ? 'welcome' : key === 'closer' ? 'closer' : key.startsWith('sessions-') ? 'sessions' : key.startsWith('briefs-') ? 'briefs' : key.startsWith('prospect') ? 'prospect' : key.startsWith('topup') ? 'topup' : key === 'white-label' ? 'extra' : key === 'admin-test' ? 'test' : 'other');
const GROUPS: Record<string, string> = {
  welcome: 'Your first audit · one time',
  prospect: 'Prospect audits · no subscription, valid 90 days',
  topup: 'More phone sessions · for seat holders, never expire',
  closer: 'Closer Pack · no subscription, up to 2 per account',
  sessions: 'Phone sessions · every surface in one run, never expire',
  briefs: 'Revenue briefs · live county ad prices, yours for good',
  extra: 'Extras',
  test: 'Admin',
  other: 'Other',
};
type Item = { key: string; name: string; credits: number; cents: number; blurb: string; briefs?: number; featured?: boolean };
type AccountPlan = 'P_SCOUT' | 'P_AGENCY' | 'P_SCALE';
/** When buying sessions costs about as much as moving up a plan: what the next plan adds. */
const NUDGE: Record<string, { from: AccountPlan; to: string; more: string; adds: string; keys: string[] }> = {
  P_SCOUT: { from: 'P_SCOUT', to: 'Agency', more: '$80', adds: '700 more phone sessions and 15 more briefs every month, and your logo, name and brand color on shared reports', keys: ['sessions-250', 'sessions-500'] },
  P_AGENCY: { from: 'P_AGENCY', to: 'Scale', more: '$170', adds: '2,000 more phone sessions and 40 more briefs every month', keys: ['sessions-500'] },
};
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
    [ready, setReady] = useState(true),
    [going, setGoing] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (p.isOpen)
      fetch('/api/billing/checkout')
        .then((r) => r.json())
        .then((d) => {
          // The item asked for, if it is on offer; else the first audit (a first purchase) or a top-up; else 5 prospect audits.
          const list: Item[] = d.packs ?? [];
          setItems(list);
          setReady(d.ready !== false);
          setAccountPlan(d.accountPlan ?? null);
          setBriefs(typeof d.briefs === 'number' ? d.briefs : null);
          choose((list.find((k) => k.key === p.want) ?? list.find((k) => k.key === 'welcome') ?? list.find((k) => k.featured && k.key.startsWith('sessions-')) ?? list.find((k) => k.key === 'closer') ?? list.find((k) => k.key.startsWith('topup')) ?? list.find((k) => k.key === 'prospect-5') ?? list[0])?.key ?? '');
        })
        .catch(() => setError('Unable to load the price list.'));
  }, [p.isOpen, p.want]);
  if (!p.isOpen) return null;
  /** To Stripe's payment page for the chosen item; the buyer comes back to this page afterwards. */
  async function pay() {
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
  const chosen = items.find((k) => k.key === pick);
  // Sold the account plans: the window speaks of sessions and briefs, and plans rather than seats.
  const plans = items.some((k) => k.key === 'closer' || k.key.startsWith('sessions-') || k.key.startsWith('briefs-'));
  const nudge = accountPlan && NUDGE[accountPlan]?.keys.includes(pick) ? NUDGE[accountPlan] : null;
  return (
    // The overlay scrolls: the price list is taller than a small screen.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75">
      <div className="flex min-h-full items-center justify-center p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={plans ? 'Add phone sessions and briefs' : 'Get phone sessions'}
        className="w-full max-w-md space-y-5 rounded-xl bg-slate-900 p-6"
      >
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">{plans ? 'Add phone sessions and briefs' : 'Get phone sessions'}</h2>
          <button type="button" onClick={p.onClose} className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Close</button>
        </div>
        <p>Your balance · {p.currentBalance.toLocaleString()} phone sessions{plans && briefs !== null ? ` · ${briefs} brief${briefs === 1 ? '' : 's'}` : ''}</p>
        <p className="text-sm text-slate-400">
          A phone session is one real phone run at one grid point: a 5×5 scan is 25, Scan Now or scheduled.{' '}
          <a href="/pricing" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">Pricing</a>
        </p>
        <a href="/profiles?tab=plan" className="block rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-100 hover:bg-emerald-500/20">
          {plans
            ? <><span className="font-semibold">Plans are the best value:</span> Scout $49 (300 phone sessions, 5 briefs a month), Agency $129 (1,000 and 20), Scale $299 (3,000 and 60). Unused plan sessions and briefs roll over for one month. <span className="font-semibold underline">Plan and billing</span></>
            : <><span className="font-semibold">Monthly seats are the best value:</span> Scout from $39, Command from $59, Dominator from $99 per client, with 250 to 1,250 phone sessions a month each. <span className="font-semibold underline">Plan and billing</span></>}
        </a>
        {ready && items.length > 0 ? (
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
                    <span className="block text-sm text-slate-400">{k.blurb}{k.credits && !k.key.startsWith('sessions-') && k.key !== 'closer' ? ` ${k.credits.toLocaleString()} phone sessions.` : ''}</span>
                  </span>
                </label>
                </Fragment>
              ))}
            </div>
            {nudge && (
              <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-100">
                <span className="font-semibold">Smarter math:</span> {nudge.to} is {nudge.more} more a month and adds {nudge.adds}.{' '}
                <a href="/profiles?tab=plan" className="font-semibold underline">Switch to {nudge.to}</a>
              </p>
            )}
            <button
              type="button"
              onClick={pay}
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
