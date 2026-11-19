import { DEMO, type RealPin, type RealScan, type ScanKey, pct, scanName, scanStats, shareReportUrl } from '@/lib/demo-real-scans';

const rankTone = (p: RealPin) => (p.rank == null ? 'miss' : p.rank <= 3 ? 'top' : 'mid');
const aiTone = (p: RealPin) => (p.aiCited ? 'named' : p.aio ? 'unnamed' : 'none');

function Grid({ scan, mode, label }: { scan: RealScan; mode: 'rank' | 'ai'; label: string }) {
  return <div className="demo-twin-grid" role="img" aria-label={label} style={{ gridTemplateColumns: `repeat(${scan.gridSize}, 1fr)` }}>
    {scan.pins.map(p => <span key={p.id} data-tone={mode === 'rank' ? rankTone(p) : aiTone(p)}>{mode === 'rank' ? (p.rank ?? '–') : p.aiCited ? (p.aiPos ? `#${p.aiPos}` : '✓') : p.aio ? '✕' : ''}</span>)}
  </div>;
}

function ScanCompare({ scanKey }: { scanKey: ScanKey }) {
  const scan = DEMO.scans[scanKey], s = scanStats(scan);
  return <article className="demo-twin">
    <header><b>{scanName(scan)}</b><a href={shareReportUrl(scan)} target="_blank" rel="noreferrer">Open the full report with all {s.n} phone recordings ↗</a></header>
    <div className="demo-twin-pair">
      <figure><figcaption><span className="demo-label">WHAT A RANK GRID REPORTS</span><strong>{pct(s.top3, s.n)}%</strong><small>Top 3 at {s.top3} of {s.n} locations. “Not found” at {s.notFound}.</small></figcaption><Grid scan={scan} mode="rank" label={`Local rank at each of ${s.n} locations`} /></figure>
      <figure className="demo-twin-ai"><figcaption><span className="demo-label">WHAT THE PHONE ACTUALLY SHOWED</span><strong>{pct(s.named, s.n)}%</strong><small>Google’s AI answer named {DEMO.business} at {s.named} of {s.n} locations, first at {s.namedFirst}.</small></figcaption><Grid scan={scan} mode="ai" label={`Position of ${DEMO.business} in Google’s AI answer at each of ${s.n} locations`} /></figure>
    </div>
    <p className="demo-twin-key"><span data-tone="top" /> Top 3 <span data-tone="mid" /> Rank 4+ <span data-tone="miss" /> Not found <span data-tone="named" /> Named in the AI answer (# = order named) <span data-tone="unnamed" /> AI answer shown, business missing</p>
  </article>;
}

/** The headline findings of the two real scans. Every figure is counted from the scan pins at build time. */
export default function RealScanFindings() {
  const t = scanStats(DEMO.scans.tight), w = scanStats(DEMO.scans.wide);
  const all = t.n + w.n;
  return <section className="demo-findings" aria-labelledby="demo-findings-heading">
    <div className="demo-sales-heading"><p className="demo-eyebrow">{all} REAL ANDROID SEARCHES · “{DEMO.keyword.toUpperCase()}” · {DEMO.city.toUpperCase()}</p><h2 id="demo-findings-heading">Four Things a Rank Tracker Could Not Have Told This Plumber.</h2><p>Nothing here is simulated. Two Stakeout scans searched Google on real Android phones over residential internet connections across {DEMO.city}, and recorded every screen.</p></div>
    <div className="demo-finding-cards">
      <article><strong>{t.singleBusiness + w.singleBusiness}<small> of {all}</small></strong><h3>The local list never appeared</h3><p>At {pct(t.singleBusiness + w.singleBusiness, all)}% of locations Google showed one business under an AI answer instead of a list of local results. There was no “rank” to track.</p></article>
      <article><strong>{t.aio + w.aio}<small> of {all}</small></strong><h3>An AI answer led the page</h3><p>Google answered with an AI-written list of plumbers on {pct(t.aio + w.aio, all)}% of searches. It named {DEMO.business} on {t.named + w.named} of them.</p></article>
      <article><strong>{t.notFoundButNamed + w.notFoundButNamed}<small> of {t.notFound + w.notFound}</small></strong><h3>“Not found” was wrong</h3><p>Where a rank grid would report the business missing, Google’s AI answer was recommending it by name {pct(t.notFoundButNamed + w.notFoundButNamed, t.notFound + w.notFound)}% of the time.</p></article>
      {t.rivalSite && <article><strong>{t.rivalSite.count}<small> vs {t.ownSite}</small></strong><h3>A competitor’s website got the link</h3><p>In the {t.n}-search scan, the AI answer linked {t.rivalSite.domain} {t.rivalSite.count} times and {DEMO.ownDomain} {t.ownSite === 1 ? 'once' : `${t.ownSite} times`}. That gap is the work order.</p></article>}
    </div>
    <ScanCompare scanKey="wide" />
    <ScanCompare scanKey="tight" />
  </section>;
}
