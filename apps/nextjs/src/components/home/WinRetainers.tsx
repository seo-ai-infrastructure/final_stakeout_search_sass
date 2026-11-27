'use client';

import { ArrowRight, Link2, Play, Radar } from 'lucide-react';
import { HOME_PIN_EVENT, PINS, REPORT, STATS, pinBadge, type HomePinEvent } from './data';

/** How an agency uses one scan to open a sales call. The examples are drawn from the page's sample report. */
export function WinRetainers({ closerHref, closerPrice }: { closerHref: string; closerPrice: string }) {
  const show = () => window.dispatchEvent(new CustomEvent<HomePinEvent>(HOME_PIN_EVENT, { detail: { r: 2, c: 2, mode: 'rank' } }));
  return (
    <section id="win-retainers" className="scroll-mt-16 py-20 lg:py-24 border-b border-[#1E2B38] bg-[#0B1119]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF8A4F]">New Business · The Prospect Scan</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Close Cold Prospects in 60 Seconds.</h2>
          <p className="mt-3 text-slate-300 text-base sm:text-lg leading-relaxed">Keeping clients pays the bills. New retainers grow the agency. Scan a prospect before the call, and the first minute of your screen share does the selling.</p>
        </div>

        <ol className="mt-12 grid lg:grid-cols-3 gap-7">
          <li className="rounded-2xl bg-[#111923] border border-[#1E2B38] p-6 flex flex-col">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-[#FF6A28]/15 border border-[#FF6A28]/40 flex items-center justify-center"><Radar className="w-4 h-4 text-[#FF8A4F]" aria-hidden="true" /></span>
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-[#FF8A4F]">Before the call</span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-white">Run one scan on the prospect.</h3>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">Type their business name and their money keyword, and drop a 5×5 grid on their service area. Real phones search from all 25 points and record every screen. You need no access to their Google account.</p>
            <div className="mt-auto pt-5">
              <div className="rounded-xl bg-[#090E14] border border-[#243444] p-3">
                <div className="font-mono text-[11px] text-white">“{REPORT.keyword}”</div>
                <div className="mt-2 grid grid-cols-5 gap-1 max-w-[150px]" aria-hidden="true">
                  {PINS.map((p) => { const b = pinBadge(p, 'rank'); return <i key={p.id} className={`aspect-square rounded-full border ${b.bg} ${b.border}`} />; })}
                </div>
                <div className="mt-2 text-[11px] text-slate-400">{STATS.points} points · {STATS.points} recordings</div>
              </div>
            </div>
          </li>

          <li className="rounded-2xl bg-[#111923] border border-[#1E2B38] p-6 flex flex-col">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-[#FF6A28]/15 border border-[#FF6A28]/40 flex items-center justify-center"><Link2 className="w-4 h-4 text-[#FF8A4F]" aria-hidden="true" /></span>
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-[#FF8A4F]">In their inbox</span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-white">Send one no-login link.</h3>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">The report opens in their browser. It shows which rival Google’s AI names ahead of them, where a competitor’s 1-Box replaced the map pack, and which of those points sit in the highest-income census tracts.</p>
            <div className="mt-auto pt-5">
              <div className="rounded-xl bg-white text-slate-900 p-3 space-y-2">
                {[['Roto-Rooter', 21, false], ['Your prospect', 16, true]].map(([n, c, me]) => (
                  <div key={String(n)}>
                    <div className="flex justify-between text-[11px]"><span className={me ? 'font-bold text-violet-700' : 'font-medium text-slate-700'}>{n}</span><span className="font-mono text-slate-500">{c} pts</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${me ? 'bg-violet-600' : 'bg-slate-400'}`} style={{ width: `${(Number(c) / STATS.points) * 100}%` }} /></div>
                  </div>
                ))}
                <div className="text-[10.5px] text-slate-500">Named in the AI Overview’s first three · from the sample report above</div>
              </div>
            </div>
          </li>

          <li className="rounded-2xl bg-[#111923] border border-[#1E2B38] p-6 flex flex-col">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-[#FF6A28]/15 border border-[#FF6A28]/40 flex items-center justify-center"><Play className="w-4 h-4 text-[#FF8A4F]" aria-hidden="true" /></span>
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-[#FF8A4F]">On Zoom</span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-white">Open their worst pin and press play.</h3>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">Share your screen, pick the block where they disappear, and let them watch a real phone run their own search. That minute is the opening for a $1,500–$2,500/mo local retainer, with no slide deck.</p>
            <div className="mt-auto pt-5">
              <button type="button" onClick={show} className="w-full rounded-xl bg-[#090E14] hover:bg-[#0D141D] border border-[#243444] p-3 text-left cursor-pointer transition-colors">
                <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">Example · R3·C3</div>
                <div className="mt-1 text-[12.5px] text-slate-200 leading-snug">A rival holds Google’s 1-Box at the centre of the grid.</div>
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#FF8A4F]">See that pin and its recording <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></div>
              </button>
            </div>
          </li>
        </ol>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <a href="#pricing" className="inline-flex items-center justify-center gap-2 bg-[#FF6A28] hover:bg-[#ff7b40] text-white font-bold text-sm px-5 py-3 rounded-xl shadow-lg shadow-[#FF6A28]/25 transition-all">See Monthly Plans <ArrowRight className="w-4 h-4" aria-hidden="true" /></a>
          <a href={closerHref} className="text-sm font-semibold text-slate-200 hover:text-[#FF8A4F] underline underline-offset-4">Or run two prospect scans once for {closerPrice}</a>
        </div>
      </div>
    </section>
  );
}
