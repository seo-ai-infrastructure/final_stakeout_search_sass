'use client';
import { useEffect, useMemo, useState } from 'react';
import { DAILY, brandSplit, brandWord, byWeek, byWeekday, intentOf, rateByWeek, risingKeywords, scannable, type DailyKey, type Day, type KeywordMove, type KeywordTrend } from '@stakeout/core/gbpInsights';
import { BarCell, MiniChart, SERIES, SectionHead, Segmented, Skeleton, Spark, SplitBar, StackChart, Tile, WeekdayBars, card, fmt, shortDate } from '@/components/InsightBits';

type Totals = Record<DailyKey, number>;
type Range = { recent: { from: string; to: string }; before: { from: string; to: string }; days: number; compare?: 'previous' | 'year' };
type Performance =
  | { kind: 'daily'; days: Day[]; previous?: Day[]; totals: Totals; before: Totals; known: DailyKey[]; daysWithData: number; daysBefore: number; length: number }
  | { kind: 'snapshot'; totals: Partial<Totals>; known: string[]; recordedAt: string }
  | { kind: 'none' }
  | { kind: 'problem'; problem: string };
type Insights = { range: Range; performance: Performance; keywords: { rows: KeywordTrend[]; months: string[]; problem: string | null } };
type Health = {
  reviews: { unreplied: number; read: number; total: number } | null;
  holiday: { name: string; date: string; days: number; set: boolean } | null;
  hoursKnown: boolean;
  attributes: { set: number; available: number } | null;
  services: number | null;
  photos: number | null;
  point: { lat: number; lng: number } | null;
};

const label = (k: DailyKey) => DAILY.find((m) => m.key === k)!.label;
const monthName = (m: string) => new Date(m + '-15T00:00:00Z').toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const MAX_PICK = 10;
/** What a customer does from a listing. The first three are the usual ones; the rest take a place among them when a listing has them. */
const OUTCOMES: DailyKey[] = ['calls', 'websiteClicks', 'directions'];
const MORE: DailyKey[] = ['bookings', 'conversations', 'foodOrders'];
const ACTS: DailyKey[] = [...OUTCOMES, ...MORE];
/** Where the listing was seen, phones first. */
const PLACES: [DailyKey, string][] = [['mobileMaps', 'Maps on a phone'], ['mobileSearch', 'Search on a phone'], ['desktopMaps', 'Maps on a computer'], ['desktopSearch', 'Search on a computer']];
const ALL = DAILY.map((m) => m.key);
type Chart = 'actions' | 'rate' | DailyKey;

/** How a search moved in the latest month, in a few characters. */
function Move({ move }: { move: KeywordMove }) {
  if (move.kind === 'change') return move.pct === null ? <span className="text-slate-600">–</span> : <span className={move.pct === 0 ? 'text-slate-500' : move.pct > 0 ? 'text-emerald-400' : 'text-rose-400'}>{move.pct > 0 ? '▲' : move.pct < 0 ? '▼' : ''} {Math.abs(move.pct)}%</span>;
  if (move.kind === 'atLeast') return <span className="text-emerald-400" title="Google only said “fewer than 15” for the month before, so it is up by at least this many.">▲ +{fmt(move.by)} or more</span>;
  if (move.kind === 'back') return <span className="text-emerald-400" title="Not shown the month before, but it was in earlier months.">▲ Back</span>;
  if (move.kind === 'new') return <span className="text-sky-400" title="Not seen in any earlier month Google gave.">New</span>;
  if (move.kind === 'below') return <span className="text-rose-400" title={`It had a real count the month before and has dropped under ${move.under}.`}>▼ under {move.under}</span>;
  return <span className="text-slate-600">–</span>;
}

/** One fact about how ready the listing is: a dot (green: fine, amber: to do, grey: nothing to say), and a way to it when there is one. */
function Ready({ tone, children, onClick, title }: { tone: 'good' | 'todo' | 'quiet'; children: React.ReactNode; onClick?: () => void; title?: string }) {
  const inner = <><span className={'h-2 w-2 shrink-0 rounded-full ' + (tone === 'good' ? 'bg-emerald-400' : tone === 'todo' ? 'bg-amber-400' : 'bg-slate-600')} aria-hidden /><span className="min-w-0">{children}</span></>;
  const box = 'flex min-w-0 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-left text-xs text-slate-300';
  return onClick ? <button type="button" title={title} onClick={onClick} className={box + ' hover:border-slate-600 hover:text-slate-100'}>{inner}<span className="ml-auto text-slate-500" aria-hidden>→</span></button> : <div title={title} className={box}>{inner}</div>;
}

/**
 * Google's own numbers for the listing: what customers did, where it was seen and the searches
 * that showed it. `range` is the tab's date choice, as a query string.
 */
export default function GbpInsights({ profile, location, businessName, place, range, onOpen }: { profile: string; location: string; businessName: string; place: string; range: string; onOpen?: (what: 'reviews' | 'edit') => void }) {
  const [data, setData] = useState<Insights | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [chart, setChart] = useState<Chart>('actions');
  const [view, setView] = useState<'top' | 'rising'>('top');
  const [intent, setIntent] = useState<'all' | 'money' | 'branded'>('all');
  const [noJobs, setNoJobs] = useState(false);
  const [find, setFind] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [all, setAll] = useState(false);

  useEffect(() => { setData(null); setPicked([]); setAll(false); setFind(''); setIntent('all'); }, [profile, location]);
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
  // How ready the listing is does not depend on the dates, and is read on its own so it never holds the numbers up.
  useEffect(() => {
    let live = true;
    setHealth(null);
    fetch(`/api/admin/gbp/health?profile=${encodeURIComponent(profile)}&location=${encodeURIComponent(location)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) setHealth(j); }).catch(() => {});
    return () => { live = false; };
  }, [profile, location]);

  const p = data?.performance;
  const daily = p?.kind === 'daily' ? p : null;
  const yearly = data?.range.compare === 'year';
  const beforeName = yearly ? 'a year earlier' : 'the period before';
  // A change is only shown when both periods are close to complete: a range Google has half of is not a drop.
  const compare = Boolean(daily && daily.daysWithData >= daily.length - 3 && daily.daysBefore >= daily.length - 3);
  const weekly = Boolean(daily && daily.length > 92);
  const sumOf = (t: Totals, keys: DailyKey[]) => keys.reduce((n, k) => n + (t[k] ?? 0), 0);
  const actions = daily ? sumOf(daily.totals, ACTS) : 0;
  const actionsBefore = daily ? sumOf(daily.before, ACTS) : 0;
  const liveKey = (k: DailyKey) => Boolean(daily && daily.known.includes(k) && (daily.totals[k] > 0 || daily.before[k] > 0));
  // The three outcome cards: calls, website clicks and directions, with bookings, messages or orders taking the place of one the listing does not have.
  const { slots, also } = useMemo(() => {
    const slots = [...OUTCOMES];
    const extra = MORE.filter(liveKey).sort((a, b) => (daily?.totals[b] ?? 0) - (daily?.totals[a] ?? 0));
    const also: DailyKey[] = [];
    for (const k of extra) {
      const i = slots.findIndex((x) => OUTCOMES.includes(x) && !liveKey(x));
      if (i >= 0) slots[i] = k; else also.push(k);
    }
    return { slots, also };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily]);
  const rows_ = useMemo(() => (daily ? (weekly ? byWeek(daily.days, ALL) : daily.days) : []), [daily, weekly]);
  const prior = useMemo(() => (daily && compare && daily.previous?.length === daily.days.length ? (weekly ? byWeek(daily.previous, ALL) : daily.previous) : []), [daily, compare, weekly]);
  const when = (d: Day) => (weekly ? 'Week of ' : '') + shortDate(d.date);
  const single: DailyKey | null = chart !== 'actions' && chart !== 'rate' && daily?.known.includes(chart) ? chart : null;
  const points = useMemo(() => (single ? rows_.map((d, i) => ({ label: when(d), value: d[single], before: prior.length === rows_.length ? prior[i][single] : null })) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows_, prior, single]);
  // Actions per 100 views by week, for this period and the one it is held against, once there are two weeks to draw.
  const ratePoints = useMemo(() => {
    if (!daily || daily.length < 14 || !daily.known.includes('views')) return [];
    const now = rateByWeek(daily.days);
    const was = compare && daily.previous?.length === daily.days.length ? rateByWeek(daily.previous) : [];
    return now.filter((w) => w.value !== null).length < 2 ? [] : now.map((w, i) => ({ label: 'Week of ' + shortDate(w.date), value: w.value ?? 0, before: was.length === now.length ? was[i].value : null }));
  }, [daily, compare]);
  const mode: Chart = single ?? (chart === 'rate' && ratePoints.length ? 'rate' : 'actions');
  // What customers did, one band each: the three usual ones, and everything else together.
  const bands = useMemo(() => {
    if (!daily) return [];
    const rest = MORE.filter(liveKey);
    const parts: { name: string; keys: DailyKey[] }[] = [...OUTCOMES.map((k) => ({ name: label(k), keys: [k] })), { name: rest.length === 1 ? label(rest[0]) : 'Bookings, messages and orders', keys: rest }];
    // Each keeps its colour whether or not the others are there.
    return parts.map((x, i) => ({ name: x.name, tone: SERIES[i], values: rows_.map((d) => x.keys.reduce((n, k) => n + d[k], 0)) })).filter((b) => b.values.some((v) => v > 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, rows_]);
  const actsOf = (d: Day) => ACTS.reduce((n, k) => n + d[k], 0);
  const weekdays = useMemo(() => (daily && daily.length >= 28 ? byWeekday(single ? daily.days : daily.days.map((d) => ({ ...d, calls: actsOf(d) })), single ?? 'calls') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daily, single]);
  const chartName = single ? (single === 'views' ? 'Views' : label(single)) : 'Customer actions';
  const seen = daily ? PLACES.map(([k, text]) => ({ label: text, value: daily.totals[k] })) : [];
  const seenTotal = seen.reduce((n, x) => n + x.value, 0);
  const phoneShare = daily && seenTotal ? Math.round(((daily.totals.mobileMaps + daily.totals.mobileSearch) / seenTotal) * 100) : null;
  const seenBefore = daily ? PLACES.reduce((n, [k]) => n + daily.before[k], 0) : 0;
  const phoneShareBefore = daily && compare && seenBefore ? Math.round(((daily.before.mobileMaps + daily.before.mobileSearch) / seenBefore) * 100) : null;
  const mapsShare = daily && seenTotal ? Math.round(((daily.totals.mobileMaps + daily.totals.desktopMaps) / seenTotal) * 100) : null;
  const rate = daily && daily.totals.views > 0 ? (actions / daily.totals.views) * 100 : null;
  const rateBefore = daily && compare && daily.before.views > 0 ? (actionsBefore / daily.before.views) * 100 : null;

  const rows = data?.keywords.rows ?? [];
  const months = data?.keywords.months ?? [];
  const brand = useMemo(() => brandWord(businessName, rows.map((r) => r.keyword), place), [rows, businessName, place]);
  const split = useMemo(() => brandSplit(rows, brand), [rows, brand]);
  const kinds = useMemo(() => new Map(rows.map((r) => [r.keyword, intentOf(r.keyword, brand)])), [rows, brand]);
  const count = (k: 'money' | 'branded' | 'noise') => rows.filter((r) => kinds.get(r.keyword) === k).length;
  const good = useMemo(() => rows.filter((r) => scannable(r.keyword, brand)), [rows, brand]);
  const rising = useMemo(() => risingKeywords(rows), [rows]);
  const list = (view === 'rising' ? rising : rows)
    .filter((r) => intent === 'all' || kinds.get(r.keyword) === intent)
    .filter((r) => !noJobs || kinds.get(r.keyword) !== 'noise')
    .filter((r) => !find.trim() || r.keyword.includes(find.trim().toLowerCase()));
  const shown = all || find.trim() ? list : list.slice(0, 15);
  const top = Math.max(1, ...rows.map((r) => r.latest ?? 0));
  const toggle = (k: string) => setPicked((x) => (x.includes(k) ? x.filter((y) => y !== k) : x.length < MAX_PICK ? [...x, k] : x));
  // A scan of these searches for this listing, starting from where it is on the map when Google says where that is.
  const scanLink = (kws: string[], grid?: number) => '/new-scan?' + new URLSearchParams([['name', businessName], ...kws.map((k) => ['kw', k] as [string, string]), ...(health?.point ? [['lat', String(health.point.lat)], ['lng', String(health.point.lng)]] : []), ...(grid ? [['grid', String(grid)]] : [])]).toString();
  const cols = 4 + (months.length > 1 ? 2 : 0) + (months.length > 2 ? 2 : 0);

  return (
    <section className={card + ' space-y-5'}>
      <SectionHead title="Google Business Profile" sub={<>Google’s own numbers for this listing{data ? ` · ${shortDate(data.range.recent.from)} to ${shortDate(data.range.recent.to)}, against ${yearly ? 'the same days a year earlier' : `the ${data.range.days} days before`}` : ''}</>} />

      {/* How ready the listing is: the things that most often cost it calls. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="How ready the listing is">
        {!health ? Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[34px] animate-pulse rounded-lg bg-slate-800/50" />) : (
          <>
            {health.reviews === null ? <Ready tone="quiet">Reviews could not be read</Ready>
              : health.reviews.unreplied > 0 ? <Ready tone="todo" onClick={onOpen && (() => onOpen('reviews'))} title={health.reviews.total > health.reviews.read ? `Among the newest ${health.reviews.read} reviews` : undefined}>{fmt(health.reviews.unreplied)} review{health.reviews.unreplied === 1 ? '' : 's'} not answered</Ready>
              : <Ready tone={health.reviews.read ? 'good' : 'quiet'} onClick={onOpen && (() => onOpen('reviews'))}>{health.reviews.read ? 'Every review answered' : 'No reviews yet'}</Ready>}
            {!health.hoursKnown ? <Ready tone="quiet">Holiday hours could not be read</Ready>
              : !health.holiday ? <Ready tone="quiet">No holiday in the next 45 days</Ready>
              : <Ready tone={health.holiday.set ? 'good' : 'todo'} onClick={onOpen && (() => onOpen('edit'))} title={shortDate(health.holiday.date)}>{health.holiday.name} {health.holiday.days === 0 ? 'is today' : health.holiday.days === 1 ? 'is tomorrow' : `in ${health.holiday.days} days`}: hours {health.holiday.set ? 'set' : 'not set'}</Ready>}
            <Ready tone={health.attributes === null && health.services === null ? 'quiet' : (health.attributes?.set ?? 1) > 0 && (health.services ?? 1) > 0 ? 'good' : 'todo'} onClick={onOpen && (() => onOpen('edit'))} title={health.attributes ? `${health.attributes.set} of the ${health.attributes.available} attributes Google offers this listing` : undefined}>
              {health.attributes ? `${fmt(health.attributes.set)} of ${fmt(health.attributes.available)} attributes` : 'Attributes not read'} · {health.services === null ? 'no service list' : `${fmt(health.services)} service${health.services === 1 ? '' : 's'}`}
            </Ready>
            {health.photos === null ? <Ready tone="quiet">Photos could not be read</Ready> : <Ready tone={health.photos >= 10 ? 'good' : 'todo'} title={health.photos < 10 ? 'Listings with at least ten photos tend to get more calls and direction requests.' : undefined}>{fmt(health.photos)} photo{health.photos === 1 ? '' : 's'}{health.photos < 10 ? ': add more' : ''}</Ready>}
          </>
        )}
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!data && !error && <Skeleton />}

      {daily && (
        <div className={'space-y-5 ' + (busy ? 'opacity-50' : '')}>
          {/* Five numbers, each also the switch for the chart under them. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="col-span-2 lg:col-span-1"><Tile big label="Views on Search and Maps" value={daily.totals.views} was={daily.before.views} compare={compare} spark={rows_.map((d) => d.views)} active={mode === 'views'} onSelect={() => setChart('views')} /></div>
            <Tile big label="Customer actions" value={actions} was={actionsBefore} compare={compare} spark={rows_.map(actsOf)} active={mode === 'actions' || mode === 'rate'} onSelect={() => setChart('actions')}
              extra={rate !== null ? <><span className="font-semibold tabular-nums text-slate-200">{fmt(rate, 1)}</span> per 100 views{rateBefore !== null && <span className="text-slate-500"> · was {fmt(rateBefore, 1)}</span>}</> : undefined} />
            {slots.map((k) => <Tile key={k} big label={label(k)} value={daily.known.includes(k) ? daily.totals[k] : null} was={daily.before[k]} compare={compare && daily.known.includes(k)} note={daily.known.includes(k) ? undefined : 'Google reports none for this listing'} spark={rows_.map((d) => d[k])} active={mode === k} onSelect={() => setChart(k)} />)}
          </div>
          {also.length > 0 && <p className="text-xs text-slate-400">Also: {also.map((k) => `${fmt(daily.totals[k])} ${label(k).toLowerCase()}`).join(' · ')}</p>}
          {!compare && <p className="text-xs text-slate-500">Google has {daily.daysWithData} of these {daily.length} days{daily.daysBefore < daily.length - 3 ? ` and ${daily.daysBefore} of the ${daily.length} ${yearly ? 'a year earlier (it keeps 18 months)' : 'before'}` : ''}, so no comparison is shown: a part-filled period is not a drop.</p>}

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">{mode === 'rate' ? 'Actions per 100 views, by week' : `${chartName} ${weekly ? 'by week' : 'by day'}`}</h4>
                <Segmented label="What to chart" value={mode as string} onChange={(v) => setChart(v as Chart)} options={[['actions', 'Customer actions'], ['views', 'Views'], ...(ratePoints.length ? [['rate', 'Per 100 views'] as const] : [])]} />
              </div>
              {mode === 'rate' ? <MiniChart points={ratePoints} name="Actions per 100 views" digits={1} beforeName={beforeName} />
                : mode === 'actions' ? (bands.length ? <StackChart labels={rows_.map(when)} series={bands} /> : <p className="text-sm text-slate-400">No calls, website clicks or direction requests for these dates.</p>)
                : <MiniChart points={points} name={chartName} beforeName={beforeName} />}
              {mode === 'rate' && <p className="mt-1 text-xs text-slate-500">Of every 100 times the listing was seen, how many led to a call, a website click, a direction request, a message or a booking. This is the number that listing edits, photos and reviews move.</p>}
            </div>
            <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950 p-3">
              <h4 className="text-sm font-semibold">Where customers found you</h4>
              {phoneShare === null ? <p className="mt-2 text-sm text-slate-400">Google gave no breakdown for these dates.</p> : (
                <>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-slate-100">{phoneShare}%<span className="ml-2 text-sm font-normal text-slate-400">on a phone</span></p>
                  <p className="mb-3 mt-0.5 text-xs text-slate-500">{phoneShareBefore !== null ? `was ${phoneShareBefore}% ${beforeName} · ` : ''}{mapsShare}% in Maps, {100 - (mapsShare ?? 0)}% in Search</p>
                  <SplitBar stack parts={seen} />
                </>
              )}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {weekdays.some((v) => v > 0) && (
              <div className="min-w-0">
                <h4 className="mb-2 text-sm font-semibold">{chartName} on a typical day of the week</h4>
                <WeekdayBars values={weekdays} name={chartName} />
              </div>
            )}
            {data && !data.keywords.problem && split.known && split.discovery.terms + split.branded.terms > 0 && (
              <div className="min-w-0">
                <h4 className="mb-2 text-sm font-semibold">How people searched{split.by === 'terms' ? <span className="ml-1 font-normal text-slate-500">counted by search</span> : null}</h4>
                <SplitBar parts={[{ label: 'For what you do', value: split.discovery[split.by] }, { label: 'For you by name', value: split.branded[split.by] }]} />
                {split.by === 'terms' && <p className="mt-2 text-xs text-slate-500">Google gives few exact numbers for this listing, so the searches themselves are counted.</p>}
              </div>
            )}
          </div>
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
                <Segmented label="What kind of search" value={intent} onChange={(v) => { setIntent(v); setAll(false); }} options={[['all', `All · ${rows.length}`], ['money', `Not by name · ${count('money')}`], ['branded', `By name · ${count('branded')}`]] as const} />
                {count('noise') > 0 && <button type="button" aria-pressed={noJobs} onClick={() => setNoJobs((v) => !v)} title="Job hunting, salaries, classes and phone-number lookups" className={'rounded-lg border px-2.5 py-1.5 text-xs ' + (noJobs ? 'border-emerald-500/60 bg-emerald-500/10 font-semibold text-emerald-300' : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200')}>Hide job searches · {count('noise')}</button>}
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
                      <th className="px-3 py-2" aria-label="Scan" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {shown.map((r) => {
                      const ok = scannable(r.keyword, brand), on = picked.includes(r.keyword);
                      return (
                        <tr key={r.keyword} className={'group hover:bg-slate-800/40 ' + (on ? 'bg-emerald-500/5' : '')}>
                          <td className="px-3 py-1.5"><input type="checkbox" className="h-4 w-4 accent-emerald-500" aria-label={'Scan ' + r.keyword} checked={on} disabled={!on && picked.length >= MAX_PICK} onChange={() => toggle(r.keyword)} /></td>
                          <td className={'max-w-[20rem] truncate px-3 py-1.5 ' + (ok ? 'text-slate-200' : 'text-slate-500')} title={ok ? r.keyword : kinds.get(r.keyword) === 'branded' ? 'A search for the business by name' : 'Job hunting or the like, not a customer'}>{r.keyword}{kinds.get(r.keyword) === 'branded' && <span className="ml-2 rounded border border-slate-700 px-1 text-[10px] uppercase tracking-wide text-slate-500">name</span>}{kinds.get(r.keyword) === 'noise' && <span className="ml-2 rounded border border-slate-700 px-1 text-[10px] uppercase tracking-wide text-slate-500">jobs</span>}</td>
                          {r.latest !== null ? <BarCell value={r.latest} max={top} strong /> : <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.latestText || '–'}</td>}
                          {months.length > 1 && <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.previous === null ? r.previousText || '–' : fmt(r.previous)}</td>}
                          {months.length > 1 && <td className="px-3 py-1.5 text-right text-xs tabular-nums"><Move move={r.move} /></td>}
                          {months.length > 2 && <td className="px-3 py-1"><Spark values={r.byMonth.map((v) => v ?? 0)} tone={r.latest !== null && r.previous !== null && r.latest < r.previous ? '#fb7185' : '#34d399'} /></td>}
                          {months.length > 2 && <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.exact ? fmt(r.total) : '–'}</td>}
                          <td className="whitespace-nowrap px-3 py-1.5 text-right"><a href={scanLink([r.keyword], 5)} className="rounded-md border border-emerald-500/50 px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100" title={`Scan “${r.keyword}” on a 5×5 grid around this listing: 25 points, 25 credits`}>Scan 5×5 · 25 cr</a></td>
                        </tr>
                      );
                    })}
                    {!shown.length && <tr><td colSpan={cols} className="px-3 py-3 text-sm text-slate-400">{view === 'rising' && !find.trim() && intent === 'all' ? 'No search grew by five or more in the latest month.' : 'No search matches that.'}</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a href={picked.length ? scanLink(picked) : undefined} aria-disabled={!picked.length} className={'rounded-lg px-4 py-2 text-sm font-semibold ' + (picked.length ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'pointer-events-none bg-slate-800 text-slate-500')}>Scan {picked.length || ''} keyword{picked.length === 1 ? '' : 's'} →</a>
                <button type="button" onClick={() => setPicked(good.slice(0, 5).map((r) => r.keyword))} disabled={!good.length} className="text-sm text-sky-400 hover:underline disabled:opacity-40">Pick the top 5 customer searches</button>
                {list.length > 15 && !find.trim() && <button type="button" onClick={() => setAll((v) => !v)} className="text-sm text-slate-400 hover:text-slate-200">{all ? 'Show fewer' : `Show all ${list.length}`}</button>}
              </div>
              <p className="mt-2 text-xs text-slate-500">Times the listing was shown for each search, by calendar month (Google gives these by month, up to the latest 12). “&lt;15” means fewer than 15 that month, so a search that was under 15 and now has a count is shown as up by at least the gap, not as new. Google counts calls, clicks and directions for the listing as a whole, not per search: a scan shows where each search ranks.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
