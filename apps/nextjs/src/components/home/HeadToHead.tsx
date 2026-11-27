'use client';

import { useState } from 'react';
import { ArrowUpRight, Play } from 'lucide-react';
import { Recording } from './Recording';

/** One point of the 7×7 head-to-head: what the rank grid drew there and what the phone recorded. */
export type DuelPoint = { id: string; pinId: string; row: number; col: number; zip: string; theirs: number; rank: number | null; pack: boolean; solo: string | null; own: boolean; aio: boolean; cited: boolean; aiPos: number | null; aiCount: number };
export type Duel = { business: string; keyword: string; date: string; token: string; points: DuelPoint[] };

/** Read off the tool's own scan report for this search (Nov 15, 2026, 7:29 PM): where it searched and its headline figures. */
const TOOL = { surface: 'Google Maps', when: 'Nov 15, 2026 · 7:29 PM', found: 49, solv: '34.69%', arp: '5.47', rival: { name: '1-Tom-Plumber Lakeland', place: '7th', solv: '12.24%' } };

/** Where the tool's own map (cropped to its grid) draws its pins, as a share of the picture. */
const AT = { x0: 12.37, y0: 12.24, step: 12.555 };
const name = (p: DuelPoint) => `R${p.row + 1}·C${p.col + 1}`;
const band = (n: number) => (n <= 3 ? 'text-emerald-600' : n <= 10 ? 'text-amber-600' : 'text-rose-600');

function seen(p: DuelPoint, business: string) {
  if (p.own) return { label: '1-Box', cls: 'bg-emerald-600 border-yellow-300 text-white', text: `${business} held Google’s single-business panel (its own 1-Box). No map pack was on the screen.` };
  if (p.solo) return { label: '1-Box', cls: 'bg-slate-800 border-amber-400 text-amber-300', text: `${p.solo} held Google’s single-business panel. No map pack was on the screen.` };
  if (!p.pack) return { label: '–', cls: 'bg-slate-700 border-slate-500 text-slate-200', text: 'No local results were on the screen here.' };
  if (p.rank === null) return { label: 'NF', cls: 'bg-rose-700 border-rose-400 text-white', text: 'A map pack was shown; the business was not in it.' };
  return { label: String(p.rank), cls: p.rank <= 3 ? 'bg-emerald-600 border-emerald-300 text-white' : 'bg-amber-600 border-amber-300 text-white', text: `#${p.rank} in the local results.` };
}
function verdict(p: DuelPoint) {
  if (p.own) return 'No map pack here: the phone shows its own 1-Box';
  if (!p.pack) return 'A rank drawn where Google showed no map pack';
  if (p.rank === null) return 'A rank drawn where the business was not in the pack';
  if (p.rank === p.theirs) return 'The two agree here';
  return p.rank < p.theirs ? `The tool reads ${p.theirs - p.rank} place${p.theirs - p.rank === 1 ? '' : 's'} too low` : `The tool reads ${p.rank - p.theirs} place${p.rank - p.theirs === 1 ? '' : 's'} too high`;
}

/**
 * The same keyword, business and 49 points, in a leading rank-grid tool and on real phones.
 * A slider wipes the tool's own map over what the phones recorded; any point opens its recording.
 */
export function HeadToHead({ duel, pocket }: { duel: Duel; pocket: boolean }) {
  const P = duel.points;
  const [reveal, setReveal] = useState(50);
  const [picked, setPicked] = useState(Math.max(0, P.findIndex((p) => p.row === 3 && p.col === 2)));
  const [playing, setPlaying] = useState(false);
  const p = P[picked], s = seen(p, duel.business);
  const noPack = P.filter((x) => !x.pack).length, hijacks = P.filter((x) => x.solo && !x.own).length;
  const low = P.filter((x) => x.pack && x.rank !== null && x.rank <= 3 && x.theirs > 3).length;
  const packs = P.length - noPack, ownBox = P.filter((x) => x.own).length;
  const theirTop3 = P.filter((x) => x.theirs <= 3).length, packTop3 = P.filter((x) => x.pack && x.rank !== null && x.rank <= 3).length;
  const rivalBoxes = P.filter((x) => x.solo === TOOL.rival.name).length;
  const rows: [string, string, string][] = [
    ['Searched on', TOOL.surface, 'Google Search, on an Android phone'],
    ['Started', TOOL.when, 'The same minute'],
    ['Result for the business', `A rank at ${TOOL.found} of ${P.length} points`, `A map pack on screen at ${packs} of ${P.length}`],
    ['Top 3', `${theirTop3} of ${P.length} (SoLV ${TOOL.solv})`, `${packTop3} in the pack, plus its own 1-Box at ${ownBox}`],
    ['Competitor 1-Box panels', 'Not in the report', `${hijacks} of ${P.length} points`],
  ];
  return (
    <section id="head-to-head" className="scroll-mt-16 py-20 lg:py-24 border-b border-[#1E2B38]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF8A4F]">Head to Head · Same Keyword · Same Business · Same {P.length} Points · Same Time</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">A Leading Rank Grid Drew {P.length} Numbers. At {noPack} of Those Points, Google Never Showed a Map Pack.</h2>
          <p className="mt-3 text-slate-300 text-base sm:text-lg leading-relaxed">We ran “{duel.keyword}” for {duel.business} through a leading map-grid rank tracker and through Stakeout in the same minute. Drag the slider: the tool’s report draws a rank at every point. The phones recorded a competitor’s 1-Box at {hijacks} of them, and every point has its video.</p>
        </div>

        <div className="mt-10 grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7">
            <div className="flex items-center justify-between gap-3 text-[11px] font-mono font-bold uppercase tracking-wider mb-2">
              <span className="text-rose-300">← A leading rank-grid tool</span>
              <span className="text-emerald-300 text-right">Stakeout · a real phone at each point →</span>
            </div>
            <div className="relative aspect-square rounded-2xl overflow-hidden border border-[#243444] bg-[#0B1119]" style={{ backgroundImage: 'linear-gradient(to right, rgba(45,62,80,0.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(45,62,80,0.28) 1px, transparent 1px)', backgroundSize: '12.555% 12.555%' }}>
              {P.map((x, i) => {
                const v = seen(x, duel.business), on = i === picked;
                return (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${name(x)}: the tool says #${x.theirs}; the phone recorded: ${v.text}`}
                    onClick={() => setPicked(i)}
                    style={{ left: `${AT.x0 + x.col * AT.step}%`, top: `${AT.y0 + x.row * AT.step}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-[9.6%] aspect-square rounded-full border-2 flex items-center justify-center font-extrabold leading-none text-[9px] sm:text-xs cursor-pointer shadow-md ${v.cls}`}
                  >
                    {v.label}
                  </button>
                );
              })}
              <img src="/home/legacy-grid-7x7.jpg" alt={`A leading rank-grid tool’s 7 by 7 map for the same keyword and business: a rank number at every one of the ${P.length} points.`} width={760} height={760} loading="lazy" className="absolute inset-0 w-full h-full pointer-events-none select-none" style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }} />
              <span aria-hidden="true" className="absolute -translate-x-1/2 -translate-y-1/2 w-[12%] aspect-square rounded-full border-[3px] border-[#FF6A28] shadow-[0_0_0_2px_rgba(9,14,20,0.85)] pointer-events-none" style={{ left: `${AT.x0 + p.col * AT.step}%`, top: `${AT.y0 + p.row * AT.step}%` }} />
              <div aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] pointer-events-none" style={{ left: `${reveal}%` }}>
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white text-slate-900 text-xs font-black flex items-center justify-center shadow-lg">↔</span>
              </div>
            </div>
            <input type="range" min={0} max={100} value={reveal} onChange={(e) => setReveal(Number(e.target.value))} aria-label="Slide between the rank-grid tool’s map and what the phones recorded" className="mt-3 w-full accent-[#FF6A28] cursor-pointer" />
            <p className="mt-2 text-[11.5px] text-slate-400 leading-relaxed">Left: the tool’s own results map (map data ©Google). Right: what the phone at each point recorded on {duel.date}. Tap any point for its receipt. This scan ran on home internet lines; every scan now runs on 5G.</p>
          </div>

          <div className="lg:col-span-5 space-y-5">
            <div className="rounded-2xl bg-[#111923] border border-[#1E2B38] overflow-hidden">
              <table className="w-full text-left text-[12.5px]">
                <caption className="sr-only">The rank-grid tool’s own report beside what the phones recorded</caption>
                <thead>
                  <tr className="bg-[#0D141D] font-mono text-[10px] uppercase tracking-wider">
                    <td className="px-3 py-2" />
                    <th scope="col" className="px-3 py-2 font-bold text-rose-300">The tool’s report</th>
                    <th scope="col" className="px-3 py-2 font-bold text-emerald-300">The phones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2B38]">
                  {rows.map(([k, a, b]) => (
                    <tr key={k}>
                      <th scope="row" className="px-3 py-2.5 align-top font-medium text-slate-400 w-[30%]">{k}</th>
                      <td className="px-3 py-2.5 align-top text-slate-200">{a}</td>
                      <td className="px-3 py-2.5 align-top text-white font-semibold">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl bg-white text-slate-900 border border-slate-200 shadow-2xl p-5" aria-live="polite">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">Point {name(p)} · ZIP {p.zip}</span>
                <span className="text-[10.5px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">{verdict(p)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <div className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-slate-400">The rank grid says</div>
                  <div className={`mt-1 text-3xl font-extrabold tracking-tight ${band(p.theirs)}`}>#{p.theirs}</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <div className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-slate-400">The phone recorded</div>
                  <div className="mt-1 text-[13px] font-semibold text-slate-900 leading-snug">{s.text}</div>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-600">
                <span className="font-mono font-bold uppercase tracking-wider text-[10.5px] text-slate-400">AI Overview · </span>
                {p.aio ? (p.cited ? `${duel.business} was named${p.aiPos ? `, #${p.aiPos} of ${p.aiCount}` : ''}.` : `Shown, without ${duel.business}.`) : 'None at this point.'}
              </p>
              <button type="button" onClick={() => setPlaying(true)} className="mt-4 w-full py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer">
                <Play className="w-3.5 h-3.5 fill-[#FF6A28] text-[#FF6A28]" aria-hidden="true" />
                <span>Watch the Phone Recording ({name(p)})</span>
              </button>
              <a href={'/share/' + duel.token} className="mt-2 flex items-center justify-center gap-1 text-[11.5px] font-semibold text-slate-600 hover:text-[#FF6A28]">Open the full {P.length}-point scan <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" /></a>
            </div>

            <p className="text-[13px] text-slate-300 leading-relaxed">The tool’s report places {TOOL.rival.name} {TOOL.rival.place} in this market, with a {TOOL.rival.solv} share. On the phones that firm held Google’s single-business panel at {rivalBoxes} of the {P.length} points. And it cuts both ways: at {low} points the phone showed {duel.business} in the top 3 while the tool drew #4 or lower.</p>
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
