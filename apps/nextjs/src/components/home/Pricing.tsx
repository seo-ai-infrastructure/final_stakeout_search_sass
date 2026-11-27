'use client';

import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';

export type PlanCard = { name: string; dollars: number; bullets: string[] };

/** The plan ladder. Prices and what each plan includes come from the live plan list, and each button starts that plan's sign-up; the $1 switch shows what a Pocket Test buyer pays the first month. */
export function Pricing({ pocket, scout, agency, scale, max, plansHref, pricingHref, closerHref, closerPrice, supportHref, supportEmail }: { pocket: boolean; scout: PlanCard; agency: PlanCard; scale: PlanCard; max: PlanCard; plansHref: string; pricingHref: string; closerHref: string; closerPrice: string; supportHref: string; supportEmail: string }) {
  const [off, setOff] = useState(true);
  const [big, setBig] = useState<'scale' | 'max'>('scale');
  const high = big === 'scale' ? scale : max;
  const less = pocket && off;
  const price = (p: PlanCard) => (
    <div className="mt-5 flex items-baseline gap-2">
      <span className="text-4xl font-extrabold text-white tracking-tight">${less ? p.dollars - 1 : p.dollars}</span>
      <span className="text-sm text-slate-400">{less ? `first mo · then $${p.dollars}/mo` : '/ month'}</span>
    </div>
  );
  const list = (items: string[], tick: string, text: string) => (
    <ul className={`mt-6 space-y-3 text-sm ${text}`}>
      {items.map((b) => <li key={b} className="flex items-start gap-2.5"><Check className={`w-4 h-4 ${tick} shrink-0 mt-0.5`} aria-hidden="true" /><span>{b}</span></li>)}
    </ul>
  );
  // Each plan's button goes straight to sign-up and the plan checkout, as on the pricing page.
  const cta = (cls: string, p: PlanCard) => <a href={plansHref} className={cls + ' block text-center'}>Start {p.name}{'\u00A0'}→</a>;
  return (
    <section id="pricing" className="scroll-mt-16 py-20 lg:py-24 border-b border-[#1E2B38]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF8A4F]">Transparent Hardware Pricing • No Coin Meters</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Real 5G Phones. Predictable Monthly Plans. Zero “Casino Coins.”</h2>
          <p className="mt-3 text-slate-300 text-base">Every pin runs on physical Android hardware over live US 5G lines—with MP4 video receipts and AI Overview parsing included.</p>
          {pocket && (
            <div className="mt-5 inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-[#111923] border border-[#243444] text-xs text-slate-200 text-left">
              <input id="dollar-off-toggle" type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} className="accent-[#FF6A28] cursor-pointer" />
              <label htmlFor="dollar-off-toggle" className="cursor-pointer select-none">Ran the <strong>$1 Pocket Test</strong>? Your $1 comes off your first month automatically.</label>
            </div>
          )}
        </div>

        <div className="mt-12 grid lg:grid-cols-3 gap-7 items-stretch">
          <div className="rounded-2xl bg-[#111923] border border-[#1E2B38] p-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl font-bold text-white">{scout.name}</h3>
                <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300">Solo &amp; In-House</span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">Verify real 5G neighborhood visibility for flagship locations without scraper guesswork.</p>
              {price(scout)}
              {list(scout.bullets, 'text-emerald-400', 'text-slate-300')}
            </div>
            {cta('mt-8 w-full py-3 px-4 rounded-xl bg-[#182330] hover:bg-[#213042] border border-[#2C3E52] text-white font-semibold text-sm transition-colors cursor-pointer', scout)}
          </div>

          <div className="rounded-2xl bg-gradient-to-b from-[#192434] to-[#111923] border-2 border-[#FF6A28] p-7 flex flex-col justify-between relative shadow-2xl shadow-[#FF6A28]/10">
            <div className="absolute -top-3.5 left-6 px-3 py-0.5 rounded-full bg-[#FF6A28] text-white font-mono text-[10px] font-bold uppercase tracking-wider">Built for Agencies · Retainer Closer</div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl font-bold text-white">{agency.name}</h3>
                <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[#FF6A28]/15 text-[#FF8A4F] border border-[#FF6A28]/30">Multi-Client SEO</span>
              </div>
              <p className="text-xs text-slate-300 mt-1.5">Win pitches and defend retainers with white-label client links, AI citation audits, and census wealth maps.</p>
              {price(agency)}
              {list(agency.bullets, 'text-[#FF8A4F]', 'text-slate-200')}
            </div>
            {cta('mt-8 w-full py-3.5 px-4 rounded-xl bg-[#FF6A28] hover:bg-[#ff7b40] text-white font-bold text-sm shadow-lg shadow-[#FF6A28]/25 transition-all cursor-pointer', agency)}
          </div>

          <div className="rounded-2xl bg-[#111923] border border-[#1E2B38] p-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl font-bold text-white">{high.name}</h3>
                <div className="inline-flex p-0.5 rounded-lg bg-[#090E14] border border-[#243444] text-[11px]" role="group" aria-label="Plan size">
                  <button type="button" aria-pressed={big === 'scale'} onClick={() => setBig('scale')} className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${big === 'scale' ? 'bg-[#1E2B38] text-white' : 'text-slate-400'}`}>Scale</button>
                  <button type="button" aria-pressed={big === 'max'} onClick={() => setBig('max')} className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${big === 'max' ? 'bg-[#1E2B38] text-white' : 'text-slate-400'}`}>Max</button>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">Built for performance lead-gen fleets &amp; large multi-market agencies running dense 5×5 and 7×7 grids.</p>
              {price(high)}
              {list(high.bullets, 'text-emerald-400', 'text-slate-300')}
            </div>
            {cta('mt-8 w-full py-3 px-4 rounded-xl bg-[#182330] hover:bg-[#213042] border border-[#2C3E52] text-white font-semibold text-sm transition-colors cursor-pointer', high)}
          </div>
        </div>

        <div className="mt-7 rounded-xl bg-gradient-to-r from-[#1A120E] via-[#23150E] to-[#1A120E] border border-[#FF6A28]/35 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <span className="shrink-0 px-2.5 py-1 rounded bg-[#FF6A28]/15 border border-[#FF6A28]/40 font-mono text-xs font-bold uppercase text-[#FF8A4F]">Dead-Tracker Buyout</span>
          <p className="text-sm text-slate-200 leading-relaxed"><strong className="text-white">Locked into a legacy grid contract?</strong> Forward your last rank-tracker receipt to <a href={supportHref} className="font-semibold text-[#FF8A4F] hover:text-white underline underline-offset-4">{supportEmail}</a> after signing up and we’ll add <strong className="text-white">500 bonus phone sessions</strong> to your first month: twenty 5×5 grids on us.</p>
        </div>

        <p className="mt-6 text-center text-[13px] text-slate-400">
          <a href={pricingHref} className="font-semibold text-slate-200 hover:text-[#FF8A4F] underline underline-offset-4">Full pricing, yearly billing and the listing add-on</a>
        </p>

        <div className="mt-8 rounded-xl bg-[#0D141D] border border-[#1E2B38] px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <span className="shrink-0 px-2.5 py-1 rounded bg-slate-800 border border-slate-700 font-mono text-xs font-bold text-slate-200">ONE-TIME PACK</span>
            <p className="text-sm text-slate-300"><strong className="text-white">Not ready for a monthly subscription?</strong> Run two full 5×5 grids once with the <strong className="text-white">Live 5G Proof Pack</strong>—50 phone sessions, each with its video receipt.</p>
          </div>
          <a href={closerHref} className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-slate-200 hover:text-[#FF8A4F] border border-[#2C3E52] hover:border-[#FF6A28]/50 px-4 py-2.5 rounded-lg transition-colors">Run the Live 5G Proof Pack · {closerPrice} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></a>
        </div>
      </div>
    </section>
  );
}
