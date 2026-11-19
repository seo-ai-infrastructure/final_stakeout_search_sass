'use client';
import { useCallback, useEffect, useState } from 'react';
import { pct } from '@stakeout/core/googleSite';
import GoogleExplorer from '@/components/GoogleExplorer';

type Status = { configured: boolean; connected: boolean; email: string | null; searchConsole: boolean; analytics: boolean };
type Range = { from: string; to: string };
type Site =
  | { property: null; properties: number }
  | { property: string; periods: { recent: Range; before: Range; days: number }; recent: SiteTotals; before: SiteTotals; queries: { query: string; clicks: number; impressions: number; position: number | null }[] };
type SiteTotals = { clicks: number; impressions: number; position: number | null };
type Property = { id: string; name: string; account: string };
type Visits = { sessions: number; keyEvents: number };
type Analytics = { campaign: string; all: { recent: Visits; before: Visits }; listing: { recent: Visits; before: Visits } };

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const input = 'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500';
const MAX_PICK = 10;
async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j as T;
}

function Tile({ label, now, before, lowerIsBetter, digits = 0 }: { label: string; now: number | null; before?: number | null; lowerIsBetter?: boolean; digits?: number }) {
  const change = now !== null && before !== null && before !== undefined ? pct(now, before) : null;
  const good = change === null || change === 0 ? null : lowerIsBetter ? change < 0 : change > 0;
  const show = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-100">{now === null ? '–' : show(now)}</p>
      <p className={'mt-0.5 text-xs ' + (good === null ? 'text-slate-500' : good ? 'text-emerald-400' : 'text-rose-400')}>
        {change === null ? ' ' : (change > 0 ? '▲ ' : change < 0 ? '▼ ' : '') + Math.abs(change) + '% vs the 28 days before (' + show(before as number) + ')'}
      </p>
    </div>
  );
}

/** The client's website in Search Console and Analytics, read with the admin's own Google login. */
export default function GoogleSitePanel({ website, businessName }: { website: string; businessName: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState('');
  const [site, setSite] = useState<Site | null>(null);
  const [siteError, setSiteError] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [property, setProperty] = useState('');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState('');

  const host = (() => { try { return new URL(website).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  // A new key name: an earlier version could save one site's property under another site.
  const remember = 'stakeout.ga4site.' + host;

  const loadStatus = useCallback(() => get<Status>('/api/admin/google').then(setStatus).catch(() => setStatus({ configured: false, connected: false, email: null, searchConsole: false, analytics: false })), []);
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    setSite(null); setSiteError(''); setPicked([]); setAnalytics(null); setAnalyticsError(''); setProperty('');
    if (!status?.connected || !host) return;
    let live = true;
    if (status.searchConsole) get<Site>('/api/admin/google/site?website=' + encodeURIComponent(website)).then((s) => live && setSite(s)).catch((e) => live && setSiteError(e.message));
    if (status.analytics) {
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
        .catch((e) => live && setAnalyticsError(e.message));
    }
    return () => { live = false; };
  }, [status, website, host, remember]);

  useEffect(() => {
    setAnalytics(null); setAnalyticsError('');
    if (!property) return;
    let live = true;
    get<Analytics>('/api/admin/google/analytics?property=' + encodeURIComponent(property)).then((a) => live && setAnalytics(a)).catch((e) => live && setAnalyticsError(e.message));
    return () => { live = false; };
  }, [property]);

  // Only a choice made by hand is remembered for this site; a guess is not.
  const choose = (id: string) => {
    setProperty(id);
    try { if (id) window.localStorage.setItem(remember, id); else window.localStorage.removeItem(remember); } catch { /* storage unavailable */ }
  };
  const disconnect = async () => {
    await fetch('/api/admin/google', { method: 'DELETE' }).catch(() => {});
    setNotice('Google disconnected.');
    loadStatus();
  };
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length < MAX_PICK ? [...p, k] : p));
  const scanUrl = '/new-scan?' + new URLSearchParams([['name', businessName], ...picked.map((k) => ['kw', k] as [string, string])]).toString();

  if (!status) return null;
  return (
    <section className={card + ' space-y-5'}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Website: Search Console and Analytics</h3>
        <span className="text-xs text-slate-500">{host || 'no website on this listing'} · read-only</span>
      </div>
      {notice && <p className="text-sm text-sky-300">{notice}</p>}

      {!status.configured ? (
        <p className="text-sm text-slate-400">Google sign-in is not set up yet: add <code className="text-slate-200">GOOGLE_CLIENT_ID</code> and <code className="text-slate-200">GOOGLE_CLIENT_SECRET</code> on Vercel, then redeploy.</p>
      ) : !status.connected ? (
        <div>
          <p className="text-sm text-slate-400">Connect the Google login that can see your clients’ Search Console and Analytics. Stakeout only reads; it cannot change anything there.</p>
          <a href="/api/google/connect" className="mt-3 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Connect Google</a>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Connected as <span className="text-slate-300">{status.email || 'a Google account'}</span>
            {!status.searchConsole && ' · Search Console was not allowed'}{!status.analytics && ' · Analytics was not allowed'} ·{' '}
            <button type="button" onClick={disconnect} className="text-slate-400 underline hover:text-rose-300">Disconnect</button>
            {(!status.searchConsole || !status.analytics) && <> · <a href="/api/google/connect" className="text-sky-400 underline">Connect again</a></>}
          </p>

          {!host ? <p className="text-sm text-slate-400">This listing has no website, so there is nothing to look up.</p> : (
            <>
              {status.searchConsole && (
                <div>
                  <h4 className="text-sm font-semibold">Search Console</h4>
                  {siteError ? <p className="mt-2 text-sm text-amber-300">{siteError}</p> : !site ? <p className="mt-2 text-sm text-slate-400">Reading Search Console…</p> : site.property === null ? (
                    <p className="mt-2 text-sm text-slate-400">The connected Google login has no Search Console property for {host} (it can see {site.properties} other{site.properties === 1 ? '' : 's'}). Ask the client to add it as a user on theirs.</p>
                  ) : (
                    <>
                      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <Tile label="Clicks from Google Search" now={site.recent.clicks} before={site.before.clicks} />
                        <Tile label="Times shown" now={site.recent.impressions} before={site.before.impressions} />
                        <Tile label="Average position" now={site.recent.position} before={site.before.position} lowerIsBetter digits={1} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{site.periods.recent.from} to {site.periods.recent.to}, against the {site.periods.days} days before · property {site.property}</p>
                      {site.queries.length > 0 && (
                        <>
                          <ul className="mt-3 divide-y divide-slate-800 rounded-lg border border-slate-800">
                            {site.queries.slice(0, 15).map((r) => {
                              const on = picked.includes(r.query);
                              return (
                                <li key={r.query}>
                                  <label className={'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-800/60 ' + (on ? 'bg-emerald-500/5' : '')}>
                                    <input type="checkbox" checked={on} disabled={!on && picked.length >= MAX_PICK} onChange={() => toggle(r.query)} />
                                    <span className="min-w-0 flex-1 truncate text-slate-200">{r.query}</span>
                                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-300">{r.clicks.toLocaleString('en-US')} clicks</span>
                                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-400">{r.impressions.toLocaleString('en-US')} shown</span>
                                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-500">pos {r.position === null ? '–' : r.position.toFixed(1)}</span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                          <div className="mt-3">
                            <a href={picked.length ? scanUrl : undefined} aria-disabled={!picked.length} className={'inline-block rounded-lg px-4 py-2 text-sm font-semibold ' + (picked.length ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'pointer-events-none bg-slate-800 text-slate-500')}>
                              Scan {picked.length || ''} keyword{picked.length === 1 ? '' : 's'} →
                            </a>
                          </div>
                        </>
                      )}
                      <GoogleExplorer source="gsc" website={website} />
                    </>
                  )}
                </div>
              )}

              {status.analytics && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold">Analytics</h4>
                    {properties && properties.length > 0 && (
                      <select className={input + ' max-w-full'} value={property} onChange={(e) => choose(e.target.value)} aria-label="Analytics property">
                        <option value="">Choose the Analytics property for this site…</option>
                        {properties.map((p) => <option key={p.id} value={p.id}>{p.name}{p.account ? ' · ' + p.account : ''}</option>)}
                      </select>
                    )}
                  </div>
                  {analyticsError ? <p className="mt-2 text-sm text-amber-300">{analyticsError}</p> : !properties ? <p className="mt-2 text-sm text-slate-400">Reading Analytics…</p> : properties.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">The connected Google login cannot see any Analytics properties.</p>
                  ) : !property ? <p className="mt-2 text-sm text-slate-400">Pick the property for {host}. The choice is remembered on this computer.</p> : !analytics ? <p className="mt-2 text-sm text-slate-400">Reading Analytics…</p> : (
                    <>
                      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <Tile label="All website visits" now={analytics.all.recent.sessions} before={analytics.all.before.sessions} />
                        <Tile label="Visits from the Google listing" now={analytics.listing.recent.sessions} before={analytics.listing.before.sessions} />
                        <Tile label="Key events from the listing" now={analytics.listing.recent.keyEvents} before={analytics.listing.before.keyEvents} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        “From the Google listing” counts visits tagged <code>{analytics.campaign}</code>, which is what the “Add tracking tag” button puts on the listing’s website link.
                        {analytics.listing.recent.sessions === 0 && analytics.listing.before.sessions === 0 && ' None yet: add the tag to the website link above and the visits start being counted.'}
                      </p>
                      <GoogleExplorer source="ga" property={property} />
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
