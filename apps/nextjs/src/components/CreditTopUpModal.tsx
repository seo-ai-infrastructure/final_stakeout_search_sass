'use client';
import { Fragment, useEffect, useState } from 'react';

/** The price list in groups, each under its own heading. */
const groupOf = (key?: string) => (!key ? '' : key === 'welcome' ? 'welcome' : key.startsWith('prospect') ? 'prospect' : key.startsWith('topup') ? 'topup' : key === 'white-label' ? 'extra' : key === 'admin-test' ? 'test' : 'other');
const GROUPS: Record<string, string> = {
  welcome: 'Your first audit · one time',
  prospect: 'Prospect audits · no subscription, valid 90 days',
  topup: 'More phone sessions · for seat holders, never expire',
  extra: 'Extras',
  test: 'Admin',
  other: 'Other',
};
type Item = { key: string; name: string; credits: number; cents: number; blurb: string };
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
          choose((list.find((k) => k.key === p.want) ?? list.find((k) => k.key === 'welcome') ?? list.find((k) => k.key.startsWith('topup')) ?? list.find((k) => k.key === 'prospect-5') ?? list[0])?.key ?? '');
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
  return (
    // The overlay scrolls: the price list is taller than a small screen.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75">
      <div className="flex min-h-full items-center justify-center p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Get phone sessions"
        className="w-full max-w-md space-y-5 rounded-xl bg-slate-900 p-6"
      >
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">Get phone sessions</h2>
          <button type="button" onClick={p.onClose} className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Close</button>
        </div>
        <p>Your balance · {p.currentBalance.toLocaleString()} phone sessions</p>
        <p className="text-sm text-slate-400">
          A phone session is one real phone run at one grid point: a 5×5 scan is 25, Scan Now or scheduled.{' '}
          <a href="/pricing" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">Pricing</a>
        </p>
        <a href="/profiles?tab=plan" className="block rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-100 hover:bg-emerald-500/20">
          <span className="font-semibold">Monthly seats are the best value:</span> Scout from $39, Command from $59, Dominator from $99 per client, with 250 to 1,250 phone sessions a month each. <span className="font-semibold underline">Plan and billing</span>
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
                    <span className="block text-sm text-slate-400">{k.blurb}{k.credits ? ` ${k.credits.toLocaleString()} phone sessions.` : ''}</span>
                  </span>
                </label>
                </Fragment>
              ))}
            </div>
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
