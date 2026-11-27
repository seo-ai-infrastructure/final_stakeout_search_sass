'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Play, X } from 'lucide-react';
import { PocketOpenButton } from '../pocket/PocketBanner';
import { HOME_PIN_EVENT, PINS, REPORT, REPORT_URL, STATS, incomeTint, pct, pinBadge, pinName, recordingUrl, usd0, type GridMode, type HomePinEvent } from './data';

const CENTER = PINS.findIndex((p) => p.r === 2 && p.c === 2);

/**
 * The hero's report: a real 5×5 scan a visitor can click through. It opens on the map pack view
 * and the centre pin, where another firm holds Google's single-business panel while the client
 * is card #1 in the AI answer. Every pin plays its own phone recording.
 */
export function HeroReport({ pocket }: { pocket: boolean }) {
  const [mode, setMode] = useState<GridMode>('rank');
  const [income, setIncome] = useState(true);
  const [picked, setPicked] = useState(CENTER);
  const [playing, setPlaying] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const pin = PINS[picked];

  // Buttons further down the page (the report's priority actions) open a pin here.
  useEffect(() => {
    const open = (e: Event) => {
      const d = (e as CustomEvent<HomePinEvent>).detail;
      const i = PINS.findIndex((p) => p.r === d.r && p.c === d.c);
      if (i < 0) return;
      setPicked(i);
      setMode(d.mode);
      box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener(HOME_PIN_EVENT, open);
    return () => window.removeEventListener(HOME_PIN_EVENT, open);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlaying(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [playing]);

  const lsa = pin.lsa.length;
  return (
    <div id="hero-telemetry" ref={box} className="lg:col-span-7">
      <div className="rounded-2xl bg-[#111923] border border-[#243444] shadow-2xl shadow-black/60 overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 bg-[#0D141D] border-b border-[#1E2B38] flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#FF8A4F]">Live 5G Visibility Report · Interactive Demo</span>
              <span className="hidden sm:inline-block text-slate-600">•</span>
              <span className="hidden sm:inline-block text-[11px] text-slate-400">{STATS.points} real-device MP4 captures</span>
            </div>
            <h2 className="text-[17px] font-bold text-white tracking-tight mt-0.5">
              {REPORT.business} <span className="text-slate-400 font-normal text-[13px]">· {REPORT.market}</span>
            </h2>
          </div>
          <div className="inline-flex p-1 rounded-lg bg-[#090E14] border border-[#243444]" role="group" aria-label="View">
            <button type="button" aria-pressed={mode === 'rank'} onClick={() => setMode('rank')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${mode === 'rank' ? 'bg-[#1E2B38] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
              Map Pack Reality ({STATS.packTop3}/{STATS.points})
            </button>
            <button type="button" aria-pressed={mode === 'ai'} onClick={() => setMode('ai')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${mode === 'ai' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
              AI Overview ({STATS.inAi}/{STATS.points})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 bg-white text-slate-900 border-b border-slate-200 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-3 border-t-2 border-t-violet-600">
            <span className="block font-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Share of Search</span>
            <div className="mt-0.5 flex items-baseline gap-1.5"><strong className="text-xl font-extrabold tracking-tight">{pct(STATS.share)}%</strong><span className="text-xs font-semibold text-slate-500">{STATS.share} / {STATS.points}</span></div>
          </div>
          <div className="p-3 border-t-2 border-t-emerald-600">
            <span className="block font-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-500">In AI Overview</span>
            <div className="mt-0.5 flex items-baseline gap-1.5"><strong className="text-xl font-extrabold tracking-tight text-emerald-700">{pct(STATS.inAi)}%</strong><span className="text-xs font-semibold text-slate-500">{STATS.inAi} / {STATS.points}</span></div>
          </div>
          <div className="p-3 border-t-2 border-t-sky-600">
            <span className="block font-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Map Pack Top 3</span>
            <div className="mt-0.5 flex items-baseline gap-1.5"><strong className="text-xl font-extrabold tracking-tight">{pct(STATS.packTop3)}%</strong><span className="text-xs font-semibold text-amber-700">{STATS.hijacks} 1-Box hijacks</span></div>
          </div>
          <div className="p-3 border-t-2 border-t-rose-600">
            <span className="block font-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Own Site Cited by AI</span>
            <div className="mt-0.5 flex items-baseline gap-1.5"><strong className="text-xl font-extrabold tracking-tight text-rose-600">{pct(STATS.siteCited)}%</strong><span className="text-xs font-semibold text-slate-500">{STATS.siteCited} / {STATS.points} answers</span></div>
          </div>
        </div>

        <div className="grid md:grid-cols-12">
          <div className="md:col-span-7 p-4 sm:p-5 bg-[#0F1722] flex flex-col justify-between border-b md:border-b-0 md:border-r border-[#1E2B38]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <div className="text-xs font-bold text-white font-mono">“{REPORT.keyword}”</div>
                <div className="text-[11px] text-slate-400">Click any pin to inspect its 5G phone receipt →</div>
              </div>
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#162230] border border-[#293B4E] text-[11px] font-medium text-amber-200 cursor-pointer select-none">
                <input type="checkbox" checked={income} onChange={(e) => setIncome(e.target.checked)} className="accent-[#FF6A28] rounded" />
                <span>$ Census Income</span>
              </label>
            </div>

            <div className="relative rounded-xl border border-[#243444] p-3 sm:p-4 overflow-hidden" style={{ backgroundImage: 'linear-gradient(to right, rgba(45,62,80,0.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(45,62,80,0.28) 1px, transparent 1px)', backgroundSize: '36px 36px', backgroundColor: '#0B1119' }}>
              <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
                {PINS.map((p, i) => {
                  const b = pinBadge(p, mode), on = i === picked;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${pinName(p)}, ${p.area}: ${b.summary}`}
                      title={`${pinName(p)} · ${p.area}${p.inc ? ` · $${Math.round(p.inc / 1000)}k median income` : ''}`}
                      onClick={() => setPicked(i)}
                      style={{ backgroundColor: income ? incomeTint(p.inc) : 'rgba(17,25,35,0.55)' }}
                      className={`group relative aspect-square rounded-lg border transition-all flex flex-col items-center justify-center p-1 cursor-pointer ${on ? 'border-[#FF6A28] ring-2 ring-[#FF6A28]/60 scale-[1.04] z-10' : 'border-white/10 hover:border-white/30'}`}
                    >
                      <span className={`w-8 h-8 sm:w-9 sm:h-9 ${b.shape} ${b.bg} border-2 ${b.border} ${b.text} flex items-center justify-center shadow-md group-hover:scale-105 transition-transform`}>{b.label}</span>
                      {income && <span className="mt-1 text-[9px] font-mono text-amber-100/80 leading-none">{p.inc ? `$${Math.round(p.inc / 1000)}k` : '–'}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#1E2B38] flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10.5px] text-slate-400">
              {mode === 'rank' ? (
                <>
                  <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> #1–3 Pack</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" /> #4–10</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-rose-700 inline-block" /> Not Found</span>
                  <span className="inline-flex items-center gap-1 text-amber-300 font-medium"><i className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-amber-400 inline-block" /> 1-Box Hijack ({STATS.hijacks} pts)</span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block" /> Featured Card #1–3</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded bg-amber-600 inline-block" /> Card #4+</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded bg-sky-800 border border-sky-400 inline-block" /> GBP Cited Only</span>
                </>
              )}
            </div>
          </div>

          <div className="md:col-span-5 bg-white text-slate-900 p-4 sm:p-5 flex flex-col justify-between" aria-live="polite">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">Point Receipt · {pinName(pin)}</span>
                {pin.inc ? <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">{usd0(pin.inc)} Household Inc.</span> : null}
              </div>
              <h3 className="text-[17px] font-extrabold text-slate-900 mt-1">{pin.area} <span className="text-slate-400 font-normal text-xs">({pin.zip})</span></h3>
              <p className="text-[11.5px] text-slate-500">Captured on a physical Android phone · live 5G line · {REPORT.when}</p>

              <div className="mt-3.5 pt-3 border-t border-slate-200">
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">Map Pack Reality on Phone</div>
                {pin.oneBox === 'other' ? (
                  <div className="mt-1 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950">
                    <strong className="font-bold">{pin.first[0]}</strong> held Google’s <span className="underline decoration-amber-500 font-semibold">Single-Business Panel (1-Box)</span>.
                    <span className="block text-[11px] text-amber-800 mt-0.5">⚠️ Google showed NO 3-Pack here. Legacy Maps-API tools hallucinate a normal rank on this pin.</span>
                  </div>
                ) : pin.oneBox === 'won' ? (
                  <div className="mt-1 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-semibold">🏆 {REPORT.business} won the Single-Business 1-Box Panel!</div>
                ) : pin.rank === null ? (
                  <div className="mt-1 text-sm font-bold text-rose-600">Not Found in Local Pack</div>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
                    <span className="text-sm font-extrabold text-slate-900">{pin.rank <= 3 ? `Ranked #${pin.rank} in 3-Pack` : `Ranked #${pin.rank}, below the 3-Pack`}</span>
                    {lsa > 0 && <span className="text-[11px] text-slate-500">Behind {lsa} Google Guaranteed LSA{lsa === 1 ? '' : 's'}</span>}
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1.5">Mobile AI Overview (4-Signal Read)</div>
                <div className="space-y-1 text-xs">
                  <Signal on={pin.featured} tone="violet" strong>{pin.featured ? (pin.card ? `Featured · Card #${pin.card}${pin.of ? ` of ${pin.of}` : ''}` : 'Featured · Recommended inline') : 'Not shown as a featured card'}</Signal>
                  <Signal on={pin.listed} tone="violet">{pin.listed ? `GBP Listing cited${pin.links ? ` (${pin.links} link${pin.links === 1 ? '' : 's'})` : pin.srcPos ? ` (source #${pin.srcPos})` : ''}` : 'GBP Listing not cited'}</Signal>
                  <Signal on={pin.site} tone="emerald" cross>{pin.site ? 'Own website cited!' : 'Own website NOT cited by AI'}</Signal>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200">
                <div className="text-[10.5px] font-mono uppercase tracking-wider text-slate-400">Sites Feeding This AI Answer</div>
                <p className="text-[11.5px] text-slate-700 font-medium mt-0.5 truncate" title={pin.sources.join(', ')}>{pin.sources.slice(0, 4).join(', ')}</p>
              </div>
            </div>

            <button type="button" onClick={() => setPlaying(true)} className="mt-4 w-full py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer">
              <Play className="w-3.5 h-3.5 fill-[#FF6A28] text-[#FF6A28]" aria-hidden="true" />
              <span>Watch 5G Phone Recording ({pinName(pin)})</span>
            </button>
            <a href={REPORT_URL} className="mt-2 inline-flex items-center justify-center gap-1 text-[11.5px] font-semibold text-slate-600 hover:text-[#FF6A28]">Open the full report <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" /></a>
          </div>
        </div>
      </div>

      {playing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Phone recording for ${pinName(pin)}`} onClick={() => setPlaying(false)}>
          <div className="w-full max-w-md max-h-full overflow-y-auto rounded-2xl bg-[#111923] border border-[#2C3E52] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 bg-[#090E14] border-b border-[#1E2B38] flex items-center justify-between gap-3">
              <div>
                <span className="font-mono text-[10px] font-bold text-[#FF8A4F] uppercase">5G MP4 Screen Recording · {pinName(pin)}</span>
                <h4 className="text-sm font-bold text-white">{pin.area} ({pin.zip})</h4>
              </div>
              <button type="button" autoFocus onClick={() => setPlaying(false)} aria-label="Close the recording" className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white cursor-pointer"><X className="w-4 h-4" aria-hidden="true" /></button>
            </div>
            <div className="p-5 bg-[#0B1119]">
              <div className="mx-auto max-w-[300px] rounded-[26px] border-4 border-slate-700 bg-black overflow-hidden shadow-2xl">
                <video key={pin.id} className="block w-full aspect-[9/16] max-h-[62vh] object-contain bg-black" src={recordingUrl(pin)} controls autoPlay muted playsInline preload="metadata" aria-label={`The phone’s screen recording of “${REPORT.keyword}” at ${pinName(pin)}, ${pin.area}`} />
              </div>
              <p className="mt-3 text-center text-[11px] text-slate-400">The real recording from this point: “{REPORT.keyword}”, {REPORT.when}.</p>
              {pocket && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">Want to see this live at your own coordinates?</span>
                  <span onClick={() => setPlaying(false)}>
                    <PocketOpenButton className="shrink-0 inline-flex items-center gap-1 px-3.5 py-2 rounded-lg bg-[#FF6A28] hover:bg-[#ff7b40] text-white text-xs font-bold cursor-pointer">Test Your Pocket · $1 <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></PocketOpenButton>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Signal({ on, tone, strong, cross, children }: { on: boolean; tone: 'violet' | 'emerald'; strong?: boolean; cross?: boolean; children: React.ReactNode }) {
  const dot = on ? (tone === 'violet' ? 'bg-violet-600 text-white' : 'bg-emerald-600 text-white') : cross ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-500';
  const text = on ? (tone === 'emerald' ? 'text-emerald-700 font-semibold' : strong ? 'font-semibold text-slate-800' : 'text-slate-700') : 'text-slate-500';
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${dot}`}>{on ? '✓' : cross ? '×' : '–'}</span>
      <span className={text}>{children}</span>
    </div>
  );
}
