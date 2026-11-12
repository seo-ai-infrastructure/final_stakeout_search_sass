'use client';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { useEffect, useState } from 'react';
type Props = {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currentBalance: number;
  onBalanceUpdated: (n: number) => void;
};
export function CreditTopUpModal(p: Props) {
  const [packs, setPacks] = useState<{ key: string; name: string; credits: number; cents: number; blurb: string }[]>([]),
    [credits, choose] = useState(500),
    [error, setError] = useState('');
  useEffect(() => {
    if (p.isOpen)
      fetch('/api/paypal/order')
        .then((r) => r.json())
        .then((d) => {
          setPacks(d.packs ?? []);
          choose(d.packs?.[0]?.credits ?? 500);
        })
        .catch(() => setError('Unable to load the price list.'));
  }, [p.isOpen]);
  if (!p.isOpen) return null;
  async function post(path: string, payload: unknown) {
    const res = await fetch('/api/paypal/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error);
    return d;
  }
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Buy credits"
        className="w-full max-w-md space-y-5 rounded-xl bg-slate-900 p-6"
      >
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">{packs.length === 1 && packs[0].key === 'onboarding' ? 'Start with onboarding' : 'Buy scan credits'}</h2>
          <button onClick={p.onClose}>Close</button>
        </div>
        <p>Current balance · {p.currentBalance}</p>
        {clientId && packs.length > 0 ? (
          <>
            <div role="radiogroup" aria-label="What to buy" className="space-y-2">
              {packs.map((k) => (
                <label
                  key={k.credits}
                  className={'flex cursor-pointer items-start gap-3 rounded-lg border p-3 ' + (credits === k.credits ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 hover:bg-slate-800')}
                >
                  <input type="radio" name="pack" className="mt-1" checked={credits === k.credits} onChange={() => choose(k.credits)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">{k.name}</span>
                      <span className="shrink-0 font-bold">USD {(k.cents / 100).toFixed(2)}</span>
                    </span>
                    <span className="block text-sm text-slate-400">{k.blurb}</span>
                  </span>
                </label>
              ))}
            </div>
            <PayPalScriptProvider
              options={{ clientId, currency: 'USD', intent: 'capture' }}
            >
              <PayPalButtons
                forceReRender={[credits]}
                createOrder={async () => {
                  setError('');
                  try {
                    return (await post('order', { credits })).orderID;
                  } catch (e) {
                    // The server's own reason (a setting, an unavailable item), not a generic failure.
                    setError((e as Error).message || 'Checkout could not start.');
                    throw e;
                  }
                }}
                onApprove={async ({ orderID }) => {
                  const d = await post('capture', { orderID });
                  p.onBalanceUpdated(d.creditBalance);
                  window.dispatchEvent(new Event('balance-change'));
                  p.onClose();
                }}
                onError={() =>
                  setError((cur) => cur || 'Checkout could not finish. Check your balance before trying again.')
                }
              />
            </PayPalScriptProvider>
          </>
        ) : (
          <p>Checkout is being set up. Email sass@stakeoutsearch.com and we will sort it out.</p>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  );
}
