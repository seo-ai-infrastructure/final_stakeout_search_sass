'use client';

import { useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Play } from 'lucide-react';
import { PocketOpenButton } from '../pocket/PocketBanner';
import { Recording } from './Recording';

/** One point of the 7×7 head-to-head: what the rank grid drew there and what the phone recorded. */
export type DuelPoint = { id: string; pinId: string; row: number; col: number; zip: string; theirs: number; rank: number | null; pack: boolean; solo: string | null; own: boolean; aio: boolean; cited: boolean; aiPos: number | null; aiCount: number };
export type Duel = { business: string; keyword: string; date: string; token: string; points: DuelPoint[] };

/**
 * The two leaderboards for these 49 points. `phones`: points where the firm was in the top 3 of the map pack or held
 * the 1-Box, from this scan's competitor leaderboard. `tool`: its rank and Share of Local Voice (the share of points
 * where it put the firm in the top 3) in the tracker's own report of the same minute.
 */
const BOARD: { name: string; me?: boolean; phones: number; toolRank: number; toolSolv: number; lead?: string; what: string }[] = [
  { name: '1-Tom-Plumber Lakeland', phones: 29, toolRank: 7, toolSolv: 12.24, lead: 'Real #1 threat missed', what: '4.8× higher visibility on real phones' },
  { name: 'Stuart’s Plumbing (Client)', me: true, phones: 24, toolRank: 4, toolSolv: 34.69, what: 'Underreported client’s true #2 market position' },
  { name: 'Richard C. Fox Plumbing', phones: 11, toolRank: 1, toolSolv: 69.39, lead: 'False #1 ghost chase', what: 'inflated more than 3× by Maps API' },
  { name: 'AP Drain Service LLC', phones: 10, toolRank: 23, toolSolv: 0, what: 'Tracker reported zero top-3 spots; actually top-3 on 10 pins' },
  { name: 'Benjamin Franklin Plumbing', phones: 9, toolRank: 2, toolSolv: 51.02, what: 'Overstated nearly 3× on Maps API vs. mobile Chrome Search' },
];
/** The three points called out under the grids. */
const CAUGHT: { row: number; col: number; where: string; said: string; real: string }[] = [
  { row: 3, col: 2, where: 'West of Downtown', said: 'Tracker painted #4', real: 'Real phone: No 3-Pack (Competitor 1-Box hijack)' },
  { row: 4, col: 1, where: 'Southwest Lakeland', said: 'Tracker painted #5', real: 'Real phone: N/A (Zero Map Pack on page)' },
  { row: 5, col: 0, where: 'By 570 Toll', said: 'Tracker screamed #11 in red', real: 'Real phone: Winning at #3 in the 3-Pack' },
];

const name = (p: { row: number; col: number }) => `R${p.row + 1}·C${p.col + 1}`;
/** A rank circle the way map-grid trackers colour it. */
const toolPin = (n: number) => (n <= 1 ? 'bg-green-800 text-white' : n <= 3 ? 'bg-lime-700 text-white' : n <= 5 ? 'bg-yellow-400 text-slate-900' : n <= 8 ? 'bg-orange-600 text-white' : 'bg-red-700 text-white');

function seen(p: DuelPoint, business: string) {
  if (p.own) return { label: '1-Box', cls: 'bg-emerald-600 border-yellow-300 text-white', text: `${business} held Google’s single-business panel (its own 1-Box). No 3-Pack was on the screen.` };
  if (p.solo) return { label: '1-Box', cls: 'bg-slate-800 border-amber-400 text-amber-300', text: `${p.solo} held Google’s single-business panel. No 3-Pack was on the screen.` };
  if (!p.pack) return { label: 'N/A', cls: 'bg-cyan-700 border-cyan-300 text-white', text: 'No map pack of any kind was on the page.' };
  if (p.rank === null) return { label: 'NF', cls: 'bg-rose-700 border-rose-400 text-white', text: 'A 3-Pack was shown; the business was not in it.' };
  return { label: String(p.rank), cls: p.rank <= 3 ? 'bg-emerald-600 border-emerald-300 text-white' : 'bg-amber-600 border-amber-300 text-white', text: `#${p.rank} in the local results.` };
}

/**
 * Under the hero: the same keyword, business and 49 coordinates on a leading Maps-API grid tracker and on
 * real phones, started in the same minute. One tab sets the two grids side by side (any pin plays its
 * recording); the other sets the two competitor leaderboards side by side.
 */
export function HeadToHead({ duel, pocket }: { duel: Duel; pocket: boolean }) {
  const P = duel.points, size = Math.round(Math.sqrt(P.length));
  const [tab, setTab] = useState<'grid' | 'board'>('grid');
  const [side, setSide] = useState<'tool' | 'phones'>('tool');
  const [picked, setPicked] = useState(Math.max(0, P.findIndex((p) => p.row === 3 && p.col === 2)));
  const [playing, setPlaying] = useState(false);
  const strip = useRef<HTMLDivElement | null>(null);
  const p = P[picked], s = seen(p, duel.business);
  const noPack = P.filter((x) => !x.pack).length, boxes = P.filter((x) => x.solo).length, aio = P.filter((x) => x.aio).length;
  const play = (row: number, col: number) => { setPicked(Math.max(0, P.findIndex((x) => x.row === row && x.col === col))); setPlaying(true); };
  // On a phone the two grids sit side by side in a strip that swipes; the toggle above it moves the strip.
  const show = (which: 'tool' | 'phones') => { setSide(which); const el = strip.current; if (el) el.scrollTo({ left: which === 'tool' ? 0 : el.scrollWidth, behavior: 'smooth' }); };
  const swiped = () => { const el = strip.current; if (el && el.scrollWidth > el.clientWidth + 8) setSide(el.scrollLeft > (el.scrollWidth - el.clientWidth) / 2 ? 'phones' : 'tool'); };
  const pill = (on: boolean) => `px-3.5 py-2 rounded-lg text-[12.5px] sm:text-sm font-semibold transition-all cursor-pointer text-left ${on ? 'bg-[#FF6A28] text-white shadow-lg shadow-[#FF6A28]/20' : 'text-slate-300 hover:text-white'}`;
  const cols = { gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` };
  return (
    <section id="head-to-head" className="scroll-mt-16 py-20 lg:py-24 border-b border-[#1E2B38]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF8A4F]">Same Plumber · Same {P.length} Coordinates · Lakeland, FL</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">“We Searched From Across Town and Didn’t See Our Business—Nothing Matches Your Report.”</h2>
          <p className="mt-3 text-slate-300 text-base sm:text-lg leading-relaxed">Here is why clients lose trust even when your “mobile” rank tracker looks fine. We ran “{duel.keyword}” across the exact same {size}×{size} Lakeland grid on a respected Maps-API tracker and on Stakeout’s physical Android phones, in the same minute.</p>
        </div>

        <div className="mt-8 inline-flex flex-col sm:flex-row gap-1 p-1 rounded-xl bg-[#111923] border border-[#243444]" role="tablist" aria-label="Comparison">
          <button type="button" role="tab" aria-selected={tab === 'grid'} onClick={() => setTab('grid')} className={pill(tab === 'grid')}>Where Did the 3-Pack Go? ({P.length}-Pin Grid)</button>
          <button type="button" role="tab" aria-selected={tab === 'board'} onClick={() => setTab('board')} className={pill(tab === 'board')}>Fighting Ghost Competitors (Leaderboard)</button>
        </div>

        {tab === 'grid' ? (
          <div className="mt-6" role="tabpanel">
            <div className="lg:hidden mb-3 inline-flex p-1 rounded-lg bg-[#090E14] border border-[#243444]" role="group" aria-label="Which grid">
              <button type="button" aria-pressed={side === 'tool'} onClick={() => show('tool')} className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${side === 'tool' ? 'bg-[#1E2B38] text-white' : 'text-slate-400'}`}>Maps-API Grid</button>
              <button type="button" aria-pressed={side === 'phones'} onClick={() => show('phones')} className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${side === 'phones' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>Real Phones</button>
            </div>

            <div ref={strip} onScroll={swiped} className="flex gap-4 overflow-x-auto snap-x snap-mandatory lg:grid lg:grid-cols-2 lg:gap-7 lg:overflow-visible [scrollbar-width:none]">
              <div className="snap-center shrink-0 w-full rounded-2xl bg-[#111923] border border-rose-500/30 p-4 sm:p-6">
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-rose-300">Leading Maps-API Grid Tracker (Same {P.length} Coordinates)</div>
                <div className="mt-4 mx-auto max-w-[460px] grid gap-1.5 sm:gap-2.5 rounded-xl bg-[#E9EEF0] p-3 sm:p-4" style={cols}>
                  {P.map((x, i) => (
                    <button key={x.id} type="button" aria-pressed={i === picked} aria-label={`${name(x)}: the tracker says #${x.theirs}`} onClick={() => setPicked(i)} className={`aspect-square rounded-full flex items-center justify-center font-bold text-[11px] sm:text-sm cursor-pointer shadow ${toolPin(x.theirs)} ${i === picked ? 'outline outline-[3px] outline-offset-2 outline-[#FF6A28]' : ''}`}>{x.theirs}</button>
                  ))}
                </div>
                <p className="mt-4 text-[13px] text-slate-300 leading-relaxed">{P.length} neat colored dots. Assumes a standard 3-Pack existed on 100% of pins and reports 0 AI Overviews.</p>
              </div>

              <div className="snap-center shrink-0 w-full rounded-2xl bg-gradient-to-b from-[#15202D] to-[#111923] border border-emerald-500/35 p-4 sm:p-6">
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-emerald-300">Stakeout Real Android Phones (Same {P.length} Coordinates)</div>
                <div className="mt-4 mx-auto max-w-[460px] grid gap-1.5 sm:gap-2.5 rounded-xl bg-[#0B1119] border border-[#243444] p-3 sm:p-4" style={cols}>
                  {P.map((x, i) => {
                    const v = seen(x, duel.business);
                    return (
                      <button key={x.id} type="button" aria-pressed={i === picked} aria-label={`${name(x)}: the phone recorded: ${v.text}${x.cited ? ' Named in the AI Overview.' : ''}`} onClick={() => setPicked(i)} className={`aspect-square rounded-full border-2 flex items-center justify-center font-extrabold leading-none text-[9px] sm:text-xs cursor-pointer shadow ${v.cls} ${x.cited ? 'ring-2 ring-violet-400' : ''} ${i === picked ? 'outline outline-[3px] outline-offset-[3px] outline-[#FF6A28]' : ''}`}>{v.label}</button>
                    );
                  })}
                </div>
                <p className="mt-4 text-[13px] text-slate-200 leading-relaxed">{Math.round((100 * noPack) / P.length)}% of the city ({noPack} of {P.length} pins) had NO 3-Pack at all—{boxes} single-business 1-Box panels + {noPack - boxes} N/A—plus {aio} mobile AI Overviews.</p>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-slate-400">
                  <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Top 3</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" /> #4–10</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-amber-400 inline-block" /> Rival 1-Box</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-emerald-600 border border-yellow-300 inline-block" /> Own 1-Box</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-cyan-700 inline-block" /> N/A</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full border-2 border-violet-400 inline-block" /> Named in the AI Overview</span>
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-white text-slate-900 border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3" aria-live="polite">
              <div className="min-w-0 flex-1 text-[13px] leading-snug">
                <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-500">{name(p)} · ZIP {p.zip}</span>
                <div className="mt-0.5"><strong>Tracker: #{p.theirs}.</strong> <strong>Real phone:</strong> {s.text} {p.aio ? (p.cited ? `AI Overview: ${duel.business} was named${p.aiPos ? `, #${p.aiPos} of ${p.aiCount}` : ''}.` : `AI Overview shown, without ${duel.business}.`) : ''}</div>
              </div>
              <button type="button" onClick={() => setPlaying(true)} className="shrink-0 py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer">
                <Play className="w-3.5 h-3.5 fill-[#FF6A28] text-[#FF6A28]" aria-hidden="true" /> Watch the Recording ({name(p)})
              </button>
            </div>

            <div className="mt-4 grid md:grid-cols-3 gap-3">
              {CAUGHT.map((c) => (
                <button key={name(c)} type="button" onClick={() => play(c.row, c.col)} className="group text-left rounded-xl bg-[#111923] hover:bg-[#15202D] border border-[#243444] hover:border-[#FF6A28]/50 p-4 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2 text-xs"><strong className="font-mono text-[#FF8A4F]">{name(c)}</strong><span className="text-slate-400">({c.where})</span></div>
                  <div className="mt-1.5 text-[13px] text-slate-300 leading-snug">{c.said} → <strong className="text-white">{c.real}</strong></div>
                  <div className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#FF8A4F] group-hover:text-white"><Play className="w-3 h-3 fill-current" aria-hidden="true" /> Play this pin’s recording</div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] text-slate-500">Both searches started {duel.date} at 7:29 PM. This scan ran on home internet lines; every scan now runs on 5G.</p>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl bg-[#111923] border border-[#1E2B38] p-5 sm:p-7" role="tabpanel">
            <h3 className="text-xl sm:text-2xl font-bold text-white max-w-3xl">Imagine Spending 6 Months Reverse-Engineering a “Market Leader” That Is a Distant Third on Real Phones.</h3>
            <p className="mt-2 text-sm text-slate-400">“{duel.keyword}” across all {P.length} Lakeland points. Top 3 share: the points where a firm was in the 3-Pack’s top 3 or held the 1-Box.</p>
            <div className="mt-5 hidden md:grid grid-cols-12 gap-4 px-3 font-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              <span className="col-span-3">Plumbing firm</span><span className="col-span-2 text-rose-300">Maps-API tracker claimed</span><span className="col-span-3 text-emerald-300">Real phones (top 3 share)</span><span className="col-span-4">What actually happened</span>
            </div>
            <ol className="mt-2 divide-y divide-[#1E2B38]">
              {BOARD.map((b, i) => {
                const share = Math.round((100 * b.phones) / P.length);
                return (
                  <li key={b.name} className={`py-3.5 px-3 grid md:grid-cols-12 gap-x-4 gap-y-1.5 md:items-center rounded-lg ${b.me ? 'bg-emerald-500/[0.06]' : ''}`}>
                    <strong className={`md:col-span-3 text-sm ${b.me ? 'text-emerald-300' : 'text-white'}`}>{b.name}</strong>
                    <span className="md:col-span-2 text-[13px] text-rose-200 tabular-nums"><span className="md:hidden text-slate-500">Tracker: </span>#{b.toolRank} · {b.toolSolv.toFixed(2)}% SoLV</span>
                    <span className="md:col-span-3 text-[13px] text-white font-bold tabular-nums"><span className="md:hidden font-normal text-slate-500">Real phones: </span>#{i + 1} · {share}% ({b.phones} of {P.length})
                      <span className="mt-1 block h-1.5 rounded-full bg-[#0B1119] overflow-hidden"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} /></span>
                    </span>
                    <span className="md:col-span-4 text-[13px] text-slate-300 leading-snug">{b.lead ? <><strong className="text-white">{b.lead}</strong>—</> : null}{b.what}</span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-[11.5px] text-slate-500">The tracker’s figures are from its own report for the same minute ({duel.date}, 7:29 PM). SoLV is its Share of Local Voice: the share of points where it put the firm in the top 3.</p>
          </div>
        )}

        <div className="mt-8 rounded-2xl bg-gradient-to-r from-[#161F2C] via-[#1B2533] to-[#161F2C] border border-[#2C3E52] p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <p className="text-sm sm:text-[15px] text-slate-200 max-w-xl">Yes—this includes trackers with a “Mobile” toggle. {pocket ? 'Check what a real 5G phone sees right where you’re sitting.' : 'See what a real phone records at every pin.'}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {pocket
              ? <PocketOpenButton className="inline-flex items-center justify-center gap-2 bg-[#FF6A28] hover:bg-[#ff7b40] text-white font-bold text-sm px-5 py-3.5 rounded-xl shadow-lg shadow-[#FF6A28]/25 transition-all cursor-pointer">Bet $1 We Match Your Phone <ArrowRight className="w-4 h-4" aria-hidden="true" /></PocketOpenButton>
              : <a href="#pricing" className="inline-flex items-center justify-center gap-2 bg-[#FF6A28] hover:bg-[#ff7b40] text-white font-bold text-sm px-5 py-3.5 rounded-xl shadow-lg shadow-[#FF6A28]/25 transition-all">See Monthly Plans <ArrowRight className="w-4 h-4" aria-hidden="true" /></a>}
            <a href={'/share/' + duel.token} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-200 hover:text-[#FF8A4F] underline underline-offset-4">Inspect All {P.length} Lakeland Recordings <ArrowUpRight className="w-4 h-4" aria-hidden="true" /></a>
          </div>
        </div>
      </div>

      {playing && (
        <Recording
          point={name(p)}
          place={`ZIP ${p.zip}`}
          src={`/api/proof/${p.pinId}?kind=video&share=${duel.token}`}
          label={`The phone’s screen recording of “${duel.keyword}” at ${name(p)}`}
          caption={`The real recording from this point: “${duel.keyword}”, ${duel.date}.`}
          pocket={pocket}
          onClose={() => setPlaying(false)}
        />
      )}
    </section>
  );
}
