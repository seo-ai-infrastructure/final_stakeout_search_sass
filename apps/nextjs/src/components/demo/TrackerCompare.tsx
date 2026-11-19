import { DEMO, TRACKER_GRID, type RealPin, pct, scanStats } from '@/lib/demo-real-scans';

const trackerTone = (rank: number) => (rank <= 3 ? 'top' : rank <= 10 ? 'mid' : 'low');
/** One headline per point, the way the report's Combined view reads it. */
function phone(p: RealPin): { tone: string; label: string } {
  if (p.rank != null) return { tone: p.rank <= 3 ? 'top' : 'mid', label: String(p.rank) };
  if (p.aiCited) return { tone: 'ai', label: p.aiPos ? `#${p.aiPos}` : '✓' };
  return { tone: 'miss', label: '✕' };
}

/** Same keyword, same business, same 49 points: a rank-grid tool's numbers beside what the phones recorded. */
export default function TrackerCompare() {
  const scan = DEMO.scans.grid, s = scanStats(scan), size = scan.gridSize;
  const theirs = TRACKER_GRID.flat();
  if (theirs.length !== scan.pins.length) return null;
  const at = (p: RealPin) => TRACKER_GRID[p.row][p.col];
  const noList = scan.pins.filter(p => !p.pack);
  const theirTop3 = theirs.filter(r => r <= 3).length;
  const lowButNamed = scan.pins.filter(p => at(p) > 3 && p.aiCited).length, low = theirs.length - theirTop3;
  const cols = { gridTemplateColumns: `repeat(${size}, 1fr)` };
  return <section className="demo-versus" aria-labelledby="demo-versus-heading">
    <div className="demo-sales-heading"><p className="demo-eyebrow">HEAD TO HEAD · SAME KEYWORD · SAME BUSINESS · SAME {theirs.length} POINTS · SAME TIME</p><h2 id="demo-versus-heading">A Leading Rank Grid Drew {theirs.length} Numbers. At {noList.length} of Those Points, Google Never Showed a Local List.</h2><p>We ran “{DEMO.keyword}” for {DEMO.business} through a leading map-grid rank tracker and through Stakeout at the same time. The rank tracker returns a position for every point. Stakeout records what a phone at that point was shown.</p></div>
    <div className="demo-versus-pair">
      <figure><figcaption><span className="demo-label">A LEADING RANK-GRID TOOL</span><strong>{pct(theirTop3, theirs.length)}%<small> top 3</small></strong><small>A rank at {theirs.length} of {theirs.length} points, from #1 down to #{Math.max(...theirs)}. Nothing about AI answers, ads, or whether a local list was on the screen.</small></figcaption><div className="demo-versus-grid" style={cols} role="img" aria-label="Ranks reported by the rank-grid tool at each of the 49 points">{theirs.map((r, i) => <span key={i} data-tone={trackerTone(r)}>{r}</span>)}</div></figure>
      <figure><figcaption><span className="demo-label">STAKEOUT · REAL PHONE AT EACH POINT</span><strong>{pct(s.named, s.n)}%<small> named by Google’s AI</small></strong><small>A local list appeared at only {s.n - noList.length} points. At the other {noList.length}, Google showed one business under an AI answer, and that answer named {DEMO.business} at {noList.filter(p => p.aiCited).length} of them.</small></figcaption><div className="demo-versus-grid" style={cols} role="img" aria-label="What a phone was shown at each of the 49 points">{scan.pins.map(p => { const c = phone(p); return <span key={p.id} data-tone={c.tone}>{c.label}</span>; })}</div></figure>
    </div>
    <p className="demo-versus-key"><span data-tone="top" /> Local rank 1–3 <span data-tone="mid" /> Local rank 4–10 <span data-tone="low" /> Local rank 11+ <span data-tone="ai" /> No local rank: place in Google’s AI answer <span data-tone="miss" /> Not shown at all</p>
    <p className="demo-versus-take"><b>What that means for a client report:</b> the rank grid put {DEMO.business} outside the top 3 at {low} points. Google’s AI answer was recommending the business by name at {lowButNamed} of those {low}. One tool says the west side of town is lost. The phones say it is being won somewhere the rank grid cannot see.</p>
  </section>;
}
