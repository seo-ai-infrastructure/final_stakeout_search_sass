'use client';

import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Play, X } from 'lucide-react';
import { PocketOpenButton } from '../pocket/PocketBanner';
import { Recording } from './Recording';

/** One point of the 7×7 head-to-head: what the rank grid drew there and what the phone recorded. */
export type DuelPoint = { id: string; pinId: string; row: number; col: number; zip: string; theirs: number; rank: number | null; pack: boolean; solo: string | null; own: boolean; aio: boolean; cited: boolean; aiPos: number | null; aiCount: number };
export type Duel = { business: string; keyword: string; date: string; token: string; points: DuelPoint[] };

/** Read off the tool's own scan report for this search (Nov 15, 2026, 7:29 PM): where it searched and its headline figures. */
const TOOL = { surface: 'Google Maps', when: 'Nov 15, 2026 · 7:29 PM', found: 49, solv: '34.69%', arp: '5.47', reviews: '1,696', rival: { name: '1-Tom-Plumber Lakeland', short: '1-Tom-Plumber', place: '7th', solv: '12.24%' } };
/** Read off the same scan's public report: packs with that rival in the top 3, and Local Service Ads on the search page. */
const PHONES = { rivalInPacks: 18, lsaPoints: 38, lsaMost: 3 };
/** The Nov 25, 2026 scan on 5G lines (the hero's report): AI Overviews with the business, card #1, own site cited, top outside site. */
const LATER = { date: 'Nov 25', points: 25, inAi: 25, cardOne: 12, ownSite: 1, topSite: 'rotorooter.com' };

/**
 * The two leaderboards for these 49 points. `phones`: points where the firm was in the top 3 of the map pack or held
 * the 1-Box, from this scan's competitor leaderboard. `tool`: its rank and Share of Local Voice (the share of points
 * where it put the firm in the top 3) in the tool's own report.
 */
const BOARD: { name: string; me?: boolean; phones: number; toolRank: number; toolSolv: number }[] = [
  { name: '1-Tom-Plumber Lakeland', phones: 29, toolRank: 7, toolSolv: 12.24 },
  { name: 'Stuart’s Plumbing', me: true, phones: 24, toolRank: 4, toolSolv: 34.69 },
  { name: 'Richard C Fox Plumbing', phones: 11, toolRank: 1, toolSolv: 69.39 },
  { name: 'AP Drain Service', phones: 10, toolRank: 23, toolSolv: 0 },
  { name: 'Benjamin Franklin Plumbing', phones: 9, toolRank: 2, toolSolv: 51.02 },
  { name: 'Roto-Rooter', phones: 6, toolRank: 3, toolSolv: 36.73 },
  { name: 'True Plumbers & AC', phones: 6, toolRank: 6, toolSolv: 24.49 },
  { name: 'All Pro Plumbing & Air', phones: 0, toolRank: 5, toolSolv: 26.53 },
];

/** Where the tool's own map (cropped to its grid) draws its pins, as a share of the picture. */
const AT = { x0: 5.23, y0: 5.15, step: 14.935 };
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
export function HeadToHead({ duel, pocket, reportUrl }: { duel: Duel; pocket: boolean; reportUrl: string }) {
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
  // The west side (the two western columns), where the tool's report says to focus.
  const west = P.filter((x) => x.col <= 1), westNoPack = west.filter((x) => !x.pack).length;
  const westLow = Math.min(...west.map((x) => x.theirs)), westHigh = Math.max(...west.map((x) => x.theirs));
  const aio = P.filter((x) => x.aio).length, named = P.filter((x) => x.cited).length;
  const theirs: [string, string][] = [
    [`Drew a Rank on All ${P.length} Pins`, `Reported a position at ${TOOL.found} of ${P.length} points—including ${noPack} where Google Search showed no 3-Pack on a real phone.`],
    [`Buried the Firm Holding the 1-Box (${TOOL.rival.solv} SoLV)`, `Ranked ${TOOL.rival.short} ${TOOL.rival.place} in the market with a ${TOOL.rival.solv} Share of Voice—while Google handed it the single-business 1-Box panel at ${rivalBoxes} of the ${P.length} points.`],
    ['Sent the Agency Chasing a Ghost', `Its top recommendation: optimize the west and northwest, where it drew #${westLow}–#${westHigh}. On the phones, ${westNoPack} of those ${west.length} western points had no 3-Pack to rank in.`],
    ['Zero AI Overviews + a Wrong Audit Flag', `Reported nothing on the AI Overviews Google showed at ${aio} of ${P.length} points, or the Local Service Ads at ${PHONES.lsaPoints}—and flagged the ${TOOL.reviews}-review profile as “missing a website link,” though its Website button is on screen in the recordings.`],
  ];
  const ours: [string, string][] = [
    [`Exposed ${hijacks} Competitor 1-Box Hijacks`, `Captured Google replacing the entire 3-Pack with a single-business panel for rivals on ${hijacks} of ${P.length} points—with playable video proof.`],
    ['Caught Who Actually Owns the Street', `Showed ${TOOL.rival.short} holding the 1-Box across the west side and a top-3 spot in ${PHONES.rivalInPacks} of the ${packs} packs—plus up to ${PHONES.lsaMost} Local Service Ads stacked above the results.`],
    [`Measured Real Mobile AI Overviews (${aio} / ${P.length})`, `Recorded an AI Overview at ${aio} of ${P.length} points and ${duel.business} named in ${named} of them—including streets with no 3-Pack at all.`],
    [`And on Live 5G, Ten Days Later (${LATER.inAi} / ${LATER.points})`, `The ${LATER.date} scan on 5G lines put ${duel.business} in all ${LATER.points} AI Overviews (Card #1 in ${LATER.cardOne} spots) while Google’s AI cited ${LATER.topSite} in every answer and its own site in ${LATER.ownSite}—an immediate retainer gameplan.`],
  ];
  return (
    <section id="head-to-head" className="scroll-mt-16 py-20 lg:py-24 border-b border-[#1E2B38]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF8A4F]">Caught Red-Handed in Lakeland, FL</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Same Plumber. Same Keyword. Two Completely Different Realities.</h2>
          <p className="mt-3 text-slate-300 text-base sm:text-lg leading-relaxed">We ran “{duel.keyword}” for {duel.business} on one of the industry’s largest Maps-API grid trackers—and ran the exact same {P.length} coordinates on physical Android phones in the same minute. Drag the slider to switch between them; tap any pin for its video.</p>
        </div>

        <div className="mt-10 grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7">
            <div className="flex items-center justify-between gap-3 text-[11px] font-mono font-bold uppercase tracking-wider mb-2">
              <span className="text-rose-300">← A leading rank-grid tool</span>
              <span className="text-emerald-300 text-right">Stakeout · a real phone at each point →</span>
            </div>
            <div className="relative aspect-square rounded-2xl overflow-hidden border border-[#243444] bg-[#0B1119]" style={{ backgroundImage: 'linear-gradient(to right, rgba(45,62,80,0.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(45,62,80,0.28) 1px, transparent 1px)', backgroundSize: '14.935% 14.935%' }}>
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
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-[10%] aspect-square rounded-full border-2 flex items-center justify-center font-extrabold leading-none text-[10px] sm:text-sm cursor-pointer shadow-md ${v.cls}`}
                  >
                    {v.label}
                  </button>
                );
              })}
              <img src="/home/legacy-grid-7x7.jpg" alt={`A leading rank-grid tool’s 7 by 7 map for the same keyword and business: a rank number at every one of the ${P.length} points.`} width={1242} height={1242} loading="lazy" className="absolute inset-0 w-full h-full pointer-events-none select-none" style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }} />
              <span aria-hidden="true" className="absolute -translate-x-1/2 -translate-y-1/2 w-[10.4%] aspect-square rounded-full border-[3px] border-[#FF6A28] shadow-[0_0_0_2px_rgba(9,14,20,0.85)] pointer-events-none" style={{ left: `${AT.x0 + p.col * AT.step}%`, top: `${AT.y0 + p.row * AT.step}%` }} />
              <div aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] pointer-events-none" style={{ left: `${reveal}%` }}>
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white text-slate-900 text-xs font-black flex items-center justify-center shadow-lg">↔</span>
              </div>
            </div>
            <input type="range" min={0} max={100} value={reveal} onChange={(e) => setReveal(Number(e.target.value))} aria-label="Slide between the rank-grid tool’s map and what the phones recorded" className="mt-3 w-full accent-[#FF6A28] cursor-pointer" />
            <p className="mt-2 text-[11.5px] text-slate-400 leading-relaxed">Left: the tool’s own results map (map data ©Google). Right: what the phone at each point recorded on {duel.date}. Tap any point for its receipt. This scan ran on home internet lines; every scan now runs on 5G.</p>
          </div>

          <div className="lg:col-span-5 space-y-5">
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

            <p className="text-[13px] text-slate-400 leading-relaxed">It cuts both ways: at {low} points the phone showed {duel.business} in the top 3 while the tool drew #4 or lower. The tool put it in the top 3 at {theirTop3} of {P.length} points; the phones showed {packTop3} in the pack plus its own 1-Box at {ownBox}.</p>
          </div>
        </div>

        <div className="mt-12 rounded-2xl bg-[#111923] border border-[#1E2B38] p-5 sm:p-7">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
            <div className="max-w-2xl">
              <h3 className="text-xl sm:text-2xl font-bold text-white">Same {P.length} Points. Two Different Leaderboards.</h3>
              <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">How often each firm was in the top 3. The phones count the map pack’s top 3 or holding the 1-Box. The tool’s figure is its own Share of Local Voice.</p>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono font-bold uppercase tracking-wider">
              <span className="inline-flex items-center gap-1.5 text-emerald-300"><i className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> The phones</span>
              <span className="inline-flex items-center gap-1.5 text-rose-300"><i className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" /> The tool</span>
            </div>
          </div>
          <ol className="mt-5 divide-y divide-[#1E2B38]">
            {BOARD.map((b) => {
              const share = Math.round((100 * b.phones) / P.length);
              return (
                <li key={b.name} className="py-3 grid sm:grid-cols-12 gap-x-5 gap-y-2 items-center">
                  <div className="sm:col-span-4 flex items-baseline gap-2.5 min-w-0">
                    <span className="font-mono text-xs text-slate-500 w-4 shrink-0">{b.phones ? 1 + BOARD.filter((x) => x.phones > b.phones).length : '–'}</span>
                    <span className={`text-sm font-semibold truncate ${b.me ? 'text-emerald-300' : 'text-white'}`}>{b.name}{b.me ? ' (the client)' : ''}</span>
                  </div>
                  <div className="sm:col-span-8 space-y-1.5">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-[#0B1119] overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} /></div>
                      <span className="w-[150px] shrink-0 text-xs text-slate-200 tabular-nums"><strong className="text-white">{share}%</strong> · top 3 at {b.phones} of {P.length}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-[#0B1119] overflow-hidden"><div className="h-full rounded-full bg-rose-400" style={{ width: `${b.toolSolv}%` }} /></div>
                      <span className="w-[150px] shrink-0 text-xs text-slate-400 tabular-nums"><strong className="text-slate-200">{b.toolSolv.toFixed(2)}%</strong> · ranked #{b.toolRank}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-[13px] text-slate-300 leading-relaxed">The tool crowned {BOARD[2].name} the market leader at {BOARD[2].toolSolv}%. On the phones it was in the top 3 at {BOARD[2].phones} of {P.length} points. The firm that led on the phones, {BOARD[0].name}, sits #{BOARD[0].toolRank} in the tool’s report, and the tool’s #{BOARD[7].toolRank}, {BOARD[7].name}, was not in a single top 3.</p>
        </div>

        <div className="mt-7 grid lg:grid-cols-2 gap-7 items-stretch">
          <div className="rounded-2xl bg-[#111923] border border-rose-500/30 p-6 sm:p-7">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-[10.5px] font-bold uppercase tracking-wider"><X className="w-3.5 h-3.5" aria-hidden="true" /> Leading Maps-API Grid Tracker</div>
            <p className="mt-3 text-xs text-slate-400">Queries Google Maps API · Zero video proof · Blind to Search UI</p>
            <ol className="mt-5 space-y-4">
              {theirs.map(([t, b], i) => (
                <li key={t} className="flex items-start gap-3">
                  <span aria-hidden="true" className="shrink-0 w-6 h-6 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span className="text-sm text-slate-300 leading-relaxed"><strong className="block text-white">{t}</strong>{b}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-2xl bg-gradient-to-b from-[#15202D] to-[#111923] border border-[#FF6A28]/45 p-6 sm:p-7">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[10.5px] font-bold uppercase tracking-wider"><Check className="w-3.5 h-3.5" aria-hidden="true" /> Stakeout Real Android Hardware</div>
            <p className="mt-3 text-xs text-slate-300">Real Chrome Mobile Search · A phone at every pin · Video receipt on every pin</p>
            <ol className="mt-5 space-y-4">
              {ours.map(([t, b], i) => (
                <li key={t} className="flex items-start gap-3">
                  <span aria-hidden="true" className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span className="text-sm text-slate-200 leading-relaxed"><strong className="block text-white">{t}</strong>{b}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-8 rounded-2xl bg-gradient-to-r from-[#161F2C] via-[#1B2533] to-[#161F2C] border border-[#2C3E52] p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {pocket
            ? <PocketOpenButton className="inline-flex items-center justify-center gap-2 bg-[#FF6A28] hover:bg-[#ff7b40] text-white font-bold text-sm px-5 py-3.5 rounded-xl shadow-lg shadow-[#FF6A28]/25 transition-all cursor-pointer">Put Your Own Tracker to the $1 Pocket Test <ArrowRight className="w-4 h-4" aria-hidden="true" /></PocketOpenButton>
            : <a href="#pricing" className="inline-flex items-center justify-center gap-2 bg-[#FF6A28] hover:bg-[#ff7b40] text-white font-bold text-sm px-5 py-3.5 rounded-xl shadow-lg shadow-[#FF6A28]/25 transition-all">See Monthly Plans <ArrowRight className="w-4 h-4" aria-hidden="true" /></a>}
          <a href={reportUrl} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-200 hover:text-[#FF8A4F] underline underline-offset-4">Inspect Stuart’s Full 25-Pin Report &amp; Video Receipts <ArrowUpRight className="w-4 h-4" aria-hidden="true" /></a>
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
