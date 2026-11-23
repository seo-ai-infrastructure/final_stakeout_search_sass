'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePolling } from '@/lib/usePolling';
import Link from 'next/link';
import { AdminRuns } from './AdminRuns';

type OpenScan = { id: string; keyword: string; targetBusiness: string; targetType: string; gridSize: number; status: string; totalPins: number; completedPins: number; failedPins: number; createdAt: string; owner: string };
type Brand = { domain: string; userId: string; name: string; hasLogo: boolean };
type Account = { id: string; email: string; role: string; credits: number; briefs: number; confirmed: boolean; createdAt: string; scans: number };

type Tpl = { id: string; name: string; version: string | null } | null;
type Ops = {
  at: string;
  settings: { searchGapSeconds: number; ispExclude: string[]; signupsOpen: boolean; costPerPointUsd: number; powerSave?: boolean; idleOffMinutes?: number; mobileCreditsPerPoint?: number; mobileForCustomers?: boolean; aiFlagsForCustomers?: boolean; pageOneShareForCustomers?: boolean; newPlansLive?: boolean; newPlansPreview?: string[] };
  system: { templates?: { chrome: Tpl; maps: Tpl; google?: Tpl }; templatesReadAt?: string; traffic?: { limitBytes: number | null; usedBytes: number | null; leftBytes: number | null; todayBytes: number | null; expires: string | null; at: string } | null; trafficLow?: boolean; proxyDown?: { region: string; since: string }[]; proxyProviders?: string[]; mobileData?: boolean; mobileProvider?: string | null; mobileLogin?: string | null; mobileTraffic?: { leftBytes: number | null; todayBytes: number | null; limitBytes: number | null } | null; mobileTrafficLow?: boolean; trafficHours?: { hour: string; residentialBytes: number | null; mobileBytes: number | null; points: number; bytesPerPoint: number | null }[] } | null;
  capacity: {
    completed24h: number; completedLastHour: number; started24h: number; timedPoints: number; medianSeconds: number | null; perPhoneHour: number | null;
    waiting: number; readyPhones: number; etaMinutes: number | null; cost24hUsd: number;
    phones: { phone: string; points: number; lastHour: number; medianSeconds: number | null }[];
  };
  captchas: { today: number; yesterday: number };
};
/** Proxy data over the last day against the searches run: what a search costs in data, and the hour that used most. */
function dataPerSearch(hours: { hour: string; residentialBytes: number | null; mobileBytes: number | null; points: number }[] | undefined): [string, string, string] {
  const label = 'Proxy data per search, last 24 h';
  const known = (hours ?? []).filter((h) => h.residentialBytes !== null || h.mobileBytes !== null);
  if (!known.length) return [label, '—', 'measured hour by hour: the first figures appear after two hours'];
  const res = known.reduce((n, h) => n + (h.residentialBytes ?? 0), 0);
  const mob = known.reduce((n, h) => n + (h.mobileBytes ?? 0), 0);
  const points = known.reduce((n, h) => n + h.points, 0);
  const idle = known.filter((h) => h.points === 0).reduce((n, h) => n + (h.residentialBytes ?? 0) + (h.mobileBytes ?? 0), 0);
  const top = [...known].sort((a, b) => (b.residentialBytes ?? 0) + (b.mobileBytes ?? 0) - ((a.residentialBytes ?? 0) + (a.mobileBytes ?? 0)))[0];
  return [
    label,
    points ? Math.round((res + mob) / points / 1e6) + ' MB' : '—',
    `${gb(res)} home internet · ${gb(mob)} mobile · ${points} searches · ${gb(idle)} in hours with no searches · most in the hour from ${top.hour.slice(11)}:00 UTC (${gb((top.residentialBytes ?? 0) + (top.mobileBytes ?? 0))})`,
  ];
}

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
  const [created, setCreated] = useState<{ email: string; password?: string; url?: string; emailed?: boolean; copied?: boolean } | null>(null);
  // The Accounts panel can be folded away; the choice is remembered on this browser.
  const [accountsOpen, setAccountsOpen] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem('stakeout.admin.accounts') === 'closed') setAccountsOpen(false);
    } catch {
      /* storage unavailable: stay open */
    }
  }, []);
  const toggleAccounts = (open: boolean) => {
    setAccountsOpen(open);
    try {
      window.localStorage.setItem('stakeout.admin.accounts', open ? 'open' : 'closed');
    } catch {
      /* storage unavailable: the choice lasts until the page reloads */
    }
  };
  // White label: each account can have one domain that serves its shared reports under its own name and logo.
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandForm, setBrandForm] = useState<{ userId: string; email: string; domain: string; name: string; logo: string; logoName: string; existing: boolean } | null>(null);
  const [brandNote, setBrandNote] = useState<{ domain: string; hosting: string } | null>(null);
  const [credit, setCredit] = useState({ email: '', amount: '', note: '' });
  const [gift, setGift] = useState({ email: '', amount: '', note: '' });
  const [invite, setInvite] = useState('');
  const [ops, setOps] = useState<Ops | null>(null);
  const [form, setForm] = useState<{ gap: string; cost: string; isps: string; signups: boolean; powerSave: boolean; idleOff: string; mobileCredits: string; mobileCustomers: boolean; aiFlags: boolean; pageOne: boolean; newPlans: boolean; preview: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/ops', { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json();
    setScans(d.scans ?? []);
    setUsers(d.users ?? []);
    setBrands(d.brands ?? []);
    if (d.settings && d.capacity) {
      setOps(d);
      // The form is filled once, so a refresh never overwrites what is being typed.
      setForm((f) => f ?? { gap: String(d.settings.searchGapSeconds), cost: String(d.settings.costPerPointUsd), isps: d.settings.ispExclude.join(', '), signups: d.settings.signupsOpen, powerSave: Boolean(d.settings.powerSave), idleOff: String(d.settings.idleOffMinutes ?? 10), mobileCredits: String(d.settings.mobileCreditsPerPoint ?? 1), mobileCustomers: Boolean(d.settings.mobileForCustomers), aiFlags: Boolean(d.settings.aiFlagsForCustomers), pageOne: Boolean(d.settings.pageOneShareForCustomers), newPlans: Boolean(d.settings.newPlansLive), preview: (d.settings.newPlansPreview ?? []).join(', ') });
    }
  }, []);
  usePolling(load, 15000);

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

  // A new account's sign-in details are never hidden: while they are on screen the panel stays open.
  const accountsShown = accountsOpen || created !== null || brandForm !== null || brandNote !== null;

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

      {ops && (ops.system?.proxyDown?.length || ops.system?.trafficLow || ops.system?.mobileTrafficLow) ? (
        <section role="alert" className="space-y-1 rounded-2xl border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-100">
          {ops.system?.proxyDown?.length ? (
            <p>
              <span className="font-bold">Proxies down</span> in {ops.system.proxyDown.map((d) => d.region).join(', ')} since{' '}
              {new Date(ops.system.proxyDown.map((d) => d.since).sort()[0]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}: every port is refused. Points there are waiting, not failing, and finish by themselves once proxies answer. Usually the traffic has run out (Proxy-Seller, and Decodo if it is on).
            </p>
          ) : null}
          {ops.system?.trafficLow ? (
            <p>
              <span className="font-bold">Proxy-Seller traffic low:</span> {gb(ops.system.traffic?.leftBytes)} left
              {ops.system.traffic?.todayBytes ? `, ${gb(ops.system.traffic.todayBytes)} used today` : ''}. Buy more at Proxy-Seller before it runs out.
            </p>
          ) : null}
          {ops.system?.mobileTrafficLow ? (
            <p>
              <span className="font-bold">Mobile data low:</span> {gb(ops.system.mobileTraffic?.leftBytes)} left
              {ops.system.mobileTraffic?.todayBytes ? `, ${gb(ops.system.mobileTraffic.todayBytes)} used today` : ''}. Top up the VoidMob package before it runs out.
            </p>
          ) : null}
        </section>
      ) : null}

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
                [
                  'Proxy providers',
                  (ops.system?.proxyProviders ?? ['proxyseller']).map((p) => (p === 'decodo' ? 'Decodo' : 'Proxy-Seller')).join(' → '),
                  (ops.system?.proxyProviders ?? []).includes('decodo') ? 'in this order; ISP-only points use Proxy-Seller' : 'Decodo is off: set DECODO_USERNAME and DECODO_PASSWORD',
                ],
                [
                  'Mobile data',
                  ops.system?.mobileData ? (ops.system.mobileProvider === 'decodo' ? 'Decodo mobile' : 'VoidMob') : 'Off',
                  ops.system?.mobileData
                    ? `${ops.settings.mobileCreditsPerPoint ?? 1} phone sessions a point · ${ops.settings.mobileForCustomers ? 'customers can choose it' : 'admins only'}${ops.system.mobileTraffic ? ' · ' + gb(ops.system.mobileTraffic.leftBytes) + ' left' : ''}${ops.system.mobileLogin ? ' · login: ' + ops.system.mobileLogin : ''}`
                    : 'set VOIDMOB_API_KEY and VOIDMOB_PROXY_ID on the worker',
                ],
                ['Proxy-Seller traffic today', gb(ops.system?.traffic?.todayBytes), ops.system?.traffic ? `${gb(ops.system.traffic.leftBytes)} left of ${gb(ops.system.traffic.limitBytes)}${ops.system.traffic.expires ? ' · expires ' + ops.system.traffic.expires : ''}` : 'not reported by the worker yet'],
                dataPerSearch(ops.system?.trafficHours),
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

      <AdminRuns />

      <section className={card}>
        <h2 className="text-sm font-bold text-white">Add phone sessions</h2>
        <p className="mt-1 text-xs text-slate-400">Writes the ledger entry and the balance together. A negative amount removes phone sessions.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className={input + ' w-64'} list="admin-accounts" placeholder="account email" value={credit.email} onChange={(e) => setCredit({ ...credit, email: e.target.value })} />
          <datalist id="admin-accounts">
            {users.map((u) => (
              <option key={u.id} value={u.email} />
            ))}
          </datalist>
          <input className={input + ' w-28'} type="number" placeholder="sessions" value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} />
          <input className={input + ' w-64'} maxLength={80} placeholder="note (optional)" value={credit.note} onChange={(e) => setCredit({ ...credit, note: e.target.value })} />
          <button
            type="button"
            disabled={busy !== '' || !credit.email || !credit.amount}
            className={btn + ' bg-emerald-500 text-slate-950 hover:bg-emerald-400'}
            onClick={async () => {
              const ok = await run('credits', { action: 'add_credits', email: credit.email, amount: Number(credit.amount), note: credit.note }, (d) => `${d.email} now has ${d.balance} phone sessions.`);
              if (ok) setCredit({ email: '', amount: '', note: '' });
            }}
          >
            {busy === 'credits' ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-bold text-white">Add brief credits</h2>
        <p className="mt-1 text-xs text-slate-400">
          Given brief credits never expire and are used after a plan’s own. One compiles a revenue brief or updates one. Until the new plans are live, only admins and the preview accounts compile briefs. A negative amount takes given or bought credits back.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className={input + ' w-64'} list="admin-accounts" placeholder="account email" value={gift.email} onChange={(e) => setGift({ ...gift, email: e.target.value })} />
          <input className={input + ' w-28'} type="number" placeholder="brief credits" value={gift.amount} onChange={(e) => setGift({ ...gift, amount: e.target.value })} />
          <input className={input + ' w-64'} maxLength={80} placeholder="note (optional)" value={gift.note} onChange={(e) => setGift({ ...gift, note: e.target.value })} />
          <button
            type="button"
            disabled={busy !== '' || !gift.email || !gift.amount}
            className={btn + ' bg-emerald-500 text-slate-950 hover:bg-emerald-400'}
            onClick={async () => {
              const ok = await run('briefs', { action: 'add_briefs', email: gift.email, amount: Number(gift.amount), note: gift.note }, (d) => `${d.email} now has ${d.briefs} given or bought brief credit${d.briefs === 1 ? '' : 's'}.`);
              if (ok) setGift({ email: '', amount: '', note: '' });
            }}
          >
            {busy === 'briefs' ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-bold text-white">
          <button
            type="button"
            aria-expanded={accountsShown}
            aria-controls="admin-accounts-panel"
            onClick={() => toggleAccounts(!accountsOpen)}
            className="-m-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg p-2 text-left hover:bg-slate-800/60"
          >
            <span>
              Accounts ({users.length})
            </span>
            <span className="flex items-center gap-2 text-xs font-normal text-slate-400">
              {accountsShown ? 'Hide' : 'Show'}
              <svg aria-hidden="true" viewBox="0 0 20 20" className={'h-4 w-4 transition-transform ' + (accountsShown ? 'rotate-180' : '')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 8l5 5 5-5" />
              </svg>
            </span>
          </button>
        </h2>
        {accountsShown && (
          <div id="admin-accounts-panel">
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Sessions</th>
                <th className="py-2 pr-4 font-medium" title="Given or bought brief credits; a plan's own are on its Plan page">Brief credits</th>
                <th className="py-2 pr-4 font-medium">Scans</th>
                <th className="py-2 pr-4 font-medium">Joined</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2 pr-4 text-white">
                    {u.email}
                    {brands.filter((b) => b.userId === u.id).map((b) => (
                      <span key={b.domain} className="mt-0.5 block text-xs font-normal text-sky-300">{b.domain}</span>
                    ))}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={u.role === 'BLOCKED' ? 'text-rose-300' : u.role === 'ADMIN' ? 'text-emerald-300' : 'text-slate-300'}>
                      {u.role === 'BLOCKED' ? 'Blocked' : u.role === 'ADMIN' ? 'Admin' : u.role === 'SYSTEM' ? 'System' : u.confirmed ? 'Active' : 'Email not confirmed'}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-200">{u.credits}</td>
                  <td className="py-2 pr-4 text-slate-200">{u.briefs}</td>
                  <td className="py-2 pr-4 text-slate-200">{u.scans}</td>
                  <td className="py-2 pr-4 text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 text-right">
                    {(u.role === 'AGENCY' || u.role === 'ADMIN') && (
                      <button
                        type="button"
                        disabled={busy !== ''}
                        className={btn + ' mr-2 border border-slate-600 py-1 text-slate-200 hover:bg-slate-800'}
                        onClick={() => {
                          const b = brands.find((x) => x.userId === u.id);
                          setBrandNote(null);
                          setBrandForm({ userId: u.id, email: u.email, domain: b?.domain ?? '', name: b?.name ?? '', logo: '', logoName: '', existing: Boolean(b) });
                        }}
                      >
                        White label
                      </button>
                    )}
                    {(u.role === 'AGENCY' || u.role === 'ADMIN') && (
                      <button
                        type="button"
                        disabled={busy !== ''}
                        className={btn + ' mr-2 border border-slate-600 py-1 text-slate-200 hover:bg-slate-800'}
                        onClick={() =>
                          run('pw:' + u.id, { action: 'password_link', userId: u.id }, (d) => {
                            setCreated({ email: String(d.email), url: String(d.url), emailed: Boolean(d.emailed) });
                            return `Password link made for ${d.email}. It is shown under the Accounts table.`;
                          })
                        }
                      >
                        Password link
                      </button>
                    )}
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
        {brandForm && (
          <div className="mt-4 rounded-lg border border-sky-500/40 bg-sky-950/20 p-4">
            <p className="text-sm font-bold text-white">White label for {brandForm.email}</p>
            <p className="mt-1 text-xs text-slate-400">Their shared reports open on this domain, under this name and logo, with nothing of Stakeout on the page.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-300">
                Domain
                <input className={input + ' mt-1 w-full'} placeholder="reports.theiragency.com" value={brandForm.domain} onChange={(e) => setBrandForm({ ...brandForm, domain: e.target.value })} />
              </label>
              <label className="text-xs text-slate-300">
                Name shown on reports
                <input className={input + ' mt-1 w-full'} placeholder="Their Agency" maxLength={60} value={brandForm.name} onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })} />
              </label>
              <label className="text-xs text-slate-300 sm:col-span-2">
                Logo (PNG, JPEG or WebP, under 300 KB){brandForm.existing ? ': leave empty to keep the current one' : ''}
                <input
                  className="mt-1 block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return setBrandForm({ ...brandForm, logo: '', logoName: '' });
                    if (f.size > 300 * 1024) {
                      setNote({ ok: false, text: `That logo is ${Math.round(f.size / 1024)} KB. It must be under 300 KB.` });
                      e.target.value = '';
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setBrandForm((cur) => (cur ? { ...cur, logo: String(reader.result), logoName: f.name } : cur));
                    reader.readAsDataURL(f);
                  }}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== '' || !brandForm.domain.trim() || !brandForm.name.trim()}
                className={btn + ' border border-sky-500/60 text-sky-200 hover:bg-sky-500/10'}
                onClick={async () => {
                  const ok = await run('brand', { action: 'set_brand', userId: brandForm.userId, domain: brandForm.domain, name: brandForm.name, logo: brandForm.logo || undefined }, (d) => {
                    const brand = d.brand as { domain: string };
                    setBrandNote({ domain: brand.domain, hosting: String((d.hosting as { note?: string } | undefined)?.note ?? '') });
                    return `White label saved for ${d.email}: ${brand.domain}.`;
                  });
                  if (ok) setBrandForm(null);
                }}
              >
                Save
              </button>
              {brandForm.existing && (
                <button
                  type="button"
                  disabled={busy !== ''}
                  className={btn + ' border border-rose-500/60 text-rose-300 hover:bg-rose-500/10'}
                  onClick={async () => {
                    const ok = await run('brand', { action: 'remove_brand', domain: brandForm.domain }, (d) => `White label removed: ${d.domain}. Their share links go back to this site's address.`);
                    if (ok) setBrandForm(null);
                  }}
                >
                  Remove white label
                </button>
              )}
              <button type="button" className={btn + ' border border-slate-600 text-slate-200 hover:bg-slate-800'} onClick={() => setBrandForm(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {brandNote && (
          <div role="status" className="mt-4 rounded-lg border border-sky-500/40 bg-sky-950/20 p-4 text-sm text-slate-200">
            <p className="font-bold text-white">Two steps to finish {brandNote.domain}</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-300">
              <li>
                The customer adds this DNS record at their domain provider:
                <code className="mt-1 block select-all break-all rounded bg-slate-950 px-2 py-1 font-mono text-xs text-white">
                  {brandNote.domain.split('.')[0]}  CNAME  cname.vercel-dns.com
                </code>
              </li>
              <li>{brandNote.hosting}</li>
            </ol>
            <p className="mt-2 text-xs text-slate-400">Once both are done, their Share button gives links on {brandNote.domain}. It can take a few minutes for the certificate to be issued.</p>
            <button type="button" className={btn + ' mt-3 border border-slate-600 text-slate-200 hover:bg-slate-800'} onClick={() => setBrandNote(null)}>
              Done
            </button>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
          <input className={input + ' w-72'} type="email" placeholder="invite: new account email" value={invite} onChange={(e) => setInvite(e.target.value)} />
          <button
            type="button"
            disabled={busy !== '' || !invite}
            className={btn + ' border border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/10'}
            onClick={async () => {
              const ok = await run('invite', { action: 'create_account', email: invite }, (d) => {
                setCreated({ email: String(d.email), password: String(d.password), url: d.url ? String(d.url) : undefined, emailed: Boolean(d.emailed) });
                return `Account created for ${d.email}. Its sign-in details are shown beside the Create account button.`;
              });
              if (ok) setInvite('');
            }}
          >
            {busy === 'invite' ? 'Creating…' : 'Create account'}
          </button>
          <span className="text-xs text-slate-500">Works while sign-ups are closed. The account starts with 0 phone sessions.</span>
        </div>
        {created && (
          <div role="alert" className="mt-3 rounded-lg border border-amber-400/60 bg-amber-400/10 p-4">
            <p className="text-sm font-bold text-amber-200">
              {created.password ? 'Save these sign-in details now. The password cannot be shown again.' : 'Password link. It cannot be shown again.'}
            </p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-400">Account</dt>
              <dd className="font-mono text-white">{created.email}</dd>
              {created.password && (
                <>
                  <dt className="text-slate-400">Password</dt>
                  <dd><code className="select-all rounded bg-slate-950 px-2 py-1 font-mono text-base text-white">{created.password}</code></dd>
                </>
              )}
              {created.url && (
                <>
                  <dt className="text-slate-400">Their link</dt>
                  <dd className="min-w-0"><code className="block select-all break-all rounded bg-slate-950 px-2 py-1 font-mono text-xs text-white">{created.url}</code></dd>
                </>
              )}
            </dl>
            <p className="mt-3 text-xs text-slate-300">
              {created.url
                ? created.emailed
                  ? `The link was emailed to ${created.email}. It lets them choose their own password, works once, and lasts 7 days.`
                  : 'The link was NOT emailed (the mailer is unavailable): send it to them yourself. It lets them choose their own password, works once, and lasts 7 days.'
                : 'Nothing was emailed to them: send these details yourself.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={btn + ' border border-slate-600 text-slate-200 hover:bg-slate-800'}
                onClick={() => {
                  const lines = created.url
                    ? [`Choose your Stakeout Search password here: ${created.url}`, `Your sign-in email is ${created.email}.`]
                    : ['Sign in at https://www.stakeoutsearch.com/login', `Email: ${created.email}`, `Password: ${created.password}`];
                  void navigator.clipboard?.writeText(lines.join('\n'));
                  setCreated({ ...created, copied: true });
                }}
              >
                {created.copied ? 'Copied' : created.url ? 'Copy a message with the link' : 'Copy sign-in details'}
              </button>
              <button type="button" className={btn + ' border border-amber-400/60 text-amber-200 hover:bg-amber-400/10'} onClick={() => setCreated(null)}>
                Done
              </button>
            </div>
          </div>
        )}
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
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" className="h-4 w-4" checked={form.powerSave} onChange={(e) => setForm({ ...form, powerSave: e.target.checked })} />
              Switch phones off between scans
            </label>
            <label className="text-xs text-slate-400">
              Switch off after this many minutes with nothing waiting
              <input className={input + ' mt-1 block w-full'} type="number" min={2} max={240} disabled={!form.powerSave} value={form.idleOff} onChange={(e) => setForm({ ...form, idleOff: e.target.value })} />
            </label>
            <p className="text-xs text-slate-500 sm:col-span-2">
              With this on, phones start when a scan arrives (about two minutes before its first point) and stop once the queue has been empty this long, so an idle phone uses no proxy data. Turn it off
              while you work on a phone by hand in DuoPlus.
            </p>
            <label className="text-xs text-slate-400">
              Mobile Network: phone sessions per point (Residential is 1)
              <input className={input + ' mt-1 block w-full'} type="number" min={1} max={10} value={form.mobileCredits} onChange={(e) => setForm({ ...form, mobileCredits: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" className="h-4 w-4" checked={form.mobileCustomers} onChange={(e) => setForm({ ...form, mobileCustomers: e.target.checked })} />
              Customers can choose Mobile Network and the Mix (otherwise admins only)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200 sm:col-span-2">
              <input type="checkbox" className="h-4 w-4" checked={form.aiFlags} onChange={(e) => setForm({ ...form, aiFlags: e.target.checked })} />
              Customers see the AI Overview by its four flags: featured, named, listing cited, website cited (admins always do)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200 sm:col-span-2">
              <input type="checkbox" className="h-4 w-4" checked={form.pageOne} onChange={(e) => setForm({ ...form, pageOne: e.target.checked })} />
              Customers&rsquo; Share of local search counts page one: the map pack&rsquo;s top 3 or an upfront AI Overview spot at any point, over the points with local results (admins always see it)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200 sm:col-span-2">
              <input type="checkbox" className="h-4 w-4" checked={form.newPlans} onChange={(e) => setForm({ ...form, newPlans: e.target.checked })} />
              New plans live for everyone: Scout, Agency and Scale, the listing add-on, briefs, the Closer Pack and the new top-ups on the site and in the app (accounts on seats keep them)
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-200 sm:col-span-2">
              Accounts that see the new plans before they go live (emails, comma-separated; admins always do)
              <input className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm" value={form.preview} onChange={(e) => setForm({ ...form, preview: e.target.value })} placeholder="test@youragency.com" />
              <span className="text-xs text-slate-400">
                Before launch, see the new pricing page at <a className="text-sky-300 underline" href="/pricing/preview" target="_blank" rel="noreferrer">/pricing/preview</a> (admins and these accounts only).
              </span>
            </label>
          </div>
          <button
            type="button"
            disabled={busy !== ''}
            className={btn + ' mt-4 bg-emerald-500 text-slate-950 hover:bg-emerald-400'}
            onClick={() => run('settings', { action: 'save_settings', settings: { searchGapSeconds: Number(form.gap), costPerPointUsd: Number(form.cost), ispExclude: form.isps, signupsOpen: form.signups, powerSave: form.powerSave, idleOffMinutes: Number(form.idleOff), mobileCreditsPerPoint: Number(form.mobileCredits), mobileForCustomers: form.mobileCustomers, aiFlagsForCustomers: form.aiFlags, pageOneShareForCustomers: form.pageOne, newPlansLive: form.newPlans, newPlansPreview: form.preview } }, () => 'Settings saved.')}
          >
            {busy === 'settings' ? 'Saving…' : 'Save settings'}
          </button>
          <div className="mt-5 border-t border-slate-800 pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Templates</h3>
            {([['chrome', 'Chrome'], ['maps', 'Maps'], ['google', 'Google app']] as const).map(([k, label]) => {
              const t = ops.system?.templates?.[k];
              return (
                <p key={k} className="mt-1 text-sm text-slate-200">
                  <span className="font-semibold">{label}:</span> {t ? `${t.id} · ${t.name} · ${t.version ? 'version ' + t.version : 'no version declared'}` : k === 'google' ? 'not found (name the DuoPlus template "Stakeout Google App")' : 'not found'}
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
