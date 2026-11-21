'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ListingTotals } from '@stakeout/core/gbpInsights';
import { fmt } from '@/components/InsightBits';

type Loc = { id: string; name: string; plan: string | null };
type Profile = { id: string; name: string; customer?: boolean; locations: Loc[] };
type Row = ListingTotals & { profile: string };
type Col = 'name' | 'views' | 'calls' | 'websiteClicks' | 'directions' | 'rate';
const COLS: [Col, string, string][] = [['views', 'Views', 'Times the listing was seen on Search and Maps'], ['calls', 'Calls', ''], ['websiteClicks', 'Website clicks', ''], ['directions', 'Directions', ''], ['rate', 'Actions per 100 views', 'Calls, clicks, directions, messages and bookings for every 100 views']];
const SHOW = 25;

/**
 * Every listing on one page with Google's newest 30-day totals, busiest first: the way into a
 * listing, and the place to spot one that is being seen but not acted on. Listings Google has no
 * totals for yet (connected in the last day) are listed too, without figures.
 */
export default function GbpOverview({ profiles, admin, picked, onOpen }: { profiles: Profile[]; admin: boolean; picked: { profile: string; location: string } | null; onOpen: (p: { profile: string; location: string }) => void }) {
  const [stats, setStats] = useState<Row[] | null>(null);
  const [problem, setProblem] = useState('');
  const [find, setFind] = useState('');
  const [sort, setSort] = useState<{ by: Col; down: boolean }>({ by: 'views', down: true });
  const [touched, setTouched] = useState(false);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/admin/gbp/overview', { cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not read the totals.'); return j as { rows: Row[]; problems?: string[] }; })
      .then((j) => { if (live) { setStats(j.rows); setProblem(j.problems?.[0] ?? ''); } })
      .catch((e) => { if (live) { setStats([]); setProblem(e.message); } });
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => {
    const by = new Map((stats ?? []).map((r) => [r.profile + '|' + r.location, r]));
    const seen = new Set<string>();
    const list = profiles.flatMap((p) => p.locations.map((l) => ({ profile: p.id, id: l.id, name: l.name, plan: l.plan, customer: Boolean(p.customer), t: by.get(p.id + '|' + l.id) ?? null })))
      // A listing two accounts can manage shows once.
      .filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
    return list;
  }, [profiles, stats]);
  const has = rows.filter((r) => r.t);
  const total = (k: 'views' | 'calls' | 'websiteClicks' | 'directions' | 'actions') => has.reduce((n, r) => n + (r.t?.[k] ?? 0), 0);
  const overall = total('views') > 0 ? (total('actions') / total('views')) * 100 : null;
  // Seen plenty, acted on little: under half the rate of the listings as a whole, with enough views to mean something.
  const quiet = (r: (typeof rows)[number]) => overall !== null && r.t !== null && r.t.rate !== null && r.t.views >= 200 && r.t.rate < overall / 2;

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    const list = rows.filter((r) => !q || r.name.toLowerCase().includes(q));
    const val = (r: (typeof rows)[number]) => (sort.by === 'name' ? 0 : r.t ? (r.t[sort.by] ?? -1) : -2);
    // Until a column is clicked: busiest first (as the totals arrive), listings without figures last, by name.
    return list.sort((a, b) => (sort.by === 'name' ? a.name.localeCompare(b.name) * (sort.down ? -1 : 1) : (touched ? (val(b) - val(a)) * (sort.down ? 1 : -1) : (b.t?.actions ?? -1) - (a.t?.actions ?? -1) || (b.t?.views ?? -1) - (a.t?.views ?? -1)) || a.name.localeCompare(b.name)));
  }, [rows, find, sort, touched]);
  const visible = all || find.trim() ? shown : shown.slice(0, SHOW);
  const flagged = rows.filter(quiet).length;
  const head = (c: Col, text: string, hint: string, right = true) => (
    <th key={c} className={'whitespace-nowrap px-3 py-2 font-medium ' + (right ? 'text-right' : '')} aria-sort={touched && sort.by === c ? (sort.down ? 'descending' : 'ascending') : undefined}>
      <button type="button" title={hint || undefined} onClick={() => { setTouched(true); setSort((s) => ({ by: c, down: s.by === c && touched ? !s.down : c !== 'name' })); }} className={'hover:text-slate-200 ' + (touched && sort.by === c ? 'text-emerald-300' : '')}>{text}{touched && sort.by === c ? (sort.down ? ' ↓' : ' ↑') : ''}</button>
    </th>
  );

  return (
    <div className="mt-3 space-y-3">
      {has.length > 1 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([['Listings', rows.length, ''], ['Views', total('views'), ''], ['Calls', total('calls'), ''], ['Website clicks', total('websiteClicks'), ''], ['Directions', total('directions'), '']] as const).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-800 bg-slate-950 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-100">{fmt(value)}</p></div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500" placeholder={'Search ' + rows.length + ' listings by name'} value={find} onChange={(e) => setFind(e.target.value)} />
        {flagged > 0 && <span className="text-xs text-amber-300">{flagged} listing{flagged === 1 ? ' is' : 's are'} being seen but not acted on</span>}
        {stats === null && <span className="text-xs text-slate-500">Reading Google’s totals…</span>}
        {problem && <span className="text-xs text-amber-300">{problem}</span>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-xs text-slate-400">
            <tr>{head('name', 'Listing', '', false)}{COLS.map(([c, text, hint]) => head(c, text, hint))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {visible.map((r) => {
              const on = picked?.profile === r.profile && picked.location === r.id;
              const open = () => onOpen({ profile: r.profile, location: r.id });
              return (
                <tr key={r.profile + r.id} onClick={open} className={'cursor-pointer hover:bg-slate-800/50 ' + (on ? 'bg-emerald-500/10' : '')}>
                  <td className="max-w-[22rem] px-3 py-2">
                    <button type="button" onClick={(e) => { e.stopPropagation(); open(); }} className={'block max-w-full truncate text-left font-medium hover:underline ' + (on ? 'text-emerald-300' : 'text-slate-100')} title={r.name}>{r.name}</button>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      {/* Several listings share a name: the last digits of the id tell them apart. */}
                      <span className="font-mono">…{r.id.split('/')[3]?.slice(-5)}</span>
                      {!admin && <span className={'rounded-full border px-1.5 py-px ' + (r.plan ? 'border-emerald-500/40 text-emerald-300' : 'border-slate-700 text-slate-500')}>{r.plan === 'DOMINATOR' ? 'Dominator' : r.plan === 'COMMAND' ? 'Command' : r.plan === 'AGENT' ? 'Agent' : r.plan ? 'Manage' : 'Free'}</span>}
                      {admin && r.customer && <span className="rounded-full border border-sky-500/40 px-1.5 py-px text-sky-300">customer</span>}
                      {quiet(r) && <span className="rounded-full border border-amber-500/40 px-1.5 py-px text-amber-300" title="Its actions per 100 views are under half the rate across all listings">seen, not acted on</span>}
                    </span>
                  </td>
                  {r.t ? (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-200">{fmt(r.t.views)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-200">{fmt(r.t.calls)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-200">{fmt(r.t.websiteClicks)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-200">{fmt(r.t.directions)}</td>
                      <td className={'px-3 py-2 text-right tabular-nums ' + (quiet(r) ? 'text-amber-300' : 'text-slate-300')}>{r.t.rate === null ? '–' : r.t.rate.toFixed(1)}</td>
                    </>
                  ) : (
                    <td colSpan={5} className="px-3 py-2 text-right text-xs text-slate-600">{stats === null ? '' : 'no totals from Google yet'}</td>
                  )}
                </tr>
              );
            })}
            {!visible.length && <tr><td colSpan={6} className="px-3 py-3 text-sm text-slate-400">No listing matches that.</td></tr>}
          </tbody>
        </table>
      </div>
      {shown.length > SHOW && !find.trim() && <button type="button" onClick={() => setAll((v) => !v)} className="text-sm text-slate-400 hover:text-slate-200">{all ? 'Show fewer' : `Show all ${shown.length}`}</button>}
    </div>
  );
}
