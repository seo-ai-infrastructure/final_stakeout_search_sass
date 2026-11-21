// apps/nextjs/src/components/UserSessionBadge.tsx
'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Coins, LogOut, User } from 'lucide-react';
import { CreditTopUpModal } from '@/components/CreditTopUpModal';
export function UserSessionBadge() {
  const router = useRouter();
  const [user, setUser] = useState<{
    email: string;
    name?: string;
    creditBalance: number;
  } | null>(null);
  const [buying, setBuying] = useState(false);
  const [want, setWant] = useState('');
  const [paid, setPaid] = useState('');
  // From a button on the site (?buy=<item>, such as the $5 first audit): open the price list on that item, tidy the address.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const item = q.get('buy');
    if (!item) return;
    q.delete('buy');
    window.history.replaceState(null, '', window.location.pathname + (q.size ? '?' + q : '') + window.location.hash);
    setWant(item);
    setBuying(true);
  }, []);
  // Back from Stripe (?paid=<checkout id>): record the payment, show the new balance, tidy the address.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get('paid');
    if (!id) return;
    q.delete('paid');
    window.history.replaceState(null, '', window.location.pathname + (q.size ? '?' + q : '') + window.location.hash);
    if (id === 'cancelled') return;
    setPaid('Confirming your payment…');
    fetch('/api/billing/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: id }) })
      .then(async (r) => ({ ok: r.ok, d: await r.json() }))
      .then(({ ok, d }) => {
        setPaid(ok && d.refunded ? 'The first audit is one per account and per card, and this one has already been used. Your payment was refunded in full; no points were added.' : ok && d.plan ? `You are on the ${d.plan} plan: ${Number(d.credits).toLocaleString()} points added, and the same every month until you cancel.` : ok && !Number(d.credits) ? 'Payment received. We will email you to set up your white label.' : ok ? `Payment received: ${Number(d.credits).toLocaleString()} points added.` : d.error || 'Your payment is still being confirmed. Your points will appear shortly.');
        window.dispatchEvent(new Event('balance-change'));
      })
      .catch(() => setPaid('Your payment is still being confirmed. Your points will appear shortly.'));
  }, []);
  useEffect(() => {
    const update = () =>
      fetch('/api/user/me', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.email) setUser(data);
        })
        .catch(() => {});
    void update();
    window.addEventListener('balance-change', update);
    return () => window.removeEventListener('balance-change', update);
  }, []);
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }
  if (!user) return null;
  return (
    <div className="flex items-center gap-3">
      {paid && (
        <p role="status" className="fixed left-1/2 top-16 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-emerald-500/40 bg-slate-900 px-4 py-3 text-sm text-emerald-200 shadow-xl">
          {paid}
          <button type="button" onClick={() => setPaid('')} className="text-slate-400 hover:text-white" aria-label="Dismiss">✕</button>
        </p>
      )}
      <button
        type="button"
        onClick={() => setBuying(true)}
        title="Points: what they cost and how to get more"
        aria-label={user.creditBalance.toLocaleString() + ' points. See prices and get more'}
        className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1 hover:border-emerald-400 hover:bg-emerald-900/40"
      >
        <Coins className="h-3.5 w-3.5" />
        <span>{user.creditBalance.toLocaleString()} pts</span>
      </button>
      <CreditTopUpModal
        isOpen={buying}
        want={want}
        onClose={() => setBuying(false)}
        userId=""
        currentBalance={user.creditBalance}
        onBalanceUpdated={(n) => setUser((u) => (u ? { ...u, creditBalance: n } : u))}
      />
      <div className="hidden items-center gap-1.5 text-xs text-slate-300 sm:flex">
        <User className="h-3.5 w-3.5 text-slate-500" />
        <span className="max-w-[160px] truncate font-medium">
          {user.name || user.email}
        </span>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs"
        title="Sign Out"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Sign Out</span>
      </button>
    </div>
  );
}
