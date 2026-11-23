'use client';
import { useEffect, useMemo, useState } from 'react';
import { calendarWeeks, emptyWeeks, localDay, type GbpPost } from '@stakeout/core/gbpPosts';

type Loc = { id: string; name: string; plan: string | null };
type Profile = { id: string; name: string; locations: Loc[] };
type Post = GbpPost & { profile: string };
type Open = (p: { profile: string; location: string }) => void;

const btn = 'rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500 disabled:opacity-40';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOT: Record<GbpPost['state'], string> = { scheduled: 'bg-sky-400', publishing: 'bg-amber-400', published: 'bg-emerald-400', failed: 'bg-rose-400', draft: 'bg-slate-500' };
const STATE_TEXT: Record<GbpPost['state'], string> = { scheduled: 'Scheduled', publishing: 'Publishing', published: 'On Google', failed: 'Failed', draft: 'Draft' };
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dayName = (ymd: string) => new Date(ymd + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

/**
 * The content calendar across every listing: one month of days with each listing's posts on them,
 * and the listings that have nothing coming up. Writing happens on a listing's own Posts tab, which
 * `onOpen` goes to.
 */
export default function GbpAllCalendar({ profiles, admin, addon = false, onOpen }: { profiles: Profile[]; admin: boolean; addon?: boolean; onOpen: Open }) {
  const today = localDay(new Date());
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [problem, setProblem] = useState('');
  const [month, setMonth] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [only, setOnly] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [allQuiet, setAllQuiet] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/admin/gbp/posts?all=1', { cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not read the posts.'); return j as { posts: Post[]; problems?: string[] }; })
      .then((j) => { if (live) { setPosts(j.posts); setProblem(j.problems?.[0] ?? ''); } })
      .catch((e) => { if (live) { setPosts([]); setProblem(e.message); } });
    return () => { live = false; };
  }, []);

  // The listings that can be posted to: all of an admin's, a customer's paid ones. A listing two accounts manage counts once.
  const listings = useMemo(() => {
    const seen = new Set<string>();
    return profiles.flatMap((p) => p.locations.filter((l) => admin || l.plan !== null).map((l) => ({ profile: p.id, id: l.id, name: l.name }))).filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true))).sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles, admin]);
  const nameOf = useMemo(() => new Map(listings.map((l) => [l.id, l.name])), [listings]);
  const shown = useMemo(() => (posts ?? []).filter((p) => p.at && (!only || p.location === only)), [posts, only]);
  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of shown) { const k = localDay(new Date(String(p.at))); m.set(k, [...(m.get(k) ?? []), p]); }
    return m;
  }, [shown]);
  const weeks = useMemo(() => calendarWeeks(month.y, month.m), [month]);
  const monthKey = month.y + '-' + String(month.m + 1).padStart(2, '0');
  const step = (n: number) => setMonth(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  // Per listing: how many of the next four weeks have no post, emptiest first.
  const quiet = useMemo(() => {
    if (!posts) return [];
    const days = new Map<string, string[]>();
    for (const p of posts) if (p.at && p.state !== 'failed' && p.state !== 'draft') days.set(p.location, [...(days.get(p.location) ?? []), localDay(new Date(p.at))]);
    return listings.map((l) => ({ ...l, empty: emptyWeeks(days.get(l.id) ?? [], today, 4).length })).filter((l) => l.empty > 0).sort((a, b) => b.empty - a.empty || a.name.localeCompare(b.name));
  }, [posts, listings, today]);
  const upcoming = shown.filter((p) => p.state === 'scheduled').length;
  const dayPosts = open ? byDay.get(open) ?? [] : [];

  if (!listings.length)
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <p className="font-semibold">{addon ? 'The content calendar covers listings with the listing add-on.' : 'The content calendar covers listings on a Command or Dominator seat.'}</p>
        <p className="mt-1 text-sm text-slate-400">Put a listing on a plan to schedule its Google posts and see them here alongside your other listings.</p>
      </div>
    );

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => step(-1)} aria-label="Previous month" className={btn + ' px-2.5'}>‹</button>
          <h2 className="min-w-[9.5rem] text-center text-sm font-semibold">{new Date(month.y, month.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
          <button type="button" onClick={() => step(1)} aria-label="Next month" className={btn + ' px-2.5'}>›</button>
          <button type="button" onClick={() => { const n = new Date(); setMonth({ y: n.getFullYear(), m: n.getMonth() }); }} className="ml-1 text-xs text-slate-400 hover:text-slate-200">Today</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          {(['scheduled', 'published', 'failed'] as const).map((s) => <span key={s} className="flex items-center gap-1.5"><span className={'h-2 w-2 rounded-full ' + DOT[s]} aria-hidden />{STATE_TEXT[s]}</span>)}
          <select aria-label="Which listing" value={only} onChange={(e) => { setOnly(e.target.value); setOpen(null); }} className="w-full max-w-[16rem] rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-500">
            <option value="">All {listings.length} listings</option>
            {listings.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {posts === null ? 'Reading every listing’s posts…' : `${upcoming} post${upcoming === 1 ? '' : 's'} scheduled${only ? ' for this listing' : ' across all listings'}.`}
        {problem && <span className="ml-2 text-amber-300">{problem}</span>}
      </p>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {WEEKDAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((day, i) => {
            const list = byDay.get(day) ?? [];
            const inMonth = day.startsWith(monthKey), past = day < today, isToday = day === today;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setOpen(open === day ? null : day)}
                disabled={!list.length}
                aria-label={dayName(day) + (list.length ? `: ${list.length} post${list.length === 1 ? '' : 's'}` : '')}
                className={'min-h-[4.5rem] border-slate-800 p-1.5 text-left align-top sm:min-h-[6.25rem] ' + (i % 7 ? 'border-l ' : '') + (i >= 7 ? 'border-t ' : '') + (inMonth ? '' : 'bg-slate-950/60 ') + (open === day ? 'bg-slate-800/60 ' : list.length ? 'hover:bg-slate-800/40 ' : '')}
              >
                <span className={'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums ' + (isToday ? 'bg-emerald-500 font-bold text-slate-950' : inMonth ? (past ? 'text-slate-600' : 'text-slate-300') : 'text-slate-700')}>{Number(day.slice(8))}</span>
                {/* On a phone a day is too narrow for words: the dots say what is there. */}
                <span className="mt-1 flex flex-wrap gap-1 sm:hidden">{list.slice(0, 8).map((p) => <span key={p.id} className={'h-2 w-2 rounded-full ' + DOT[p.state]} />)}</span>
                <span className="mt-1 hidden space-y-0.5 sm:block">
                  {list.slice(0, 3).map((p) => (
                    <span key={p.id} className="flex items-center gap-1 truncate rounded bg-slate-800/80 px-1 py-0.5 text-[11px] text-slate-300" title={(nameOf.get(p.location) ?? 'A listing') + ': ' + (p.title || p.body || 'Photo')}>
                      <span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + DOT[p.state]} aria-hidden />
                      <span className="truncate">{only ? p.title || p.body || 'Photo' : nameOf.get(p.location) ?? 'A listing'}</span>
                    </span>
                  ))}
                  {list.length > 3 && <span className="block text-[10px] text-slate-500">+{list.length - 3} more</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {open && dayPosts.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{dayName(open)}</p>
            <button type="button" onClick={() => setOpen(null)} className="text-xs text-slate-400 hover:text-slate-200">Close</button>
          </div>
          <ul className="mt-2 divide-y divide-slate-800">
            {dayPosts.map((p) => (
              <li key={p.id} className="flex gap-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image && <img src={p.image} alt="" className="h-12 w-16 shrink-0 rounded-md border border-slate-800 object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400"><span className={'h-2 w-2 rounded-full ' + DOT[p.state]} aria-hidden /><span className="font-semibold text-slate-200">{nameOf.get(p.location) ?? 'A listing'}</span> · {STATE_TEXT[p.state]} · {p.at ? clock(p.at) : ''}</p>
                  <p className="mt-0.5 line-clamp-3 whitespace-pre-line break-words text-sm text-slate-300">{p.title ? p.title + (p.body ? ': ' : '') : ''}{p.body || (p.title ? '' : 'Photo')}</p>
                  {p.error && <p className="mt-0.5 text-xs text-rose-300">{p.error}</p>}
                </div>
                <button type="button" onClick={() => onOpen({ profile: p.profile, location: p.location })} className="shrink-0 self-start text-xs text-sky-400 hover:underline">Open its posts</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {posts !== null && !only && (
        <div className="border-t border-slate-800 pt-4">
          <h3 className="text-sm font-semibold">Nothing coming up {quiet.length > 0 && <span className="ml-1 font-normal text-slate-500">{quiet.length} of {listings.length} listings have an empty week in the next four</span>}</h3>
          {quiet.length === 0 ? <p className="mt-1 text-sm text-slate-400">Every listing has a post in each of the next four weeks.</p> : (
            <>
              <ul className="mt-2 divide-y divide-slate-800 rounded-lg border border-slate-800">
                {(allQuiet ? quiet : quiet.slice(0, 8)).map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{l.name}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className={'text-xs ' + (l.empty === 4 ? 'text-amber-300' : 'text-slate-400')}>{l.empty === 4 ? 'nothing in the next four weeks' : `${l.empty} empty week${l.empty === 1 ? '' : 's'}`}</span>
                      <button type="button" onClick={() => onOpen({ profile: l.profile, location: l.id })} className={btn + ' py-1 text-xs'}>Plan its posts</button>
                    </span>
                  </li>
                ))}
              </ul>
              {quiet.length > 8 && <button type="button" onClick={() => setAllQuiet((v) => !v)} className="mt-2 text-sm text-slate-400 hover:text-slate-200">{allQuiet ? 'Show fewer' : `Show all ${quiet.length}`}</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
