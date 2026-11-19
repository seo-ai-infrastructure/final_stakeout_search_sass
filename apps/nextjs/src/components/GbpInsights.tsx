'use client';
import { useEffect, useMemo, useState } from 'react';
import { DAILY, SURFACES, brandWord, byWeek, risingKeywords, scannable, type DailyKey, type Day, type KeywordTrend } from '@stakeout/core/gbpInsights';
import { BarCell, Change, MiniChart, SectionHead, Segmented, Skeleton, Spark, SplitBar, Tile, card, fmt, shortDate } from '@/components/InsightBits';

type Totals = Record<DailyKey, number>;
type Range = { recent: { from: string; to: string }; before: { from: string; to: string }; days: number };
type Performance =
  | { kind: 'daily'; days: Day[]; previous?: Day[]; totals: Totals; before: Totals; known: DailyKey[]; daysWithData: number; daysBefore: number; length: number }
  | { kind: 'snapshot'; totals: Partial<Totals>; known: string[]; recordedAt: string }
  | { kind: 'none' }
  | { kind: 'problem'; problem: string };
type Insights = { range: Range; performance: Performance; keywords: { rows: KeywordTrend[]; months: string[]; problem: string | null } };

const label = (k: DailyKey) => DAILY.find((m) => m.key === k)!.label;
const monthName = (m: string) => new Date(m + '-15T00:00:00Z').toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const CHART: DailyKey[] = ['calls', 'websiteClicks', 'directions', 'views'];
const MAX_PICK = 10;

/**
 * Google's own numbers for the listing: calls, website clicks and direction requests first, then
 * where it was seen and the searches that showed it. `range` is the tab's date choice, as a query string.
 */
export default function GbpInsights({ profile, location, businessName, place, range }: { profile: string; location: string; businessName: string; place: string; range: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [metric, setMetric] = useState<DailyKey>('calls');
  const [view, setView] = useState<'top' | 'rising'>('top');
  const [find, setFind] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [all, setAll] = useState(false);

  useEffect(() => { setData(null); setPicked([]); setAll(false); setFind(''); }, [profile, location]);
  useEffect(() => {
    let live = true;
    setBusy(true); setError('');
    fetch(`/api/admin/gbp/insights?profile=${encodeURIComponent(profile)}&location=${encodeURIComponent(location)}&${range}`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not read the numbers.'); return j as Insights; })
      .then((j) => { if (live) setData(j); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [profile, location, range]);

  const p = data?.performance;
  const daily = p?.kind === 'daily' ? p : null;
  // A change is only shown when both periods are close to complete: a range Google has half of is not a drop.
  const compare = Boolean(daily && daily.daysWithData >= daily.length - 3 && daily.daysBefore >= daily.length - 3);
  const chartKeys = CHART.filter((k) => daily?.known.includes(k));
  const shownMetric = chartKeys.includes(metric) ? metric : chartKeys[0];
  const points = useMemo(() => {
    if (!daily || !shownMetric) return [];
    const weekly = daily.length > 92;
    const keys = DAILY.map((m) => m.key);
    const rows = weekly ? byWeek(daily.days, keys) : daily.days;
    // The period before, point for point, when Google has all of it.
    const prior = compare && daily.previous?.length === daily.days.length ? (weekly ? byWeek(daily.previous, keys) : daily.previous) : [];
    return rows.map((d, i) => ({ label: (weekly ? 'Week of ' : '') + shortDate(d.date), value: d[shownMetric], before: prior.length === rows.length ? prior[i][shownMetric] : null }));
  }, [daily, shownMetric, compare]);
  // Each headline number's shape over the period, for the line along its tile (by week once there are many days).
  const sparkOf = (k: DailyKey) => (daily ? (daily.length > 92 ? byWeek(daily.days, DAILY.map((m) => m.key)) : daily.days).map((d) => d[k]) : []);
  const actions = daily ? (['calls', 'websiteClicks', 'directions', 'conversations', 'bookings', 'foodOrders'] as DailyKey[]).filter((k) => daily.known.includes(k)).reduce((n, k) => n + daily.totals[k], 0) : 0;
  const actionsBefore = daily ? (['calls', 'websiteClicks', 'directions', 'conversations', 'bookings', 'foodOrders'] as DailyKey[]).filter((k) => daily.known.includes(k)).reduce((n, k) => n + daily.before[k], 0) : 0;

  const rows = data?.keywords.rows ?? [];
  const months = data?.keywords.months ?? [];
  const brand = useMemo(() => brandWord(businessName, rows.map((r) => r.keyword), place), [rows, businessName, place]);
  const good = useMemo(() => rows.filter((r) => scannable(r.keyword, brand)), [rows, brand]);
  const rising = useMemo(() => risingKeywords(rows), [rows]);
  const list = (view === 'rising' ? rising : rows).filter((r) => !find.trim() || r.keyword.includes(find.trim().toLowerCase()));
  const shown = all || find.trim() ? list : list.slice(0, 15);
  const top = Math.max(1, ...rows.map((r) => r.latest ?? 0));
  const toggle = (k: string) => setPicked((x) => (x.includes(k) ? x.filter((y) => y !== k) : x.length < MAX_PICK ? [...x, k] : x));
  const scanUrl = '/new-scan?' + new URLSearchParams([['name', businessName], ...picked.map((k) => ['kw', k] as [string, string])]).toString();

  return (
    <section className={card + ' space-y-5'}>
      <SectionHead title="Google Business Profile" sub={<>Google’s own numbers for this listing{data ? ` · ${shortDate(data.range.recent.from)} to ${shortDate(data.range.recent.to)}, against the ${data.range.days} days before` : ''}</>} />
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!data && !error && <Skeleton />}

      {daily && (
        <div className={'space-y-5 ' + (busy ? 'opacity-50' : '')}>
          {/* The headline numbers are also the switch for the chart under them. */}
          <div className={'grid grid-cols-2 gap-3 ' + (chartKeys.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4')}>
            {chartKeys.map((k) => <Tile key={k} big label={k === 'views' ? 'Views on Search and Maps' : label(k)} value={daily.totals[k]} was={daily.before[k]} compare={compare} spark={sparkOf(k)} active={shownMetric === k} onSelect={() => setMetric(k)} />)}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {daily.totals.views > 0 && <Tile label="Actions per 100 views" value={(actions / daily.totals.views) * 100} was={daily.before.views ? (actionsBefore / daily.before.views) * 100 : null} digits={1} compare={compare} note="calls, clicks, directions and more" />}
            {(['conversations', 'bookings', 'foodOrders', 'menuClicks'] as DailyKey[]).filter((k) => daily.known.includes(k) && (daily.totals[k] > 0 || daily.before[k] > 0)).map((k) => <Tile key={k} label={label(k)} value={daily.totals[k]} was={daily.before[k]} compare={compare} />)}
          </div>
          {!compare && <p className="text-xs text-slate-500">Google has {daily.daysWithData} of these {daily.length} days{daily.daysBefore < daily.length - 3 ? ` and ${daily.daysBefore} of the ${daily.length} before` : ''}, so no comparison is shown: a part-filled period is not a drop.</p>}

          {shownMetric && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">{label(shownMetric)} {daily.length > 92 ? 'by week' : 'by day'}</h4>
              <MiniChart points={points} name={label(shownMetric)} />
            </div>
          )}

          {SURFACES.some((k) => daily.totals[k] > 0) && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">Where the listing was seen</h4>
              <SplitBar parts={SURFACES.map((k) => ({ label: label(k), value: daily.totals[k] }))} />
            </div>
          )}
        </div>
      )}
      {p?.kind === 'snapshot' && (
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(['calls', 'websiteClicks', 'directions', 'views'] as DailyKey[]).filter((k) => p.known.includes(k)).map((k) => <Tile key={k} big={k !== 'views'} label={label(k)} value={p.totals[k] ?? 0} compare={false} />)}
          </div>
          <p className="mt-2 text-xs text-slate-500">Google’s totals for the 30 days up to {new Date(p.recordedAt).toLocaleDateString()}. Day-by-day figures (and other date ranges) appear about a day after a profile is connected.</p>
        </div>
      )}
      {p?.kind === 'none' && <p className="text-sm text-slate-400">No performance numbers yet. They are collected about once a day after a profile is connected, so check back tomorrow.</p>}
      {p?.kind === 'problem' && <p className="text-sm text-amber-300">Performance numbers are not available for this listing: {p.problem}</p>}

      {data && (
        <div className="border-t border-slate-800 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Searches that showed this listing {months.length > 0 && <span className="ml-1 font-normal text-slate-500">{monthName(months[0])}{months.length > 1 ? ' to ' + monthName(months[months.length - 1]) : ''}</span>}</h4>
            {rows.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Segmented label="Which searches" value={view} onChange={setView} options={[['top', 'Top'], ['rising', `Rising${rising.length ? ' · ' + rising.length : ''}`]] as const} />
                <input className="w-44 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-emerald-500" placeholder="Find a search" value={find} onChange={(e) => setFind(e.target.value)} />
              </div>
            )}
          </div>
          {data.keywords.problem ? (
            <p className="mt-2 text-sm text-amber-300">Google gives no search terms for this listing: {data.keywords.problem}</p>
          ) : rows.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">Google reported no searches for these months.</p>
          ) : (
            <>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-xs text-slate-400">
                    <tr>
                      <th className="w-8 px-3 py-2" />
                      <th className="px-3 py-2 font-medium">Search</th>
                      <th className="px-3 py-2 text-right font-medium">{months.length ? monthName(months[months.length - 1]) : 'Latest'}</th>
                      {months.length > 1 && <th className="px-3 py-2 text-right font-medium">{monthName(months[months.length - 2])}</th>}
                      {months.length > 1 && <th className="px-3 py-2 text-right font-medium">Change</th>}
                      {months.length > 2 && <th className="w-28 px-3 py-2 font-medium">Trend</th>}
                      {months.length > 2 && <th className="px-3 py-2 text-right font-medium">{months.length} months</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {shown.map((r) => {
                      const ok = scannable(r.keyword, brand), on = picked.includes(r.keyword);
                      return (
                        <tr key={r.keyword} className={'hover:bg-slate-800/40 ' + (on ? 'bg-emerald-500/5' : '')}>
                          <td className="px-3 py-1.5"><input type="checkbox" className="h-4 w-4 accent-emerald-500" aria-label={'Scan ' + r.keyword} checked={on} disabled={!on && picked.length >= MAX_PICK} onChange={() => toggle(r.keyword)} /></td>
                          <td className={'max-w-[20rem] truncate px-3 py-1.5 ' + (ok ? 'text-slate-200' : 'text-slate-500')} title={ok ? r.keyword : 'A search for the business by name, or a job search'}>{r.keyword}</td>
                          {r.latest !== null ? <BarCell value={r.latest} max={top} strong /> : <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.latestText || '–'}</td>}
                          {months.length > 1 && <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.previous === null ? r.previousText || '–' : fmt(r.previous)}</td>}
                          {months.length > 1 && <td className="px-3 py-1.5 text-right text-xs tabular-nums">{r.latest === null ? <span className="text-slate-600">–</span> : <Change now={r.latest} was={r.previous} />}</td>}
                          {months.length > 2 && <td className="px-3 py-1"><Spark values={r.byMonth.map((v) => v ?? 0)} tone={r.latest !== null && r.previous !== null && r.latest < r.previous ? '#fb7185' : '#34d399'} /></td>}
                          {months.length > 2 && <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.exact ? fmt(r.total) : '–'}</td>}
                        </tr>
                      );
                    })}
                    {!shown.length && <tr><td colSpan={7} className="px-3 py-3 text-sm text-slate-400">{view === 'rising' && !find.trim() ? 'No search grew by five or more in the latest month.' : 'No search matches that.'}</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a href={picked.length ? scanUrl : undefined} aria-disabled={!picked.length} className={'rounded-lg px-4 py-2 text-sm font-semibold ' + (picked.length ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'pointer-events-none bg-slate-800 text-slate-500')}>Scan {picked.length || ''} keyword{picked.length === 1 ? '' : 's'} →</a>
                <button type="button" onClick={() => setPicked(good.slice(0, 5).map((r) => r.keyword))} disabled={!good.length} className="text-sm text-sky-400 hover:underline disabled:opacity-40">Pick the top 5 customer searches</button>
                {list.length > 15 && !find.trim() && <button type="button" onClick={() => setAll((v) => !v)} className="text-sm text-slate-400 hover:text-slate-200">{all ? 'Show fewer' : `Show all ${list.length}`}</button>}
              </div>
              <p className="mt-2 text-xs text-slate-500">Times the listing was shown for each search, by calendar month (Google gives these by month, up to the latest 12). “&lt;15” means fewer than 15 that month. Google counts calls, clicks and directions for the listing as a whole, not per search: a scan shows where each search ranks.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
