'use client';

import { useState } from 'react';
import { DEMO, TRACKER_GRID, type RealPin, proofVideoUrl, shareReportUrl } from '@/lib/demo-real-scans';

const EYEBROW = 'mk-mono text-[12px] uppercase tracking-widest';
const TONE: Record<string, string> = {
  top: 'bg-[#3ddc97] text-[#06231a]',
  mid: 'bg-[#f5c451] text-[#1a1300]',
  low: 'bg-[#e2684f] text-white',
  ai: 'bg-[#8b5cf6] text-white',
  miss: 'bg-[#e11d48] text-white',
};
const trackerTone = (rank: number) => (rank <= 3 ? 'top' : rank <= 10 ? 'mid' : 'low');
/** One headline per point, the way the report's Combined view reads it. */
function phoneCell(p: RealPin): { tone: string; label: string } {
  if (p.rank != null) return { tone: p.rank <= 3 ? 'top' : 'mid', label: String(p.rank) };
  if (p.aiCited) return { tone: 'ai', label: p.aiPos ? `#${p.aiPos}` : '✓' };
  return { tone: 'miss', label: '✕' };
}
/** What the phone displayed in the local results at this point, in the report's own wording. */
function localLine(p: RealPin) {
  if (p.pack) return p.rank != null ? `#${p.rank} in the local results.` : 'Not in the top 10 local results.';
  if (!p.solo) return 'No local results on the page.';
  return p.rank === 1 ? `No map pack. Google showed only ${DEMO.business}: the single-business result.` : `No map pack. Google showed a single business: ${p.solo}.`;
}
function aiLine(p: RealPin) {
  if (!p.aio) return 'No AI Overview on this search.';
  if (!p.aiCited) return `The AI Overview named ${p.aiCount || 'other'} businesses, not ${DEMO.business}.`;
  return p.aiPos ? `The AI Overview named ${DEMO.business} #${p.aiPos} of ${p.aiCount}.` : `The AI Overview named ${DEMO.business}.`;
}
/** Short version of the same two facts, for the headline box. */
function phoneHeadline(p: RealPin) {
  const local = p.pack ? (p.rank != null ? `#${p.rank} local` : 'Not in the local top 10') : p.rank === 1 ? 'Only you shown' : p.solo ? 'No map pack' : 'No local results';
  const ai = !p.aio ? 'no AI Overview' : p.aiCited ? (p.aiPos ? `AI named you #${p.aiPos}` : 'AI named you') : 'AI left you out';
  return `${local} · ${ai}`;
}

/** Pick any of the 49 points: the rank tracker's number beside what the phone recorded there, with the recording. */
export default function PinCompare() {
  const scan = DEMO.scans.grid, pins = scan.pins, size = scan.gridSize;
  const their = (p: RealPin) => TRACKER_GRID[p.row][p.col];
  // Open on the widest gap: a poor tracker rank at a point with no map pack where the AI named the business near the top.
  const start = [...pins].filter(p => !p.pack && p.aiCited).sort((a, b) => their(b) - 3 * (b.aiPos ?? 9) - (their(a) - 3 * (a.aiPos ?? 9)))[0] ?? pins[0];
  const [id, setId] = useState(start.id);
  const index = Math.max(0, pins.findIndex(p => p.id === id)), pin = pins[index];
  const step = (d: number) => setId(pins[(index + d + pins.length) % pins.length].id);
  const cols = { gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` };
  const cell = (on: boolean, tone: string) => 'grid aspect-square place-items-center rounded-full text-[11px] font-bold tabular-nums transition sm:text-xs ' + TONE[tone] + (on ? ' ring-2 ring-white ring-offset-2 ring-offset-[#0b0f15]' : ' opacity-80 hover:opacity-100');

  return (
    <div className="mt-14">
      <p className={EYEBROW + ' text-center text-[#f5c451]'}>Check it yourself · pick any of the {pins.length} points</p>
      <h3 className="mk-display mx-auto mt-3 max-w-4xl text-center text-3xl font-bold leading-tight sm:text-4xl">What the Rank Tracker Said. <span className="mk-gold-text">What the Phone Recorded.</span></h3>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="grid grid-cols-2 gap-5 self-start rounded-2xl border border-[#1b2431] bg-[#0b0f15] p-5 sm:p-6">
          <div>
            <p className={EYEBROW + ' mb-3 text-[#9aa7b8]'}>Rank tracker</p>
            <div className="grid gap-1.5" style={cols}>
              {pins.map(p => <button key={p.id} type="button" onClick={() => setId(p.id)} aria-pressed={p.id === id} aria-label={`Row ${p.row + 1}, column ${p.col + 1}: rank tracker says ${their(p)}`} className={cell(p.id === id, trackerTone(their(p)))}>{their(p)}</button>)}
            </div>
          </div>
          <div>
            <p className={EYEBROW + ' mb-3 text-[#f5c451]'}>Stakeout phone</p>
            <div className="grid gap-1.5" style={cols}>
              {pins.map(p => { const c = phoneCell(p); return <button key={p.id} type="button" onClick={() => setId(p.id)} aria-pressed={p.id === id} aria-label={`Row ${p.row + 1}, column ${p.col + 1}: ${phoneHeadline(p)}`} className={cell(p.id === id, c.tone)}>{c.label}</button>; })}
            </div>
          </div>
          <p className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#9aa7b8]">
            {[['top', 'Rank 1–3'], ['mid', 'Rank 4–10'], ['low', 'Rank 11+'], ['ai', 'No local rank: place in the AI Overview'], ['miss', 'Not shown']].map(([tone, text]) => <span key={tone} className="inline-flex items-center gap-1.5"><span className={'h-2.5 w-2.5 rounded-full ' + TONE[tone].split(' ')[0]} />{text}</span>)}
          </p>
          <p className="col-span-2 text-xs leading-relaxed text-[#6b7686]">A rank tracker of this kind reads the Google Maps list, which exists at every point. The phone ran the same search on Google in Chrome, where the customer starts and where the map pack often does not appear.</p>
        </div>

        <div className="rounded-2xl border border-[#f5c451]/40 bg-[#f5c451]/[0.05] p-5 sm:p-6" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={EYEBROW + ' text-[#f5c451]'}>Point {index + 1} · row {pin.row + 1}, column {pin.col + 1}</p>
              <p className="mt-1 text-sm text-[#9aa7b8]">ZIP {pin.zip}{pin.isp ? ` · searched over ${pin.isp}` : ''} · {scan.date}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button type="button" onClick={() => step(-1)} aria-label="Previous point" className="h-9 w-9 rounded-lg border border-[#2a3442] bg-[#0c1118] text-[#c9d3df] hover:text-white">←</button>
              <button type="button" onClick={() => step(1)} aria-label="Next point" className="h-9 w-9 rounded-lg border border-[#2a3442] bg-[#0c1118] text-[#c9d3df] hover:text-white">→</button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[#1b2431] bg-[#0b0f15] p-4">
              <p className={EYEBROW + ' text-[#9aa7b8]'}>The rank tracker said</p>
              <p className="mk-display mt-1 text-4xl font-bold">#{their(pin)}</p>
              <p className="mt-1 text-xs text-[#9aa7b8]">One number. No AI Overview, no ads, no recording.</p>
            </div>
            <div className="rounded-xl border border-[#f5c451]/40 bg-[#0b0f15] p-4">
              <p className={EYEBROW + ' text-[#f5c451]'}>The phone showed</p>
              <p className="mk-display mt-1 text-2xl font-bold leading-tight text-[#f5c451]">{phoneHeadline(pin)}</p>
            </div>
          </div>
          <div className="mt-4 grid items-start gap-4 sm:grid-cols-[1fr_190px]">
            <ul className="space-y-2.5 text-sm leading-relaxed text-[#c9d3df]">
              <li className="border-l-2 border-[#2a3442] pl-3">{localLine(pin)}</li>
              <li className={'border-l-2 pl-3 ' + (pin.aiCited ? 'border-[#8b5cf6]' : 'border-[#2a3442]')}>{aiLine(pin)}</li>
              {pin.adsAbove != null && <li className="border-l-2 border-[#2a3442] pl-3">{pin.adsAbove} {pin.adsAbove === 1 ? 'ad' : 'ads'} sat above {DEMO.business} in the local list.</li>}
              {pin.sources.some(x => x !== 'google.com') && <li className="border-l-2 border-[#2a3442] pl-3">Sites the AI linked: {pin.sources.filter(x => x !== 'google.com').slice(0, 4).join(', ')}.</li>}
              <li className="pt-1"><a href={shareReportUrl(scan)} target="_blank" rel="noreferrer" className="text-[#7aa7ff] hover:underline">Open the full report for all {pins.length} points ↗</a></li>
            </ul>
            <figure>
              <video key={pin.pinId} controls playsInline preload="none" src={proofVideoUrl(scan, pin)} className="aspect-[9/16] w-full rounded-[18px] border-4 border-[#1b2431] bg-black" aria-label={`Screen recording of the search at point ${index + 1}`} />
              <figcaption className="mt-2 text-center text-xs text-[#9aa7b8]">The real recording of this search. Press play.</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </div>
  );
}
