'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { GeoGridDashboard } from '@/components/GeoGridDashboard';
import { SiteFooter, SiteHeader } from '@/components/marketing/SiteChrome';
import '@/components/marketing/marketing.css';
import PinCompare from './PinCompare';
import { RetentionCalculator, RetentionToggle, SoloSlots } from './RetentionProof';
import { DEMO, TRACKER_GRID, type RealPin, type ScanKey, pct, scanStats, shareReportUrl } from '@/lib/demo-real-scans';

// The Done-For-You sprint offer lives on the agency page (/agency).
const SPRINT_URL = '/agency#apply';
const IMG = '/media/demo/';
type MapMode = 'combined' | 'rank' | 'ai' | 'ads';
type View = { mode: MapMode; tab: 'overview' | 'evidence' };
const SCANS: { key: ScanKey; name: string }[] = [
  { key: 'top25', name: 'Top 25 Demo Map' },
  { key: 'grid', name: 'Standard 7 × 7 grid' },
];
const EYEBROW = 'mk-mono text-[12px] uppercase tracking-widest';
const SHOT = 'block w-full rounded-xl border border-[#1b2431] shadow-[0_20px_60px_rgba(0,0,0,0.5)]';
/** The point the Evidence feature opens on: #1 in a full local list and #1 in the AI answer, so every panel has something to show. */
const proofPin = (pins: RealPin[]) => pins.find(p => p.aiPos === 1 && p.rank === 1 && p.pack) ?? pins.find(p => p.aiPos === 1) ?? pins[0];

/** Public sales demo: real report screenshots, then the real shared report itself, embedded as-is. */
export default function RealReportDemo() {
  const [scanKey, setScanKey] = useState<ScanKey>('top25');
  const [view, setView] = useState<View>({ mode: 'combined', tab: 'overview' });
  const { mode, tab } = view;
  const report = useRef<HTMLElement>(null);
  const scan = DEMO.scans[scanKey], s = scanStats(scan);
  const top = scanStats(DEMO.scans.top25), grid = scanStats(DEMO.scans.grid);
  const proof = proofPin(DEMO.scans.top25.pins);
  const lead = DEMO.scans.top25.leaders[0], tied = !!lead && DEMO.scans.top25.leaders[1]?.top3 === lead.top3;

  // Head to head: the rank-grid tool's numbers against the phone scan on the same 49 points.
  const theirs = TRACKER_GRID.flat(), gridPins = DEMO.scans.grid.pins;
  const theirTop3 = theirs.filter(r => r <= 3).length, theirLow = theirs.length - theirTop3;
  const lowButNamed = gridPins.filter(p => TRACKER_GRID[p.row][p.col] > 3 && p.aiCited).length;
  const noListNamed = gridPins.filter(p => !p.pack && p.aiCited).length;
  const gridVisible = gridPins.filter(p => p.rank != null || p.aiCited).length;
  const gridSolo = gridPins.filter(p => !p.pack && p.solo).length, gridNoLocal = grid.singleBusiness - gridSolo;

  // Proof points: every figure is counted from the Top 25 scan's own pins.
  const t25 = DEMO.scans.top25, visible = t25.pins.filter(p => p.rank != null || p.aiCited).length;
  const named = (name: string) => t25.aiNamed.find(a => a.name === name);
  const me = named(DEMO.business);
  // The business the AI names most while the local results barely show it, and the local leader the AI names least.
  const aiOnly = t25.aiNamed.filter(a => a.name !== DEMO.business).sort((a, b) => b.named - b.localFound - (a.named - a.localFound))[0];
  const packOnly = t25.leaders.filter(l => l.top3 === lead?.top3).map(l => ({ ...l, ai: named(l.name) })).filter(l => l.ai).sort((a, b) => (a.ai?.named ?? 0) - (b.ai?.named ?? 0))[0];
  const soloText = t25.solos.slice(0, 2).map(x => `${x.name} took ${x.count}`).concat(`${DEMO.business} took ${t25.solos.find(x => x.name === DEMO.business)?.count ?? 0}`).join(', ');
  const ownRank = t25.sites.findIndex(x => x.domain === DEMO.ownDomain);
  const proofs: { tag: string; big: string; title: string; text: string }[] = [
    { tag: 'The client-retention lifesaver', big: `${pct(top.top3, top.n)}% → ${pct(visible, top.n)}%`, title: 'A “Weak” Rank Score Hid Real Visibility', text: `Read as local rank alone, this scan shows ${DEMO.business} not found at ${top.notFound} of ${top.n} points, with a ${pct(top.top3, top.n)}% share of local voice. That is the kind of report that loses clients. Stakeout shows the business was on the screen at ${visible} of ${top.n} points, in the local results or named in the AI answer: Google’s AI Overview recommended it at ${top.notFoundButNamed} of the ${top.notFound} points where it missed the pack${me ? `, and listed it first ${me.first} times (average place #${me.avgPlace})` : ''}.` },
    { tag: 'The 3-pack is disappearing', big: `${top.singleBusiness} of ${top.n}`, title: 'Google Showed One Business, Not Three', text: `At ${pct(top.singleBusiness, top.n)}% of points Google showed no 3-pack and gave the local result to a single business: ${soloText}. An AI Overview appeared on ${top.aio} of ${top.n} searches.` },
    ...(packOnly?.ai && aiOnly ? [{ tag: 'Map-pack winners, AI losers', big: `${pct(packOnly.top3, top.n)}% vs ${pct(packOnly.ai.named, top.n)}%`, title: 'Leading the Map Is Not Leading the Answer', text: `${packOnly.name} ${tied ? 'is tied for' : 'has'} the most top-3 placements (${packOnly.top3} of ${top.n}), yet the AI named it in only ${packOnly.ai.named} of ${top.n} answers and ${packOnly.ai.first === 0 ? 'never first' : `first ${packOnly.ai.first} times`} (average place #${packOnly.ai.avgPlace}). ${aiOnly.name} was found in the local results at only ${aiOnly.localFound} of ${top.n} points, yet the AI named it in ${aiOnly.named}.` }] : []),
    ...(top.rivalSite ? [{ tag: 'AI citations, itemised', big: `${top.rivalSite.count} vs ${top.ownSite}`, title: 'The Exact Sites Feeding the AI Answer', text: `Instead of guessing how to get into the AI answer, you get every site it cited, counted: ${t25.sites.slice(0, 4).map(x => `${x.domain} (${x.count} of ${top.n})`).join(', ')}. ${DEMO.ownDomain} ${ownRank > 0 ? `sits behind ${ownRank} of them` : 'is on that list'}. That gap is the work order.` }] : []),
  ];

  const show = (next: View, nextScan: ScanKey = scanKey, anchor?: string) => {
    setView(next); setScanKey(nextScan);
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!anchor) { report.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }); return; }
    // The report may remount and refetch first: wait for the section to exist, then go to it.
    let tries = 0;
    const go = () => { const el = report.current?.querySelector('#' + anchor); if (el) el.scrollIntoView({ block: 'start' }); else if (tries++ < 40) window.setTimeout(go, 150); };
    window.setTimeout(go, 150);
  };

  const features: { tag: string; title: string; text: string; proof: string; img: string; alt: string; open: () => void }[] = [
    { tag: 'New · AI Overview Local Pack Tracker', title: 'Your Place in Google’s AI Answer, Mapped Point by Point', text: 'On more and more local searches the AI Overview is the local pack. At every point Stakeout records whether you are #1 in its list, named further down, left out, or whether there was no AI Overview at all.', proof: `Named at ${top.named} of ${top.n} points, #1 at ${top.namedFirst}`, img: 'ai-place-map.jpg', alt: 'Stakeout AI place map: the business’s position in Google’s AI Overview at each of 25 points in Lakeland', open: () => show({ mode: 'ai', tab: 'overview' }, 'top25') },
    { tag: 'Full AI Overview tracking', title: 'Which Websites and Businesses the AI Trusts', text: 'Every website the AI cited and every business it named across the scan, in the order it listed them, set against their local rank. You see whose site is feeding the answer, and how far yours has to climb.', proof: top.rivalSite ? `${top.rivalSite.domain} cited in ${top.rivalSite.count} of ${top.n} answers. ${DEMO.ownDomain}: ${top.ownSite}` : `AI Overview on ${top.aio} of ${top.n} searches`, img: 'ai-overview-coverage.jpg', alt: 'AI Overview coverage: websites the AI cited and businesses the AI named across the scan', open: () => show({ mode: 'combined', tab: 'overview' }, 'top25', 'ai-overview-coverage') },
    { tag: 'Evidence tab · video receipts', title: 'Exactly What That Phone Saw', text: 'Pick any point and get the screen recording, the results page, the Local Finder, the AI Overview text copied from Google, who is ahead of you, who is advertising, and the income and homeownership of that neighborhood.', proof: `Point R${proof.row + 1}·C${proof.col + 1}: ${proof.rank ? `#${proof.rank} in the local results` : 'no local rank'}${proof.aiPos ? `, #${proof.aiPos} in the AI Overview` : ''}`, img: 'evidence-tab.jpg', alt: 'Evidence tab: the phone recording, rank in the 3-pack, Local Finder and AI Overview, and the neighborhood’s Census figures for one point', open: () => show({ mode: 'combined', tab: 'evidence' }, 'top25') },
    { tag: 'Competitor analysis', title: 'Who Is Taking Your Best Neighborhoods', text: 'Every business seen in the scan on one leaderboard: top-3 share, share of buying power reached, average rank, and how often Google’s AI names them. A competitor can lead the map pack and barely exist in the AI answer, or the reverse.', proof: lead ? `Most top-3 placements: ${tied ? `${lead.name} and ${DEMO.scans.top25.leaders[1].name}, ${lead.top3} of ${top.n} points each` : `${lead.name}, ${lead.top3} of ${top.n} points`}` : 'Every competitor, side by side', img: 'competitor-leaderboard.jpg', alt: 'Competitor leaderboard: top-3 share, buying power, average rank and AI mentions for each business', open: () => show({ mode: 'combined', tab: 'overview' }, 'top25', 'competitor-leaderboard') },
  ];
  const quick: { label: string; on: boolean; go: () => void }[] = [
    { label: 'Combined', on: tab === 'overview' && mode === 'combined', go: () => show({ mode: 'combined', tab: 'overview' }) },
    { label: 'Pack rank', on: tab === 'overview' && mode === 'rank', go: () => show({ mode: 'rank', tab: 'overview' }) },
    { label: 'AI place', on: tab === 'overview' && mode === 'ai', go: () => show({ mode: 'ai', tab: 'overview' }) },
    { label: 'Ads above', on: tab === 'overview' && mode === 'ads', go: () => show({ mode: 'ads', tab: 'overview' }) },
    { label: 'Evidence', on: tab === 'evidence', go: () => show({ mode, tab: 'evidence' }) },
  ];
  const pill = (on: boolean) => 'rounded-lg border px-3.5 py-2 text-sm font-semibold transition ' + (on ? 'border-[#f5c451] bg-[#f5c451] text-[#06080c]' : 'border-[#2a3442] bg-[#0c1118] text-[#c9d3df] hover:border-[#f5c451]/60 hover:text-white');

  return (
    <div className="mk min-h-screen overflow-x-hidden">
      <SiteHeader />
      <main>
        <section className="relative">
          <div className="mk-grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
          <div className="mk-glow pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <p className={EYEBROW + ' text-[#f5c451]'}><span className="mr-2 rounded bg-[#f5c451] px-2 py-0.5 font-bold text-[#06080c]">New</span>Top 25 Demo Map · only on Stakeout</p>
              <h1 className="mk-display mt-4 text-5xl font-bold leading-[1.05] sm:text-6xl">Stop Tracking Every Zip Code. <span className="mk-gold-text">Track the {top.n} Neighborhoods Your Best Customers Live In.</span></h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#c9d3df]">A square grid treats every pin the same, whatever the neighborhood underneath it. The Top 25 Demo Map reads U.S. Census data for your service area, finds the highest-income neighborhoods around your business, and runs a real phone search in the middle of each one. It’s not just about getting calls. It’s about getting calls from your best customers.</p>
              <p className="mt-4 max-w-xl leading-relaxed text-[#9aa7b8]">The map shown here is a real run for “{DEMO.keyword}” in {DEMO.city}. {DEMO.business} ranked top 3 in {top.top3} of its {top.n} best neighborhoods, yet Google’s AI answer recommended it by name in {top.named} of them.</p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button type="button" onClick={() => show({ mode: 'combined', tab: 'overview' }, 'top25')} className="mk-btn-primary rounded-xl px-7 py-3.5 text-base font-semibold">Open the live report ↓</button>
                <Link href={SPRINT_URL} className="rounded-xl border border-[#2a3442] px-6 py-3.5 font-semibold text-[#eef2f7] hover:border-[#f5c451]/60">Get this for your market</Link>
              </div>
            </div>
            <figure>
              <img src={IMG + 'top25-combined-map.jpg'} alt="Top 25 Demo Map: one real phone search in each of the highest-income neighborhoods around the business, coloured by local rank and AI Overview placement" className={SHOT} />
              <figcaption className="mt-3 text-sm text-[#9aa7b8]">The real Top 25 Demo Map for this scan. Green: top 3 in the local results. Purple: recommended by the AI Overview. Red: a true miss.</figcaption>
            </figure>
          </div>
        </section>

        <section className="border-y border-[#1b2431] bg-[#080b10]">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <p className={EYEBROW + ' text-center text-[#7aa7ff]'}>Head to head · same keyword · same business · same {theirs.length} points · same time</p>
            <h2 className="mk-display mx-auto mt-3 max-w-5xl text-center text-4xl font-bold leading-tight sm:text-5xl">A Leading Rank Grid Drew {theirs.length} Numbers. <span className="mk-gold-text">At {grid.singleBusiness} of Those Points, Google Never Showed a Local Map Pack.</span></h2>
            <p className="mx-auto mt-5 max-w-3xl text-center text-lg leading-relaxed text-[#c9d3df]">We ran “{DEMO.keyword}” for {DEMO.business} through a leading map-grid rank tracker and through Stakeout at the same time. The rank tracker returns a position for every point. Stakeout records what a phone at that point was shown.</p>
            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <figure className="flex flex-col rounded-2xl border border-[#1b2431] bg-[#0b0f15] p-6">
                <p className={EYEBROW + ' text-[#9aa7b8]'}>A leading rank-grid tool</p>
                <p className="mk-display mt-2 text-5xl font-bold">{pct(theirTop3, theirs.length)}% <span className="text-lg font-semibold text-[#9aa7b8]">top 3</span></p>
                <p className="mt-2 text-[#9aa7b8] lg:min-h-[72px]">A rank at {theirs.length} of {theirs.length} points, from #1 down to #{Math.max(...theirs)}. Nothing about AI answers, ads, or whether a local list was on the screen at all.</p>
                <img src={IMG + 'rank-grid-tool-7x7.jpg'} alt="A leading rank-grid tool’s 7 by 7 map for the same keyword and business: a rank number at every point" loading="lazy" className={SHOT + ' mx-auto mt-5 max-w-[440px]'} />
              </figure>
              <figure className="flex flex-col rounded-2xl border border-[#f5c451]/40 bg-[#f5c451]/[0.05] p-6">
                <p className={EYEBROW + ' text-[#f5c451]'}>Stakeout · a real phone at each point</p>
                <p className="mk-display mt-2 text-5xl font-bold text-[#f5c451]">{pct(gridVisible, grid.n)}% <span className="text-lg font-semibold text-[#c9d3df]">visible: {gridVisible} of {grid.n} points</span></p>
                <p className="mt-2 text-[#c9d3df] lg:min-h-[72px]">In the local results or named in Google’s AI answer at every point but {grid.n - gridVisible === 1 ? 'one' : grid.n - gridVisible}. A map pack appeared at only {grid.n - grid.singleBusiness} points. At {gridSolo} Google showed a single business{gridNoLocal > 0 ? `, at ${gridNoLocal} no local results at all` : ''}, and its AI answer named {DEMO.business} at {noListNamed} of those {grid.singleBusiness}.</p>
                <img src={IMG + 'stakeout-combined-7x7.jpg'} alt="Stakeout’s combined map for the same 49 points: local rank where a list was shown, AI Overview placement where it was not" loading="lazy" className={SHOT + ' my-auto'} />
              </figure>
            </div>
            <p className="mx-auto mt-8 max-w-4xl rounded-2xl border border-[#2a3442] bg-[#0c1118] p-6 text-lg leading-relaxed text-[#c9d3df]"><b className="text-white">What that means for a client report:</b> the rank grid put {DEMO.business} outside the top 3 at {theirLow} points. Google’s AI answer was recommending the business by name at {lowButNamed} of those {theirLow}. One tool says the west side of town is lost. The phones say it is being won in a place the rank grid cannot see.</p>
            <PinCompare />
          </div>
        </section>

        <RetentionToggle />

        <section className="mx-auto max-w-7xl space-y-24 border-t border-[#1b2431] px-5 py-24 sm:px-8">
          {features.map((f, i) => (
            <div key={f.tag} className={'grid items-center gap-10 ' + (i % 2 ? 'lg:grid-cols-[1.5fr_1fr]' : 'lg:grid-cols-[1fr_1.5fr]')}>
              <div className={i % 2 ? 'lg:order-2' : ''}>
                <p className={EYEBROW + ' text-[#7aa7ff]'}>{f.tag}</p>
                <h2 className="mk-display mt-3 text-4xl font-bold leading-tight">{f.title}</h2>
                <p className="mt-4 text-lg leading-relaxed text-[#c9d3df]">{f.text}</p>
                <p className="mt-5 flex items-start gap-2 font-semibold text-[#3ddc97]"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3ddc97]" />In this scan: {f.proof}</p>
                <button type="button" onClick={f.open} className="mt-6 rounded-xl border border-[#f5c451]/50 px-5 py-3 font-semibold text-[#f5c451] hover:bg-[#f5c451]/10">Open this in the live report ↓</button>
              </div>
              <a href={IMG + f.img} target="_blank" rel="noreferrer" aria-label={'Open full size: ' + f.alt} className={'block cursor-zoom-in transition hover:opacity-90 ' + (i % 2 ? 'lg:order-1' : '')}><img src={IMG + f.img} alt={f.alt} loading="lazy" className={SHOT} /></a>
            </div>
          ))}
        </section>

        <section className="border-t border-[#1b2431]">
          <div className="mx-auto grid max-w-7xl items-start gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className={EYEBROW + ' text-[#f5c451]'}><span className="mr-2 rounded bg-[#f5c451] px-2 py-0.5 font-bold text-[#06080c]">New</span>Google profiles</p>
              <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-5xl">Rank Is the Cause. <span className="mk-gold-text">Calls Are the Proof.</span></h2>
              <p className="mt-4 text-lg leading-relaxed text-[#c9d3df]">Each client’s Google Business Profile, Search Console and Google Analytics on one page, next to their scans. Show the client what the visibility work turned into.</p>
              <ul className="mt-6 space-y-3 text-[#c9d3df]">
                {[
                  ['Search insights', 'Calls, website clicks and direction requests from the listing, each set against the period before.'],
                  ['Searches that showed the listing', 'The real searches customers used, month by month, with one click to scan the top ones.'],
                  ['Search Console and Analytics', 'Clicks, position, conversions and calls, including visits sent by AI assistants.'],
                  ['Edit business, Posts and Reviews', 'Update the listing, schedule Google posts and reply to reviews from one inbox.'],
                  ['Changes', 'A daily watch on each listing, so an unwanted edit is caught the day it happens.'],
                ].map(([name, text]) => (
                  <li key={name} className="flex gap-3"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3ddc97]" /><span><b className="text-white">{name}.</b> {text}</span></li>
                ))}
              </ul>
              <Link href={SPRINT_URL} className="mt-8 inline-block rounded-xl border border-[#f5c451]/50 px-5 py-3 font-semibold text-[#f5c451] hover:bg-[#f5c451]/10">Get this for your market</Link>
            </div>
            <figure>
              <a href={IMG + 'google-profiles-search-insights.jpg'} target="_blank" rel="noreferrer" aria-label="Open the full Google profiles screenshot" className="group relative block max-h-[640px] cursor-zoom-in overflow-hidden rounded-xl border border-[#1b2431] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                <img src={IMG + 'google-profiles-search-insights.jpg'} alt="Google profiles: Search insights for a listing, with Google Business Profile calls and clicks, Search Console searches and Google Analytics conversions" loading="lazy" className="block w-full" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#06080c] via-[#06080c]/85 to-transparent pb-4 pt-16 text-center text-sm font-semibold text-white">See the full page ↗</span>
              </a>
              <figcaption className="mt-3 text-sm text-[#9aa7b8]">Shown with a sample account. Your own page fills with Google’s numbers for your listings.</figcaption>
            </figure>
          </div>
        </section>

        <section ref={report} className="scroll-mt-20 border-y border-[#1b2431] bg-[#080b10]">
          <div className="mx-auto max-w-[1600px] px-3 py-16 sm:px-6">
            <p className={EYEBROW + ' text-center text-[#f5c451]'}>The live report · nothing simulated</p>
            <h2 className="mk-display mx-auto mt-3 max-w-4xl text-center text-4xl font-bold leading-tight sm:text-5xl">This Is the Actual Client Report. <span className="mk-gold-text">Click Around.</span></h2>
            <p className="mx-auto mt-4 max-w-3xl text-center text-[#9aa7b8]">Every pin is a Google search run on a real Android phone, with its screen recording attached. {s.n} searches, {scan.date}.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Choose a real report">
              {SCANS.map(x => <button key={x.key} type="button" aria-pressed={scanKey === x.key} onClick={() => setScanKey(x.key)} className={pill(scanKey === x.key)}>{x.name} · {DEMO.scans[x.key].pins.length} searches</button>)}
              <span className="mx-2 hidden h-6 w-px bg-[#2a3442] sm:block" aria-hidden="true" />
              {quick.map(q => <button key={q.label} type="button" aria-pressed={q.on} onClick={q.go} className={pill(q.on)}>{q.label}</button>)}
              <a href={shareReportUrl(scan)} target="_blank" rel="noreferrer" className="ml-2 text-sm text-[#7aa7ff] hover:underline">Open full screen ↗</a>
            </div>
            <div className="mt-6 overflow-hidden rounded-2xl border border-[#2a3442] bg-slate-950">
              <GeoGridDashboard key={scan.shareToken + mode + tab} identifier={scan.shareToken} shared initialMapMode={mode} initialTab={tab} initialPin={tab === 'evidence' ? proofPin(scan.pins).pinId : null} />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <p className={EYEBROW + ' text-center text-[#7aa7ff]'}>Proof from the Top 25 scan · {top.n} real Android searches · {t25.date}</p>
          <h2 className="mk-display mx-auto mt-3 max-w-4xl text-center text-4xl font-bold leading-tight sm:text-5xl">Four Proof Points <span className="mk-gold-text">No Rank Tracker Can Show a Client.</span></h2>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {proofs.map((c, i) => (
              <div key={c.title} className="rounded-2xl border border-[#1b2431] bg-[#0c1118] p-8">
                <p className={EYEBROW + ' text-[#7aa7ff]'}>{String(i + 1).padStart(2, '0')} · {c.tag}</p>
                <p className="mk-display mt-3 text-5xl font-bold text-[#f5c451]">{c.big}</p>
                <h3 className="mk-display mt-3 text-2xl font-semibold">{c.title}</h3>
                <p className="mt-3 leading-relaxed text-[#c9d3df]">{c.text}</p>
              </div>
            ))}
          </div>
          <SoloSlots />
        </section>

        <RetentionCalculator cta={SPRINT_URL} />

        <section className="border-t border-[#1b2431] bg-[#080b10]">
          <div className="mx-auto max-w-4xl px-5 py-20 text-center sm:px-8">
            <h2 className="mk-display text-4xl font-bold leading-tight sm:text-5xl">Stop Defending Colored Dots. <span className="mk-gold-text">Start Showing Video Receipts.</span></h2>
            <p className="mx-auto mt-4 max-w-2xl text-[#9aa7b8]">Get this report for your market: what mobile searchers see in the neighborhoods you most want to serve, with a recording behind every point, brought into a focused 30-day visibility sprint.</p>
            <Link href={SPRINT_URL} className="mk-btn-primary mt-8 inline-block rounded-xl px-8 py-4 text-lg font-semibold">Apply for 1 of 12 DFY Sprint Spots ($297/mo) →</Link>
            <p className="mt-4 text-sm text-[#9aa7b8]">Or <Link href="/login?mode=register" className="text-[#7aa7ff] hover:underline">run live grids on your own account</Link>.</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
