'use client';
import { useState } from 'react';
import GbpInsights from '@/components/GbpInsights';
import GoogleSitePanel, { type Dates } from '@/components/GoogleSitePanel';

const PRESETS = [[30, '30 days'], [60, '60 days'], [90, '90 days'], [180, '6 months'], [365, '12 months'], [540, '18 months']] as const;
const field = 'rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-500';

/**
 * One listing's search numbers in one place, all for the same dates: Google's own figures for the
 * listing, Search Console for the page it links to, and Analytics for what those visits did.
 */
export default function SearchInsights({ profile, location, businessName, place, website }: { profile: string; location: string; businessName: string; place: string; website: string }) {
  const [days, setDays] = useState(30);
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Custom dates apply once both are set; until then the last choice stays on screen.
  const dates: Dates = custom && from && to && from <= to ? { from, to } : { days };
  const query = 'from' in dates ? `from=${dates.from}&to=${dates.to}` : `days=${dates.days}`;

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/95 px-3 py-2 backdrop-blur">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dates</span>
        <span role="group" aria-label="Dates" className="inline-flex overflow-hidden rounded-lg border border-slate-700 text-xs">
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
        <span className="ml-auto text-xs text-slate-500">Every figure is set against the same number of days before.</span>
      </div>
      <GbpInsights profile={profile} location={location} businessName={businessName} place={place} range={query} />
      <GoogleSitePanel website={website} businessName={businessName} dates={dates} />
    </div>
  );
}
