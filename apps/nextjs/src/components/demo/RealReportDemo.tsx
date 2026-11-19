'use client';

import { useRef, useState } from 'react';
import { GeoGridDashboard } from '@/components/GeoGridDashboard';
import { DEMO, type RealPin, type ScanKey, pct, scanStats, shareReportUrl } from '@/lib/demo-real-scans';
import './demographic-demo.css';
import DemoSalesSections, { SPRINT_URL } from './DemoSalesSections';
import RealScanFindings from './RealScanFindings';
import TrackerCompare from './TrackerCompare';

type MapMode = 'combined' | 'rank' | 'ai' | 'ads';
type View = { mode: MapMode; tab: 'overview' | 'evidence' };
/** The point the Evidence card opens on: #1 in a full local list and #1 in the AI answer, so every panel has something to show. */
const proofPin = (pins: RealPin[]) => pins.find(p => p.aiPos === 1 && p.rank === 1 && p.pack) ?? pins.find(p => p.aiPos === 1) ?? pins[0];
const SCANS: { key: ScanKey; name: string }[] = [
  { key: 'top25', name: 'Top 25 Demo Map' },
  { key: 'grid', name: 'Standard 7 × 7 grid' },
];

/** Public sales demo: the real shared report, embedded as-is, opened on the view each feature describes. */
export default function RealReportDemo() {
  const [scanKey, setScanKey] = useState<ScanKey>('top25');
  const [view, setView] = useState<View>({ mode: 'combined', tab: 'overview' });
  const { mode, tab } = view;
  const report = useRef<HTMLDivElement>(null);
  const scan = DEMO.scans[scanKey];
  const top = scanStats(DEMO.scans.top25), s = scanStats(scan);
  const proof = proofPin(scan.pins);
  const show = (next: View, nextScan: ScanKey = scanKey, anchor?: string) => {
    setView(next); setScanKey(nextScan);
    if (anchor) {
      // The report may remount and refetch first: wait for the section to exist, then go to it.
      let tries = 0;
      const go = () => { const el = report.current?.querySelector('#' + anchor); if (el) el.scrollIntoView({ block: 'start' }); else if (tries++ < 40) window.setTimeout(go, 150); };
      window.setTimeout(go, 150);
      return;
    }
    report.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };
  const lead = scan.leaders[0], tied = !!lead && scan.leaders[1]?.top3 === lead.top3;
  const features: { mode: MapMode; evidence?: boolean; anchor?: string; scan?: ScanKey; tag: string; name: string; text: string; proof: string }[] = [
    { mode: 'combined', scan: 'top25', tag: 'NEW · ONLY ON STAKEOUT', name: 'Top 25 Demo Map', text: 'Skip the square grid. Scan the highest-income neighborhoods in your service area, with homeownership and home values under every pin.', proof: `Top 3 in ${top.top3} of ${top.n} best neighborhoods` },
    { mode: 'ai', tag: 'NEW · AI OVERVIEW LOCAL PACK TRACKER', name: 'Your Place in Google’s AI Answer, Mapped', text: 'At every point: are you #1 in the AI Overview’s list, named further down, left out, or is there no AI Overview at all?', proof: `Named at ${s.named} of ${s.n} points, #1 at ${s.namedFirst}` },
    { mode: 'combined', anchor: 'ai-overview-coverage', tag: 'FULL AI OVERVIEW TRACKING', name: 'Which Sites and Businesses the AI Trusts', text: 'Every website the AI cited and every business it named across the scan, in the order it listed them, set against their local rank.', proof: s.rivalSite ? `${s.rivalSite.domain} cited in ${s.rivalSite.count} of ${s.n} answers, ${DEMO.ownDomain} in ${s.ownSite}` : `AI Overview on ${s.aio} of ${s.n} searches` },
    { mode: 'ads', tag: 'ADS ABOVE', name: 'What Searchers Pass Before You', text: 'Counts the sponsored results stacked above your listing at each point, and names the advertisers buying them.', proof: s.avgAdsAbove != null ? `${s.avgAdsAbove.toFixed(1)} ads above the business on average, across ${s.listsOpened} local lists` : 'Ad counts for every point' },
    { mode: 'combined', evidence: true, tag: 'EVIDENCE TAB · VIDEO RECEIPTS', name: 'Exactly What That Phone Saw', text: 'For every point: the screen recording, the results page, the Local Finder, the AI Overview text, who is ahead of you, the advertisers, and the neighborhood’s income and homeownership.', proof: `Open point R${proof.row + 1}·C${proof.col + 1}: ${proof.rank ? `#${proof.rank} in the local results` : 'no local rank'}${proof.aiPos ? `, #${proof.aiPos} in the AI Overview` : ''}` },
    { mode: 'combined', anchor: 'competitor-leaderboard', tag: 'COMPETITOR ANALYSIS', name: 'Who Is Taking Your Best Neighborhoods', text: 'Every business seen in the scan, ranked by top-3 share, buying power reached, average rank and how often Google’s AI names it.', proof: lead ? `Most top-3 placements: ${tied ? `${lead.name} and ${scan.leaders[1].name}, ${lead.top3} of ${s.n} points each` : `${lead.name}, ${lead.top3} of ${s.n} points`}` : 'Every competitor, side by side' },
  ];
  return <main className="demographic-demo">
    <div className="demo-sandbox-banner"><p><b>A REAL CLIENT REPORT · NOTHING SIMULATED</b> The report below is live Stakeout output: every pin is a Google search run on a real Android phone, with its screen recording attached. Want one for your market?</p><a href={SPRINT_URL}>Claim 1 of 12 Done-For-You Sprint Spots →</a></div>
    <div className="demo-heading"><div><p className="demo-eyebrow"><span className="demo-new-tag">NEW</span>TOP 25 DEMO MAP · ONLY ON STAKEOUT SEARCH</p><h1>Stop Tracking Every Zip Code. Track the {top.n} Neighborhoods Your Best Customers Live In.</h1><p>A square grid treats every pin the same, whatever the neighborhood underneath it. The Top 25 Demo Map reads U.S. Census data for your service area, finds the highest-income neighborhoods around your business, and puts a real phone search in the middle of each one. It’s not just about getting calls. It’s about getting calls from your best customers.</p><p style={{ marginTop: 14 }}>Below is one run for “{DEMO.keyword}” in {DEMO.city}. {DEMO.business} ranked top 3 in {top.top3} of its {top.n} best neighborhoods, yet Google’s AI answer recommended it by name in {top.named} of them ({pct(top.named, top.n)}%).</p></div><span className="demo-location"><span /> {DEMO.city}</span></div>
    <div className="demo-feature-picks" role="group" aria-label="Open the report on a feature">{features.map(f => { const on = !f.anchor && mode === f.mode && (tab === 'evidence') === !!f.evidence && (!f.scan || f.scan === scanKey); return <button key={f.tag} aria-pressed={on} onClick={() => show({ mode: f.anchor ? mode : f.mode, tab: f.evidence ? 'evidence' : 'overview' }, f.scan, f.anchor)}><span className="demo-label">{f.tag}</span><b>{f.name}</b><span>{f.text}</span><em>{f.proof}</em><i>See it in the real report ↓</i></button>; })}</div>
    <div className="demo-report-frame" ref={report}>
      <div className="demo-report-note"><div className="demo-segments" role="group" aria-label="Choose a real report">{SCANS.map(x => <button key={x.key} aria-pressed={scanKey === x.key} onClick={() => setScanKey(x.key)}>{x.name} · {DEMO.scans[x.key].pins.length} searches · {DEMO.scans[x.key].date}</button>)}</div><a href={shareReportUrl(scan)} target="_blank" rel="noreferrer">Open this report full screen ↗</a></div>
      <p className="demo-report-hint">This is the actual client report, not a mockup. Switch the map between Combined, Pack rank, AI place and Ads above, turn on the income layer, and open any point for its recording.</p>
      <GeoGridDashboard key={scan.shareToken + mode + tab} identifier={scan.shareToken} shared initialMapMode={mode} initialTab={tab} initialPin={tab === 'evidence' ? proof.pinId : null} />
    </div>
    <TrackerCompare />
    <RealScanFindings scanKey={scanKey} />
    <DemoSalesSections />
  </main>;
}
