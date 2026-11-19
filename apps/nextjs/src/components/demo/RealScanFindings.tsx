import { DEMO, type ScanKey, pct, scanStats } from '@/lib/demo-real-scans';

/** Headline findings of one real scan. Every figure is counted from that scan's pins. */
export default function RealScanFindings({ scanKey }: { scanKey: ScanKey }) {
  const s = scanStats(DEMO.scans[scanKey]);
  const where = scanKey === 'top25' ? 'top-income neighborhoods' : 'grid points';
  return <section className="demo-findings" aria-labelledby="demo-findings-heading">
    <div className="demo-sales-heading"><p className="demo-eyebrow">WHAT THIS REPORT FOUND · {s.n} REAL ANDROID SEARCHES · “{DEMO.keyword.toUpperCase()}”</p><h2 id="demo-findings-heading">Four Things a Rank Tracker Could Not Have Told This Plumber.</h2></div>
    <div className="demo-finding-cards">
      <article><strong>{s.top3}<small> of {s.n}</small></strong><h3>Top 3 in the local results</h3><p>A standard rank score for these {where}: {pct(s.top3, s.n)}%. On its own, that number says the business is invisible in most of them.</p></article>
      <article><strong>{s.named}<small> of {s.n}</small></strong><h3>Named in Google’s AI answer</h3><p>Google put an AI-written answer on {s.aio} of {s.n} searches and recommended {DEMO.business} by name on {s.named}, first on {s.namedFirst}.</p></article>
      <article><strong>{s.singleBusiness}<small> of {s.n}</small></strong><h3>The local list never appeared</h3><p>At {pct(s.singleBusiness, s.n)}% of these {where} Google showed one business under the AI answer instead of a list of local results. There was no “rank” to track.</p></article>
      <article><strong>{s.notFoundButNamed}<small> of {s.notFound}</small></strong><h3>“Not found” was wrong</h3><p>Where a rank grid would report the business missing, Google’s AI answer was recommending it by name {pct(s.notFoundButNamed, s.notFound)}% of the time.</p></article>
    </div>
  </section>;
}
