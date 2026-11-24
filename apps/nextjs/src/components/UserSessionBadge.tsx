// apps/nextjs/src/components/UserSessionBadge.tsx
'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Coins, LogOut, User, X } from 'lucide-react';
import { CreditTopUpModal } from '@/components/CreditTopUpModal';
import { paidMessage } from '@/lib/pricing';
import { trackPurchase } from '@/lib/googleTag';
import styles from './UserSessionBadge.module.css';
type SessionUser = { email: string; name?: string | null; creditBalance: number; /** A plan nearly used up this month (see /api/user/me). */ boost?: { due: boolean; left: number; monthly: number; month: number } | null; /** Signed in as a team member: who, and whose account (paused: no seat for them now). */ team?: { email: string; owner: string | null; paused: boolean } | null };
/** The Boost offer is shown once per billing month in this browser (storage can be missing or refuse: then once per visit). */
const offerKey = (month: number) => 'stakeout:boost-offer:' + month;
function offerSeen(month: number) { try { return window.localStorage.getItem(offerKey(month)) === '1'; } catch { return false; } }
function markOfferSeen(month: number) { try { window.localStorage.setItem(offerKey(month), '1'); } catch { /* once per visit then */ } }
export function UserSessionBadge({ initialUser }: { initialUser?: SessionUser } = {}) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(initialUser ?? null);
  const [buying, setBuying] = useState(false);
  const [want, setWant] = useState('');
  const [paid, setPaid] = useState('');
  // The Boost offer, when the plan's month is nearly used up and it has not been shown this month.
  const [offer, setOffer] = useState<{ left: number; monthly: number; month: number } | null>(null);
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
        setPaid(ok ? paidMessage(d) : d.error || 'Your payment is still being confirmed. Your phone sessions will appear shortly.');
        // The ad conversion, once per checkout (refunds and free checkouts aren't counted).
        if (ok && !d.refunded) trackPurchase({ id, cents: Number(d.cents) });
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
          if (data?.boost?.due && !offerSeen(data.boost.month)) setOffer({ left: data.boost.left, monthly: data.boost.monthly, month: data.boost.month });
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
      {offer && !buying && (
        <section role="dialog" aria-label="Running low on phone sessions" className="fixed bottom-4 right-4 z-40 w-[min(92vw,360px)] space-y-3 rounded-xl border border-emerald-500/40 bg-slate-900 p-4 text-sm text-slate-200 shadow-2xl">
          <p className="text-base font-bold text-white">Running low on phone sessions</p>
          <p>{offer.left.toLocaleString()} of this month’s {offer.monthly.toLocaleString()} plan sessions are left. A Boost adds 250 more for $39, or move up a plan for more every month.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { markOfferSeen(offer.month); setOffer(null); setWant('boost-250'); setBuying(true); }} className="min-h-[40px] flex-1 rounded-lg bg-emerald-400 px-3 font-bold text-slate-950">Get the Boost</button>
            <button type="button" onClick={() => { markOfferSeen(offer.month); setOffer(null); }} className="min-h-[40px] rounded-lg border border-slate-600 px-3 text-slate-200">Not now</button>
          </div>
        </section>
      )}
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
        <span title={user.team?.paused ? 'The account that added you has no seat for you on its plan right now.' : undefined}>
          {user.team ? (user.team.owner && !user.team.paused ? `${user.team.email} · in ${user.team.owner}’s account` : `${user.team.email} · team access paused`) : user.name || user.email}
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
