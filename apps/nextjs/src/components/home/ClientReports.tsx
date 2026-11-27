'use client';

import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Sparkles } from 'lucide-react';
import { HOME_PIN_EVENT, REPORT, REPORT_URL, STATS, type HomePinEvent } from './data';

/** Read off the public report for the Nov 25 scan (its Competing firms and Sources panels and its two priority actions). */
const FIRMS = [
  { name: 'Roto-Rooter', count: 21, me: false },
  { name: 'Stuart’s Plumbing (Client)', count: 16, me: true },
  { name: '1-Tom-Plumber', count: 14, me: false },
  { name: 'Benjamin Franklin Plumbing', count: 12, me: false },
  { name: 'AP Drain Service', count: 3, me: false },
  { name: 'Richard Fox Plumbing', count: 1, me: false },
  { name: 'True Plumbers & AC', count: 1, me: false },
];
const DOMAINS = [
  { domain: 'rotorooter.com', count: 25, own: false },
  { domain: 'benjaminfranklinplumbing.com', count: 20, own: false },
  { domain: 'angi.com', count: 19, own: false },
  { domain: 'youtube.com', count: 19, own: false },
  { domain: 'plumbingexperts.com', count: 19, own: false },
  { domain: 'allproplumbingpdx.com', count: 19, own: false },
  { domain: 'stuartsplumbing.com (Client)', count: 1, own: true },
];
const ANSWERS = 25;

const openPin = (detail: HomePinEvent) => window.dispatchEvent(new CustomEvent(HOME_PIN_EVENT, { detail }));

export function ClientReports({ pocket }: { pocket: boolean }) {
  const [own, setOwn] = useState(false);
  return (
    <section id="client-reports" className="scroll-mt-16 py-20 lg:py-24 border-b border-[#1E2B38]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF8A4F]">White-Label Client &amp; AI Visibility Reports</span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">“I Searched From Home Last Night. Why Didn’t I See Us?”</h2>
            <p className="mt-3 text-slate-300 text-base sm:text-lg leading-relaxed">Every agency dreads that text message. Instead of making excuses about browser cache, send one white-label report link with real-phone recordings, clean deduplicated competitor share, and exact AI citation gaps.</p>
          </div>
          <div className="self-start lg:self-end flex flex-wrap items-center gap-3 bg-[#111923] border border-[#243444] rounded-xl p-2" role="group" aria-label="Report branding">
            <span className="text-xs text-slate-300 pl-2 font-medium">Report Branding:</span>
            <button type="button" aria-pressed={!own} onClick={() => setOwn(false)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${!own ? 'bg-[#FF6A28] text-white' : 'text-slate-400 hover:text-white'}`}>Stakeout Default</button>
            <button type="button" aria-pressed={own} onClick={() => setOwn(true)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${own ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Your Agency White-Label</button>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-7 items-stretch">
          <div className="lg:col-span-7 rounded-2xl bg-white text-slate-900 border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
            <div className={`px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 text-white ${own ? 'bg-indigo-950' : 'bg-[#0D141D]'}`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black ${own ? 'bg-indigo-400 text-indigo-950' : 'bg-[#FF6A28] text-slate-950'}`}>{own ? 'A' : 'S'}</div>
                <span className="font-bold text-xs tracking-tight">{own ? 'YOUR AGENCY NAME · CLIENT PORTAL' : 'STAKEOUT SEARCH · VERIFIED REPORT'}</span>
              </div>
              <span className="font-mono text-[10px] text-slate-300 uppercase">No Login Required for Client</span>
            </div>

            <div className="flex-1 p-6 sm:p-7 grid sm:grid-cols-2 gap-7 content-start">
              <div>
                <h3 className="text-[15px] font-extrabold text-slate-900 tracking-tight">Firms Named First in AI Overviews</h3>
                <p className="text-xs text-slate-500 mt-0.5">Among the first three named · clean brand-deduplicated tally across {STATS.points} points</p>
                <div className="mt-4 space-y-3.5">
                  {FIRMS.map((f) => (
                    <div key={f.name}>
                      <div className="flex justify-between gap-3 text-xs mb-1">
                        <span className={f.me ? 'font-bold text-violet-700' : 'font-medium text-slate-700'}>{f.name}</span>
                        <span className="font-mono text-slate-500">{f.count} pts</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${f.me ? 'bg-violet-600' : 'bg-slate-400'}`} style={{ width: `${(f.count / STATS.points) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-[15px] font-extrabold text-slate-900 tracking-tight">Websites Google’s AI Actually Cites</h3>
                <p className="text-xs text-slate-500 mt-0.5">Exposes why retainers are needed even at 100% AI presence</p>
                <div className="mt-4 space-y-3.5">
                  {DOMAINS.map((d) => (
                    <div key={d.domain}>
                      <div className="flex justify-between gap-3 text-xs mb-1">
                        <span className={`truncate ${d.own ? 'font-bold text-rose-600' : 'font-medium text-slate-700'}`}>{d.domain}</span>
                        <span className={`font-mono shrink-0 ${d.own ? 'font-bold text-rose-600' : 'text-slate-500'}`}>{d.count}/{ANSWERS}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${d.own ? 'bg-rose-600' : 'bg-slate-700'}`} style={{ width: `${Math.max(5, (d.count / ANSWERS) * 100)}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-amber-50 border-t border-amber-200/80 text-xs text-amber-950 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
              <span><strong>Retainer Upsell Built In:</strong> Show prospects in 5 seconds which outside sites feed Google’s AI answers while their own website is cited in just <strong>1 of {ANSWERS}</strong>.</span>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-white text-slate-900 border border-slate-200 shadow-2xl p-6 sm:p-7 flex flex-col justify-between">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#FF6A28]">Zero Manual Writing · Computed From Real Pins</span>
              <h3 className="mt-1 text-xl font-extrabold text-slate-900 tracking-tight">Automated Priority Actions</h3>
              <p className="text-xs text-slate-500 mt-1">Every recommendation links straight back to the exact GPS pins &amp; MP4 video evidence behind it:</p>

              <div className="mt-5 space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#FF6A28]">1 · Map Pack Edge</div>
                  <h4 className="text-sm font-bold text-slate-900 mt-0.5">Hold the map pack into Lakeland &amp; Auburndale</h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">For “{REPORT.keyword}” the firm is top 3 at 9 of 25 points with local results, strongest in Eaton Park. It falls to #6 or lower, out of the pack, or behind another firm’s single panel at 15 points: the western edge (5) and the northern row (5).</p>
                  <div className="mt-2.5 pt-2 border-t border-dashed border-slate-300 flex flex-wrap gap-1.5">
                    {[{ label: 'R1·C1 1-Box', r: 0, c: 0 }, { label: 'R3·C3 1-Box', r: 2, c: 2 }, { label: 'R2·C3 #8', r: 1, c: 2 }].map((ev) => (
                      <button key={ev.label} type="button" onClick={() => openPin({ r: ev.r, c: ev.c, mode: 'rank' })} className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-white border border-slate-300 hover:border-[#FF6A28] hover:text-[#FF6A28] transition-colors cursor-pointer">{ev.label} ↗</button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-violet-700">2 · Where the AI Reads</div>
                  <h4 className="text-sm font-bold text-slate-900 mt-0.5">Strengthen the profiles the AI cites: rotorooter.com &amp; benjaminfranklinplumbing.com</h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">Over 25 AI answers read, the most cited sites were rotorooter.com (25), benjaminfranklinplumbing.com (20), angi.com (19). The firm’s own site was cited in 1. A complete, current profile on the sites the answer leans on is the most direct way into it.</p>
                  <div className="mt-2.5 pt-2 border-t border-dashed border-slate-300">
                    <button type="button" onClick={() => openPin({ r: 4, c: 1, mode: 'ai' })} className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-white border border-slate-300 hover:border-violet-600 hover:text-violet-700 transition-colors cursor-pointer">Inspect R5·C2 (own site cited) ↗</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <a href={REPORT_URL} className="font-bold text-slate-900 hover:text-[#FF6A28] inline-flex items-center gap-1">Open this report <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" /></a>
              <a href="#pricing" className="font-bold text-slate-900 hover:text-[#FF6A28] inline-flex items-center gap-1">{pocket ? 'Included in Plans' : 'See plans'} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
