'use client';
import { useMemo, useState } from 'react';
import { BODY_MAX, CTA, calendarWeeks, emptyDraft, emptyWeeks, localDay, planSlots, postProblem, type GbpPost, type PostDraft } from '@stakeout/core/gbpPosts';

const input = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-50';
const small = input.replace('w-full ', '');
const btn = 'rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500 disabled:opacity-40';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOT: Record<GbpPost['state'], string> = { scheduled: 'bg-sky-400', publishing: 'bg-amber-400', published: 'bg-emerald-400', failed: 'bg-rose-400', draft: 'bg-slate-500' };
const STATE_TEXT: Record<GbpPost['state'], string> = { scheduled: 'Scheduled', publishing: 'Publishing', published: 'On Google', failed: 'Failed', draft: 'Draft' };
const PLAN_KEY = 'stakeout.gbp.plan';
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dayName = (ymd: string) => new Date(ymd + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const slotName = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

type Plan = { days: number[]; time: string; weeks: number };
const readPlan = (): Plan => {
  try {
    const p = JSON.parse(localStorage.getItem(PLAN_KEY) ?? 'null');
    if (p && Array.isArray(p.days) && typeof p.time === 'string' && Number.isInteger(p.weeks)) return p as Plan;
  } catch { /* none saved */ }
  return { days: [2], time: '09:00', weeks: 4 };
};

/**
 * The content calendar for one listing: a month of days with the posts that went out and the ones
 * waiting on each, and a planner that lays out a month of posting slots to fill in one sitting.
 * `onDay` asks the composer for a post on a day; `onSchedule` sends one written in the planner.
 */
export default function GbpPostCalendar({ posts, onDay, onSchedule, onCancel }: { posts: GbpPost[]; onDay: (day: string) => void; onSchedule: (d: PostDraft) => Promise<void>; onCancel: (p: GbpPost) => Promise<void> }) {
  const today = localDay(new Date());
  const [month, setMonth] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [open, setOpen] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<Plan>({ days: [2], time: '09:00', weeks: 4 });
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [cta, setCta] = useState({ cta: '', ctaUrl: '' });
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  // Each post on the day it went out, or is due, where the viewer is.
  const byDay = useMemo(() => {
    const m = new Map<string, GbpPost[]>();
    for (const p of posts) {
      if (!p.at) continue;
      const k = localDay(new Date(p.at));
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    for (const list of m.values()) list.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return m;
  }, [posts]);
  const weeks = useMemo(() => calendarWeeks(month.y, month.m), [month]);
  const monthKey = month.y + '-' + String(month.m + 1).padStart(2, '0');
  const quiet = useMemo(() => emptyWeeks([...byDay.entries()].filter(([, l]) => l.some((p) => p.state !== 'failed' && p.state !== 'draft')).map(([d]) => d), today, 4), [byDay, today]);
  const taken = useMemo(() => [...byDay.entries()].filter(([, l]) => l.some((p) => p.state === 'scheduled' || p.state === 'publishing' || p.state === 'published')).map(([d]) => d), [byDay]);
  const slots = useMemo(() => (planning ? planSlots(plan.days, plan.time, plan.weeks, taken) : []), [planning, plan, taken]);
  const written = slots.filter((s) => (texts[localDay(s)] ?? '').trim());
  const step = (n: number) => setMonth(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const savePlan = (p: Plan) => { setPlan(p); try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch { /* not remembered */ } };
  const startPlanning = () => { setPlan(readPlan()); setPlanning(true); setNote(''); setFailed({}); };

  const draftOf = (s: Date): PostDraft => ({ ...emptyDraft(), body: (texts[localDay(s)] ?? '').trim(), cta: cta.cta, ctaUrl: cta.cta && cta.cta !== 'CALL' ? cta.ctaUrl.trim() : '', scheduledAt: s.toISOString() });
  const problems = written.map((s) => postProblem(draftOf(s))).filter(Boolean);
  const scheduleAll = async () => {
    setProgress({ done: 0, of: written.length }); setFailed({}); setNote('');
    const bad: Record<string, string> = {};
    let done = 0;
    // One at a time: each is its own request to Google's side, and a refusal names the post it was for.
    for (const s of written) {
      const k = localDay(s);
      try {
        await onSchedule(draftOf(s));
        setTexts((t) => { const n = { ...t }; delete n[k]; return n; });
      } catch (e) {
        bad[k] = e instanceof Error ? e.message : 'Not scheduled.';
      }
      setProgress({ done: ++done, of: written.length });
    }
    setProgress(null); setFailed(bad);
    const ok = written.length - Object.keys(bad).length;
    setNote(ok ? `${ok} post${ok === 1 ? '' : 's'} scheduled.` + (Object.keys(bad).length ? ' The ones marked below were not.' : '') : '');
  };

  const dayPosts = open ? byDay.get(open) ?? [] : [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => step(-1)} aria-label="Previous month" className={btn + ' px-2.5'}>‹</button>
          <h4 className="min-w-[9.5rem] text-center text-sm font-semibold">{new Date(month.y, month.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h4>
          <button type="button" onClick={() => step(1)} aria-label="Next month" className={btn + ' px-2.5'}>›</button>
          <button type="button" onClick={() => { const n = new Date(); setMonth({ y: n.getFullYear(), m: n.getMonth() }); }} className="ml-1 text-xs text-slate-400 hover:text-slate-200">Today</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          {(['scheduled', 'published', 'failed'] as const).map((s) => <span key={s} className="flex items-center gap-1.5"><span className={'h-2 w-2 rounded-full ' + DOT[s]} aria-hidden />{STATE_TEXT[s]}</span>)}
          <button type="button" onClick={() => (planning ? setPlanning(false) : startPlanning())} aria-expanded={planning} className={'rounded-lg px-3 py-1.5 text-sm font-semibold ' + (planning ? 'border border-slate-700 text-slate-300' : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400')}>{planning ? 'Close planner' : 'Plan a month'}</button>
        </div>
      </div>

      {quiet.length > 0 && !planning && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">{quiet.length === 4 ? 'Nothing is planned for the next four weeks.' : `${quiet.length} of the next four weeks ${quiet.length === 1 ? 'has' : 'have'} no post.`} A listing that posts every week looks cared for. <button type="button" onClick={startPlanning} className="underline hover:text-amber-100">Plan them now</button></p>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {WEEKDAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((day, i) => {
            const list = byDay.get(day) ?? [];
            const inMonth = day.startsWith(monthKey), past = day < today, isToday = day === today;
            const planned = planning && slots.some((s) => localDay(s) === day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => (list.length ? setOpen(open === day ? null : day) : !past && onDay(day))}
                disabled={past && !list.length}
                aria-label={dayName(day) + (list.length ? `: ${list.length} post${list.length === 1 ? '' : 's'}` : past ? '' : ': add a post')}
                className={'group relative min-h-[4.5rem] border-slate-800 p-1.5 text-left align-top sm:min-h-[5.75rem] ' + (i % 7 ? 'border-l ' : '') + (i >= 7 ? 'border-t ' : '') + (inMonth ? '' : 'bg-slate-950/60 ') + (open === day ? 'bg-slate-800/60 ' : !past || list.length ? 'hover:bg-slate-800/40 ' : '') + (planned ? 'ring-1 ring-inset ring-emerald-500/50 ' : '')}
              >
                <span className={'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums ' + (isToday ? 'bg-emerald-500 font-bold text-slate-950' : inMonth ? (past ? 'text-slate-600' : 'text-slate-300') : 'text-slate-700')}>{Number(day.slice(8))}</span>
                {!list.length && !past && <span className="absolute right-1.5 top-1 text-sm text-slate-600 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden>+</span>}
                {/* On a phone a day is too narrow for words: the dots say what is there. */}
                <span className="mt-1 flex flex-wrap gap-1 sm:hidden">{list.map((p) => <span key={p.id} className={'h-2 w-2 rounded-full ' + DOT[p.state]} />)}</span>
                <span className="mt-1 hidden space-y-0.5 sm:block">
                  {list.slice(0, 2).map((p) => (
                    <span key={p.id} className="flex items-center gap-1 truncate rounded bg-slate-800/80 px-1 py-0.5 text-[11px] text-slate-300" title={p.body || p.title || 'Photo'}>
                      <span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + DOT[p.state]} aria-hidden />
                      <span className="truncate">{p.title || p.body || 'Photo'}</span>
                    </span>
                  ))}
                  {list.length > 2 && <span className="block text-[10px] text-slate-500">+{list.length - 2} more</span>}
                  {planned && !list.length && <span className="block text-[10px] text-emerald-400">slot</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-500">Click an empty day to write a post for it. Click a day with posts to see them. Times are yours, where you are.</p>

      {open && dayPosts.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{dayName(open)}</p>
            <div className="flex items-center gap-3 text-xs">
              {open >= today && <button type="button" onClick={() => onDay(open)} className="text-sky-400 hover:underline">Add another</button>}
              <button type="button" onClick={() => setOpen(null)} className="text-slate-400 hover:text-slate-200">Close</button>
            </div>
          </div>
          <ul className="mt-2 divide-y divide-slate-800">
            {dayPosts.map((p) => (
              <li key={p.id} className="flex gap-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image && <img src={p.image} alt="" className="h-12 w-16 shrink-0 rounded-md border border-slate-800 object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs text-slate-400"><span className={'h-2 w-2 rounded-full ' + DOT[p.state]} aria-hidden />{STATE_TEXT[p.state]} · {p.at ? clock(p.at) : ''}</p>
                  <p className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-200">{p.title ? p.title + (p.body ? ': ' : '') : ''}{p.body || (p.title ? '' : 'Photo')}</p>
                  {p.error && <p className="mt-1 text-xs text-rose-300">{p.error}</p>}
                  <div className="mt-1 flex gap-3 text-xs">
                    {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-sky-300">See it on Google</a>}
                    {p.state === 'scheduled' && <button type="button" onClick={() => onCancel(p)} className="text-slate-400 hover:text-rose-300">Cancel this post</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {planning && (
        <div className="rounded-lg border border-emerald-500/30 bg-slate-950/60 p-4">
          <p className="text-sm font-semibold">Plan a month</p>
          <p className="mt-0.5 text-xs text-slate-500">Choose the days you post on. Every open slot gets a box: write the ones you want and schedule them together. Days that already have a post are left out.</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span role="group" aria-label="Days to post on" className="inline-flex overflow-hidden rounded-lg border border-slate-700 text-xs">
              {WEEKDAYS.map((d, i) => (
                <button key={d} type="button" aria-pressed={plan.days.includes(i)} onClick={() => savePlan({ ...plan, days: plan.days.includes(i) ? plan.days.filter((x) => x !== i) : [...plan.days, i].sort() })} className={'px-2.5 py-1.5 ' + (plan.days.includes(i) ? 'bg-emerald-500/20 font-semibold text-emerald-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')}>{d}</button>
              ))}
            </span>
            <label className="flex items-center gap-2 text-xs text-slate-400">at <input type="time" className={small + ' py-1 text-xs'} value={plan.time} onChange={(e) => savePlan({ ...plan, time: e.target.value || '09:00' })} /></label>
            <label className="flex items-center gap-2 text-xs text-slate-400">for
              <select className={small + ' py-1 text-xs'} value={plan.weeks} onChange={(e) => savePlan({ ...plan, weeks: Number(e.target.value) })}>
                {[2, 4, 6, 8, 12].map((w) => <option key={w} value={w}>{w} weeks</option>)}
              </select>
            </label>
          </div>

          {!plan.days.length ? <p className="mt-3 text-sm text-slate-400">Pick at least one day of the week.</p> : !slots.length ? <p className="mt-3 text-sm text-slate-400">Every one of those days already has a post. Add a day, or look further ahead.</p> : (
            <ol className="mt-3 space-y-2">
              {slots.map((s) => {
                const k = localDay(s), text = texts[k] ?? '';
                return (
                  <li key={k} className="grid gap-2 sm:grid-cols-[10.5rem_1fr]">
                    <div className="pt-2 text-xs">
                      <p className="font-medium text-slate-300">{slotName(s)}</p>
                      <p className={'mt-0.5 tabular-nums ' + (text.trim().length > BODY_MAX ? 'text-rose-300' : 'text-slate-600')}>{text.trim().length ? `${text.trim().length} / ${BODY_MAX}` : 'empty: skipped'}</p>
                    </div>
                    <div>
                      <textarea className={input + ' h-20'} value={text} disabled={Boolean(progress)} onChange={(e) => setTexts((t) => ({ ...t, [k]: e.target.value }))} placeholder="What should customers know that week?" aria-label={'Post for ' + slotName(s)} />
                      {failed[k] && <p className="mt-1 text-xs text-rose-300">Not scheduled: {failed[k]}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {slots.length > 0 && (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_1fr]">
                <div><label className="text-xs font-medium text-slate-400">Button on every post</label><select className={input + ' mt-1'} value={cta.cta} onChange={(e) => setCta({ ...cta, cta: e.target.value })}>{CTA.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                {cta.cta && cta.cta !== 'CALL' && <div><label className="text-xs font-medium text-slate-400">Button link</label><input className={input + ' mt-1'} value={cta.ctaUrl} onChange={(e) => setCta({ ...cta, ctaUrl: e.target.value })} placeholder="https://" /></div>}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={scheduleAll} disabled={!written.length || problems.length > 0 || Boolean(progress)} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">{progress ? `Scheduling ${progress.done} of ${progress.of}…` : written.length ? `Schedule ${written.length} post${written.length === 1 ? '' : 's'}` : 'Write a post to schedule'}</button>
                <span className="text-xs text-slate-500">{written.length} of {slots.length} slots written. Photos, offers and events are added one at a time, from the form below.</span>
                {problems[0] && <span className="text-xs text-amber-300">{problems[0]}</span>}
              </div>
            </>
          )}
          {note && <p className="mt-2 text-xs text-emerald-300">{note}</p>}
        </div>
      )}
    </div>
  );
}
