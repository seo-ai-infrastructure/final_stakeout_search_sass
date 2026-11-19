'use client';
import { useEffect, useMemo, useState } from 'react';
import { getListed, type CitedSite, type SiteKind } from '@stakeout/core/citeSites';
import type { GridScanData } from '@/components/GeoGridDashboard';

const box = 'rounded-2xl border border-slate-800 bg-slate-900/70 p-5';
const KIND: Record<SiteKind, string> = { directory: 'Directory', reviews: 'Reviews', social: 'Social', community: 'Community', booking: 'Booking' };
/** Ticks are kept on this device, per business, so they carry from one scan of it to the next. */
const keyFor = (business: string) => 'stakeout.getlisted.' + business.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);

function Row({ s, answers, done, onToggle, canTick }: { s: CitedSite; answers: number; done: boolean; onToggle: () => void; canTick: boolean }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      {canTick && <input type="checkbox" checked={done} onChange={onToggle} aria-label={'Listed on ' + s.name} className="mt-1 h-4 w-4 shrink-0 accent-emerald-500" />}
      <div className="min-w-0 flex-1">
        <p className={'text-sm ' + (done ? 'text-slate-500 line-through' : 'text-slate-100')}>
          <span className="font-semibold">{s.name}</span>
          <span className="ml-2 rounded-full border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">{KIND[s.known!.kind]}</span>
        </p>
        <p className="mt-0.5 text-xs text-slate-400">{s.known!.how}. <a href={s.known!.url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">Start here</a></p>
      </div>
      <div className="w-28 shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-slate-200">{s.answers} <span className="text-xs font-normal text-slate-500">of {answers}</span></p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden><div className="h-full rounded-full bg-emerald-500" style={{ width: Math.max(4, s.share) + '%' }} /></div>
      </div>
    </li>
  );
}

/**
 * "Get listed here": the sites Google's AI Overview drew on across this scan's points, as a
 * checklist of the ones a business can add itself to, most cited first. Shown only when the scan
 * saw AI answers with sources.
 */
export default function GetListedCard({ scan, shared }: { scan: GridScanData; shared: boolean }) {
  const list = useMemo(() => getListed(scan.pins, scan.targetDomain), [scan.pins, scan.targetDomain]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const key = keyFor(scan.targetBusiness);
  useEffect(() => {
    if (shared) return;
    try { const v = JSON.parse(localStorage.getItem(key) ?? '[]'); if (Array.isArray(v)) setDone(new Set(v.map(String))); } catch { /* nothing saved */ }
  }, [key, shared]);
  const toggle = (site: string) => setDone((cur) => {
    const next = new Set(cur);
    if (next.has(site)) next.delete(site); else next.add(site);
    try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* not remembered */ }
    return next;
  });

  if (!list.answers || (!list.act.length && !list.others.length)) return null;
  const left = list.act.filter((s) => !done.has(s.site)).length;
  const others = all ? list.others : list.others.slice(0, 8);

  return (
    <div className={box}>
      <h2 className="text-sm font-bold text-white">Get listed where Google’s AI looks</h2>
      <p className="mt-1 text-sm text-slate-300">
        Google’s AI answer named its sources at {list.answers} point{list.answers === 1 ? '' : 's'} of this scan.
        {list.ownAnswers !== null && <> {scan.targetBusiness}’s own website was one of them at {list.ownAnswers}.</>}
        {list.act.length > 0 ? <> These are the sites it drew on that a business can add itself to{!shared && list.act.length > 0 ? `: ${left} still to do` : ''}.</> : ' None of them is a site a business can add itself to.'}
      </p>

      {list.act.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-800">
          {list.act.map((s) => <Row key={s.site} s={s} answers={list.answers} done={done.has(s.site)} onToggle={() => toggle(s.site)} canTick={!shared} />)}
        </ul>
      )}

      {list.others.length > 0 && (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Also cited: other businesses and publishers</p>
          <p className="mt-1 text-xs text-slate-400">These cannot be claimed. A “best of” list or a local news site here is worth asking to be included in; a competitor’s site shows what kind of page Google trusts for this search.</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {others.map((s) => (
              <li key={s.site}><a href={'https://' + s.site} target="_blank" rel="noreferrer nofollow" className="inline-block rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-500">{s.site} <span className="text-slate-500">· {s.answers}</span></a></li>
            ))}
          </ul>
          {list.others.length > 8 && <button type="button" onClick={() => setAll(!all)} className="mt-2 text-xs text-sky-400 hover:underline">{all ? 'Show fewer' : `Show all ${list.others.length}`}</button>}
        </div>
      )}
      {!shared && list.act.length > 0 && <p className="mt-3 text-[11px] text-slate-500">Ticks are remembered on this device for this business.</p>}
    </div>
  );
}
