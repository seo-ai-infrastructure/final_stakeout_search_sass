'use client';
import { useCallback, useEffect, useState } from 'react';
import { ACCOUNT_PLANS } from '@stakeout/core/gbpPlans';

type Member = { id: string; email: string; name: string | null; addedAt: string | null; joined: boolean };
type Team = { plan: string | null; seats: number | null; members: Member[]; left: number | null; you: { member: boolean; email: string }; paused: boolean };

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const btn = 'rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500 disabled:opacity-40';

async function call<T>(body?: unknown): Promise<T> {
  const r = await fetch('/api/team', body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'That did not work.');
  return d as T;
}

/**
 * Team seats on the Plan and billing page: the owner adds people by email (they get a link to choose
 * a password) and takes them off; a team member sees whose account they work in.
 */
export default function TeamSeats() {
  const [team, setTeam] = useState<Team | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const read = useCallback(() => call<Team>().then(setTeam).catch((e) => setError(e.message)), []);
  useEffect(() => { read(); }, [read]);
  const run = async (key: string, what: () => Promise<void>) => {
    setBusy(key); setError(''); setNote('');
    try { await what(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(''); }
  };
  if (!team) return error ? <div className={card}><p role="alert" className="text-sm text-rose-300">{error}</p></div> : null;
  const owner = !team.you.member;
  const total = team.seats === null ? null : team.seats + 1;
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    run('add', async () => {
      const t = await call<Team & { you?: Team['you'] }>({ add: email });
      setTeam((was) => ({ ...(was as Team), ...t }));
      setNote(`${email.trim()} is on your team. They have an email with a link to choose a password and sign in.`);
      setEmail('');
    });
  };
  const remove = (m: Member) => run(m.id, async () => {
    if (!window.confirm(`Take ${m.email} off your team? They lose access to this account at once.`)) return;
    const t = await call<Team>({ remove: m.id });
    setTeam((was) => ({ ...(was as Team), ...t }));
    setNote(`${m.email} is off your team.`);
  });
  const resend = (m: Member) => run('r' + m.id, async () => {
    const t = await call<Team>({ resend: m.id });
    setTeam((was) => ({ ...(was as Team), ...t }));
    setNote(`A new link is on its way to ${m.email}.`);
  });
  return (
    <div className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Team</h2>
        <p className="text-sm text-slate-400">{total === null ? 'No limit on your plan' : total === 1 ? 'Just you on this plan' : `${team.members.length + 1} of ${total} seats used, you included`}</p>
      </div>
      {owner ? (
        <p className="mt-2 text-sm text-slate-400">People you add sign in with their own email and work in this account: they run scans and open reports, using its phone sessions. The plan, billing, API keys and the team stay with you.</p>
      ) : (
        <p className="mt-2 text-sm text-slate-400">You are signed in as {team.you.email}, working in this account as a team member. The owner manages the plan, billing and the team.</p>
      )}
      {team.members.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-800 rounded-lg border border-slate-800">
          {team.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-100">{m.name ? `${m.name} · ${m.email}` : m.email}</p>
                <p className="text-xs text-slate-500">{m.joined ? 'Can sign in' : 'Invited: has not chosen a password yet'}</p>
              </div>
              {owner && (
                <div className="flex gap-2">
                  {!m.joined && <button type="button" onClick={() => resend(m)} disabled={busy === 'r' + m.id} className={btn}>{busy === 'r' + m.id ? 'Sending…' : 'Send the link again'}</button>}
                  <button type="button" onClick={() => remove(m)} disabled={busy === m.id} className={btn + ' hover:border-rose-400 hover:text-rose-200'}>{busy === m.id ? 'Working…' : 'Remove'}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {owner && (team.seats === 0 ? (
        <p className="mt-4 rounded-lg border border-slate-700 px-3 py-2.5 text-sm text-slate-300">
          Team seats come with Agency ({ACCOUNT_PLANS.P_AGENCY.seats} people), Scale ({ACCOUNT_PLANS.P_SCALE.seats}) and Agency Max (no limit). <a href="#plans" className="font-semibold text-emerald-300 underline">Choose a plan</a>
        </p>
      ) : team.left === 0 ? (
        <p className="mt-4 rounded-lg border border-slate-700 px-3 py-2.5 text-sm text-slate-300">Every seat on your plan is taken. Remove someone, or move up a plan for more seats.</p>
      ) : (
        <form onSubmit={add} className="mt-4 flex flex-wrap gap-2">
          <label htmlFor="team-email" className="sr-only">Email of the person to add</label>
          <input id="team-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@agency.com" autoComplete="off" className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400 focus:outline-none" />
          <button type="submit" disabled={busy === 'add' || !email.trim()} className="min-h-[40px] rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">{busy === 'add' ? 'Adding…' : 'Add to team'}</button>
        </form>
      ))}
      {note && <p className="mt-3 text-sm text-emerald-300">{note}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    </div>
  );
}
