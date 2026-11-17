'use client';
import type { GridScanData } from './GeoGridDashboard';
import type { SiteKind } from '@/lib/marketInsights';
import { bandOf, reportSummary, verdictFor, type RankBucket, type FindingKind } from '@/lib/reportSummary';
import { RANK_COLORS, rankTextColor } from '@/lib/gridColumns';

/** The rank bands in the map's own colours: the top 3 in green, #4–10 amber, #11 and lower red, not found the darkest red. */
const TONE: Record<RankBucket['key'], string> = { first: RANK_COLORS.top, top3: RANK_COLORS.top, top10: RANK_COLORS.six, beyond: RANK_COLORS.low, absent: RANK_COLORS.none };
const box = 'rounded-2xl border border-slate-800 bg-slate-900/70 p-5';
const num = (n: number | null | undefined, unit = '', digits = 0) => (n == null ? '—' : n.toFixed(digits) + unit);
const VERDICT = {
  strong: { pill: 'bg-emerald-400 text-slate-950', text: 'text-emerald-300' },
  patchy: { pill: 'bg-amber-400 text-slate-950', text: 'text-amber-300' },
  weak: { pill: 'bg-rose-500 text-white', text: 'text-rose-300' },
  none: { pill: 'bg-slate-700 text-slate-200', text: 'text-slate-200' },
} as const;

/** The headline: one large score with a one-word verdict, four supporting numbers, then what it means. */
/** A tag before each cited site, so the list reads as who controls the sources (plain sites get none). */
const SITE_TAG: Partial<Record<SiteKind, { label: string; cls: string }>> = {
  gbp: { label: 'GBP', cls: 'bg-emerald-500/15 text-emerald-300' },
  you: { label: 'Your site', cls: 'bg-sky-500/15 text-sky-300' },
  competitor: { label: 'Competitor', cls: 'bg-rose-500/15 text-rose-300' },
  directory: { label: 'Directory', cls: 'bg-orange-500/15 text-orange-300' },
  forum: { label: 'Forum', cls: 'bg-violet-500/15 text-violet-300' },
};

/** How each kind of finding is labelled. Colour follows meaning: blue is buying power, never a rank. */
const FINDING: Record<FindingKind, { label: string; mark: string; tint: string; ink: string }> = {
  rank: { label: 'Visibility', mark: '#', tint: 'bg-emerald-500/15', ink: 'text-emerald-300' },
  bp: { label: 'Buying power', mark: '$', tint: 'bg-sky-500/15', ink: 'text-sky-300' },
  radius: { label: 'Reach', mark: 'mi', tint: 'bg-slate-500/20', ink: 'text-slate-200' },
  rival: { label: 'Competitor', mark: 'vs', tint: 'bg-rose-500/15', ink: 'text-rose-300' },
  ads: { label: 'Ad pressure', mark: 'Ad', tint: 'bg-orange-500/15', ink: 'text-orange-300' },
  ai: { label: 'AI Overview', mark: 'AI', tint: 'bg-violet-500/15', ink: 'text-violet-300' },
};

export function ReportVerdict({
  scan,
  activeFinding = null,
  onFinding,
}: {
  scan: GridScanData;
  /** The finding whose view is on the map now, and what to do when one is chosen. */
  activeFinding?: FindingKind | null;
  onFinding?: (kind: FindingKind) => void;
}) {
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
              <p className={'mt-1 text-2xl font-bold ' + (label === 'Buying-Power SoLV' ? 'text-sky-300' : 'text-white')}>{value}</p>
              <p className={'text-[11px] ' + (label === 'Buying-Power SoLV' && delta !== null && Math.round(delta) < 0 ? 'font-semibold text-rose-300' : label === 'Buying-Power SoLV' && delta !== null && Math.round(delta) > 0 ? 'font-semibold text-emerald-300' : 'text-slate-500')}>{hint}</p>
            </div>
          ))}
        </div>
      </div>
      {s.findings.length > 0 && (
        <div className={box}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            What this scan shows{onFinding ? ' · select one to see it on the map' : ''}
          </h2>
          <ul className="mt-3 space-y-2">
            {s.findings.map((f, i) => {
              const kind = s.findingKinds[i] ?? 'rank';
              const k = FINDING[kind];
              const active = activeFinding === kind;
              const body = (
                <>
                  <span className={'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold ' + k.tint + ' ' + k.ink}>{k.mark}</span>
                  <span className="min-w-0">
                    <span className={'block text-[11px] font-bold ' + k.ink}>{k.label}</span>
                    <span className="block text-sm leading-relaxed text-slate-200">{f}</span>
                  </span>
                </>
              );
              return (
                <li key={f}>
                  {onFinding ? (
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onFinding(kind)}
                      className={'flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition ' + (active ? 'border-slate-400 bg-slate-800/70' : 'border-slate-800 hover:border-slate-600 hover:bg-slate-800/40')}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-start gap-3 rounded-xl border border-slate-800 p-2.5">{body}</div>
                  )}
                </li>
              );
            })}
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
  // Sits under the map, in a wide column: the distribution on the left, who holds #1 on the right.
  // On a narrow screen the two halves stack.
  return (
    <div className={box + (s.leaders.length > 0 ? ' grid gap-6 md:grid-cols-2' : '')}>
      <div>
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
              className={'min-w-[2.75rem] rounded-lg text-base font-extrabold ' + (band === b.key ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900' : band ? 'opacity-40' : '')}
              style={{ width: b.pct + '%', backgroundColor: TONE[b.key], color: rankTextColor(TONE[b.key]) }}
            >
              {b.count}
            </button>
          ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
        {s.distribution.buckets.map((b) => (
          <li key={b.key} className={'flex items-center gap-2 ' + (b.count ? '' : 'opacity-40')}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: TONE[b.key] }} />
            {b.label}: <strong className="text-white">{b.count}</strong>
          </li>
        ))}
      </ul>
      {band && (
        <button type="button" onClick={() => onBand(null)} className="mt-3 rounded-lg border border-amber-400/60 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-400/10">
          Showing {s.distribution.buckets.find((b) => b.key === band)?.label} points · clear
        </button>
      )}
      </div>
      {s.leaders.length > 0 && (
        <div className="border-t border-slate-800 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
          <h3 className="text-sm font-bold text-white">Who holds #1</h3>
          <p className="mt-1 text-xs text-slate-400">The business ranked first, point by point.</p>
          <ul className="mt-4 space-y-2">
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
          {s.aiNamed.you && (
            <p className="mt-1 text-xs text-violet-300">
              named first at {s.aiNamed.you.first} of {s.aiNamed.lists} · average place #{s.aiNamed.you.avgPos}
            </p>
          )}
        </div>
        <div>
          <p className="text-2xl font-extrabold text-white">{s.ai.sources.length}</p>
          <p className="text-xs text-slate-400">different sources cited across the grid</p>
        </div>
      </div>
      {s.aiGap && (
        <div role="note" className="mt-5 rounded-xl border border-amber-500/50 bg-amber-950/30 p-4">
          <p className="text-sm font-bold text-amber-200">Your Google Business Profile is carrying your AI visibility.</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/90">
            {s.aiGap.own > 0
              ? `Your own website is cited in ${s.aiGap.own} of ${s.aiGap.answers} answers`
              : `Your own website is not cited in any of the ${s.aiGap.answers} answers`}
            , against {s.aiGap.gbp} for your Google profile.
            {s.aiGap.top && ` ${s.aiGap.top.label} is cited in ${s.aiGap.top.points}`}
            {s.aiGap.competitor && s.aiGap.competitor.domain !== s.aiGap.top?.domain && `, and a competitor's website (${s.aiGap.competitor.domain}) in ${s.aiGap.competitor.points}`}
            {s.aiGap.top && '.'}
          </p>
        </div>
      )}
      {s.aiSites.length > 0 && (
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">Websites the AI cited</h3>
      )}
      {s.aiSites.length > 0 && (
        <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {s.aiSites.slice(0, 10).map((x) => (
            <li key={x.domain} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {SITE_TAG[x.kind] && <span className={'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ' + SITE_TAG[x.kind]!.cls}>{SITE_TAG[x.kind]!.label}</span>}
                  <span className={'truncate ' + (x.kind === 'you' ? 'font-bold text-sky-300' : 'text-slate-200')}>{x.label}</span>
                </span>
                <span className="shrink-0 text-slate-400">{x.points} of {s.ai.shown}</span>
              </div>
              <div className="mt-1 h-1.5 rounded bg-slate-800">
                <div className={'h-1.5 rounded ' + (x.kind === 'you' ? 'bg-sky-400' : 'bg-violet-400')} style={{ width: (100 * x.points) / Math.max(1, s.ai.shown) + '%' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {s.aiNamed.rows.length > 0 && (
        <div className="mt-5 border-t border-slate-800 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Businesses the AI named</h3>
          <p className="mt-1 text-xs text-slate-500">
            In the order the AI listed them, across the {s.aiNamed.lists} {s.aiNamed.lists === 1 ? 'answer' : 'answers'} that listed businesses. This is separate from the local rank.
          </p>
          <ol className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {s.aiNamed.rows.slice(0, 10).map((b, i) => (
              <li key={b.name} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={'truncate ' + (b.isYou ? 'font-bold text-emerald-300' : 'text-slate-200')}>
                    <span className="mr-1.5 text-slate-500">{i + 1}.</span>
                    {b.name}
                    {b.isYou ? ' (you)' : ''}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-slate-400">
                    {(() => {
                      // Its place here against its place on the local leaderboard.
                      const d = s.aiVs[i]?.delta ?? null;
                      if (d === null) return <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">not in local top 10</span>;
                      if (d === 0) return <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">same as local</span>;
                      return (
                        <span className={'rounded px-1.5 py-0.5 text-[10px] font-bold ' + (d > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300')}>
                          {d > 0 ? '▲' : '▼'} {Math.abs(d)} in AI
                        </span>
                      );
                    })()}
                    named at {b.points} of {s.aiNamed.lists}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-slate-800">
                  <div className={'h-1.5 rounded ' + (b.isYou ? 'bg-emerald-400' : 'bg-violet-400')} style={{ width: (100 * b.points) / Math.max(1, s.aiNamed.lists) + '%' }} />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {b.first ? `named first at ${b.first}` : 'never named first'} · average place #{b.avgPos}
                </p>
              </li>
            ))}
          </ol>
          {!s.aiNamed.you && <p className="mt-3 text-xs text-amber-300">{scan.targetBusiness} is not in any of these lists.</p>}
        </div>
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
            <video src={p.videoUrl ? p.videoUrl + '#t=6' : undefined} muted playsInline preload="metadata" className="block h-56 w-full bg-black object-cover object-top" aria-label={`Recording of point ${p.rowIdx + 1},${p.colIdx + 1}`} />
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
