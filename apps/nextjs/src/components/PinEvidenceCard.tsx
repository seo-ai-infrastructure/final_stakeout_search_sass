'use client';
import { useState } from 'react';
import type { GridPinData, GridScanData } from './GeoGridDashboard';
import { rankColor } from '@/lib/gridColumns';
import { aiPosition } from '@/lib/marketInsights';
import { tidyAiText } from '@/lib/aiText';
import { AiView, usePinEvidence } from './EvidencePanel';

const key = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const btn = 'rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40';

/** Where a point sits on the grid, in words a client understands ("North east", "Centre"). */
export function gridSide(rowIdx: number, colIdx: number, size: number): string {
  const third = (i: number) => (size < 3 ? 1 : i < size / 3 ? 0 : i >= size - size / 3 ? 2 : 1);
  const ns = ['North', '', 'South'][third(rowIdx)], ew = ['west', '', 'east'][third(colIdx)];
  if (!ns && !ew) return 'Centre';
  if (!ns) return ew[0].toUpperCase() + ew.slice(1);
  return ew ? `${ns} ${ew}` : ns;
}

/** What the rank is, said plainly, including when the full list was not opened at this point. */
function rankLine(pin: GridPinData): string {
  if (pin.status !== 'COMPLETED') return pin.status === 'FAILED' ? 'This point failed' : 'Still running';
  const r = pin.rankFound;
  if (pin.proxyMeta?.finderShown === false) {
    if (pin.proxyMeta.rankFrom === 'map_pack') return r != null ? `#${r} in the map pack (the full list was not opened)` : 'Not in the map pack (the full list was not opened)';
    if (pin.proxyMeta.rankFrom === 'none') return 'No local results on this page';
    if (pin.proxyMeta.rankFrom === 'single_business')
      return r === 1 ? 'Google showed only you here: the single-business result' : `Google showed a single business here: ${pin.topCompetitors?.[0] ?? 'another business'}`;
    return r != null ? `#${r} in the AI Overview’s list (no local list on this page)` : 'Not in the AI Overview’s list (no local list on this page)';
  }
  return r != null ? `#${r} in the local results` : 'Not in the top 10';
}

/**
 * One point's evidence: what the phone at that spot saw. A mini grid to move between points, the
 * recording in a phone-shaped frame, the observed results and AI text always open, and a short
 * stack showing what a searcher scrolls past before reaching the business.
 */
export function PinEvidenceCard({
  scan,
  pin,
  onSelect,
  shared,
  onRerun,
  rerunBusy,
  onOpenEvidence,
  shareToken,
}: {
  scan: GridScanData;
  pin: GridPinData | null;
  onSelect: (id: string) => void;
  shared?: boolean;
  onRerun?: (id: string) => void;
  rerunBusy?: boolean;
  onOpenEvidence?: () => void;
  /** On a shared report: the link's token, needed to load a point's evidence. */
  shareToken?: string;
}) {
  const [tab, setTab] = useState<'results' | 'ai'>('results');
  // The AI Overview as rebuilt from the point's evidence (the same as the Evidence tab shows),
  // loaded only when the AI tab is opened on a point that had one.
  const evidence = usePinEvidence(pin?.id, tab === 'ai' && pin?.status === 'COMPLETED' && Boolean(pin?.hasAiOverview), shareToken);
  const rebuilt = evidence.ev && (evidence.ev.aiCopy?.businesses.length || evidence.ev.aiLayout || evidence.ev.aiOverview) ? evidence.ev : null;
  const size = scan.gridSize;
  const ordered = [...scan.pins].sort((a, b) => a.rowIdx - b.rowIdx || a.colIdx - b.colIdx);
  const at = pin ? ordered.findIndex((p) => p.id === pin.id) : -1;
  const step = (d: number) => onSelect(ordered[(at + d + ordered.length) % ordered.length].id);
  const withVideo = scan.pins.filter((p) => p.videoUrl).length;

  const ins = pin?.insights?.v === 1 ? pin.insights : null;
  const ads = ins?.adsAboveYou ?? null;
  const place = pin && ins ? aiPosition(ins.ai.named, scan.targetBusiness) : null;
  const isYou = (n: string) => key(n) === key(scan.targetBusiness);
  // What a searcher passes before the business's own listing, top of the page first.
  const stack: { tone: string; label: string; text: string }[] = [];
  if (pin?.status === 'COMPLETED') {
    if (ads != null && ads > 0) stack.push({ tone: 'border-rose-500/40 bg-rose-950/30 text-rose-300', label: 'Sponsored', text: `${ads} sponsored ${ads === 1 ? 'result' : 'results'} above you` });
    if (pin.hasAiOverview)
      stack.push({
        tone: 'border-violet-500/40 bg-violet-950/30 text-violet-300',
        label: 'AI Overview',
        text: place ? `You are #${place.pos} of ${place.of} businesses it names` : pin.targetCitedInAi ? 'It names you' : 'It does not name you',
      });
    stack.push({ tone: 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300', label: 'Local results', text: pin.rankFound != null ? `You are #${pin.rankFound}` : 'You are not in the top 10' });
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5" aria-label="Point evidence">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* The whole grid, small: coloured by rank, the open point outlined. Each square opens its point. */}
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${size}, 14px)` }}>
            {ordered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                aria-label={`Point ${p.rowIdx * size + p.colIdx + 1}: row ${p.rowIdx + 1}, column ${p.colIdx + 1}`}
                aria-pressed={pin?.id === p.id}
                className={'h-3.5 w-3.5 rounded-[3px] ' + (pin?.id === p.id ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900' : 'hover:ring-1 hover:ring-slate-300')}
                // Placed by its own row and column, so a grid with skipped points keeps its shape.
                style={{ backgroundColor: rankColor(p.status, p.rankFound), gridColumn: p.colIdx + 1, gridRow: p.rowIdx + 1 }}
              />
            ))}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {pin
                ? `Point ${pin.rowIdx * size + pin.colIdx + 1} · ${gridSide(pin.rowIdx, pin.colIdx, size)}${pin.city ? ' · ' + pin.city : ''}${pin.zip ? ' ' + pin.zip : ''}`
                : 'Point evidence'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {pin ? (
                <>
                  Searched on a real phone at that spot{pin.proxyMeta?.isp ? ` · ${pin.proxyMeta.isp}` : ''} · row {pin.rowIdx + 1}, column {pin.colIdx + 1}
                </>
              ) : (
                <>
                  Choose a point on the map, or a square here, to see exactly what the phone at that spot saw. {withVideo} of {scan.pins.length} points have a screen recording.
                </>
              )}
            </p>
          </div>
        </div>
        {pin && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn} onClick={() => step(-1)}>
              Previous point
            </button>
            <button type="button" className={btn} onClick={() => step(1)}>
              Next point
            </button>
            {!shared && pin.metaJsonUrl && (
              <a className={btn} href={pin.metaJsonUrl} title="The signed record of this search: time, device, location and a fingerprint of the evidence">
                Receipt (JSON)
              </a>
            )}
            {!shared && pin.dumpsTarUrl && (
              <a className={btn} href={pin.dumpsTarUrl} title="Every snapshot and the recording from this search, as captured">
                Raw bundle (admin)
              </a>
            )}
          </div>
        )}
      </div>

      {pin && (
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(200px,260px)_minmax(0,1.5fr)_minmax(200px,1fr)]">
          {/* The recording, in a frame shaped like the phone it was made on. */}
          <div>
            <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-[28px] border-[3px] border-slate-700 bg-black" style={{ aspectRatio: '9 / 19.5' }}>
              {pin.videoUrl ? (
                // "#t=6" opens on the results page: the first seconds are the keyboard and the page loading.
                <video key={pin.id} controls preload="metadata" src={pin.videoUrl + '#t=6'} className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-500">No recording for this point.</div>
              )}
            </div>
            {pin.videoUrl && <p className="mt-2 text-center text-[11px] text-slate-500">The screen recording from this search, start to finish.</p>}
          </div>

          <div className="min-w-0">
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-700 text-xs font-semibold" role="group" aria-label="What to show">
              {(
                [
                  ['results', 'Observed results and ads'],
                  ['ai', 'AI Overview text'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={'px-3 py-2 ' + (tab === k ? 'bg-slate-200 text-slate-950' : 'text-slate-200 hover:bg-slate-800')}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'results' && (
              <div className="mt-3 space-y-3">
                <p className="text-sm font-semibold text-white">{rankLine(pin)}</p>
                {!shared && pin.status === 'FAILED' && onRerun && (
                  <button type="button" disabled={rerunBusy} onClick={() => onRerun(pin.id)} className="rounded-lg bg-emerald-400 px-3 py-1.5 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50">
                    {rerunBusy ? 'Starting…' : 'Re-run this point'}
                  </button>
                )}
                {ins && ins.ads.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-300">
                      Sponsored on this page · {ins.ads.length}
                      {ads != null ? ` · ${ads} above you` : ''}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {[...new Set(ins.ads.map((a) => a.name))].slice(0, 6).map((name) => (
                        <li key={name} className="rounded-lg border border-rose-500/25 bg-rose-950/20 px-3 py-1.5 text-sm text-slate-200">
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {pin.topCompetitors?.length ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Local results, in Google&apos;s order</p>
                    <ol className="mt-1.5 space-y-1">
                      {pin.topCompetitors.slice(0, 10).map((n, i) => (
                        <li key={i} className={'flex items-center gap-3 rounded-lg border px-3 py-1.5 text-sm ' + (isYou(n) ? 'border-emerald-500/50 bg-emerald-950/30' : 'border-slate-800')}>
                          <span className={'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ' + (isYou(n) ? 'bg-emerald-400 text-slate-950' : 'bg-slate-800 text-slate-200')}>{i + 1}</span>
                          <span className={isYou(n) ? 'font-bold text-white' : 'text-slate-200'}>
                            {n}
                            {isYou(n) ? ' (you)' : ''}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  pin.status === 'COMPLETED' && <p className="text-sm text-slate-400">No local results were listed at this point.</p>
                )}
              </div>
            )}
            {tab === 'ai' && (
              <div className="mt-3 space-y-3">
                {rebuilt ? (
                  // The answer as Google laid it out, on a light panel like the page it came from.
                  <div className="max-h-[640px] overflow-y-auto rounded-xl bg-white">
                    <AiView ev={rebuilt} isTarget={isYou} target={scan.targetBusiness} />
                  </div>
                ) : pin.aiOverviewText ? (
                  <>
                    {evidence.loading && <p className="text-xs text-slate-400">Loading the full answer…</p>}
                    {/* Until the rebuilt answer loads (or when it cannot): the saved text, tidied. */}
                    <div className="space-y-1.5">
                      {tidyAiText(pin.aiOverviewText).map((b, i) =>
                        b.kind === 'heading' ? (
                          <p key={i} className="pt-2 text-sm font-bold text-white">{b.text}</p>
                        ) : b.kind === 'business' ? (
                          <div key={i} className={'rounded-lg border px-3 py-2 ' + (isYou(b.text) ? 'border-emerald-500/50 bg-emerald-950/30' : 'border-slate-800')}>
                            <p className="text-sm font-bold text-white">
                              {b.text}
                              {isYou(b.text) ? ' (you)' : ''}
                            </p>
                            {b.meta && <p className="mt-0.5 text-xs text-slate-400">{b.meta}</p>}
                          </div>
                        ) : (
                          <p key={i} className="text-sm leading-relaxed text-slate-200">{b.text}</p>
                        ),
                      )}
                    </div>
                    {ins && ins.ai.sources.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sources cited</p>
                        <p className="mt-1 text-xs text-slate-300">{ins.ai.sources.join(' · ')}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-400">{pin.hasAiOverview ? 'An AI Overview appeared, but its text was not captured.' : 'No AI Overview appeared at this point.'}</p>
                )}
              </div>
            )}
            {onOpenEvidence && pin.status === 'COMPLETED' && (
              <button type="button" onClick={onOpenEvidence} className="mt-4 text-xs font-semibold text-emerald-300 underline-offset-2 hover:underline">
                Open the full evidence for this point: every card, as the phone showed it
              </button>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">How far down you are</p>
            {stack.length ? (
              <>
                <ol className="mt-2 space-y-2">
                  {stack.map((b, i) => (
                    <li key={b.label} className={'rounded-lg border p-3 ' + b.tone}>
                      <p className="text-[11px] font-semibold">
                        {i + 1}. {b.label}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-white">{b.text}</p>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  {stack.length > 1
                    ? `A searcher passes ${stack.length - 1 === 1 ? 'one block' : stack.length - 1 + ' blocks'} before reaching the local results.`
                    : 'Nothing sits above the local results at this point.'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Shown once this point has finished.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
