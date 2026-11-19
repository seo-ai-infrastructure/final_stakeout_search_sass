'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GA_SOURCES, risingSearches, samePage, topSearches, type Competing, type EventRow, type ExploreRow, type GaSource, type Inspection } from '@stakeout/core/googleExplore';
import { brandWord } from '@stakeout/core/gbpInsights';
import { brandedQuery } from '@stakeout/core/upgradeTriggers';
import GoogleExplorer from '@/components/GoogleExplorer';
import ScanOffer from '@/components/ScanOffer';
import { BarCell, Change, MiniChart, SectionHead, Segmented, Skeleton, Tile, alongside, card, fmt, shortDate } from '@/components/InsightBits';

export type Dates = ({ days: number } | { from: string; to: string }) & { /** Hold the range against the same days a year earlier instead of the days right before it. */ compare?: 'year' };
type Status = { configured: boolean; connected: boolean; email: string | null; searchConsole: boolean; analytics: boolean };
type Range = { recent: { from: string; to: string }; before: { from: string; to: string }; days: number; compare?: 'previous' | 'year' };
const back = (r: Range) => (r.compare === 'year' ? 364 : r.days);
const beforeName = (r: Range) => (r.compare === 'year' ? 'a year earlier' : 'the period before');
type GscTotals = { clicks: number; impressions: number; ctr: number | null; position: number | null };
type Gsc =
  | { property: null; properties: number }
  | { property: string; page: string; scope: 'page' | 'site'; range: Range; recent: GscTotals; before: GscTotals; days: { date: string; clicks: number; impressions: number }[]; daysBefore?: { date: string; clicks: number; impressions: number }[]; queries: ExploreRow[]; pages: ExploreRow[] };
type Property = { id: string; name: string; account: string };
type GaTotals = { a: number; b: number; c: number };
type Phones = { rows: { query: string; clicks: number; impressions: number; position: number | null; ctr: number }[]; fallback: boolean; device: { mobileShare: number; gap: number | null; why: 'share' | 'position' } | null; offer: boolean; balance?: number; packCents?: number | null };
type GaDay = { date: string; visits: number; keyEvents: number; leads: number };
type GaRowL = ExploreRow & { leads: number };
type Ga = {
  range: Range; recent: GaTotals; before: GaTotals; days: GaDay[]; daysBefore?: GaDay[]; sources: GaRowL[]; channels: GaRowL[];
  events: { rows: EventRow[]; calls: number; callsBefore: number; leads: number; leadsBefore: number; audit: { noisy: string[]; callsNotKey: string[] } };
  cities: { city: string; region: string; visits: number; calls: number; leads: number }[];
  ai: { visits: number; visitsBefore: number; leads: number; calls: number; pages: { page: string; visits: number }[] };
  listingTags: string[];
};

const field = 'rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-500';
const MAX_PICK = 10;
const DEVICE = [['', 'All devices'], ['MOBILE', 'Phones'], ['DESKTOP', 'Computers']] as const;

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j as T;
}
async function post<T>(body: unknown): Promise<T> {
  const r = await fetch('/api/admin/google/overview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j as T;
}
const span = (r: Range) => `${shortDate(r.recent.from)} to ${shortDate(r.recent.to)}, against the ${r.days} days before`;

/** Search Console for the page the listing links to (or the whole site): totals, a day-by-day line, top and rising searches. */
function SearchConsole({ website, host, businessName, dates, wholeSite }: { website: string; host: string; businessName: string; dates: Dates; wholeSite?: boolean }) {
  const [scope, setScope] = useState<'page' | 'site'>(wholeSite ? 'site' : 'page');
  const [device, setDevice] = useState<(typeof DEVICE)[number][0]>('');
  const [d, setD] = useState<Gsc | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Which of the two is charted: the one chosen, or, until one is, clicks unless there are none.
  const [chosen, setChosen] = useState<'clicks' | 'impressions' | null>(null);
  const [view, setView] = useState<'top' | 'rising'>('top');
  const [chip, setChip] = useState<'all' | 'zero' | 'strike' | 'open'>('all');
  const [find, setFind] = useState('');
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const key = JSON.stringify(dates);

  useEffect(() => { setD(null); setPicked([]); setScope(wholeSite ? 'site' : 'page'); setDevice(''); setFind(''); setAll(false); setChip('all'); }, [website, wholeSite]);
  useEffect(() => { setChosen(null); }, [website, scope, device]);
  useEffect(() => {
    let live = true;
    setBusy(true); setError('');
    post<Gsc>({ source: 'gsc', website, scope, device, ...dates }).then((j) => { if (live) setD(j); }).catch((e) => { if (live) setError(e.message); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [website, scope, device, key]);
  // What phones saw over the last 28 days: the searches a scan would explain. Read on its own, and only shown to customers.
  const [phones, setPhones] = useState<Phones | null>(null);
  const [offer, setOffer] = useState<{ query: string; why: string } | null>(null);
  useEffect(() => {
    let live = true;
    setPhones(null);
    post<Phones>({ source: 'gsc-mobile', website, scope }).then((j) => { if (live) setPhones(j); }).catch(() => {});
    return () => { live = false; };
  }, [website, scope]);
  const flags = useMemo(() => new Map((phones?.offer ? phones.rows : []).map((r) => [r.query, r])), [phones]);
  const price = phones ? ((phones.balance ?? 0) >= 25 ? '25 credits' : phones.packCents ? '$' + phones.packCents / 100 : '') : '';
  const whyOf = (r: Phones['rows'][number]) => (phones?.fallback
    ? `On phones over the last 28 days your page was shown ${fmt(r.impressions)} times for this search${r.position !== null ? `, around position ${r.position}` : ''}.`
    : `On phones over the last 28 days your page was shown ${fmt(r.impressions)} times for this search, around position ${r.position}, and clicked ${r.ctr}% of the time. A page that high usually gets more: something above it is taking the clicks.`);

  // What Google's inspection says about the listing's page (kept a day), and which other pages compete with it.
  const [inspect, setInspect] = useState<{ inspection: Inspection | null; checkedAt?: string } | null>(null);
  useEffect(() => {
    let live = true;
    setInspect(null);
    post<{ inspection: Inspection | null; checkedAt?: string }>({ source: 'inspect', website }).then((j) => { if (live) setInspect(j); }).catch(() => {});
    return () => { live = false; };
  }, [website]);
  const [competing, setCompeting] = useState<Record<string, Competing>>({});
  useEffect(() => {
    let live = true;
    setCompeting({});
    if (scope === 'page') post<{ competing: Record<string, Competing> }>({ source: 'gsc-compete', website, device, ...dates }).then((j) => { if (live) setCompeting(j.competing ?? {}); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [website, scope, device, key]);

  const metric: 'clicks' | 'impressions' = chosen ?? (d && d.property && d.recent.clicks === 0 && d.recent.impressions > 0 ? 'impressions' : 'clicks');
  const setMetric = setChosen;
  const queries = useMemo(() => topSearches(d && d.property ? d.queries : []), [d]);
  const up = useMemo(() => risingSearches(queries), [queries]);
  const rising = up.rows;
  const brand = useMemo(() => brandWord(businessName, queries.map((r) => r.key), ''), [businessName, queries]);
  const CHIPS = {
    all: () => true,
    zero: (r: ExploreRow) => r.a === 0 && r.c !== null && r.c <= 10,
    strike: (r: ExploreRow) => r.c !== null && r.c >= 4 && r.c <= 20,
    open: (r: ExploreRow) => !brandedQuery(r.key, host, brand),
  };
  const count = (k: keyof typeof CHIPS) => queries.filter(CHIPS[k]).length;
  const list = (view === 'rising' ? rising : queries).filter(CHIPS[chip]).filter((r) => !find.trim() || r.key.includes(find.trim().toLowerCase()));
  const shown = all || find.trim() ? list : list.slice(0, 15);
  const toggle = (k: string) => setPicked((x) => (x.includes(k) ? x.filter((y) => y !== k) : x.length < MAX_PICK ? [...x, k] : x));
  const scanUrl = '/new-scan?' + new URLSearchParams([['name', businessName], ...picked.map((k) => ['kw', k] as [string, string])]).toString();
  const topClicks = Math.max(1, ...queries.map((r) => r.a));

  return (
    <section id="insights-search" className={card + ' scroll-mt-16 space-y-5'}>
      <SectionHead title="Google Search Console" sub={d && d.property ? <>{d.scope === 'page' ? <>Searches that led to <span className="text-slate-300">{d.page.replace(/^https?:\/\//, '')}</span>{wholeSite ? '' : ', the page the listing links to'}</> : <>Every page of {host}</>} · {span(d.range)}</> : 'Google searches that led to the website'}>
        <Segmented label="Which pages" value={scope} onChange={setScope} options={[['page', wholeSite ? 'Home page only' : 'The listing’s page'], ['site', 'Whole website']] as const} />
        <Segmented label="Device" value={device} onChange={setDevice} options={DEVICE} />
      </SectionHead>
      {inspect?.inspection && (() => {
        const i = inspect.inspection;
        const dot = (ok: boolean | null) => <span className={'mr-1.5 inline-block h-2 w-2 rounded-full ' + (ok === null ? 'bg-slate-600' : ok ? 'bg-emerald-400' : 'bg-amber-400')} aria-hidden />;
        return (
          <p className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300" title={inspect.checkedAt ? 'Google’s URL inspection of the listing’s page, read ' + new Date(inspect.checkedAt).toLocaleString() + ' (refreshed once a day)' : undefined}>
            <span>{dot(i.indexed)}{i.indexed ? 'Indexed' : 'Not indexed'}<span className="text-slate-500"> · {i.state}</span></span>
            <span>{dot(i.canonical === 'unknown' ? null : i.canonical === 'match')}{i.canonical === 'match' ? 'Google files it under this address' : i.canonical === 'differs' ? <>Google files it under another address: <span className="text-amber-200">{(i.googleCanonical ?? '').replace(/^https?:\/\//, '')}</span></> : 'Google has chosen no address for it yet'}</span>
            <span>{dot(i.lastCrawl ? i.crawledAs !== 'computer' : null)}{i.lastCrawl ? <>Last fetched {shortDate(i.lastCrawl.slice(0, 10))}{i.crawledAs ? ` as a ${i.crawledAs}` : ''}</> : 'Not fetched by Google yet'}</span>
            <span className="text-slate-400">{i.rich.length ? 'Rich results: ' + i.rich.join(', ') : 'No rich results found'}</span>
            {i.link && <a href={i.link} target="_blank" rel="noreferrer" className="ml-auto text-sky-400 hover:underline">Open in Search Console</a>}
          </p>
        );
      })()}
      {error && <p className="text-sm text-amber-300">{error}</p>}
      {!d && !error && <Skeleton />}
      {d && d.property === null && <p className="text-sm text-slate-400">The connected Google login has no Search Console property for {host} (it can see {d.properties} other{d.properties === 1 ? '' : 's'}). Ask the client to add it as a user on theirs.</p>}
      {d && d.property && (
        <div className={'space-y-5 ' + (busy ? 'opacity-50' : '')}>
          {phones?.offer && phones.device && phones.rows[0] && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/40 bg-amber-400/5 px-4 py-3">
              <p className="min-w-0 flex-1 text-sm text-amber-100">
                {phones.device.why === 'position'
                  ? <>On phones your page sits <span className="font-semibold">{phones.device.gap} places lower</span> than on computers, and phones are {phones.device.mobileShare}% of the times it is shown.</>
                  : <><span className="font-semibold">{phones.device.mobileShare}% of the times your page is shown are on a phone</span>, where the map pack and AI Overviews take the top of the screen.</>}
                {' '}<span className="text-amber-200/70">See what a phone in your area is shown for “{phones.rows[0].query}”.</span>
              </p>
              <button type="button" onClick={() => setOffer({ query: phones.rows[0].query, why: whyOf(phones.rows[0]) })} className="whitespace-nowrap rounded-lg bg-amber-400 px-3.5 py-2 text-sm font-bold text-slate-950 hover:bg-amber-300">Scan it on real phones{price ? ` · ${price}` : ''}</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile big label="Clicks from Google Search" value={d.recent.clicks} was={d.before.clicks} spark={d.days.map((x) => x.clicks)} active={metric === 'clicks'} onSelect={() => setMetric('clicks')} />
            <Tile big label="Times shown" value={d.recent.impressions} was={d.before.impressions} spark={d.days.map((x) => x.impressions)} active={metric === 'impressions'} onSelect={() => setMetric('impressions')} />
            <Tile big label="Click rate" value={d.recent.ctr} was={d.before.ctr} digits={1} unit="%" />
            <Tile big label="Average position" value={d.recent.position} was={d.before.position} digits={1} spots />
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold">{metric === 'clicks' ? 'Clicks' : 'Times shown'} by day</h4>
            <MiniChart points={alongside(d.days, d.daysBefore, back(d.range), (x) => x[metric])} beforeName={beforeName(d.range)} name={metric === 'clicks' ? 'Clicks' : 'Times shown'} />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Searches</h4>
              <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                {picked.length > 0 && <a href={scanUrl} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400">Scan {picked.length} keyword{picked.length === 1 ? '' : 's'} →</a>}
                <Segmented label="Which searches" value={view} onChange={setView} options={[['top', 'Top'], ['rising', `Rising${rising.length ? ' · ' + rising.length : ''}`]] as const} />
                <Segmented label="Filter the searches" value={chip} onChange={(v) => { setChip(v); setAll(false); }} options={[['all', 'All'], ['zero', `Top 10 · 0 clicks · ${count('zero')}`], ['strike', `Striking distance · ${count('strike')}`], ['open', `Non-branded · ${count('open')}`]] as const} />
                <input className={field + ' w-44 text-xs'} placeholder="Find a search" value={find} onChange={(e) => setFind(e.target.value)} />
              </div>
            </div>
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-xs text-slate-400">
                  <tr><th className="w-8 px-3 py-2" /><th className="px-3 py-2 font-medium">Search</th><th className="px-3 py-2 text-right font-medium">Clicks</th><th className="whitespace-nowrap px-3 py-2 text-right font-medium">Change</th><th className="whitespace-nowrap px-3 py-2 text-right font-medium">Times shown</th><th className="whitespace-nowrap px-3 py-2 text-right font-medium">Click rate</th><th className="px-3 py-2 text-right font-medium">Position</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {shown.map((r) => {
                    const on = picked.includes(r.key);
                    return (
                      <tr key={r.key} className={'hover:bg-slate-800/40 ' + (on ? 'bg-emerald-500/5' : '')}>
                        <td className="px-3 py-1.5"><input type="checkbox" className="h-4 w-4 accent-emerald-500" aria-label={'Scan ' + r.key} checked={on} disabled={!on && picked.length >= MAX_PICK} onChange={() => toggle(r.key)} /></td>
                        <td className="max-w-[26rem] px-3 py-1.5 text-slate-200">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="min-w-0 truncate" title={r.key}>{r.key}</span>
                            {competing[r.key] && <a href={competing[r.key].page} target="_blank" rel="noreferrer" title={`${competing[r.key].share}% of the times your website was shown for this search, Google showed ${competing[r.key].page} instead of the listing’s page. Two pages are competing for it.`} className="whitespace-nowrap rounded-full border border-violet-400/50 bg-violet-400/10 px-2 py-0.5 text-[11px] font-semibold text-violet-200 hover:bg-violet-400/20">Competing page · {competing[r.key].share}% to {competing[r.key].page.replace(/^https?:\/\/[^/]+/, '').slice(0, 28) || '/'}</a>}
                            {flags.has(r.key) && <button type="button" onClick={() => setOffer({ query: r.key, why: whyOf(flags.get(r.key)!) })} className="whitespace-nowrap rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/20">{phones?.fallback ? 'Local search' : 'Low phone click rate'} · scan the live results{price ? ` (${price})` : ''}</button>}
                          </span>
                        </td>
                        <BarCell value={r.a} max={topClicks} strong />
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums">{r.wasA === null ? <span className="text-sky-300">new</span> : <><Change now={r.a} was={r.wasA} /> <span className="text-slate-600">({fmt(r.wasA)})</span></>}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-400">{fmt(r.b)}{view === 'rising' && up.by === 'shown' && <span className="ml-1.5 text-xs text-emerald-400">+{fmt(r.b - (r.wasB ?? 0))}</span>}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.d == null ? '–' : r.d.toFixed(1) + '%'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.c === null ? <span className="text-slate-600">–</span> : <span className={'inline-block min-w-[2.6rem] rounded-full px-1.5 py-0.5 text-center text-xs ' + (r.c <= 3 ? 'bg-emerald-500/15 text-emerald-300' : r.c <= 10 ? 'bg-slate-700/60 text-slate-200' : 'text-slate-500')} title={r.c <= 3 ? 'In the top three' : r.c <= 10 ? 'On the first page' : 'Past the first page'}>{r.c.toFixed(1)}</span>}</td>
                      </tr>
                    );
                  })}
                  {!shown.length && <tr><td colSpan={7} className="px-3 py-3 text-sm text-slate-400">{queries.length === 0 ? 'Google reported no searches for these dates.' : view === 'rising' && !find.trim() && chip === 'all' ? 'No search gained clicks or was shown more often than in the period before.' : 'No search matches that.'}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a href={picked.length ? scanUrl : undefined} aria-disabled={!picked.length} className={'rounded-lg px-4 py-2 text-sm font-semibold ' + (picked.length ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'pointer-events-none bg-slate-800 text-slate-500')}>Scan {picked.length || ''} keyword{picked.length === 1 ? '' : 's'} →</a>
              {list.length > 15 && !find.trim() && <button type="button" onClick={() => setAll((v) => !v)} className="text-sm text-slate-400 hover:text-slate-200">{all ? 'Show fewer' : `Show all ${list.length}`}</button>}
              <span className="text-xs text-slate-500">{up.by === 'shown' ? 'Rising: no search gained two clicks, so these are the searches the page was shown for more often than before.' : 'Rising: the searches that gained the most clicks.'} Striking distance: positions 4 to 20, close enough to move up. Google leaves out searches made by very few people.</span>
            </div>
          </div>

          {d.scope === 'site' && d.pages.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold">Pages</h4>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-xs text-slate-400"><tr><th className="px-3 py-2 font-medium">Page</th><th className="px-3 py-2 text-right font-medium">Clicks</th><th className="px-3 py-2 text-right font-medium">vs before</th><th className="px-3 py-2 text-right font-medium">Times shown</th><th className="px-3 py-2 text-right font-medium">Position</th></tr></thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {d.pages.slice(0, 12).map((r) => (
                      <tr key={r.key} className={'hover:bg-slate-800/40 ' + (samePage(r.key, d.page) ? 'bg-emerald-500/5' : '')}>
                        <td className="max-w-[26rem] truncate px-3 py-1.5 text-slate-200" title={r.key}>{r.key.replace(/^https?:\/\/[^/]+/, '') || '/'}{samePage(r.key, d.page) && <span className="ml-2 text-xs text-emerald-300">the listing’s page</span>}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{fmt(r.a)}</td>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums"><Change now={r.a} was={r.wasA} /></td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{fmt(r.b)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.c === null ? '–' : r.c.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <GoogleExplorer source="gsc" website={website} start={{ days: d.range.days, from: d.range.recent.from, to: d.range.recent.to, device }} />
        </div>
      )}
    {offer && <ScanOffer query={offer.query} why={offer.why} businessName={businessName} onClose={() => setOffer(null)} />}
    </section>
  );
}

/** Analytics for the website: calls and key events first, then where the visits that convert come from. */
function Analytics({ host, dates, website, businessName, wholeSite }: { host: string; dates: Dates; website: string; businessName: string; wholeSite?: boolean }) {
  const [scope, setScope] = useState<'page' | 'site'>(wholeSite ? 'site' : 'page');
  // Real leads (calls, forms, bookings, chats and the property's own key events) or Analytics' raw key-event count.
  const [real, setReal] = useState(true);
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [property, setProperty] = useState('');
  const [came, setCame] = useState<GaSource>('all');
  const [device, setDevice] = useState<(typeof DEVICE)[number][0]>('');
  const [d, setD] = useState<Ga | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [metric, setMetric] = useState<'keyEvents' | 'visits'>('keyEvents');
  const NOT_SET = 'Visits with no page view: usually a call-tracking or server-side event that arrived on its own, or a visit that started on a page without the Analytics tag.';
  const [by, setBy] = useState<'sources' | 'channels'>('sources');
  // A new key name: an earlier version could save one site's property under another site.
  const remember = 'stakeout.ga4site.' + host;
  const key = JSON.stringify(dates);

  useEffect(() => {
    let live = true;
    setProperties(null); setProperty(''); setD(null); setError(''); setCame('all'); setDevice(''); setScope(wholeSite ? 'site' : 'page');
    get<{ properties: Property[] }>('/api/admin/google/analytics')
      .then((r) => {
        if (!live) return;
        setProperties(r.properties);
        let saved = '';
        try { saved = window.localStorage.getItem(remember) ?? ''; } catch { /* storage unavailable */ }
        // A remembered choice for this site, else a property whose name contains the site's name.
        const guess = r.properties.find((p) => p.id === saved) ?? r.properties.find((p) => p.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(host.split('.')[0].replace(/[^a-z0-9]/g, '')));
        setProperty(guess?.id ?? '');
      })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [host, remember]);
  useEffect(() => {
    if (!property) { setD(null); return; }
    let live = true;
    setBusy(true); setError('');
    post<Ga>({ source: 'ga', property, came, device: device.toLowerCase(), website, scope, ...dates }).then((j) => { if (live) setD(j); }).catch((e) => { if (live) setError(e.message); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property, came, device, key, scope, website]);

  // Only a choice made by hand is remembered for this site; a guess is not.
  const choose = (id: string) => {
    setProperty(id);
    try { if (id) window.localStorage.setItem(remember, id); else window.localStorage.removeItem(remember); } catch { /* storage unavailable */ }
  };
  const rows = d ? d[by] : [];
  // What counts as a conversion: real leads, or whatever the property has marked as key.
  const won = d ? (real ? d.events.leads : d.recent.c) : 0, wonBefore = d ? (real ? d.events.leadsBefore : d.before.c) : 0;
  const per100 = (n: number, visits: number) => (visits ? (n / visits) * 100 : null);
  const wonOf = (r: GaRowL) => (real ? r.leads : r.c ?? 0);
  const word = real ? 'Leads' : 'Key events';
  const dayPick = (x: GaDay) => (metric === 'visits' ? x.visits : real ? x.leads : x.keyEvents);
  const audit = d?.events.audit;
  const path = (() => { try { return new URL(website).pathname.replace(/\/+$/, '') || '/'; } catch { return '/'; } })();

  return (
    <section id="insights-analytics" className={card + ' scroll-mt-16 space-y-5'}>
      <SectionHead title="Google Analytics" sub={d ? <>{scope === 'page' ? <>Visits that landed on <span className="text-slate-300">{host}{path === '/' ? '' : path}</span>{wholeSite ? '' : ', the page the listing links to'}</> : <>What visitors to {host} did</>} · {span(d.range)}</> : 'What visitors to the website did'}>
        <Segmented label="Which pages" value={scope} onChange={setScope} options={[['page', wholeSite ? 'Home page only' : 'The listing’s page'], ['site', 'Whole website']] as const} />
        {properties && properties.length > 0 && (
          <select className={field + ' max-w-full'} value={property} onChange={(e) => choose(e.target.value)} aria-label="Analytics property">
            <option value="">Choose the Analytics property for this site…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}{p.account ? ' · ' + p.account : ''}</option>)}
          </select>
        )}
      </SectionHead>
      {error && <p className="text-sm text-amber-300">{error}</p>}
      {!error && !properties && <Skeleton />}
      {properties && properties.length === 0 && <p className="text-sm text-slate-400">The connected Google login cannot see any Analytics properties.</p>}
      {properties && properties.length > 0 && !property && <p className="text-sm text-slate-400">Pick the property for {host}. The choice is remembered on this computer.</p>}
      {property && !d && !error && <Skeleton />}
      {d && (
        <div className={'space-y-5 ' + (busy ? 'opacity-50' : '')}>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Where visits came from" value={came} onChange={setCame} options={(Object.keys(GA_SOURCES) as GaSource[]).map((k) => [k, k === 'listing' ? 'Google listing' : k === 'all' ? 'All visits' : GA_SOURCES[k]] as const)} />
            <Segmented label="Device" value={device} onChange={setDevice} options={DEVICE} />
            <Segmented label="What counts as a conversion" value={real ? 'real' : 'raw'} onChange={(v) => setReal(v === 'real')} options={[['real', 'Real leads only'], ['raw', 'All key events']] as const} />
          </div>
          {audit && (audit.noisy.length > 0 || audit.callsNotKey.length > 0) && (
            <p className="rounded-lg border border-amber-400/40 bg-amber-400/5 px-3 py-2 text-xs text-amber-100">
              <span className="font-semibold">GA4 config notice:</span>{' '}
              {audit.noisy.length > 0 && <>this property counts {audit.noisy.map((n, i) => <span key={n}>{i ? ', ' : ''}<code>{n}</code></span>)} as key events, which happen on every visit. {real ? 'We left them out, so the rates here reflect real leads and calls.' : 'They are included in the numbers below: switch to “Real leads only” to leave them out.'} </>}
              {audit.callsNotKey.length > 0 && <><code>{audit.callsNotKey[0]}</code> is not marked as a key event in Analytics; it is counted as a lead here all the same. </>}
              <span className="text-amber-200/70">Fix it in Analytics under Admin → Events → Key events.</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile big label="Calls" value={d.events.calls} was={d.events.callsBefore} note={d.events.calls === 0 && d.events.callsBefore === 0 ? 'no call event found' : undefined} compare={d.events.calls > 0 || d.events.callsBefore > 0} />
            <Tile big label={real ? 'Leads (calls, forms, bookings)' : 'Key events (conversions)'} value={won} was={wonBefore} spark={d.days.map((x) => (real ? x.leads : x.keyEvents))} active={metric === 'keyEvents'} onSelect={() => setMetric('keyEvents')} />
            <Tile big label="Visits" value={d.recent.a} was={d.before.a} spark={d.days.map((x) => x.visits)} active={metric === 'visits'} onSelect={() => setMetric('visits')} />
            <Tile big label={word + ' per 100 visits'} value={per100(won, d.recent.a)} was={per100(wonBefore, d.before.a)} digits={1} />
          </div>
          {d.events.calls === 0 && d.events.callsBefore === 0 && <p className="-mt-2 text-xs text-slate-500">Calls are counted from events whose name says call, phone or tel (a tap on the phone number). This site sends none: add a “click to call” event in Analytics or Tag Manager and they appear here.</p>}

          <div>
            <h4 className="mb-2 text-sm font-semibold">{metric === 'keyEvents' ? word : 'Visits'} by day</h4>
            <MiniChart points={alongside(d.days, d.daysBefore, back(d.range), dayPick)} beforeName={beforeName(d.range)} name={metric === 'keyEvents' ? word : 'Visits'} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold">Visits sent by AI assistants</h4>
                {came !== 'ai' && d.ai.visits > 0 && <button type="button" onClick={() => setCame('ai')} className="text-xs text-sky-400 hover:underline">Show only these</button>}
              </div>
              {d.ai.visits === 0 && d.ai.visitsBefore === 0 ? <p className="mt-2 text-sm text-slate-400">None for these dates. ChatGPT, Perplexity, Gemini, Copilot and the like are counted when they pass a referrer.</p> : (
                <>
                  <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="text-3xl font-bold tabular-nums text-slate-100">{fmt(d.ai.visits)}</span><span className="text-xs"><Change now={d.ai.visits} was={d.ai.visitsBefore} /> <span className="text-slate-500">was {fmt(d.ai.visitsBefore)}</span></span><span className="text-sm text-slate-300"><span className="font-semibold tabular-nums">{fmt(d.ai.leads)}</span> lead{d.ai.leads === 1 ? '' : 's'}, <span className="font-semibold tabular-nums">{fmt(d.ai.calls)}</span> of them call{d.ai.calls === 1 ? '' : 's'}</span></p>
                  {d.ai.pages.length > 0 && <ul className="mt-3 space-y-1 text-xs">{d.ai.pages.map((x) => <li key={x.page} className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate text-slate-300" title={x.page === '(not set)' ? NOT_SET : x.page}>{x.page}{x.page === '(not set)' && <span className="ml-1 cursor-help text-slate-500">ⓘ</span>}</span><span className="tabular-nums text-slate-400">{fmt(x.visits)} visit{x.visits === 1 ? '' : 's'}</span></li>)}</ul>}
                  <p className="mt-2 text-[11px] text-slate-500">The pages they landed on most. Assistants that pass no referrer show as direct and cannot be told apart.</p>
                </>
              )}
            </div>
            <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950 p-3">
              <h4 className="text-sm font-semibold">Top visitor towns</h4>
              {d.cities.length === 0 ? <p className="mt-2 text-sm text-slate-400">Analytics named no towns for these dates.</p> : (
                <table className="mt-2 w-full text-left text-xs">
                  <thead className="text-slate-500"><tr><th className="py-1 font-medium">Town</th><th className="py-1 text-right font-medium">Visits</th><th className="py-1 text-right font-medium">Calls</th><th className="py-1" aria-label="Scan" /></tr></thead>
                  <tbody>
                    {d.cities.slice(0, 6).map((c) => (
                      <tr key={c.city + c.region} className="group border-t border-slate-800/70">
                        <td className="max-w-[12rem] truncate py-1.5 text-slate-200" title={c.city + ', ' + c.region}>{c.city}<span className="text-slate-500">{c.region && c.region !== '(not set)' ? ', ' + c.region : ''}</span></td>
                        <td className="py-1.5 text-right tabular-nums text-slate-200">{fmt(c.visits)}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">{fmt(c.calls)}</td>
                        <td className="whitespace-nowrap py-1.5 pl-2 text-right"><a href={'/new-scan?' + new URLSearchParams([...(businessName ? [['name', businessName]] : []), ['near', c.city + (c.region && c.region !== '(not set)' ? ', ' + c.region : '')], ['grid', '5']]).toString()} title={`Start a 5×5 scan centred on ${c.city}`} className="rounded-md border border-emerald-500/50 px-2 py-0.5 font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">Scan here</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Where visits came from</h4>
                <Segmented label="Group by" value={by} onChange={setBy} options={[['sources', 'Source'], ['channels', 'Channel']] as const} />
              </div>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-xs text-slate-400"><tr><th className="px-3 py-2 font-medium">{by === 'sources' ? 'Source / medium' : 'Channel'}</th><th className="px-3 py-2 text-right font-medium">Visits</th><th className="whitespace-nowrap px-3 py-2 text-right font-medium">Change</th><th className="whitespace-nowrap px-3 py-2 text-right font-medium">{word}</th><th className="whitespace-nowrap px-3 py-2 text-right font-medium" title={word + ' per 100 visits'}>Rate</th></tr></thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {rows.slice(0, 12).map((r) => (
                      <tr key={r.key} className="hover:bg-slate-800/40">
                        <td className="max-w-[14rem] truncate px-3 py-1.5 text-slate-200" title={r.key}>{r.key}</td>
                        <BarCell value={r.a} max={Math.max(1, ...rows.map((x) => x.a))} strong />
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums"><Change now={r.a} was={r.wasA} /></td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{fmt(wonOf(r))}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.a ? ((wonOf(r) / r.a) * 100).toFixed(1) : '–'}</td>
                      </tr>
                    ))}
                    {!rows.length && <tr><td colSpan={5} className="px-3 py-3 text-sm text-slate-400">No visits for these dates and filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold">Conversions and calls, by event</h4>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-xs text-slate-400"><tr><th className="px-3 py-2 font-medium">Event</th><th className="px-3 py-2 text-right font-medium">Times</th><th className="whitespace-nowrap px-3 py-2 text-right font-medium">Change</th><th className="whitespace-nowrap px-3 py-2 text-right font-medium">Key events</th></tr></thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {d.events.rows.slice(0, 12).map((r) => (
                      <tr key={r.name} className="hover:bg-slate-800/40">
                        <td className="max-w-[14rem] truncate px-3 py-1.5 text-slate-200" title={r.name}>{r.name}{r.call && <span className="ml-2 rounded-full border border-emerald-500/40 px-1.5 py-0.5 text-[10px] text-emerald-300">call</span>}{r.noise && <span className="ml-2 rounded-full border border-amber-400/40 px-1.5 py-0.5 text-[10px] text-amber-200" title="Analytics sends this on every visit: it is not a lead, and is left out of “Real leads only”.">not a lead</span>}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{fmt(r.count)}</td>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums"><Change now={r.count} was={r.wasCount} /></td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.keyEvents ? fmt(r.keyEvents) : <span title="Not marked as a key event in Analytics">–</span>}</td>
                      </tr>
                    ))}
                    {!d.events.rows.length && <tr><td colSpan={4} className="px-3 py-3 text-sm text-slate-400">No key events or call events for these dates. Mark the events that matter (form sent, call, booking) as key events in Analytics.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500">“Google listing” counts visits whose campaign, source or medium is one of {d.listingTags.map((t, i) => <span key={t}>{i ? ', ' : ''}<code>{t}</code></span>)}: the tag on this listing’s own website link, the one the “Add tracking tag” button puts there, and the usual agency ones. “AI assistants” counts visits a chat assistant’s site or app sent; ones it sent with no referrer show as direct.</p>
          <GoogleExplorer source="ga" property={property} start={d ? { days: d.range.days, from: d.range.recent.from, to: d.range.recent.to, device, page: scope === 'page' && path !== '/' ? path : '' } : undefined} />
        </div>
      )}
    </section>
  );
}

/** The client's website in Search Console and Analytics, read with the admin's own Google login. `dates` is the tab's date choice. */
export default function GoogleSitePanel({ website, businessName, dates, wholeSite }: { website: string; businessName: string; dates: Dates; wholeSite?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState('');
  const host = (() => { try { return new URL(website).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const loadStatus = useCallback(() => get<Status>('/api/admin/google').then(setStatus).catch(() => setStatus({ configured: false, connected: false, email: null, searchConsole: false, analytics: false })), []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const [leaving, setLeaving] = useState(false);
  const disconnect = async () => {
    setLeaving(true); setNotice('');
    const ok = await fetch('/api/admin/google', { method: 'DELETE' }).then((r) => r.ok).catch(() => false);
    setLeaving(false);
    setNotice(ok ? 'Google disconnected.' : 'Google was not disconnected. Try again.');
    loadStatus();
  };

  if (!status) return null;
  if (!status.configured || !status.connected)
    return (
      <section className={card}>
        <h3 className="font-semibold">Website: Search Console and Analytics</h3>
        {notice && <p className="mt-2 text-sm text-sky-300">{notice}</p>}
        {!status.configured ? (
          <p className="mt-2 text-sm text-slate-400">Google sign-in is not set up yet: add <code className="text-slate-200">GOOGLE_CLIENT_ID</code> and <code className="text-slate-200">GOOGLE_CLIENT_SECRET</code> on Vercel, then redeploy.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-400">Connect the Google login that can see your Search Console and Analytics. It is free, and Stakeout only reads; it cannot change anything there.</p>
            <a href="/api/google/connect" className="mt-3 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Connect Google</a>
          </>
        )}
      </section>
    );
  return (
    <>
      {!host ? <p className={card + ' text-sm text-slate-400'}>{wholeSite ? 'Pick a website above to see its Search Console and Analytics.' : 'This listing has no website, so there is nothing to look up in Search Console or Analytics.'}</p> : (
        <>
          {status.searchConsole && <SearchConsole website={website} host={host} businessName={businessName} dates={dates} wholeSite={wholeSite} />}
          {status.analytics && <Analytics host={host} dates={dates} website={website} businessName={businessName} wholeSite={wholeSite} />}
        </>
      )}
      <p className="text-xs text-slate-500">
        {notice && <span className="mr-2 text-sky-300">{notice}</span>}
        Search Console and Analytics are read as <span className="text-slate-300">{status.email || 'a Google account'}</span>
        {!status.searchConsole && ' · Search Console was not allowed'}{!status.analytics && ' · Analytics was not allowed'} ·{' '}
        <button type="button" onClick={disconnect} disabled={leaving} className="text-slate-400 underline hover:text-rose-300 disabled:opacity-50">{leaving ? 'Disconnecting…' : 'Disconnect'}</button>
        {(!status.searchConsole || !status.analytics) && <> · <a href="/api/google/connect" className="text-sky-400 underline">Connect again</a></>}
      </p>
    </>
  );
}
