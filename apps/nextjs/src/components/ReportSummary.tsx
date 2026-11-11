'use client';
import type { GridScanData } from './GeoGridDashboard';
import { reportSummary, type RankBucket } from '@/lib/reportSummary';

const TONE: Record<RankBucket['key'], string> = { first: 'bg-emerald-400', top3: 'bg-emerald-600', top10: 'bg-amber-400', beyond: 'bg-orange-500', absent: 'bg-rose-500' };
const box = 'rounded-xl border border-slate-800 bg-slate-900/70 p-4';
const num = (n: number | null | undefined, unit = '', digits = 0) => (n == null ? '—' : n.toFixed(digits) + unit);

/** The headline numbers, each with a line of context, then what they mean in plain language. */
export function ReportSummaryTop({ scan }: { scan: GridScanData }) {
  const s = reportSummary(scan);
  const delta = s.standard !== null && s.buyingPower !== null ? s.buyingPower - s.standard : null;
  const tiles: [string, string, string][] = [
    ['SoLV', num(scan.solv, '%'), s.completed ? `top 3 at ${s.top3} of ${s.completed} points` : 'no completed points yet'],
    ['Buying-Power SoLV', num(s.buyingPower, '%'), delta === null ? 'needs neighborhood data' : `${delta >= 0 ? '+' : ''}${delta.toFixed(0)} points against standard SoLV`],
    ['Average rank', num(s.avgRank, '', 1), s.completed ? `where found: ${s.found} of ${s.completed} points` : '—'],
    ['ATRP', num(scan.atrp, '', 1), 'average across every point'],
    ['AI Overview', scan.trackAiOverviews ? num(scan.aioTriggerRate, '%') : '—', scan.trackAiOverviews ? `of points showed one · named in ${num(scan.aioCitationRate, '%')}` : 'AI tracking was off for this scan'],
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map(([label, value, hint]) => (
          <div className={box} key={label}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
            <strong className="mt-1 block text-3xl font-extrabold tracking-tight">{value}</strong>
            <div className="mt-1 text-xs text-slate-400">{hint}</div>
          </div>
        ))}
      </div>
      {s.findings.length > 0 && (
        <div className={box}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">What this scan shows</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-200">
            {s.findings.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Rank distribution, competitor shares and AI Overview coverage for the whole grid. */
export function ReportCharts({ scan }: { scan: GridScanData }) {
  const s = reportSummary(scan);
  if (!s.completed) return null;
  const hasPower = s.owners.some((r) => r.buyingPower !== null);
  const rows = s.owners.slice(0, 7);
  const widest = Math.max(1, ...rows.map((r) => Math.max(r.standard, r.buyingPower ?? 0)));
  const showAi = s.ai.points > 0 && (scan.trackAiOverviews || s.ai.shown > 0);
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className={box}>
        <h2 className="text-sm font-bold text-white">Rank distribution</h2>
        <p className="mt-1 text-xs text-slate-400">Where {scan.targetBusiness} ranked across the {s.completed} completed points.</p>
        <div className="mt-4 flex h-7 w-full overflow-hidden rounded-lg bg-slate-800" role="img" aria-label={s.distribution.buckets.map((b) => `${b.label}: ${b.count}`).join(', ')}>
          {s.distribution.buckets
            .filter((b) => b.count > 0)
            .map((b) => (
              <div key={b.key} className={TONE[b.key] + ' flex items-center justify-center text-[11px] font-bold text-slate-950'} style={{ width: b.pct + '%' }} title={`${b.label}: ${b.count}`}>
                {b.pct >= 9 ? b.count : ''}
              </div>
            ))}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300 sm:grid-cols-3">
          {s.distribution.buckets.map((b) => (
            <li key={b.key} className="flex items-center gap-2">
              <span className={'h-2.5 w-2.5 shrink-0 rounded-sm ' + TONE[b.key]} />
              {b.label}: <strong className="text-white">{b.count}</strong> <span className="text-slate-500">({Math.round(b.pct)}%)</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={box}>
        <h2 className="text-sm font-bold text-white">Competitor share</h2>
        <p className="mt-1 text-xs text-slate-400">
          Share of points where each business is in the top 3{hasPower ? ', beside its share of the grid’s buying power.' : '.'}
        </p>
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => (
            <li key={r.name} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className={'truncate ' + (r.isYou ? 'font-bold text-emerald-300' : 'text-slate-200')}>{r.name}{r.isYou ? ' (you)' : ''}</span>
                <span className="shrink-0 text-slate-400">{Math.round(r.standard)}% of points{r.buyingPower !== null ? ` · ${Math.round(r.buyingPower)}% of buying power` : ''}</span>
              </div>
              <div className="mt-1 h-2 rounded bg-slate-800">
                <div className={'h-2 rounded ' + (r.isYou ? 'bg-emerald-400' : 'bg-slate-400')} style={{ width: (100 * r.standard) / widest + '%' }} />
              </div>
              {r.buyingPower !== null && (
                <div className="mt-1 h-2 rounded bg-slate-800">
                  <div className="h-2 rounded bg-amber-400" style={{ width: (100 * r.buyingPower) / widest + '%' }} />
                </div>
              )}
            </li>
          ))}
        </ul>
        {hasPower && (
          <p className="mt-3 text-[11px] text-slate-500">
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-400" /> top-3 points <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" /> buying power
          </p>
        )}
      </div>

      {showAi && (
        <div className={box + ' lg:col-span-2'}>
          <h2 className="text-sm font-bold text-white">AI Overview coverage</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-2xl font-extrabold text-white">{s.ai.shown} of {s.ai.points}</p>
              <p className="text-xs text-slate-400">points showed an AI Overview ({Math.round((100 * s.ai.shown) / s.ai.points)}%)</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-white">{s.ai.shown ? `${s.ai.youNamed} of ${s.ai.shown}` : '—'}</p>
              <p className="text-xs text-slate-400">of those named {scan.targetBusiness}</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-white">{s.ai.sources.length}</p>
              <p className="text-xs text-slate-400">different sources cited across the grid</p>
            </div>
          </div>
          {s.ai.sources.length > 0 && (
            <ul className="mt-4 space-y-2">
              {s.ai.sources.slice(0, 8).map((x) => (
                <li key={x.domain} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-slate-200">{x.label}</span>
                    <span className="shrink-0 text-slate-400">cited at {x.points} of {s.ai.shown} points</span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-slate-800">
                    <div className="h-2 rounded bg-violet-400" style={{ width: (100 * x.points) / Math.max(1, s.ai.shown) + '%' }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
