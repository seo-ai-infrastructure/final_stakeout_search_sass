'use client';
/**
 * The AI Overview in three parts, for the report: Position 0 (the opening answer), the business
 * cards (the AI Overview's own list of businesses) and websites cited anywhere else. Every number
 * is worked out from this scan's points (aiVisibility); Snapshot opens the real page Google served
 * at the point where a business scored most, when that page was saved.
 */
import { useEffect, useMemo, useState } from 'react';
import { aiVisibility, normName, type AiTrend, type AiVisRow, type AiVisibility } from '@stakeout/core/aiVisibility';
import { kgmidOf } from '@stakeout/core/businessIds';
import type { GridPinData, GridScanData } from './GeoGridDashboard';
import { AiView, usePinEvidence } from './EvidencePanel';
import { gridSide } from './PinEvidenceCard';
import { OutlinePicker, SavedPageFrame, type Outline } from './SavedPage';

type Part = 'all' | 'p0' | 'card' | 'web';
const PART = {
  p0: { label: 'Position 0', max: 50, bar: 'bg-amber-400', text: 'text-amber-300', ring: 'ring-amber-400/60 border-amber-400', dot: 'bg-amber-400' },
  card: { label: 'Business cards', max: 35, bar: 'bg-violet-500', text: 'text-violet-300', ring: 'ring-violet-400/60 border-violet-400', dot: 'bg-violet-500' },
  web: { label: 'Websites', max: 15, bar: 'bg-cyan-400', text: 'text-cyan-300', ring: 'ring-cyan-400/60 border-cyan-400', dot: 'bg-cyan-400' },
} as const;
const box = 'rounded-2xl border border-slate-800 bg-slate-900/70 p-5';
const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const pct = (n: number) => Math.round(n * 100) + '%';
const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** A business's change since the last scan of this search: an arrow only when beyond normal AI variation. */
function Change({ t, since, full }: { t?: AiTrend; since?: string; full?: boolean }) {
  if (!t || !since) return null;
  const when = 'since ' + day(since);
  const why = `Change ${t.delta >= 0 ? '+' : ''}${f1(t.delta)} since the scan of ${day(since)} (${t.method === 'paired' ? 'point to point over the same grid' : 'grid averages'}); normal AI variation here: ±${f1(t.threshold)}`;
  if (t.trend === 'flat')
    return (
      <span className="rounded border border-slate-800 px-2 py-0.5 text-[11px] text-slate-400" title={why} suppressHydrationWarning>
        {full ? `No real change ${when}` : '≈ ' + when}
      </span>
    );
  const up = t.trend === 'up';
  return (
    <span
      className={'rounded border px-2 py-0.5 text-[11px] font-semibold ' + (up ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/40 bg-rose-500/10 text-rose-300')}
      title={why}
      suppressHydrationWarning
    >
      {up ? '▲' : '▼'} {f1(Math.abs(t.delta))} {when}
    </span>
  );
}

export function AiVisibilitySection({ scan, shareToken }: { scan: GridScanData; shareToken?: string }) {
  const v = useMemo(
    () => aiVisibility(scan.pins, { name: scan.targetBusiness, kgmid: scan.targetKgmid ?? null, domain: scan.targetDomain ?? null }),
    [scan.pins, scan.targetBusiness, scan.targetKgmid, scan.targetDomain],
  );
  const [part, setPart] = useState<Part>('all');
  const [explain, setExplain] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [snap, setSnap] = useState<AiVisRow | null>(null);
  const done = scan.pins.filter((p) => p.status === 'COMPLETED').length;
  if (!done || !(scan.trackAiOverviews || v.withAi > 0 || v.unread > 0)) return null;

  const you = v.you;
  const N = v.points;
  const sorted = [...v.rows].sort((a, b) => (part === 'all' ? b.score - a.score : b[part] - a[part] || b.score - a.score));
  const list = showAll ? sorted : sorted.slice(0, 10);
  const youAt = sorted.findIndex((r) => r.you);
  const youShown = list.some((r) => r.you);
  const inAi = (r: AiVisRow) => Object.values(r.pins).filter((x) => x > 0).length;

  return (
    <section aria-label="AI Overview visibility" className={box}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white">AI Overview visibility</h2>
          <p className="mt-1 text-xs text-slate-400">
            Where {scan.targetBusiness} stands in Google&apos;s AI Overview for &ldquo;{scan.keyword}&rdquo;, in three parts, out of 100 at each point and averaged over{' '}
            <span className="font-semibold text-slate-200">{plural(N, 'point')}</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExplain(!explain)}
          aria-expanded={explain}
          className="min-h-[36px] rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800"
        >
          How the score works
        </button>
      </div>

      {explain && <Explainer N={N} unread={v.unread} />}

      {v.withAi === 0 ? (
        <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
          {N > 0
            ? `No AI Overview appeared at any of the ${N} points for this keyword.`
            : `The AI Overviews at these points could not be read in parts, so they are not scored here.`}
          {v.unread > 0 && N > 0 ? ` ${plural(v.unread, 'more answer')} could not be read in parts and ${v.unread === 1 ? 'is' : 'are'} left out.` : ''}
        </p>
      ) : (
        <>
          {/* The three headline numbers. */}
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Kpi title="AI Overview shown">
              <p className="text-2xl font-extrabold text-white">
                {v.withAi} <span className="text-base font-bold text-slate-400">of {N}</span>
              </p>
              <p className="mt-1 text-xs text-slate-400">
                points showed one · {plural(v.rows.length, 'business', 'businesses')} and {plural(v.websites.length + v.directories.length, 'website')} in its answers
              </p>
              {v.unread > 0 && <p className="mt-1 text-[11px] text-slate-500">{plural(v.unread, 'more answer')} could not be read in parts and {v.unread === 1 ? 'is' : 'are'} left out.</p>}
            </Kpi>
            <Kpi title="Your AI visibility" tone={you.score > 0 ? 'good' : 'bad'}>
              <p className={'text-2xl font-extrabold ' + (you.score > 0 ? 'text-emerald-300' : 'text-rose-300')}>
                {f1(you.score)} <span className="text-base font-bold text-slate-400">/ 100</span>
                {you.score > 0 && N > 1 && <span className="ml-2 align-middle text-xs font-semibold text-slate-400">±{f1(you.moe)}</span>}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                In the AI Overview at <span className="font-semibold text-slate-200">{inAi(you)} of {N}</span> points · {pct(you.share)} AI share of voice
              </p>
              {scan.aiTrend && (
                <p className="mt-1.5">
                  <Change t={scan.aiTrend.rows.you} since={scan.aiTrend.since} full />
                </p>
              )}
            </Kpi>
            <Kpi title="Recommended beyond the local results">
              {v.beyondLocal.length ? (
                <>
                  <p className="text-2xl font-extrabold text-white">{plural(v.beyondLocal.length, 'business', 'businesses')}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Recommended where they are not in the local top 10:{' '}
                    {v.beyondLocal
                      .slice(0, 2)
                      .map((r) => `${r.name} at ${plural(r.beyondLocal, 'point')}`)
                      .join(', ')}
                    {v.beyondLocal.length > 2 ? `, and ${v.beyondLocal.length - 2} more` : ''}.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-extrabold text-white">None</p>
                  <p className="mt-1 text-xs text-slate-400">Every business the AI recommends here is also in the local top 10 at those points.</p>
                </>
              )}
            </Kpi>
          </div>

          {/* The three parts: your points in each, and who leads it. Each filters the list below. */}
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <PartCard
              k="p0"
              active={part === 'p0'}
              onClick={() => setPart(part === 'p0' ? 'all' : 'p0')}
              you={you.p0}
              pins={you.p0Pins}
              N={N}
              what="Named in the opening answer, linked to its Google profile (usually with its phone), or its website cited there."
              lines={[
                ['Named first', `${you.p0First} of ${N} points`],
                ['With your phone', `${you.p0Phone} of ${N} points`],
                ['Leader', v.leaders.p0 ? `${v.leaders.p0.name}${v.leaders.p0.you ? ' (you)' : ''} · ${v.leaders.p0.p0Pins} of ${N}` : 'Nobody named here'],
              ]}
            />
            <PartCard
              k="card"
              active={part === 'card'}
              onClick={() => setPart(part === 'card' ? 'all' : 'card')}
              you={you.card}
              pins={you.cardPins}
              N={N}
              what="A business card in the AI Overview's own list: name, rating, Call, Directions and Website. The higher the card, the more it is worth."
              lines={[
                ['Your average card', you.cardAvgSlot != null ? '#' + f1(you.cardAvgSlot).replace(/\.0$/, '') : 'none'],
                [
                  'Above “Show more”',
                  !v.foldMeasured
                    ? 'not measured for this scan'
                    : you.cardAbove + you.cardBehind
                      ? `${you.cardAbove} of ${you.cardAbove + you.cardBehind} of your cards`
                      : `measured at ${v.foldPins} of ${N} points`,
                ],
                ['Leader', v.leaders.card ? `${v.leaders.card.name}${v.leaders.card.you ? ' (you)' : ''} · ${v.leaders.card.cardPins} of ${N}` : 'No cards here'],
              ]}
            />
            <PartCard
              k="web"
              active={part === 'web'}
              onClick={() => setPart(part === 'web' ? 'all' : 'web')}
              you={you.web}
              pins={you.webPins}
              N={N}
              what="Its website cited anywhere else in the answer: not in the opening answer and not inside its own card."
              lines={[
                ['Your website', you.domains.length ? `${you.domains[0]} · ${you.webPins} of ${N}` : 'not given for this scan'],
                ['Most cited website', v.leaders.web ? `${v.leaders.web.domain} · ${v.leaders.web.pins} of ${N}` : 'none'],
              ]}
            />
          </div>

          <Message v={v} scan={scan} />

          {/* Every business the AI Overview credited, best first (or by the part picked). */}
          <div className="mt-5 overflow-hidden rounded-xl border border-slate-800">
            <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/40 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Businesses in the AI Overview</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Out of 100: <span className="text-amber-300">Position 0 (50)</span> + <span className="text-violet-300">business card (35)</span> +{' '}
                  <span className="text-cyan-300">website (15)</span>, averaged over {plural(N, 'point')}.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Order by">
                {(
                  [
                    ['all', 'All three'],
                    ['p0', 'Position 0'],
                    ['card', 'Cards'],
                    ['web', 'Websites'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={part === k}
                    onClick={() => setPart(k)}
                    className={
                      'min-h-[32px] rounded-lg border px-2.5 text-xs font-semibold ' +
                      (part === k ? (k === 'all' ? 'border-slate-500 bg-slate-800 text-white' : PART[k].ring + ' bg-slate-800 ' + PART[k].text) : 'border-slate-800 text-slate-400 hover:text-slate-200')
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {!youShown && (
              <div className="border-b border-slate-800">
                <Row r={you} N={N} part={part} rank={youAt >= 0 ? youAt + 1 : null} onSnapshot={you.bestPin ? () => setSnap(you) : null} trend={scan.aiTrend} />
              </div>
            )}
            <ol className="divide-y divide-slate-800">
              {list.map((r, i) => (
                <li key={r.key}>
                  <Row r={r} N={N} part={part} rank={i + 1} onSnapshot={r.bestPin ? () => setSnap(r) : null} trend={scan.aiTrend} />
                </li>
              ))}
            </ol>
            {sorted.length > 10 && (
              <button type="button" onClick={() => setShowAll(!showAll)} className="w-full border-t border-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800/50">
                {showAll ? 'Show the top 10' : `Show all ${sorted.length}`}
              </button>
            )}
          </div>

          <Sites v={v} N={N} />
        </>
      )}

      {snap && <Snapshot row={snap} scan={scan} shareToken={shareToken} onClose={() => setSnap(null)} />}
    </section>
  );
}

function Kpi({ title, tone, children }: { title: string; tone?: 'good' | 'bad'; children: React.ReactNode }) {
  const border = tone === 'good' ? 'border-emerald-500/30' : tone === 'bad' ? 'border-rose-500/30' : 'border-slate-800';
  return (
    <div className={'min-w-0 rounded-xl border bg-slate-950/40 p-4 ' + border}>
      <p className="text-xs text-slate-400">{title}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function PartCard(props: { k: 'p0' | 'card' | 'web'; active: boolean; onClick: () => void; you: number; pins: number; N: number; what: string; lines: [string, string][] }) {
  const p = PART[props.k];
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={'min-w-0 rounded-xl border bg-slate-950/40 p-4 text-left transition-colors ' + (props.active ? 'ring-1 ' + p.ring : 'border-slate-800 hover:border-slate-600')}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={'text-xs font-bold uppercase tracking-wider ' + p.text}>
            {p.label} <span className="font-semibold normal-case tracking-normal text-slate-500">· up to {p.max}</span>
          </p>
        </div>
        <div className="text-right">
          <p className={'text-xl font-extrabold ' + p.text}>
            {f1(props.you)} <span className="text-xs font-semibold text-slate-500">/ {p.max}</span>
          </p>
          <p className="text-[11px] text-slate-400">
            {props.pins} of {props.N} points
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{props.what}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
        <div className={'h-full rounded-full ' + p.bar} style={{ width: Math.min(100, (100 * props.you) / p.max) + '%' }} />
      </div>
      <dl className="mt-3 space-y-1 border-t border-slate-800 pt-3 text-xs">
        {props.lines
          .filter(([, val]) => val)
          .map(([label, val]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="shrink-0 text-slate-400">{label}</dt>
              <dd className="truncate text-right font-medium text-slate-200" title={val}>
                {val}
              </dd>
            </div>
          ))}
      </dl>
    </button>
  );
}

/** What the numbers say, in a sentence or two, and the one part where there is most to gain. */
function Message({ v, scan }: { v: AiVisibility; scan: GridScanData }) {
  const you = v.you;
  const lead = v.rows[0];
  const N = v.points;
  const rank = v.rows.findIndex((r) => r.you);
  let tone: 'good' | 'warn' | 'info', title: string, body: string;
  if (!lead) {
    tone = 'info';
    title = 'The AI Overview named no business at these points.';
    body = 'Its answers were general advice, without business cards or businesses named in the opening answer.';
  } else if (you.score === 0) {
    tone = 'warn';
    title = `${scan.targetBusiness} is not in the AI Overview at any of the ${N} points.`;
    body = `${lead.name} leads with ${f1(lead.score)} of 100${lead.beyondLocal >= 2 ? `, recommended at ${lead.beyondLocal} points where it is not in the local top 10` : ''}.`;
  } else if (rank === 0) {
    tone = 'good';
    const next = v.rows[1];
    title = `${scan.targetBusiness} leads the AI Overview for this keyword: ${f1(you.score)} of 100.`;
    body = next ? `Next is ${next.name} with ${f1(next.score)}${you.score - next.score <= you.moe + next.moe ? ', within the range a rescan can move' : ''}.` : 'No other business scored here.';
  } else {
    tone = 'info';
    title = `${scan.targetBusiness} is #${rank + 1} in the AI Overview: ${f1(you.score)} of 100.`;
    body = `${lead.name} leads with ${f1(lead.score)}.`;
  }
  // The part with most to gain, in facts from this scan.
  let next = '';
  if (lead) {
    if (you.p0Pins === 0 && v.leaders.p0 && !v.leaders.p0.you)
      next = `Position 0: the opening answer named ${v.leaders.p0.name} at ${v.leaders.p0.p0Pins} of ${N} points and has not named you.`;
    else if (you.cardPins < N / 2 && v.leaders.card && !v.leaders.card.you)
      next = `Business cards: you have one at ${you.cardPins} of ${N} points; ${v.leaders.card.name} has one at ${v.leaders.card.cardPins}.`;
    else if (you.webPins === 0 && v.leaders.web && v.leaders.web.ownerKey !== you.key)
      next = `Websites: ${you.domains[0] ?? 'your website'} is not cited outside your card; ${v.leaders.web.domain} is cited at ${v.leaders.web.pins} of ${N} points.`;
  }
  const style = tone === 'good' ? 'border-emerald-500/30 bg-emerald-950/20' : tone === 'warn' ? 'border-amber-500/30 bg-amber-950/20' : 'border-slate-700 bg-slate-950/40';
  return (
    <div className={'mt-4 rounded-xl border p-4 ' + style} role="status">
      <p className={'text-sm font-semibold ' + (tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-slate-100')}>{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">{body}</p>
      {next && (
        <p className="mt-1.5 text-xs text-slate-400">
          <span className="font-semibold text-slate-200">Most to gain · </span>
          {next}
        </p>
      )}
    </div>
  );
}

function Row({
  r,
  N,
  part,
  rank,
  onSnapshot,
  trend,
}: {
  r: AiVisRow;
  N: number;
  part: Part;
  rank: number | null;
  onSnapshot: (() => void) | null;
  trend?: GridScanData['aiTrend'];
}) {
  const dim = (k: 'p0' | 'card' | 'web') => (part !== 'all' && part !== k ? ' opacity-25' : '');
  return (
    <div className={'p-4 ' + (r.you ? 'bg-emerald-950/20' : '')}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="w-6 shrink-0 text-sm font-bold text-slate-500">{rank != null ? rank + '.' : '–'}</span>
          <span className={'text-sm font-semibold ' + (r.you ? 'text-emerald-300' : 'text-white')}>
            {r.name}
            {r.you ? ' (you)' : ''}
          </span>
          {r.twin && <span className="text-[11px] text-slate-500">another listing with this name{r.kgmid ? ' · ' + r.kgmid : ''}</span>}
          {r.domains.length > 0 && (
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-cyan-300" title="Websites counted as this business's own">
              {r.domains.join(' · ')}
            </span>
          )}
          {r.beyondLocal >= 2 ? (
            <span className="rounded border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-200">
              Recommended beyond the local top 10 · {r.beyondLocal} of {r.aiPins} points
            </span>
          ) : r.localAvg != null ? (
            <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">local average #{f1(r.localAvg).replace(/\.0$/, '')}</span>
          ) : null}
          {rank == null && r.score === 0 && <span className="rounded border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-200">Not in the AI Overview</span>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-lg font-extrabold text-white">
            {f1(r.score)} <span className="text-xs font-normal text-slate-400">of 100</span>
          </span>
          {N > 1 && r.score > 0 && <span className="text-[11px] text-slate-500">±{f1(r.moe)}</span>}
          <Change t={trend?.rows[r.stable]} since={trend?.since} />
          <span className="rounded border border-slate-800 px-2 py-0.5 text-[11px] text-slate-300" title="AI share of voice: its part of all the points in these answers">
            {pct(r.share)} share
          </span>
          {onSnapshot && (
            <button type="button" onClick={onSnapshot} className="min-h-[32px] rounded-lg border border-slate-700 px-2.5 text-xs font-semibold text-slate-200 hover:border-violet-400 hover:text-violet-200">
              Snapshot
            </button>
          )}
        </div>
      </div>
      {/* Its score in three colours, on the same 0 to 100 scale for every business. */}
      <div className="mt-2.5 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-slate-800" role="img" aria-label={`Position 0 ${f1(r.p0)}, business cards ${f1(r.card)}, websites ${f1(r.web)}, of 100`}>
        {r.p0 > 0 && <div className={'h-full rounded-full ' + PART.p0.bar + dim('p0')} style={{ width: r.p0 + '%' }} title={`Position 0: ${f1(r.p0)} of 50`} />}
        {r.card > 0 && <div className={'h-full rounded-full ' + PART.card.bar + dim('card')} style={{ width: r.card + '%' }} title={`Business cards: ${f1(r.card)} of 35`} />}
        {r.web > 0 && <div className={'h-full rounded-full ' + PART.web.bar + dim('web')} style={{ width: r.web + '%' }} title={`Websites: ${f1(r.web)} of 15`} />}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <i className={'h-2 w-2 rounded-full ' + PART.p0.dot} aria-hidden="true" />
          <b className="font-semibold text-amber-300">{f1(r.p0)}</b> Position 0 · {r.p0Pins} of {N}
          {r.p0First ? ` · first at ${r.p0First}` : ''}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className={'h-2 w-2 rounded-full ' + PART.card.dot} aria-hidden="true" />
          <b className="font-semibold text-violet-300">{f1(r.card)}</b> cards · {r.cardPins} of {N}
          {r.cardAvgSlot != null ? ` · average #${f1(r.cardAvgSlot).replace(/\.0$/, '')}` : ''}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className={'h-2 w-2 rounded-full ' + PART.web.dot} aria-hidden="true" />
          <b className="font-semibold text-cyan-300">{f1(r.web)}</b> websites · {r.webPins} of {N}
        </span>
      </div>
    </div>
  );
}

function Sites({ v, N }: { v: AiVisibility; N: number }) {
  if (!v.websites.length && !v.directories.length) return null;
  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Businesses&apos; websites cited</h3>
        <p className="mt-0.5 text-xs text-slate-400">Outside the opening answer and the business&apos;s own card: the third part of the score.</p>
        {v.websites.length ? (
          <ul className="mt-3 space-y-2.5">
            {v.websites.slice(0, 10).map((s) => (
              <li key={s.domain} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-white">{s.domain}</span>{' '}
                    <span className="text-slate-500">{s.owner ? '· ' + s.owner : '· owner not identified'}</span>
                  </span>
                  <span className="shrink-0 text-slate-300">
                    {s.owner ? <span className="mr-2 text-cyan-300">+{f1(s.points)}</span> : null}
                    {s.pins} of {N}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
                  <div className="h-full rounded-full bg-cyan-400/80" style={{ width: (100 * s.pins) / Math.max(1, N) + '%' }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-slate-500">No business&apos;s website was cited outside the opening answer and the cards.</p>
        )}
      </div>
      <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Directories and publishers cited</h3>
        <p className="mt-0.5 text-xs text-slate-400">Listed apart: they never count toward any business.</p>
        {v.directories.length ? (
          <ul className="mt-3 space-y-2.5">
            {v.directories.slice(0, 10).map((d) => (
              <li key={d.domain} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-white">{d.domain}</span>
                  <span className="shrink-0 text-slate-300">
                    {d.pins} of {N}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
                  <div className="h-full rounded-full bg-slate-500" style={{ width: (100 * d.pins) / Math.max(1, N) + '%' }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-slate-500">None cited.</p>
        )}
      </div>
    </div>
  );
}

function Explainer({ N, unread }: { N: number; unread: number }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-300">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <p className="font-semibold text-amber-300">Position 0 · up to 50</p>
          <p className="mt-1">
            The opening answer, above any list. Named first: 50; second: 37.5; later: 25. A business counts when the answer names it (linked to its Google profile, usually with
            its phone) or cites its website.
          </p>
        </div>
        <div>
          <p className="font-semibold text-violet-300">Business cards · up to 35</p>
          <p className="mt-1">
            A card in the AI Overview&apos;s own list. First card: 35; second: 26.25; third: 19.25; any later card: 12.25. A card hidden behind &ldquo;Show more&rdquo; when the page
            loaded counts 0.6 of that (read from the real page the point saved; counted in full where no page was saved).
          </p>
        </div>
        <div>
          <p className="font-semibold text-cyan-300">Websites · up to 15</p>
          <p className="mt-1">
            The business&apos;s website cited anywhere else in the answer (not the opening answer, not its own card). First citation: 15; later ones less; cited inside another
            business&apos;s card: half.
          </p>
        </div>
      </div>
      <p className="mt-3 text-slate-400">
        A point&apos;s score adds the three (at most 100). Each business&apos;s score is its average over the same {N} points, so every business is measured against the same
        grid; ± is the 95% range. Google&apos;s own pages never count as a website. Directories, review sites and publishers are listed apart and never score. Businesses with
        the same name but different Google IDs (two offices) are kept apart.
        {unread > 0 ? ` ${unread === 1 ? 'One point is' : unread + ' points are'} left out: its AI Overview could not be read in parts.` : ''}
      </p>
    </div>
  );
}

/** The real page Google served at the point where a business scored most (the rebuilt answer when none was saved), its parts outlined. */
function Snapshot({ row, scan, shareToken, onClose }: { row: AiVisRow; scan: GridScanData; shareToken?: string; onClose: () => void }) {
  const pin = scan.pins.find((p) => p.id === row.bestPin) as GridPinData | undefined;
  const pages = pin?.proxyMeta?.pages;
  const kind = pages?.post ? 'page_post' : pages?.pre ? 'page_pre' : null;
  const evidence = usePinEvidence(pin?.id, Boolean(pin && !kind), shareToken);
  const isYou = (n: string) => n.trim().toLowerCase() === scan.targetBusiness.trim().toLowerCase();
  const [show, setShow] = useState<Outline>('all');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!pin) return null;
  const parts = pin.insights?.ai?.parts;
  const at: string[] = [];
  if (parts) {
    const same = (b: { name: string; kgmid: string }) => (row.kgmid && kgmidOf(b.kgmid) ? kgmidOf(b.kgmid) === row.kgmid : normName(b.name) === normName(row.name));
    const p0 = parts.p0.brands.findIndex(same);
    if (p0 >= 0) at.push(`named ${p0 === 0 ? 'first' : '#' + (p0 + 1)} in the opening answer${parts.p0.brands[p0].phone ? ' with its phone' : ''}`);
    const c = parts.cards.findIndex(same);
    if (c >= 0) {
      const above = pin.insights?.ai?.page?.cards.find((x) => normName(x.name) === normName(parts.cards[c].name))?.above;
      at.push(`card #${c + 1}${above === false ? ', behind “Show more”' : above === true ? ', in view before “Show more”' : ''}`);
    }
    const w = [...parts.p0.sites, ...parts.other].filter((s) => row.domains.some((d) => s.includes(d)));
    if (w.length) at.push('its website cited');
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70" role="dialog" aria-modal="true" aria-label={'Snapshot: ' + row.name} onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col border-l border-slate-800 bg-slate-950" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">{row.name}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              Point {pin.rowIdx * scan.gridSize + pin.colIdx + 1} · {gridSide(pin.rowIdx, pin.colIdx, scan.gridSize)}
              {pin.city ? ' · ' + pin.city : ''} · {f1(row.pins[pin.id] ?? 0)} of 100 here
              {at.length ? ' · ' + at.join(', ') : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="min-h-[36px] shrink-0 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800">
            Close
          </button>
        </div>
        {kind && <OutlinePicker show={show} onChange={setShow} className="border-b border-slate-800 px-4 py-2.5" />}
        <div className="flex-1 overflow-y-auto bg-slate-900 p-3">
          {kind ? (
            <SavedPageFrame pinId={pin.id} kind={kind} show={show} shareToken={shareToken} className="h-full min-h-[600px] w-full rounded-xl border-0 bg-white" />
          ) : evidence.ev ? (
            <div className="rounded-xl bg-white">
              <AiView ev={evidence.ev} isTarget={isYou} target={scan.targetBusiness} />
            </div>
          ) : (
            <p className="p-4 text-sm text-slate-400">{evidence.loading ? 'Loading this point’s answer…' : 'This point’s answer is not available.'}</p>
          )}
        </div>
        <p className="border-t border-slate-800 p-3 text-[11px] text-slate-500">
          {kind
            ? 'The page exactly as Google served it to the phone at this point, saved at that moment, with the opening answer, the business cards and the cited websites outlined. Nothing on it runs.'
            : 'Rebuilt from this point’s evidence: the real page is saved for scans from 18 Nov 2026 on.'}
        </p>
      </div>
    </div>
  );
}
