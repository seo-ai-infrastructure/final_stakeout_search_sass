'use client';
import { Fragment, useEffect, useState } from 'react';

/** The price list in groups, each under its own heading. */
const groupOf = (key?: string) => (!key ? '' : key === 'welcome' ? 'welcome' : key.startsWith('topup') ? 'topup' : key.startsWith('pack') ? 'pack' : key.endsWith('-3') ? 'offer' : key === 'onboarding' ? 'onboarding' : key === 'admin-test' ? 'test' : 'plan');
const GROUPS: Record<string, string> = {
  welcome: 'Your first scan · one time',
  topup: 'More credits · at your plan’s price',
  pack: 'Credit packs · one time',
  plan: 'Monthly plans · renew each month, cancel any time',
  offer: 'Black Friday · 3 months paid once',
  onboarding: 'Done for you · optional',
  test: 'Admin',
};
type Props = {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currentBalance: number;
  onBalanceUpdated: (n: number) => void;
};
export function CreditTopUpModal(p: Props) {
  const [packs, setPacks] = useState<{ key: string; name: string; credits: number; cents: number; blurb: string }[]>([]),
    [pick, choose] = useState('pack-100'),
    [ready, setReady] = useState(true),
    // The monthly plan this account's subscription is on, if it has one.
    [plan, setPlan] = useState<{ plan: string; periodEnd: string | null; cancelAtEnd: boolean; status: string } | null>(null),
    [note, setNote] = useState(''),
    [going, setGoing] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (p.isOpen)
      fetch('/api/billing/checkout')
        .then((r) => r.json())
        .then((d) => {
          // The welcome pack (a first purchase) or the plan's top-up comes first and is preselected; otherwise the Starter Pack.
          const list: { key: string; name: string; credits: number; cents: number; blurb: string }[] = d.packs ?? [];
          setPacks(list);
          setReady(d.ready !== false);
          setPlan(d.plan ?? null);
          choose((list.find((k) => k.key === 'welcome') ?? list.find((k) => k.key.startsWith('topup')) ?? list.find((k) => k.key === 'pack-100') ?? list[0])?.key ?? 'pack-100');
        })
        .catch(() => setError('Unable to load the price list.'));
  }, [p.isOpen]);
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
      // A change of plan on a running subscription needs no checkout: it applies from the next renewal.
      if (res.ok && d.changed) { setNote(`Your plan changes to ${d.changed} at the next renewal: this month stays as it is.`); setPlan((x) => (x ? { ...x, plan: pick, cancelAtEnd: false } : x)); setGoing(false); return; }
      if (!res.ok || !d.url) throw new Error(d.error || 'Checkout could not start.');
      window.location.assign(d.url);
    } catch (e) {
      // The server's own reason (a setting, an unavailable item), not a generic failure.
      setError((e as Error).message || 'Checkout could not start.');
      setGoing(false);
    }
  }
  const chosen = packs.find((k) => k.key === pick);
  const isPlan = (key?: string) => groupOf(key) === 'plan';
  const manage = async () => {
    setError('');
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: true, returnTo: window.location.pathname }) });
      const d = await res.json();
      if (!res.ok || !d.url) throw new Error(d.error || 'Could not open it.');
      window.location.assign(d.url);
    } catch (e) { setError((e as Error).message); }
  };
  const planName = packs.find((k) => k.key === plan?.plan)?.name ?? plan?.plan;
  return (
    // The overlay scrolls: the price list is taller than a small screen.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75">
      <div className="flex min-h-full items-center justify-center p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Buy credits"
        className="w-full max-w-md space-y-5 rounded-xl bg-slate-900 p-6"
      >
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">Buy scan credits</h2>
          <button type="button" onClick={p.onClose} className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Close</button>
        </div>
        <p>Current balance · {p.currentBalance.toLocaleString()} credits</p>
        <p className="text-sm text-slate-400">
          One credit is one grid point.{' '}
          <a href="/pricing" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">Full price list</a>
        </p>
        {plan && (
          <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            You are on the {planName} plan.{' '}
            {plan.status === 'past_due' ? <span className="text-amber-200">The last payment failed: update your card.</span> : plan.periodEnd ? (plan.cancelAtEnd ? `It ends on ${new Date(plan.periodEnd).toLocaleDateString()}; unused plan credits lapse then.` : `It renews on ${new Date(plan.periodEnd).toLocaleDateString()}.`) : ''}{' '}
            <button type="button" onClick={manage} className="font-semibold underline">Card, invoices and cancelling</button>
          </p>
        )}
        {note && <p className="text-sm text-emerald-300">{note}</p>}
        {ready && packs.length > 0 ? (
          <>
            <div role="radiogroup" aria-label="What to buy" className="space-y-2">
              {packs.map((k, i) => (
                <Fragment key={k.key}>
                {groupOf(k.key) !== groupOf(packs[i - 1]?.key) && (
                  <p className="pt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">{GROUPS[groupOf(k.key)]}</p>
                )}
                <label
                  className={'flex cursor-pointer items-start gap-3 rounded-lg border p-3 ' + (pick === k.key ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 hover:bg-slate-800')}
                >
                  <input type="radio" name="pack" className="mt-1" checked={pick === k.key} onChange={() => choose(k.key)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">{k.name}{plan?.plan === k.key && !plan.cancelAtEnd && <span className="ml-2 rounded-full border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-emerald-300">your plan</span>}</span>
                      <span className="shrink-0 font-bold">USD {(k.cents / 100).toFixed(2)}{isPlan(k.key) && <span className="text-xs font-normal text-slate-400"> / month</span>}</span>
                    </span>
                    <span className="block text-sm text-slate-400">{k.blurb} ${(k.cents / 100 / k.credits).toFixed(2)} per credit.{isPlan(k.key) && ' Renews monthly; unused credits roll over one month.'}</span>
                  </span>
                </label>
                </Fragment>
              ))}
            </div>
            <button
              type="button"
              onClick={pay}
              disabled={going || !chosen || (isPlan(chosen?.key) && plan?.plan === chosen?.key && !plan?.cancelAtEnd)}
              className="min-h-[48px] w-full rounded-xl bg-emerald-400 px-4 text-[15px] font-extrabold text-slate-950 disabled:opacity-60"
            >
              {going ? 'Working…' : !chosen ? 'Choose what to buy' : isPlan(chosen.key) ? (plan ? (plan.plan === chosen.key && !plan.cancelAtEnd ? 'This is your plan' : `Change to ${chosen.name} from the next renewal`) : `Subscribe · USD ${(chosen.cents / 100).toFixed(2)} a month`) : `Pay USD ${(chosen.cents / 100).toFixed(2)}`}
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
