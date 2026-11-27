import { ArrowRight, Check, Radio, X } from 'lucide-react';
import { ACCOUNT_PLANS, type AccountPlan } from '@stakeout/core/gbpPlans';
import { CLOSER, usd } from '@/lib/pricing';
import { DEMO, TRACKER_GRID } from '@/lib/demo-real-scans';
import { OfferBanner, SiteFoot } from '../marketing/SiteKit';
import { HREF } from '../marketing/links';
import PocketBanner from '../pocket/PocketBanner';
import '../marketing/site.css';
import { Bet } from './Bet';
import { ClientReports } from './ClientReports';
import { FounderFacade } from './FounderFacade';
import { HeadToHead, type Duel } from './HeadToHead';
import { HeroReport } from './HeroReport';
import { Pricing, type PlanCard } from './Pricing';
import { WinRetainers } from './WinRetainers';

const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
/** A wrapper for the shared pieces styled under .so (the footer, the offer strip, the pocket test's panel) that adds nothing of its own. */
const SO = { minHeight: 0, background: 'transparent' } as const;

const NAV = [['why-trackers-lie', 'Why Trackers Lie'], ['client-reports', 'Client & AI Reports'], ['founder-proof', 'Founder Proof'], ['pricing', 'Pricing']] as const;
const STACK = [
  { px: '0 – 320px', tag: 'LSAs', text: 'Google Guaranteed Carousel (Roto-Rooter, Nest)', row: 'p-3 bg-[#090E14] border-[#243444]', pxText: 'text-slate-400', badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30', body: 'text-slate-200 font-medium' },
  { px: '320 – 580px', tag: 'ADS', text: 'Sponsored Mobile Call-Only & Search Ads', row: 'p-3 bg-[#090E14] border-[#243444]', pxText: 'text-slate-400', badge: 'bg-sky-500/20 text-sky-300 border border-sky-500/30', body: 'text-slate-200 font-medium' },
  { px: '580 – 1,120px', tag: 'AI OVERVIEW', text: 'AI Business Cards + Cited Directories (Yelp, Angi)', row: 'p-3.5 bg-violet-950/40 border-violet-500/40', pxText: 'text-violet-300', badge: 'bg-violet-600 text-white', body: 'text-white font-semibold' },
  { px: '1,120px+', tag: 'REAL PACK', text: 'True 3-Pack or Competitor 1-Box Hijack (2.5 Scrolls Down)', row: 'p-3.5 bg-emerald-950/35 border-emerald-500/40', pxText: 'text-emerald-300', badge: 'bg-emerald-600 text-white', body: 'text-white font-semibold' },
];

/** Old section links (from other pages, emails and ads) still land on the matching part of this page. */
const Was = ({ ids }: { ids: string[] }) => <>{ids.map((id) => <span key={id} id={id} aria-hidden="true" className="block h-0 scroll-mt-16" />)}</>;

const n = (x: number) => x.toLocaleString('en-US');
/** What a plan really includes, from the plan list checkout uses. */
function planCard(key: AccountPlan, lead: string[]): PlanCard {
  const p = ACCOUNT_PLANS[key];
  return {
    name: p.name,
    dollars: Math.round(p.tiers[0].cents / 100),
    bullets: [
      `${n(p.points)} phone sessions a month: ${n(p.points / 25)} full 5×5 grids`,
      ...lead,
      ...(p.priority ? ['Priority queue: first to the phones and the 5G lines'] : []),
      ...(p.webhooks ? ['Webhooks when a scan finishes'] : []),
      p.seats === null ? 'Unlimited seats and businesses' : `${p.seats} seat${p.seats === 1 ? '' : 's'} · up to ${p.locations} businesses a month`,
    ],
  };
}

/** The 7×7 scan of Nov 15, 2026 beside the ranks a leading rank-grid tool reported for the same points in the same minute. */
const grid = DEMO.scans.grid;
const DUEL: Duel = {
  business: 'Stuart’s Plumbing', keyword: DEMO.keyword, date: grid.date, token: grid.shareToken,
  points: grid.pins.map((p) => ({ id: p.id, pinId: p.pinId, row: p.row, col: p.col, zip: p.zip, theirs: TRACKER_GRID[p.row][p.col], rank: p.rank, pack: p.pack, solo: p.solo, own: p.solo === DEMO.business, aio: p.aio, cited: p.aiCited, aiPos: p.aiPos, aiCount: p.aiCount })),
};

/** The homepage (plans era): the $1 Pocket Test dare, a real report to click through, and the plan ladder. */
export default function HomePage({ live, pocket }: { live: boolean; pocket: boolean }) {
  const orange = 'inline-flex items-center justify-center gap-2 bg-[#FF6A28] hover:bg-[#ff7b40] text-white font-bold shadow-xl shadow-[#FF6A28]/25 transition-all cursor-pointer';
  return (
    <div className="min-h-screen bg-[#090E14] text-slate-100 antialiased selection:bg-[#FF6A28]/30 selection:text-white overflow-x-clip" style={{ fontFamily: FONT }}>
      {pocket && (
        <div className="bg-gradient-to-r from-[#1A120E] via-[#23150E] to-[#1A120E] border-b border-[#FF6A28]/25 text-xs sm:text-[13px]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-start sm:items-center gap-2 text-slate-200">
              <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#FF6A28]/15 border border-[#FF6A28]/40 text-[#FF8A4F] font-mono text-[10px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A28] motion-safe:animate-pulse" />
                Live $1 Dare
              </span>
              <span>Put a physical 5G phone at your exact coordinates right now. Matches the phone in your hand—or your $1 back.</span>
            </div>
            <Bet pocket href="#pricing" className="font-semibold text-[#FF8A4F] hover:text-white inline-flex items-center gap-1 transition-colors whitespace-nowrap ml-auto cursor-pointer">
              Take the $1 Bet <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Bet>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-[#090E14]/90 backdrop-blur-md border-b border-[#1E2B38]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <a href="#top" aria-label="Stakeout Search home" className="flex items-center gap-2.5 group">
            <img src="/brand/stakeout-mark.png" alt="" width={28} height={28} className="w-7 h-7 group-hover:scale-105 transition-transform" />
            <div className="leading-none">
              <span className="font-extrabold tracking-tight text-white text-[17px]">STAKEOUT</span>
              <span className="block font-mono text-[8.5px] tracking-[0.38em] text-[#FF8A4F] font-bold mt-0.5">SEARCH</span>
            </div>
          </a>
          <nav aria-label="Sections" className="hidden md:flex items-center gap-7 text-[13.5px] font-medium text-slate-300">
            {NAV.map(([id, label]) => <a key={id} href={'#' + id} className="hover:text-white transition-colors">{label}</a>)}
          </nav>
          <div className="flex items-center gap-4">
            <a href={HREF.login} className="hidden sm:inline-block text-[13px] font-medium text-slate-400 hover:text-white transition-colors">Log in</a>
            <Bet pocket={pocket} href={HREF.closer} off={<>Live 5G Proof · {usd(CLOSER.cents)}</>} className="inline-flex items-center gap-1.5 bg-[#FF6A28] hover:bg-[#ff7b40] text-white font-semibold text-[13px] px-4 py-2 min-h-[40px] rounded-lg shadow-lg shadow-[#FF6A28]/25 transition-all active:scale-[0.99] cursor-pointer whitespace-nowrap">
              <span>Test Your Pocket · $1</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Bet>
          </div>
        </div>
      </header>

      <main>
        <section id="top" className="relative pt-8 pb-16 lg:pt-14 lg:pb-24 overflow-hidden border-b border-[#1E2B38]">
          <Was ids={['real-vs-reported', 'ai-overviews']} />
          <div aria-hidden="true" className="pointer-events-none absolute -top-36 left-1/4 w-[620px] h-[420px] rounded-full bg-[#FF6A28]/[0.08] blur-[130px]" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-8 items-start">
              <div className="lg:col-span-5 flex flex-col justify-center pt-1">
                <div className="inline-flex items-center gap-2 self-start px-2.5 py-1 rounded-md bg-[#111923] border border-[#1E2B38] mb-5">
                  <Radio className="w-3.5 h-3.5 shrink-0 text-[#FF6A28]" aria-hidden="true" />
                  <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#FF8A4F]">Physical Android Silicon • Live US 5G • MP4 Video Receipts</span>
                </div>
                <h1 className="text-[30px] sm:text-[42px] lg:text-[44px] xl:text-[48px] font-extrabold tracking-[-0.035em] leading-[1.07] text-white">
                  Your Buyers Search on 5G Phones. Why Are You Paying Monthly for <span className="text-[#FF6A28]">Fake Green Dots?</span>
                </h1>

                <div className="mt-6 flex flex-col sm:flex-row gap-3 order-2 sm:order-3">
                  {pocket && (
                    <Bet pocket href="#pricing" className={`${orange} text-[15px] px-6 py-3.5 rounded-xl`}>
                      <span>Test Your Exact Location · $1</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Bet>
                  )}
                  <a href="#pricing" className={pocket ? 'inline-flex items-center justify-center bg-[#111923] hover:bg-[#182330] text-slate-200 border border-[#273646] font-semibold text-[14.5px] px-5 py-3.5 rounded-xl transition-colors' : `${orange} text-[15px] px-6 py-3.5 rounded-xl`}>See Monthly Plans</a>
                </div>
                {pocket && <p className="mt-3 text-[12px] text-slate-400 leading-relaxed order-3 sm:order-4">Apple Pay &amp; Google Pay · 1 live 5G video receipt · Matches your phone (cellular + private tab) or send a screenshot for a full $1 refund.</p>}

                <p className="mt-5 text-[15.5px] text-slate-300 leading-[1.6] order-4 sm:order-2">
                  Google’s anti-scraping crackdown pushed legacy grid tools onto raw Maps APIs and data-center emulators. They completely miss <strong className="text-white font-semibold">Local Service Ads</strong>, <strong className="text-white font-semibold">1-Box competitor hijacks</strong>, and <strong className="text-white font-semibold">AI Overviews</strong> shoving your client off the screen. Stakeout runs physical phones on real 5G lines—and records every search on video.
                </p>

                <figure className="mt-7 p-4 rounded-xl bg-[#111923]/90 border border-[#1E2B38] order-5">
                  <div className="flex items-start gap-3">
                    <div aria-hidden="true" className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500/30 to-amber-500/10 border border-[#FF6A28]/40 flex items-center justify-center text-xs font-bold text-[#FF8A4F] shrink-0">SR</div>
                    <div className="min-w-0">
                      <figcaption className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-white">Stephanie R.</span>
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"><Check className="w-2.5 h-2.5" aria-hidden="true" /> Verified $1 Bet Buyer</span>
                      </figcaption>
                      <blockquote className="text-[13px] text-slate-300 mt-1 leading-snug italic">“Ran the bet and it was very close. It showed LSA, sponsored ads, AI overview, map pack. Great job.”</blockquote>
                    </div>
                  </div>
                </figure>
              </div>

              <HeroReport pocket={pocket} />
            </div>
          </div>
        </section>

        <HeadToHead duel={DUEL} pocket={pocket} />

        <section id="why-trackers-lie" className="scroll-mt-16 py-20 lg:py-24 border-b border-[#1E2B38] bg-[#0B1119]">
          <Was ids={['real-hardware']} />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF8A4F]">The Scraper Crackdown Explained</span>
              <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Just Because a Tool Says “Mobile” Doesn’t Mean It’s a Phone.</h2>
              <p className="mt-3 text-slate-300 text-base sm:text-lg leading-relaxed">
                Recent Google anti-scraping updates locked headless servers out of live search results. Legacy rank trackers quietly pivoted to raw <strong className="text-white">Maps-only API feeds</strong>—measuring a desktop word-association map while missing 1,120 pixels of ads and AI Overviews pushing your client off the screen.
              </p>
            </div>

            <div className="mt-12 grid lg:grid-cols-2 gap-8 items-stretch">
              <div className="rounded-2xl bg-[#111923] border border-[#1E2B38] p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-[10.5px] font-bold uppercase tracking-wider"><X className="w-3.5 h-3.5" aria-hidden="true" /> Legacy Map Grid Trackers</div>
                  <h3 className="mt-4 text-xl sm:text-2xl font-bold text-white">The “#2 Green Dot” Mirage</h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">What happens when a cloud scraper slaps a fake iPhone header onto a Linux server and queries a Maps API endpoint:</p>
                  <div className="mt-6 p-5 rounded-xl bg-[#090E14] border border-dashed border-slate-700 flex items-center gap-5">
                    <div aria-hidden="true" className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-2xl font-extrabold text-emerald-300 shrink-0">#2</div>
                    <div>
                      <div className="text-sm font-bold text-white">Tracker says: “You’re #2 right here!”</div>
                      <p className="text-xs text-slate-400 mt-1">Stand on that exact corner with a real 5G phone and you aren’t #2 at all—you’re #9, completely missing from the 3-Pack, or wiped out by a competitor’s 1-Box. The scraper queried a Maps API from the city center and painted a fake green dot.</p>
                    </div>
                  </div>
                  <ul className="mt-6 space-y-3 text-sm text-slate-300">
                    <li className="flex items-start gap-2.5"><X className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" /><span><strong className="text-white">Forced onto Maps-only APIs:</strong> Not the real Google Search 3-Pack where homeowners actually tap and call.</span></li>
                    <li className="flex items-start gap-2.5"><X className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" /><span><strong className="text-white">UULE Centroid Snapback:</strong> Spoofed coordinate parameters routinely snap back to the city center on “best” and “near me” searches.</span></li>
                    <li className="flex items-start gap-2.5"><X className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" /><span><strong className="text-white">Fails Play Integrity Attestation:</strong> Synthetic headless Chromium browsers cannot fake hardware-backed silicon signatures.</span></li>
                  </ul>
                </div>
                <div className="mt-8 pt-4 border-t border-[#1E2B38] text-xs text-slate-500 font-mono">RESULT: NOISY MEASUREMENT → SUPERSTITIOUS SEO</div>
              </div>

              <div className="rounded-2xl bg-gradient-to-b from-[#15202D] to-[#111923] border border-[#FF6A28]/35 p-6 sm:p-8 flex flex-col justify-between relative">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[10.5px] font-bold uppercase tracking-wider"><Check className="w-3.5 h-3.5" aria-hidden="true" /> Stakeout Physical 5G Android Capture</div>
                  <h3 className="mt-4 text-xl sm:text-2xl font-bold text-white">The Real 1,400px Mobile SERP Stack</h3>
                  <p className="mt-2 text-sm text-slate-300 leading-relaxed">Physical Android silicon passes Google Play Integrity natively on live US 5G lines—recording every layer between your buyer’s thumb and your listing:</p>
                  <div className="mt-6 space-y-2.5">
                    {STACK.map((s) => (
                      <div key={s.tag} className={`flex items-center gap-3 rounded-lg border ${s.row}`}>
                        <span className={`font-mono text-[10.5px] sm:text-[11px] w-[76px] sm:w-24 shrink-0 ${s.pxText}`}>{s.px}</span>
                        <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${s.badge}`}>{s.tag}</span>
                        <span className={`text-xs sm:text-sm ${s.body}`}>{s.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-7 pt-4 border-t border-[#243444] flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-slate-300">{pocket ? 'Fact-check this stack on your own block in about five minutes:' : 'Run it on your own block:'}</span>
                  <Bet pocket={pocket} href="#pricing" off={<>See plans <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></>} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF8A4F] hover:text-white transition-colors cursor-pointer">
                    Run the $1 Pocket Test <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Bet>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Was ids={['report']} />
        <ClientReports pocket={pocket} />
        <WinRetainers closerHref={HREF.closer} closerPrice={usd(CLOSER.cents)} />

        <section id="founder-proof" className="scroll-mt-16 py-20 lg:py-24 border-b border-[#1E2B38] bg-[#0B1119]">
          <Was ids={['founder-story']} />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              <div className="lg:col-span-6">
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF8A4F]">Built for Survival, Not Vanity Metrics</span>
                <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Bright Green Grids Nearly Cost Me Everything.</h2>
                <div className="mt-5 space-y-4 text-[15.5px] text-slate-300 leading-relaxed">
                  <p>Before building Stakeout Search, I converted my traditional SEO agency into a <strong className="text-white">100% performance lead-generation business</strong>. No monthly retainers to hide behind—if the phones didn’t ring, my family didn’t eat.</p>
                  <p>Three months in, the phones went dead silent. Overnight, revenue flatlined. Yet when I logged into three separate rank trackers I was paying hundreds of dollars a month for, every single market was glowing with bright green grids.</p>
                  <blockquote className="my-5 p-4 sm:p-5 rounded-xl bg-[#111923] border-l-4 border-[#FF6A28] text-white font-medium text-[15px] leading-snug">“On paper, three top rank trackers swore we were #1 everywhere. In reality, the phones were dead—and I came within inches of losing my house, my cars, and everything I built for my family.”</blockquote>
                  <p>Out of pure survival, I put the top trackers head-to-head against physical phones at the exact same coordinates and exposed the truth: <em className="text-white font-semibold">when measurement becomes noisy, optimization becomes superstition.</em> I built Stakeout on physical Android hardware and live 5G lines so a fake green grid could never blindside my livelihood again.</p>
                </div>
              </div>
              <div className="lg:col-span-6">
                <div className="rounded-2xl bg-[#111923] border border-[#243444] overflow-hidden shadow-2xl">
                  <div className="px-4 py-3 bg-[#090E14] border-b border-[#1E2B38] flex items-center justify-between gap-2">
                    <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-[#FF8A4F]">📼 Recorded Before Stakeout Existed • Unfiltered Breakdown</span>
                    <span className="text-[11px] font-mono text-slate-400">07:38</span>
                  </div>
                  <FounderFacade />
                  <div className="p-4 sm:p-5 text-xs sm:text-[13px] text-slate-300 leading-relaxed">Watch the original side-by-side test putting three major local rank trackers against physical mobile phones in Fort Lauderdale—exposing Maps API distortions, UULE snapback, and live mobile AI packs.</div>
                </div>
              </div>
            </div>

            <div className="mt-12 rounded-2xl bg-gradient-to-r from-[#161F2C] via-[#1B2533] to-[#161F2C] border border-[#2C3E52] p-6 sm:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-white">Don’t take our word for it—and definitely don’t take your current tracker’s word for it.</h3>
                <p className="text-sm text-slate-300 mt-1">{pocket ? 'Pull out your phone right now (iPhone or Android) and put our live 5G hardware head-to-head against your own pocket for $1.' : 'Pull out your phone and check a real recording against your own pocket.'}</p>
              </div>
              <Bet pocket={pocket} href="#pricing" off={<><span>See plans and pricing</span><ArrowRight className="w-4 h-4" aria-hidden="true" /></>} className={`shrink-0 ${orange} text-sm px-5 py-3.5 rounded-xl`}>
                <span>Run the $1 Pocket Test Live</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Bet>
            </div>
          </div>
        </section>

        <Was ids={['google-listings', 'watchdog', 'start', 'honest-math']} />
        {live && <div className="so" style={SO}><OfferBanner live={live} href={HREF.pricing} plans /></div>}

        <Pricing
          pocket={pocket}
          scout={planCard('P_SCOUT', ['Physical Android captures on live US 5G lines', 'MP4 video receipt + DOM evidence on every point', 'Map Pack, 1-Box Hijack & 4-label AI Overview tracking', 'Shareable Local & AI Visibility Reports'])}
          agency={planCard('P_AGENCY', ['Full White-Label Reports (your agency logo, name & brand accent)', 'U.S. Census Household Income shading on every grid', 'AI Citation Source Audit + Automated Priority Actions', 'Live report embeds for client dashboards'])}
          scale={planCard('P_SCALE', ['Everything in Agency'])}
          max={planCard('P_MAX', ['Everything in Scale'])}
          plansHref={HREF.plans}
          pricingHref={HREF.pricing}
          closerHref={HREF.closer}
          closerPrice={usd(CLOSER.cents)}
          supportHref={HREF.support}
          supportEmail={HREF.support.replace('mailto:', '')}
        />
      </main>

      <div className="so" style={SO}>
        <SiteFoot note="Verified on physical Android phones over live US 5G cellular lines. Every number comes with a real-device receipt. The report figures and phone recordings on this page come from the November 25, 2026 scan of Stuart’s Plumbing in Lakeland, Florida; the head-to-head comes from the 49-point scan of November 15, 2026." />
        {pocket && <PocketBanner bar={false} />}
      </div>
    </div>
  );
}
