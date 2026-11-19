'use client';

import { useState } from 'react';
import { DEMO, type ScanKey, pct, scanStats } from '@/lib/demo-real-scans';

const EYEBROW = 'mk-mono text-[12px] uppercase tracking-widest';
const tab = (on: boolean) => 'rounded-lg px-4 py-2.5 text-sm font-semibold transition ' + (on ? 'bg-[#f5c451] text-[#06080c]' : 'text-[#c9d3df] hover:text-white');

/** The same Top 25 scan read two ways: local rank alone, then everything the phone recorded. */
export function RetentionToggle() {
  const [view, setView] = useState<'rank' | 'full'>('full');
  const scan = DEMO.scans.top25, s = scanStats(scan);
  const visible = scan.pins.filter(p => p.rank != null || p.aiCited).length;
  const cards: { label: string; big: string; small: string; text: string }[] = view === 'rank'
    ? [
        { label: 'Share of local voice', big: `${pct(s.top3, s.n)}%`, small: 'weak', text: `Top 3 at only ${s.top3} of ${s.n} points. The client concludes the SEO is not working.` },
        { label: 'Missing on the map', big: String(s.notFound), small: `of ${s.n} red`, text: `${pct(s.notFound, s.n)}% of the map reads “not found”. At ${s.singleBusiness} of those points Google showed no map pack to rank in.` },
        { label: 'AI Overview visibility', big: '—', small: 'not measured', text: `${s.aio} of ${s.n} searches showed an AI Overview. A rank-only report has no line for it.` },
        { label: 'What the client hears', big: 'Losing', small: '', text: 'A rival agency only needs a screenshot of this map to open the conversation.' },
      ]
    : [
        { label: 'On the screen', big: String(visible), small: `of ${s.n} · ${pct(visible, s.n)}%`, text: `In the local results or named in Google’s AI answer. True misses across the whole area: ${s.n - visible}.` },
        { label: 'Rescued by the AI Overview', big: String(s.notFoundButNamed), small: `of ${s.notFound} misses`, text: 'Named in the AI Overview, above the local results, at points where a rank grid shows red.' },
        { label: 'Named first by the AI', big: String(s.namedFirst), small: `of ${s.named} mentions`, text: `The AI Overview appeared on ${s.aio} of ${s.n} searches and named ${DEMO.business} on ${s.named}.` },
        { label: 'What the client hears', big: 'Winning', small: '', text: 'And every one of those points has a recording they can play.' },
      ];
  return (
    <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <p className={EYEBROW + ' text-center text-[#7aa7ff]'}>One scan · two reports · Top 25 Demo Map · {scan.date}</p>
      <h2 className="mk-display mx-auto mt-3 max-w-4xl text-center text-4xl font-bold leading-tight sm:text-5xl">The Report That Loses the Client. <span className="mk-gold-text">The Report That Keeps Them.</span></h2>
      <p className="mx-auto mt-4 max-w-3xl text-center text-lg leading-relaxed text-[#c9d3df]">Same business, same keyword, same {s.n} searches. Switch between what a rank-only report shows and what the phones recorded.</p>
      <div className="mt-8 flex justify-center">
        <div className="inline-flex rounded-xl border border-[#2a3442] bg-[#0c1118] p-1.5" role="group" aria-label="Choose a report">
          <button type="button" aria-pressed={view === 'rank'} onClick={() => setView('rank')} className={tab(view === 'rank')}>Rank-only report</button>
          <button type="button" aria-pressed={view === 'full'} onClick={() => setView('full')} className={tab(view === 'full')}>Stakeout report</button>
        </div>
      </div>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
        {cards.map(c => (
          <div key={c.label} className={'rounded-2xl border p-7 ' + (view === 'rank' ? 'border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.04]' : 'border-[#3ddc97]/30 bg-[#3ddc97]/[0.04]')}>
            <p className={EYEBROW + ' text-[#9aa7b8]'}>{c.label}</p>
            <p className={'mk-display mt-3 text-5xl font-bold ' + (view === 'rank' ? 'text-[#ff6b6b]' : 'text-[#3ddc97]')}>{c.big}{c.small && <span className="ml-2 text-lg font-semibold text-[#9aa7b8]">{c.small}</span>}</p>
            <p className="mt-3 leading-relaxed text-[#c9d3df]">{c.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Which business Google handed the single-business result to, counted per scan. */
export function SoloSlots() {
  const [key, setKey] = useState<ScanKey>('grid');
  const scan = DEMO.scans[key], total = scan.solos.reduce((n, x) => n + x.count, 0), max = Math.max(...scan.solos.map(x => x.count), 1);
  const none = scan.pins.filter(p => !p.pack && !p.solo).length;
  return (
    <div className="mt-6 rounded-2xl border border-[#1b2431] bg-[#0c1118] p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={EYEBROW + ' text-[#f5c451]'}>Who got the single-business result</p>
          <h3 className="mk-display mt-2 text-2xl font-semibold">At {total} of {scan.pins.length} points, Google showed one business and no map pack.</h3>
          <p className="mt-2 max-w-2xl text-[#9aa7b8]">One company took the whole local result. Everyone else was off the page unless the AI Overview named them.{none > 0 ? ` At ${none} more ${none === 1 ? 'point' : 'points'} there were no local results at all.` : ''}</p>
        </div>
        <div className="inline-flex rounded-xl border border-[#2a3442] bg-[#06080c] p-1.5" role="group" aria-label="Choose a scan">
          <button type="button" aria-pressed={key === 'grid'} onClick={() => setKey('grid')} className={tab(key === 'grid')}>7 × 7 grid</button>
          <button type="button" aria-pressed={key === 'top25'} onClick={() => setKey('top25')} className={tab(key === 'top25')}>Top 25</button>
        </div>
      </div>
      <ul className="mt-6 space-y-3.5">
        {scan.solos.map(x => {
          const you = x.name === DEMO.business;
          return (
            <li key={x.name}>
              <div className="flex justify-between gap-4 text-sm"><span className={you ? 'font-bold text-[#3ddc97]' : 'text-[#eef2f7]'}>{x.name}{you ? ' (the client)' : ''}</span><span className="mk-mono text-[#c9d3df]">{x.count} {x.count === 1 ? 'point' : 'points'}</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#06080c]"><div className={'h-full rounded-full ' + (you ? 'bg-[#3ddc97]' : 'bg-[#f5c451]')} style={{ width: `${Math.max(4, (100 * x.count) / max)}%` }} /></div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** Plain arithmetic on the visitor's own figures. Nothing here is a forecast. */
export function RetentionCalculator({ cta }: { cta: string }) {
  const [retainer, setRetainer] = useState(2500), [kept, setKept] = useState(1);
  const slider = 'mt-2 w-full accent-[#f5c451]';
  return (
    <section className="mx-auto max-w-5xl px-5 pb-24 sm:px-8">
      <div className="rounded-2xl border border-[#1b2431] bg-[#0c1118] p-8 sm:p-10">
        <p className={EYEBROW + ' text-[#f5c451]'}>Your numbers · your assumptions</p>
        <h2 className="mk-display mt-3 text-3xl font-bold leading-tight sm:text-4xl">What Is One Kept Client Worth to You?</h2>
        <p className="mt-3 max-w-3xl text-[#9aa7b8]">Enter your own retainer and how many clients a year you think proof like this would keep. We don’t know that number and won’t guess it for you.</p>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-6">
            <label className="block"><span className="flex justify-between text-sm text-[#c9d3df]"><span>Monthly retainer per client</span><b className="mk-mono text-white">{usd(retainer)}</b></span><input type="range" min={500} max={10000} step={250} value={retainer} onChange={e => setRetainer(Number(e.target.value))} className={slider} /></label>
            <label className="block"><span className="flex justify-between text-sm text-[#c9d3df]"><span>Clients kept per year (your estimate)</span><b className="mk-mono text-white">{kept}</b></span><input type="range" min={1} max={20} step={1} value={kept} onChange={e => setKept(Number(e.target.value))} className={slider} /></label>
          </div>
          <div className="rounded-2xl border border-[#f5c451]/40 bg-[#f5c451]/[0.06] p-7 text-center lg:min-w-[300px]" aria-live="polite">
            <p className={EYEBROW + ' text-[#f5c451]'}>Revenue kept per year</p>
            <p className="mk-display mt-2 text-5xl font-bold text-white">{usd(retainer * 12 * kept)}</p>
            <p className="mt-2 text-xs text-[#9aa7b8]">{usd(retainer)} × 12 months × {kept} {kept === 1 ? 'client' : 'clients'}. Arithmetic on your inputs, not a forecast.</p>
            <a href={cta} className="mk-btn-primary mt-5 inline-block rounded-xl px-6 py-3 font-semibold">Get this for your market</a>
          </div>
        </div>
      </div>
    </section>
  );
}
