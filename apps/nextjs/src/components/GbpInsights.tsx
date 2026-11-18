'use client';
import { useEffect, useMemo, useState } from 'react';
import { METRICS, brandWord, change, scannable, type KeywordRow, type MetricKey, type Totals } from '@stakeout/core/gbpInsights';

type Performance =
  | { kind: 'daily'; to: string; recent: Totals; before: Totals; known: MetricKey[]; daysWithData: number; daysBefore: number; days: number }
  | { kind: 'snapshot'; totals: Totals; known: MetricKey[]; recordedAt: string }
  | { kind: 'none' }
  | { kind: 'problem'; problem: string };
type Insights = { performance: Performance; keywords: { rows: KeywordRow[]; months: string[]; problem: string | null } };

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const monthName = (m: string) => new Date(m + '-15T00:00:00Z').toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const MAX_PICK = 10;

/** The listing's numbers from Google and the searches that showed it, with a way to scan those searches. */
export default function GbpInsights({ profile, location, businessName, place }: { profile: string; location: string; businessName: string; place: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null); setError(''); setPicked([]); setAll(false);
    fetch(`/api/admin/gbp/insights?profile=${encodeURIComponent(profile)}&location=${encodeURIComponent(location)}`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not read the numbers.'); return j as Insights; })
      .then((j) => { if (live) setData(j); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [profile, location]);

  const rows = data?.keywords.rows ?? [];
  const brand = useMemo(() => brandWord(businessName, rows.map((r) => r.keyword), place), [rows, businessName, place]);
  const good = useMemo(() => rows.filter((r) => scannable(r.keyword, brand)), [rows, brand]);
  const shown = all ? rows : rows.slice(0, 12);
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length < MAX_PICK ? [...p, k] : p));
  const scanUrl = '/new-scan?' + new URLSearchParams([['name', businessName], ...picked.map((k) => ['kw', k] as [string, string])]).toString();
  const p = data?.performance;

  return (
    <section className={card + ' space-y-5'}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Performance on Google</h3>
        <span className="text-xs text-slate-500">Google’s own numbers for this listing · read-only</span>
      </div>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!data && !error && <p className="text-sm text-slate-400">Reading Google’s numbers…</p>}

      {p && (p.kind === 'daily' || p.kind === 'snapshot') && (
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {METRICS.filter((m) => p.known.includes(m.key)).map((m) => {
              const now = p.kind === 'daily' ? p.recent[m.key] : p.totals[m.key];
              // A change is only shown when both periods are close to complete: a month Postproxy has half of is not a drop.
              const was = p.kind === 'daily' && p.daysWithData >= p.days - 3 && p.daysBefore >= p.days - 3 ? p.before[m.key] : null;
              const pct = was === null ? null : change(now, was);
              return (
                <div key={m.key} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <p className="text-xs text-slate-400">{m.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-100">{now.toLocaleString('en-US')}</p>
                  <p className={'mt-0.5 text-xs ' + (pct === null ? 'text-slate-600' : pct > 0 ? 'text-emerald-400' : pct < 0 ? 'text-rose-400' : 'text-slate-400')}>
                    {pct === null ? ' ' : (pct > 0 ? '▲ ' : pct < 0 ? '▼ ' : '') + Math.abs(pct) + '% vs the 30 days before (' + (was ?? 0).toLocaleString('en-US') + ')'}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {p.kind === 'daily'
              ? `Last ${p.days} days, to ${p.to}. ${p.daysWithData} of ${p.days} days have data` + (p.daysWithData < p.days - 3 || p.daysBefore < p.days - 3 ? '; the comparison appears once both periods are complete.' : '.')
              : `Google’s trailing 30-day totals, recorded ${new Date(p.recordedAt).toLocaleDateString()}.`}
          </p>
        </div>
      )}
      {p?.kind === 'none' && <p className="text-sm text-slate-400">No performance numbers yet. They are collected about once a day after a profile is connected, so check back tomorrow.</p>}
      {p?.kind === 'problem' && <p className="text-sm text-amber-300">Performance numbers are not available for this listing: {p.problem}</p>}

      {data && (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold">Searches that showed this listing</h4>
            {data.keywords.months.length > 0 && <span className="text-xs text-slate-500">{monthName(data.keywords.months[0])} to {monthName(data.keywords.months[data.keywords.months.length - 1])} · times shown</span>}
          </div>
          {data.keywords.problem ? (
            <p className="mt-2 text-sm text-amber-300">Google gives no search terms for this listing: {data.keywords.problem}</p>
          ) : rows.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">Google reported no searches for the last three months.</p>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-slate-800 rounded-lg border border-slate-800">
                {shown.map((r) => {
                  const ok = scannable(r.keyword, brand);
                  const on = picked.includes(r.keyword);
                  return (
                    <li key={r.keyword}>
                      <label className={'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-800/60 ' + (on ? 'bg-emerald-500/5' : '')}>
                        <input type="checkbox" checked={on} disabled={!on && picked.length >= MAX_PICK} onChange={() => toggle(r.keyword)} />
                        <span className={'min-w-0 flex-1 truncate ' + (ok ? 'text-slate-200' : 'text-slate-500')}>{r.keyword}</span>
                        {!ok && <span className="shrink-0 text-[11px] text-slate-600">search for the business by name, or a job search</span>}
                        <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-400" title="Times shown in the latest month it appeared">{r.latest} <span className="text-slate-600">latest</span></span>
                        <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-300" title="Total times shown across the months listed; searches Google only reports as fewer than 15 count as 0">{r.exact ? r.total.toLocaleString('en-US') + ' total' : ''}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a href={picked.length ? scanUrl : undefined} aria-disabled={!picked.length} className={'rounded-lg px-4 py-2 text-sm font-semibold ' + (picked.length ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'pointer-events-none bg-slate-800 text-slate-500')}>
                  Scan {picked.length || ''} keyword{picked.length === 1 ? '' : 's'} →
                </a>
                <button type="button" onClick={() => setPicked(good.slice(0, 5).map((r) => r.keyword))} disabled={!good.length} className="text-sm text-sky-400 hover:underline disabled:opacity-40">Pick the top 5 customer searches</button>
                {rows.length > 12 && <button type="button" onClick={() => setAll((v) => !v)} className="text-sm text-slate-400 hover:text-slate-200">{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
                {picked.length >= MAX_PICK && <span className="text-xs text-slate-500">Up to {MAX_PICK} at a time.</span>}
              </div>
              <p className="mt-2 text-xs text-slate-500">Opens New scan with these keywords filled in. “&lt;15” means Google only says the search showed the listing fewer than 15 times that month.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
