'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GA_SOURCES, risingRows, type EventRow, type ExploreRow, type GaSource } from '@stakeout/core/googleExplore';
import GoogleExplorer from '@/components/GoogleExplorer';
import { BarCell, Change, MiniChart, SectionHead, Segmented, Skeleton, Tile, alongside, card, fmt, shortDate } from '@/components/InsightBits';

export type Dates = { days: number } | { from: string; to: string };
type Status = { configured: boolean; connected: boolean; email: string | null; searchConsole: boolean; analytics: boolean };
type Range = { recent: { from: string; to: string }; before: { from: string; to: string }; days: number };
type GscTotals = { clicks: number; impressions: number; ctr: number | null; position: number | null };
type Gsc =
  | { property: null; properties: number }
  | { property: string; page: string; scope: 'page' | 'site'; range: Range; recent: GscTotals; before: GscTotals; days: { date: string; clicks: number; impressions: number }[]; daysBefore?: { date: string; clicks: number; impressions: number }[]; queries: ExploreRow[]; pages: ExploreRow[] };
type Property = { id: string; name: string; account: string };
type GaTotals = { a: number; b: number; c: number };
type Ga = { range: Range; recent: GaTotals; before: GaTotals; days: { date: string; visits: number; keyEvents: number }[]; daysBefore?: { date: string; visits: number; keyEvents: number }[]; sources: ExploreRow[]; channels: ExploreRow[]; events: { rows: EventRow[]; calls: number; callsBefore: number } };

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
  const [metric, setMetric] = useState<'clicks' | 'impressions'>('clicks');
  const [view, setView] = useState<'top' | 'rising'>('top');
  const [find, setFind] = useState('');
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const key = JSON.stringify(dates);

  useEffect(() => { setD(null); setPicked([]); setScope(wholeSite ? 'site' : 'page'); setDevice(''); setFind(''); setAll(false); }, [website, wholeSite]);
  useEffect(() => {
    let live = true;
    setBusy(true); setError('');
    post<Gsc>({ source: 'gsc', website, scope, device, ...dates }).then((j) => { if (live) setD(j); }).catch((e) => { if (live) setError(e.message); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [website, scope, device, key]);

  const queries = d && d.property ? d.queries : [];
  const rising = useMemo(() => risingRows(queries), [queries]);
  const list = (view === 'rising' ? rising : queries).filter((r) => !find.trim() || r.key.includes(find.trim().toLowerCase()));
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
      {error && <p className="text-sm text-amber-300">{error}</p>}
      {!d && !error && <Skeleton />}
      {d && d.property === null && <p className="text-sm text-slate-400">The connected Google login has no Search Console property for {host} (it can see {d.properties} other{d.properties === 1 ? '' : 's'}). Ask the client to add it as a user on theirs.</p>}
      {d && d.property && (
        <div className={'space-y-5 ' + (busy ? 'opacity-50' : '')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile big label="Clicks from Google Search" value={d.recent.clicks} was={d.before.clicks} spark={d.days.map((x) => x.clicks)} active={metric === 'clicks'} onSelect={() => setMetric('clicks')} />
            <Tile big label="Times shown" value={d.recent.impressions} was={d.before.impressions} spark={d.days.map((x) => x.impressions)} active={metric === 'impressions'} onSelect={() => setMetric('impressions')} />
            <Tile big label="Click rate" value={d.recent.ctr} was={d.before.ctr} digits={1} unit="%" />
            <Tile big label="Average position" value={d.recent.position} was={d.before.position} digits={1} lowerIsBetter />
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold">{metric === 'clicks' ? 'Clicks' : 'Times shown'} by day</h4>
            <MiniChart points={alongside(d.days, d.daysBefore, d.range.days, (x) => x[metric])} name={metric === 'clicks' ? 'Clicks' : 'Times shown'} />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Searches</h4>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented label="Which searches" value={view} onChange={setView} options={[['top', 'Top'], ['rising', `Rising${rising.length ? ' · ' + rising.length : ''}`]] as const} />
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
                        <td className="max-w-[20rem] truncate px-3 py-1.5 text-slate-200" title={r.key}>{r.key}</td>
                        <BarCell value={r.a} max={topClicks} strong />
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums">{r.wasA === null ? <span className="text-sky-300">new</span> : <><Change now={r.a} was={r.wasA} /> <span className="text-slate-600">({fmt(r.wasA)})</span></>}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{fmt(r.b)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.d == null ? '–' : r.d.toFixed(1) + '%'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.c === null ? <span className="text-slate-600">–</span> : <span className={'inline-block min-w-[2.6rem] rounded-full px-1.5 py-0.5 text-center text-xs ' + (r.c <= 3 ? 'bg-emerald-500/15 text-emerald-300' : r.c <= 10 ? 'bg-slate-700/60 text-slate-200' : 'text-slate-500')} title={r.c <= 3 ? 'In the top three' : r.c <= 10 ? 'On the first page' : 'Past the first page'}>{r.c.toFixed(1)}</span>}</td>
                      </tr>
                    );
                  })}
                  {!shown.length && <tr><td colSpan={7} className="px-3 py-3 text-sm text-slate-400">{queries.length === 0 ? 'Google reported no searches for these dates.' : view === 'rising' && !find.trim() ? 'No search gained two or more clicks on the period before.' : 'No search matches that.'}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a href={picked.length ? scanUrl : undefined} aria-disabled={!picked.length} className={'rounded-lg px-4 py-2 text-sm font-semibold ' + (picked.length ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'pointer-events-none bg-slate-800 text-slate-500')}>Scan {picked.length || ''} keyword{picked.length === 1 ? '' : 's'} →</a>
              {list.length > 15 && !find.trim() && <button type="button" onClick={() => setAll((v) => !v)} className="text-sm text-slate-400 hover:text-slate-200">{all ? 'Show fewer' : `Show all ${list.length}`}</button>}
              <span className="text-xs text-slate-500">Rising: the searches that gained the most clicks. Google leaves out searches made by very few people.</span>
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
                      <tr key={r.key} className={'hover:bg-slate-800/40 ' + (r.key === d.page ? 'bg-emerald-500/5' : '')}>
                        <td className="max-w-[26rem] truncate px-3 py-1.5 text-slate-200" title={r.key}>{r.key.replace(/^https?:\/\/[^/]+/, '') || '/'}{r.key === d.page && <span className="ml-2 text-xs text-emerald-300">the listing’s page</span>}</td>
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
          <GoogleExplorer source="gsc" website={website} />
        </div>
      )}
    </section>
  );
}

/** Analytics for the website: calls and key events first, then where the visits that convert come from. */
function Analytics({ host, dates }: { host: string; dates: Dates }) {
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [property, setProperty] = useState('');
  const [came, setCame] = useState<GaSource>('all');
  const [device, setDevice] = useState<(typeof DEVICE)[number][0]>('');
  const [d, setD] = useState<Ga | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [metric, setMetric] = useState<'keyEvents' | 'visits'>('keyEvents');
  const [by, setBy] = useState<'sources' | 'channels'>('sources');
  // A new key name: an earlier version could save one site's property under another site.
  const remember = 'stakeout.ga4site.' + host;
  const key = JSON.stringify(dates);

  useEffect(() => {
    let live = true;
    setProperties(null); setProperty(''); setD(null); setError(''); setCame('all'); setDevice('');
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
    post<Ga>({ source: 'ga', property, came, device: device.toLowerCase(), ...dates }).then((j) => { if (live) setD(j); }).catch((e) => { if (live) setError(e.message); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property, came, device, key]);

  // Only a choice made by hand is remembered for this site; a guess is not.
  const choose = (id: string) => {
    setProperty(id);
    try { if (id) window.localStorage.setItem(remember, id); else window.localStorage.removeItem(remember); } catch { /* storage unavailable */ }
  };
  const rows = d ? d[by] : [];
  const rate = (t: GaTotals) => (t.a ? (t.c / t.a) * 100 : null);

  return (
    <section id="insights-analytics" className={card + ' scroll-mt-16 space-y-5'}>
      <SectionHead title="Google Analytics" sub={d ? <>What visitors to {host} did · {span(d.range)}</> : 'What visitors to the website did'}>
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
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile big label="Calls" value={d.events.calls} was={d.events.callsBefore} note={d.events.calls === 0 && d.events.callsBefore === 0 ? 'no call event found' : undefined} compare={d.events.calls > 0 || d.events.callsBefore > 0} />
            <Tile big label="Key events (conversions)" value={d.recent.c} was={d.before.c} spark={d.days.map((x) => x.keyEvents)} active={metric === 'keyEvents'} onSelect={() => setMetric('keyEvents')} />
            <Tile big label="Visits" value={d.recent.a} was={d.before.a} spark={d.days.map((x) => x.visits)} active={metric === 'visits'} onSelect={() => setMetric('visits')} />
            <Tile big label="Key events per 100 visits" value={rate(d.recent)} was={rate(d.before)} digits={1} />
          </div>
          {d.events.calls === 0 && d.events.callsBefore === 0 && <p className="-mt-2 text-xs text-slate-500">Calls are counted from events whose name says call, phone or tel (a tap on the phone number). This site sends none: add a “click to call” event in Analytics or Tag Manager and they appear here.</p>}

          <div>
            <h4 className="mb-2 text-sm font-semibold">{metric === 'keyEvents' ? 'Key events' : 'Visits'} by day</h4>
            <MiniChart points={alongside(d.days, d.daysBefore, d.range.days, (x) => x[metric])} name={metric === 'keyEvents' ? 'Key events' : 'Visits'} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Where visits came from</h4>
                <Segmented label="Group by" value={by} onChange={setBy} options={[['sources', 'Source'], ['channels', 'Channel']] as const} />
              </div>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-xs text-slate-400"><tr><th className="px-3 py-2 font-medium">{by === 'sources' ? 'Source / medium' : 'Channel'}</th><th className="px-3 py-2 text-right font-medium">Visits</th><th className="whitespace-nowrap px-3 py-2 text-right font-medium">Change</th><th className="whitespace-nowrap px-3 py-2 text-right font-medium">Key events</th><th className="whitespace-nowrap px-3 py-2 text-right font-medium" title="Key events per 100 visits">Rate</th></tr></thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {rows.slice(0, 12).map((r) => (
                      <tr key={r.key} className="hover:bg-slate-800/40">
                        <td className="max-w-[14rem] truncate px-3 py-1.5 text-slate-200" title={r.key}>{r.key}</td>
                        <BarCell value={r.a} max={Math.max(1, ...rows.map((x) => x.a))} strong />
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums"><Change now={r.a} was={r.wasA} /></td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{fmt(r.c ?? 0)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.a ? (((r.c ?? 0) / r.a) * 100).toFixed(1) : '–'}</td>
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
                        <td className="max-w-[14rem] truncate px-3 py-1.5 text-slate-200" title={r.name}>{r.name}{r.call && <span className="ml-2 rounded-full border border-emerald-500/40 px-1.5 py-0.5 text-[10px] text-emerald-300">call</span>}</td>
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
          <p className="text-xs text-slate-500">“Google listing” counts visits tagged <code>gbp_listing</code>, which the “Add tracking tag” button on the Edit business tab puts on the listing’s website link. “AI assistants” counts visits a chat assistant’s site or app sent; ones it sent with no referrer show as direct.</p>
          <GoogleExplorer source="ga" property={property} />
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
          {status.analytics && <Analytics host={host} dates={dates} />}
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
