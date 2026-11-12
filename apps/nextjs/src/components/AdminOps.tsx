'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type OpenScan = { id: string; keyword: string; targetBusiness: string; targetType: string; gridSize: number; status: string; totalPins: number; completedPins: number; failedPins: number; createdAt: string; owner: string };
type Account = { id: string; email: string; role: string; credits: number; confirmed: boolean; createdAt: string; scans: number };

type Tpl = { id: string; name: string; version: string | null } | null;
type Ops = {
  at: string;
  settings: { searchGapSeconds: number; ispExclude: string[]; signupsOpen: boolean; costPerPointUsd: number };
  system: { templates?: { chrome: Tpl; maps: Tpl }; templatesReadAt?: string; traffic?: { limitBytes: number | null; usedBytes: number | null; leftBytes: number | null; todayBytes: number | null; expires: string | null; at: string } | null } | null;
  capacity: {
    completed24h: number; completedLastHour: number; started24h: number; timedPoints: number; medianSeconds: number | null; perPhoneHour: number | null;
    waiting: number; readyPhones: number; etaMinutes: number | null; cost24hUsd: number;
    phones: { phone: string; points: number; lastHour: number; medianSeconds: number | null }[];
  };
  captchas: { today: number; yesterday: number };
};
const gb = (bytes: number | null | undefined) => (bytes == null ? '—' : (bytes / 1e9).toFixed(bytes < 1e10 ? 2 : 1) + ' GB');
const mins = (seconds: number) => (seconds >= 90 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${seconds} s`);

const card = 'rounded-2xl border border-slate-800 bg-slate-900/60 p-5';
const input = 'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500';
const btn = 'rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50';

/** The admin's everyday jobs: stop scans, add credits, block or invite accounts. */
export function AdminOps() {
  const [scans, setScans] = useState<OpenScan[]>([]);
  const [users, setUsers] = useState<Account[]>([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // A new account's one-time password. It is kept on screen, beside the button that made it, until
  // dismissed: the status note above is out of view from here and is cleared by the next action.
  const [created, setCreated] = useState<{ email: string; password: string; copied?: boolean } | null>(null);
  const [credit, setCredit] = useState({ email: '', amount: '', note: '' });
  const [invite, setInvite] = useState('');
  const [ops, setOps] = useState<Ops | null>(null);
  const [form, setForm] = useState<{ gap: string; cost: string; isps: string; signups: boolean } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/ops', { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json();
    setScans(d.scans ?? []);
    setUsers(d.users ?? []);
    if (d.settings && d.capacity) {
      setOps(d);
      // The form is filled once, so a refresh never overwrites what is being typed.
      setForm((f) => f ?? { gap: String(d.settings.searchGapSeconds), cost: String(d.settings.costPerPointUsd), isps: d.settings.ispExclude.join(', '), signups: d.settings.signupsOpen });
    }
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

      {ops && (
        <section className={card}>
          <h2 className="text-sm font-bold text-white">Capacity and cost · last 24 hours</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['Points completed', String(ops.capacity.completed24h), `${ops.capacity.completedLastHour} in the last hour`],
                ['Median time per point', ops.capacity.medianSeconds === null ? 'No timings yet' : mins(ops.capacity.medianSeconds), ops.capacity.medianSeconds === null ? 'recorded for points run from now on' : `from ${ops.capacity.timedPoints} timed points`],
                ['Per phone, per hour', ops.capacity.perPhoneHour === null ? '—' : String(ops.capacity.perPhoneHour), `a point plus the ${ops.settings.searchGapSeconds}s pause`],
                ['Waiting', `${ops.capacity.waiting} points`, ops.capacity.waiting === 0 ? 'nothing in line' : ops.capacity.etaMinutes === null ? `${ops.capacity.readyPhones} ready phone(s); no estimate until points are timed` : `about ${ops.capacity.etaMinutes} min with ${ops.capacity.readyPhones} ready phone(s)`],
                ['Estimated cost', '$' + ops.capacity.cost24hUsd.toFixed(2), `${ops.capacity.started24h} points started × $${ops.settings.costPerPointUsd}`],
                ['Proxy traffic today', gb(ops.system?.traffic?.todayBytes), ops.system?.traffic ? `${gb(ops.system.traffic.leftBytes)} left of ${gb(ops.system.traffic.limitBytes)}${ops.system.traffic.expires ? ' · expires ' + ops.system.traffic.expires : ''}` : 'not reported by the worker yet'],
                ['Captchas today', String(ops.captchas.today), `${ops.captchas.yesterday} yesterday`],
              ] as [string, string, string][]
            ).map(([label, value, hint]) => (
              <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="mt-1 text-lg font-bold text-white">{value}</p>
                <p className="text-xs text-slate-500">{hint}</p>
              </div>
            ))}
          </div>
          {ops.capacity.phones.length > 0 && (
            <p className="mt-3 text-xs text-slate-400">
              By phone: {ops.capacity.phones.map((p) => `${p.phone} ${p.points} points (${p.lastHour} last hour${p.medianSeconds === null ? '' : ', median ' + mins(p.medianSeconds)})`).join(' · ')}
            </p>
          )}
        </section>
      )}

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
              const ok = await run('invite', { action: 'create_account', email: invite }, (d) => {
                setCreated({ email: String(d.email), password: String(d.password) });
                return `Account created for ${d.email}. Its one-time password is shown beside the Create account button.`;
              });
              if (ok) setInvite('');
            }}
          >
            {busy === 'invite' ? 'Creating…' : 'Create account'}
          </button>
          <span className="text-xs text-slate-500">Works while sign-ups are closed. The account starts with 0 credits.</span>
        </div>
        {created && (
          <div role="alert" className="mt-3 rounded-lg border border-amber-400/60 bg-amber-400/10 p-4">
            <p className="text-sm font-bold text-amber-200">Save this password now. It cannot be shown again.</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-400">Account</dt>
              <dd className="font-mono text-white">{created.email}</dd>
              <dt className="text-slate-400">Password</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <code className="select-all rounded bg-slate-950 px-2 py-1 font-mono text-base text-white">{created.password}</code>
                <button
                  type="button"
                  className={btn + ' border border-slate-600 text-slate-200 hover:bg-slate-800'}
                  onClick={() => {
                    void navigator.clipboard?.writeText(`Sign in at https://www.stakeoutsearch.com/login\nEmail: ${created.email}\nPassword: ${created.password}`);
                    setCreated({ ...created, copied: true });
                  }}
                >
                  {created.copied ? 'Copied' : 'Copy sign-in details'}
                </button>
              </dd>
            </dl>
            <p className="mt-3 text-xs text-slate-400">Nothing is emailed to them: send these details yourself. Adding credits or any other action will not remove this box.</p>
            <button type="button" className={btn + ' mt-3 border border-amber-400/60 text-amber-200 hover:bg-amber-400/10'} onClick={() => setCreated(null)}>
              I have saved it
            </button>
          </div>
        )}
      </section>
      {ops && form && (
        <section className={card}>
          <h2 className="text-sm font-bold text-white">Settings</h2>
          <p className="mt-1 text-xs text-slate-400">Saved at once and used within about 15 seconds: no deploy, no worker restart.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              Pause between searches on a phone (seconds)
              <input className={input + ' mt-1 block w-full'} type="number" min={0} max={900} value={form.gap} onChange={(e) => setForm({ ...form, gap: e.target.value })} />
            </label>
            <label className="text-xs text-slate-400">
              Cost per point, for the estimate (USD)
              <input className={input + ' mt-1 block w-full'} type="number" step="0.001" min={0} max={5} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            </label>
            <label className="text-xs text-slate-400 sm:col-span-2">
              ISPs never offered (comma-separated)
              <input className={input + ' mt-1 block w-full'} value={form.isps} onChange={(e) => setForm({ ...form, isps: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" className="h-4 w-4" checked={form.signups} onChange={(e) => setForm({ ...form, signups: e.target.checked })} />
              New accounts can sign up
            </label>
          </div>
          <button
            type="button"
            disabled={busy !== ''}
            className={btn + ' mt-4 bg-emerald-500 text-slate-950 hover:bg-emerald-400'}
            onClick={() => run('settings', { action: 'save_settings', settings: { searchGapSeconds: Number(form.gap), costPerPointUsd: Number(form.cost), ispExclude: form.isps, signupsOpen: form.signups } }, () => 'Settings saved.')}
          >
            {busy === 'settings' ? 'Saving…' : 'Save settings'}
          </button>
          <div className="mt-5 border-t border-slate-800 pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Templates</h3>
            {(['chrome', 'maps'] as const).map((k) => {
              const t = ops.system?.templates?.[k];
              return (
                <p key={k} className="mt-1 text-sm text-slate-200">
                  <span className="font-semibold capitalize">{k}:</span> {t ? `${t.id} · ${t.name} · ${t.version ? 'version ' + t.version : 'no version declared'}` : 'not found'}
                </p>
              );
            })}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" disabled={busy !== ''} className={btn + ' border border-slate-600 text-slate-200 hover:bg-slate-800'} onClick={() => run('templates', { action: 'reload_templates' }, () => 'The worker will re-read its templates within a minute.')}>
                {busy === 'templates' ? 'Asking…' : 'Re-read templates'}
              </button>
              <span className="text-xs text-slate-500">
                {ops.system?.templatesReadAt ? `Last read ${new Date(ops.system.templatesReadAt).toLocaleTimeString()}. ` : ''}Use this after importing a template into DuoPlus.
              </span>
            </div>
          </div>
        </section>
      )}
      {ops && <p className="text-right text-xs text-slate-500">Last updated {new Date(ops.at).toLocaleTimeString()} · refreshes every 15 seconds</p>}
    </div>
  );
}
