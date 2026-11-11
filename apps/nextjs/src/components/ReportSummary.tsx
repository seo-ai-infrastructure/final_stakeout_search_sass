'use client';
import type { GridScanData } from './GeoGridDashboard';
import { bandOf, reportSummary, verdictFor, type RankBucket } from '@/lib/reportSummary';

/** One colour language across the report: green is the business, gold is buying power, grey is competitors. */
const TONE: Record<RankBucket['key'], string> = { first: 'bg-emerald-300', top3: 'bg-emerald-500', top10: 'bg-amber-400', beyond: 'bg-orange-500', absent: 'bg-rose-500' };
const box = 'rounded-2xl border border-slate-800 bg-slate-900/70 p-5';
const num = (n: number | null | undefined, unit = '', digits = 0) => (n == null ? '—' : n.toFixed(digits) + unit);
const VERDICT = {
  strong: { pill: 'bg-emerald-400 text-slate-950', text: 'text-emerald-300' },
  patchy: { pill: 'bg-amber-400 text-slate-950', text: 'text-amber-300' },
  weak: { pill: 'bg-rose-500 text-white', text: 'text-rose-300' },
  none: { pill: 'bg-slate-700 text-slate-200', text: 'text-slate-200' },
} as const;

/** The headline: one large score with a one-word verdict, four supporting numbers, then what it means. */
export function ReportVerdict({ scan }: { scan: GridScanData }) {
  const s = reportSummary(scan);
  const v = verdictFor(s.completed ? scan.solv : null);
  const tone = VERDICT[v.tone];
  const delta = s.standard !== null && s.buyingPower !== null ? s.buyingPower - s.standard : null;
  const tiles: [string, string, string][] = [
    ['Buying-Power SoLV', num(s.buyingPower, '%'), delta === null ? 'needs neighborhood data' : Math.round(delta) === 0 ? 'same as SoLV' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)} against SoLV`],
    ['Average rank', num(s.avgRank, '', 1), s.completed ? `found at ${s.found} of ${s.completed}` : '—'],
    ['Winning radius', s.radiusMiles === null ? '—' : s.radiusMiles.toFixed(1) + ' mi', 'top 3 holds this far out'],
    ['Ads above you', num(s.adsAboveYou, '', 1), 'on average, per point'],
  ];
  return (
    <div className="space-y-4">
      <div className={box}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Share of local voice</p>
          <span className={'rounded-full px-3 py-1 text-xs font-bold ' + tone.pill}>{v.label}</span>
        </div>
        <p className={'mt-2 text-7xl font-extrabold leading-none tracking-tight ' + tone.text}>{num(s.completed ? scan.solv : null, '%')}</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {s.completed ? (
            <>
              In the top 3 at <span className="font-bold text-white">{s.top3} of {s.completed} points</span>, and #1 at {s.distribution.buckets[0].count}.
            </>
          ) : (
            'No completed points yet.'
          )}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {tiles.map(([label, value, hint]) => (
            <div key={label} className="rounded-xl border border-slate-800 p-3">
              <p className="text-xs text-slate-400">{label}</p>
              <p className={'mt-1 text-2xl font-bold ' + (label === 'Buying-Power SoLV' ? 'text-amber-300' : 'text-white')}>{value}</p>
              <p className="text-[11px] text-slate-500">{hint}</p>
            </div>
          ))}
        </div>
      </div>
      {s.findings.length > 0 && (
        <div className={box}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">What this scan shows</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-200">
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

/** Rank distribution: each band is a button that shows its points on the map. Then who holds #1. */
export function RankDistributionCard({
  scan,
  band,
  onBand,
}: {
  scan: GridScanData;
  band: RankBucket['key'] | null;
  onBand: (b: RankBucket['key'] | null) => void;
}) {
  const s = reportSummary(scan);
  if (!s.completed) return null;
  return (
    <div className={box}>
      <h2 className="text-sm font-bold text-white">Rank distribution</h2>
      <p className="mt-1 text-xs text-slate-400">Select a band to show its points on the map.</p>
      <div className="mt-4 flex h-12 w-full gap-0.5">
        {s.distribution.buckets
          .filter((b) => b.count > 0)
          .map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => onBand(band === b.key ? null : b.key)}
              aria-pressed={band === b.key}
              aria-label={`${b.label}: ${b.count} points`}
              title={`${b.label}: ${b.count} points`}
              className={TONE[b.key] + ' min-w-[2.75rem] rounded-lg text-base font-extrabold text-slate-950 ' + (band === b.key ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900' : band ? 'opacity-40' : '')}
              style={{ width: b.pct + '%' }}
            >
              {b.count}
            </button>
          ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
        {s.distribution.buckets.map((b) => (
          <li key={b.key} className={'flex items-center gap-2 ' + (b.count ? '' : 'opacity-40')}>
            <span className={'h-2.5 w-2.5 shrink-0 rounded-sm ' + TONE[b.key]} />
            {b.label}: <strong className="text-white">{b.count}</strong>
          </li>
        ))}
      </ul>
      {band && (
        <button type="button" onClick={() => onBand(null)} className="mt-3 rounded-lg border border-amber-400/60 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-400/10">
          Showing {s.distribution.buckets.find((b) => b.key === band)?.label} points · clear
        </button>
      )}
      {s.leaders.length > 0 && (
        <div className="mt-5 border-t border-slate-800 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Who holds #1</h3>
          <ul className="mt-2 space-y-2">
            {s.leaders.slice(0, 6).map((l) => (
              <li key={l.name} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={'truncate ' + (l.isYou ? 'font-bold text-emerald-300' : 'text-slate-200')}>{l.name}{l.isYou ? ' (you)' : ''}</span>
                  <span className="shrink-0 text-slate-400">{l.points} of {s.completed}</span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-slate-800">
                  <div className={'h-1.5 rounded ' + (l.isYou ? 'bg-emerald-400' : 'bg-slate-400')} style={{ width: (100 * l.points) / s.completed + '%' }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** AI Overview coverage across the grid: how often one appeared, how often the business was named, and the sources. */
export function AiCoverageCard({ scan }: { scan: GridScanData }) {
  const s = reportSummary(scan);
  if (!s.completed || !s.ai.points || !(scan.trackAiOverviews || s.ai.shown > 0)) return null;
  if (s.ai.shown === 0)
    return (
      <div className={box}>
        <h2 className="text-sm font-bold text-white">AI Overview coverage</h2>
        <p className="mt-1 text-sm text-slate-300">No AI Overview appeared at any of the {s.ai.points} points checked for this keyword.</p>
      </div>
    );
  return (
    <div className={box}>
      <h2 className="text-sm font-bold text-white">AI Overview coverage</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-2xl font-extrabold text-white">{s.ai.shown} of {s.ai.points}</p>
          <p className="text-xs text-slate-400">points showed an AI Overview ({Math.round((100 * s.ai.shown) / s.ai.points)}%)</p>
        </div>
        <div>
          <p className="text-2xl font-extrabold text-white">{s.ai.youNamed} of {s.ai.shown}</p>
          <p className="text-xs text-slate-400">of those named {scan.targetBusiness}</p>
        </div>
        <div>
          <p className="text-2xl font-extrabold text-white">{s.ai.sources.length}</p>
          <p className="text-xs text-slate-400">different sources cited across the grid</p>
        </div>
      </div>
      {s.ai.sources.length > 0 && (
        <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {s.ai.sources.slice(0, 8).map((x) => (
            <li key={x.domain} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-slate-200">{x.label}</span>
                <span className="shrink-0 text-slate-400">{x.points} of {s.ai.shown} points</span>
              </div>
              <div className="mt-1 h-1.5 rounded bg-slate-800">
                <div className="h-1.5 rounded bg-violet-400" style={{ width: (100 * x.points) / Math.max(1, s.ai.shown) + '%' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Three of the scan's own recordings on the front page: its best, middle and worst points. */
export function ProofStrip({ scan, onOpen }: { scan: GridScanData; onOpen: (pinId: string) => void }) {
  const withVideo = scan.pins
    .filter((p) => p.status === 'COMPLETED' && p.videoUrl)
    .sort((a, b) => (a.rankFound ?? 99) - (b.rankFound ?? 99));
  if (!withVideo.length) return null;
  const picks = [...new Map([withVideo[0], withVideo[Math.floor(withVideo.length / 2)], withVideo[withVideo.length - 1]].map((p) => [p.id, p])).values()];
  const label = ['Best point', 'A typical point', 'Weakest point'];
  return (
    <section className={box} aria-label="What the phone saw">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white">What the phone saw</h2>
          <p className="mt-1 text-xs text-slate-400">Every point has its own screen recording and receipt. These are from this scan.</p>
        </div>
        <button type="button" onClick={() => onOpen(picks[0].id)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">
          All {withVideo.length} recordings
        </button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {picks.map((p, i) => (
          <figure key={p.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <video src={p.videoUrl ?? undefined} muted playsInline preload="metadata" className="block h-56 w-full bg-black object-cover object-top" aria-label={`Recording of point ${p.rowIdx + 1},${p.colIdx + 1}`} />
            <figcaption className="flex items-center justify-between gap-2 p-3 text-xs">
              <span className="text-slate-300">
                <span className="font-bold text-white">{picks.length === 3 ? label[i] : 'Point'}</span> · {p.rowIdx + 1},{p.colIdx + 1} · {p.rankFound == null ? 'not found' : 'rank #' + p.rankFound}
              </span>
              <button type="button" onClick={() => onOpen(p.id)} className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1.5 font-semibold text-slate-200 hover:bg-slate-800">
                Open evidence
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export { bandOf };
