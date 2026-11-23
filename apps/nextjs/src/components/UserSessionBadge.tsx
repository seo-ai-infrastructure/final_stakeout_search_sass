// apps/nextjs/src/components/UserSessionBadge.tsx
'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Coins, LogOut, User, X } from 'lucide-react';
import { CreditTopUpModal } from '@/components/CreditTopUpModal';
import styles from './UserSessionBadge.module.css';
type SessionUser = { email: string; name?: string | null; creditBalance: number };
export function UserSessionBadge({ initialUser }: { initialUser?: SessionUser } = {}) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(initialUser ?? null);
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
        setPaid(ok && d.refunded ? 'The first audit is one per account and per card, and this one has already been used. Your payment was refunded in full; no phone sessions were added.' : ok && d.plan ? `You are on the ${d.plan} plan: ${Number(d.credits).toLocaleString()} phone sessions added, and the same every month until you cancel.` : ok && !Number(d.credits) ? 'Payment received. We will email you to set up your white label.' : ok ? `Payment received: ${Number(d.credits).toLocaleString()} phone sessions added.` : d.error || 'Your payment is still being confirmed. Your phone sessions will appear shortly.');
        window.dispatchEvent(new Event('balance-change'));
      })
      .catch(() => setPaid('Your payment is still being confirmed. Your phone sessions will appear shortly.'));
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
    <div className={styles.session}>
      {paid && (
        <p role="status" className={styles.paid}>
          {paid}
          <button type="button" onClick={() => setPaid('')} aria-label="Dismiss"><X size={15} aria-hidden="true" /></button>
        </p>
      )}
      <button
        type="button"
        onClick={() => setBuying(true)}
        title="Phone sessions: what they cost and how to get more"
        aria-label={user.creditBalance.toLocaleString() + ' phone sessions. See prices and get more'}
        className={styles.points}
      >
        <Coins className="h-3.5 w-3.5" />
        <span>{user.creditBalance.toLocaleString()}<span className={styles.unit}>sessions</span></span>
      </button>
      <CreditTopUpModal
        isOpen={buying}
        want={want}
        onClose={() => setBuying(false)}
        userId=""
        currentBalance={user.creditBalance}
        onBalanceUpdated={(n) => setUser((u) => (u ? { ...u, creditBalance: n } : u))}
      />
      <div className={styles.identity}>
        <User className="h-3.5 w-3.5 text-slate-500" />
        <span>
          {user.name || user.email}
        </span>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className={styles.logout}
        aria-label="Sign out"
        title="Sign Out"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span>Sign out</span>
      </button>
    </div>
  );
}
