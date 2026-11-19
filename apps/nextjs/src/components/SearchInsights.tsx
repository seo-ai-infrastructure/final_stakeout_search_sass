'use client';
import { useState, type ReactNode } from 'react';
import GbpInsights from '@/components/GbpInsights';
import GoogleSitePanel, { type Dates } from '@/components/GoogleSitePanel';
import { Segmented } from '@/components/InsightBits';

const PRESETS = [[7, '7 days'], [30, '30 days'], [60, '60 days'], [90, '90 days'], [180, '6 months'], [365, '12 months'], [540, '18 months']] as const;
const field = 'rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-500';

/**
 * One listing's search numbers in one place, all for the same dates: Google's own figures for the
 * listing, Search Console for the page it links to, and Analytics for what those visits did.
 */
export default function SearchInsights({ profile, location, businessName, place, website, above, below, onUnlock, wholeSite, onOpen }: { /** The listing, when there is one: without it only the website's numbers are shown. */ profile?: string; location?: string; businessName: string; place: string; website: string; /** Shown where the listing's numbers would be. */ above?: ReactNode; /** Shown after Search Console, before Analytics. */ below?: ReactNode; /** No listing on a plan: Search Console offers the way to one, with the account's own numbers. */ onUnlock?: () => void; /** Start Search Console on the whole website instead of one page. */ wholeSite?: boolean; /** Opens another part of the listing (its reviews, its editor) from the readiness strip. */ onOpen?: (what: 'reviews' | 'edit') => void }) {
  const [days, setDays] = useState(30);
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Custom dates apply once both are set; until then the last choice stays on screen.
  const [against, setAgainst] = useState<'previous' | 'year'>('previous');
  const chosen = custom && from && to && from <= to ? { from, to } : { days };
  const dates: Dates = against === 'year' ? { ...chosen, compare: 'year' } : chosen;
  const query = ('from' in chosen ? `from=${chosen.from}&to=${chosen.to}` : `days=${chosen.days}`) + (against === 'year' ? '&compare=year' : '');

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/95 px-3 py-2 backdrop-blur">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dates</span>
        <span role="group" aria-label="Dates" className="inline-flex max-w-full overflow-x-auto whitespace-nowrap rounded-lg border border-slate-700 text-xs">
          {PRESETS.map(([d, label]) => (
            <button key={d} type="button" aria-pressed={!custom && days === d} onClick={() => { setCustom(false); setDays(d); }} className={'px-2.5 py-1.5 ' + (!custom && days === d ? 'bg-slate-700 font-semibold text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')}>{label}</button>
          ))}
          <button type="button" aria-pressed={custom} onClick={() => setCustom(true)} className={'px-2.5 py-1.5 ' + (custom ? 'bg-slate-700 font-semibold text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')}>Custom</button>
        </span>
        {custom && (
          <>
            <input type="date" aria-label="From" className={field} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-xs text-slate-500">to</span>
            <input type="date" aria-label="To" className={field} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            {(!from || !to) && <span className="text-xs text-slate-500">Set both dates.</span>}
          </>
        )}
        <Segmented label="Compare with" value={against} onChange={setAgainst} options={[['previous', 'vs previous period'], ['year', 'vs last year']] as const} />
        <nav aria-label="Jump to" className="ml-auto flex items-center gap-1 text-xs">
          {([['insights-listing', 'Listing'], ['insights-search', 'Search Console'], ['insights-analytics', 'Analytics']] as const).filter(([id]) => id !== 'insights-listing' || Boolean(profile && location)).map(([id, text]) => (
            <a key={id} href={'#' + id} className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">{text}</a>
          ))}
        </nav>
      </div>
      {profile && location ? <div id="insights-listing" className="scroll-mt-16"><GbpInsights profile={profile} location={location} businessName={businessName} place={place} range={query} onOpen={onOpen} /></div> : above}
      <GoogleSitePanel website={website} businessName={businessName} dates={dates} wholeSite={wholeSite} between={below} onUnlock={onUnlock} />
    </div>
  );
}
