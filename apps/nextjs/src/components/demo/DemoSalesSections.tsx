// The Done-For-You sprint offer lives on the agency page (/agency).
export const SPRINT_URL = '/agency#apply';
// Self-serve: create an account and run live grids.
export const PLANS_URL = '/login?mode=register';

export default function DemoSalesSections() {
  return <>
    <section className="stakeout-value-props" aria-labelledby="demo-value-heading">
      <div className="demo-sales-heading"><p className="demo-eyebrow">BEYOND ONE-SIZE-FITS-ALL MAP GRIDS</p><h2 id="demo-value-heading">Why “Green Grids” Still Leave Your Phone Quiet.</h2><p>A rank is only the beginning. Add neighborhood context, AI visibility and the screen evidence that makes your next client conversation concrete.</p></div>
      <div className="demo-value-grid">
        <article><span className="demo-label">01 · BUYING-POWER TELEMETRY</span><h3>Rank Where the Money Lives</h3><p>Put household income, homeownership and housing age underneath your ranking grid. Focus the pitch on the neighborhoods that fit your service—then compare equal-pin visibility with the buying-power model.</p></article>
        <article><span className="demo-label">02 · AI OVERVIEW &amp; CITATION RINGS</span><h3>See Beyond the 3-Pack</h3><p>A green map pin doesn’t tell the whole search story. Compare local rankings with AI citation indicators and ask whether your business appears in the answers people see. Citation rings in this sandbox are illustrative.</p></article>
        <article><span className="demo-label">03 · REAL ANDROID VIDEO RECEIPTS</span><h3>every data point comes with a receipt</h3><p>Give your clients something they can inspect. Live campaign recordings show what an Android phone displayed during a search session, connecting the reported observation to its captured evidence.</p></article>
      </div>
    </section>
    <section className="stakeout-cta-banner" aria-labelledby="demo-cta-heading">
      <div><p className="demo-eyebrow">PUT STAKEOUT ON YOUR MARKET</p><h2 id="demo-cta-heading">Want This Map Built for Your Business—With Live Phone Receipts?</h2><p>Find out what mobile searchers see in the neighborhoods you want to serve. Bring the gaps, the opportunities and the evidence into a focused 30-day visibility sprint.</p><p className="demo-case-study"><b>Reported client result · Miami Beach legal sprint</b><span>0 → 17 GBP calls in the first 7 days.</span> A prior campaign result, not a forecast for your business.</p></div>
      <div className="demo-cta-actions"><a className="demo-primary-cta" href={SPRINT_URL}>Apply for 1 of 12 DFY Sprint Spots ($297/mo) →</a><a className="demo-secondary-cta" href={PLANS_URL}>Run Live Grids on Your Own Account</a><small>For local businesses and agencies. Explore the sandbox without an account or credits.</small></div>
    </section>
  </>;
}
