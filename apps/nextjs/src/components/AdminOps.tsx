'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type OpenScan = { id: string; keyword: string; targetBusiness: string; targetType: string; gridSize: number; status: string; totalPins: number; completedPins: number; failedPins: number; createdAt: string; owner: string };
type Account = { id: string; email: string; role: string; credits: number; confirmed: boolean; createdAt: string; scans: number };

const card = 'rounded-2xl border border-slate-800 bg-slate-900/60 p-5';
const input = 'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500';
const btn = 'rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50';

/** The admin's everyday jobs: stop scans, add credits, block or invite accounts. */
export function AdminOps() {
  const [scans, setScans] = useState<OpenScan[]>([]);
  const [users, setUsers] = useState<Account[]>([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [credit, setCredit] = useState({ email: '', amount: '', note: '' });
  const [invite, setInvite] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/ops', { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json();
    setScans(d.scans ?? []);
    setUsers(d.users ?? []);
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  /** Runs one admin action, shows its result, and refreshes the panels. */
  async function run(key: string, body: Record<string, unknown>, done: (d: any) => string) {
    setBusy(key);
    setNote(null);
    try {
      const r = await fetch('/api/admin/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw Error(d.error ?? 'That did not work.');
      setNote({ ok: true, text: done(d) });
      await load();
      return true;
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
      return false;
    } finally {
      setBusy('');
    }
  }
  const points = (n: number) => (n === 1 ? '1 point' : `${n} points`);

  return (
    <div className="mb-6 space-y-6">
      {note && (
        <p role="status" className={'rounded-xl border px-4 py-3 text-sm ' + (note.ok ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200' : 'border-rose-500/40 bg-rose-950/30 text-rose-200')}>
          {note.text}
        </p>
      )}

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white">Running scans ({scans.length})</h2>
          {scans.length > 1 && (
            <button
              type="button"
              disabled={busy !== ''}
              className={btn + ' border border-rose-500/60 text-rose-300 hover:bg-rose-500/10'}
              onClick={() => window.confirm(`Stop all ${scans.length} running scans? Finished points are kept; the rest are refunded.`) && run('stop_all', { action: 'stop_all' }, (d) => `Stopped ${d.scans} scans: ${points(d.stopped)} refunded.`)}
            >
              {busy === 'stop_all' ? 'Stopping…' : 'Stop all'}
            </button>
          )}
        </div>
        {scans.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Nothing is queued or running.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-800">
            {scans.map((s) => {
              const left = s.totalPins - s.completedPins - s.failedPins;
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <Link href={'/scans/' + s.id} className="font-semibold text-white hover:underline">
                      {s.keyword}
                    </Link>
                    <p className="text-xs text-slate-400">
                      {s.targetBusiness} · {s.gridSize}×{s.gridSize} · {s.targetType.replaceAll('_', ' ')} · {s.owner} · started {new Date(s.createdAt).toLocaleTimeString()}
                    </p>
                    <p className="text-xs text-slate-300">
                      {s.completedPins}/{s.totalPins} done · {s.failedPins} failed · {left} to go
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy !== ''}
                    className={btn + ' border border-rose-500/60 text-rose-300 hover:bg-rose-500/10'}
                    onClick={() => window.confirm(`Stop “${s.keyword}”? Finished points are kept; ${points(left)} will be refunded.`) && run('stop:' + s.id, { action: 'stop_scan', scanId: s.id }, (d) => `Stopped “${s.keyword}”: ${points(d.stopped)} refunded.`)}
                  >
                    {busy === 'stop:' + s.id ? 'Stopping…' : 'Stop'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="text-sm font-bold text-white">Add credits</h2>
        <p className="mt-1 text-xs text-slate-400">Writes the ledger entry and the balance together. A negative amount removes credits.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className={input + ' w-64'} list="admin-accounts" placeholder="account email" value={credit.email} onChange={(e) => setCredit({ ...credit, email: e.target.value })} />
          <datalist id="admin-accounts">
            {users.map((u) => (
              <option key={u.id} value={u.email} />
            ))}
          </datalist>
          <input className={input + ' w-28'} type="number" placeholder="credits" value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} />
          <input className={input + ' w-64'} maxLength={80} placeholder="note (optional)" value={credit.note} onChange={(e) => setCredit({ ...credit, note: e.target.value })} />
          <button
            type="button"
            disabled={busy !== '' || !credit.email || !credit.amount}
            className={btn + ' bg-emerald-500 text-slate-950 hover:bg-emerald-400'}
            onClick={async () => {
              const ok = await run('credits', { action: 'add_credits', email: credit.email, amount: Number(credit.amount), note: credit.note }, (d) => `${d.email} now has ${d.balance} credits.`);
              if (ok) setCredit({ email: '', amount: '', note: '' });
            }}
          >
            {busy === 'credits' ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-bold text-white">Accounts ({users.length})</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Credits</th>
                <th className="py-2 pr-4 font-medium">Scans</th>
                <th className="py-2 pr-4 font-medium">Joined</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2 pr-4 text-white">{u.email}</td>
                  <td className="py-2 pr-4">
                    <span className={u.role === 'BLOCKED' ? 'text-rose-300' : u.role === 'ADMIN' ? 'text-emerald-300' : 'text-slate-300'}>
                      {u.role === 'BLOCKED' ? 'Blocked' : u.role === 'ADMIN' ? 'Admin' : u.role === 'SYSTEM' ? 'System' : u.confirmed ? 'Active' : 'Email not confirmed'}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-200">{u.credits}</td>
                  <td className="py-2 pr-4 text-slate-200">{u.scans}</td>
                  <td className="py-2 pr-4 text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 text-right">
                    {u.role === 'AGENCY' && (
                      <button type="button" disabled={busy !== ''} className={btn + ' border border-rose-500/60 py-1 text-rose-300 hover:bg-rose-500/10'} onClick={() => window.confirm(`Block ${u.email}? They will be signed out and unable to sign in.`) && run('block:' + u.id, { action: 'block', userId: u.id }, () => `${u.email} is blocked.`)}>
                        Block
                      </button>
                    )}
                    {u.role === 'BLOCKED' && (
                      <button type="button" disabled={busy !== ''} className={btn + ' border border-slate-600 py-1 text-slate-200 hover:bg-slate-800'} onClick={() => run('unblock:' + u.id, { action: 'unblock', userId: u.id }, () => `${u.email} can sign in again.`)}>
                        Unblock
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
          <input className={input + ' w-72'} type="email" placeholder="invite: new account email" value={invite} onChange={(e) => setInvite(e.target.value)} />
          <button
            type="button"
            disabled={busy !== '' || !invite}
            className={btn + ' border border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/10'}
            onClick={async () => {
              const ok = await run('invite', { action: 'create_account', email: invite }, (d) => `Account created for ${d.email}. One-time password (shown only now): ${d.password}`);
              if (ok) setInvite('');
            }}
          >
            {busy === 'invite' ? 'Creating…' : 'Create account'}
          </button>
          <span className="text-xs text-slate-500">Works while sign-ups are closed. The account starts with 0 credits.</span>
        </div>
      </section>
    </div>
  );
}
