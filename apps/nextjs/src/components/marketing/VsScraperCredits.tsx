import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import './vs.css';
import VsBriefTabs from './VsBriefTabs';
import { HREF } from './links';
import { BRIEF_PACKS, CLOSER, CLOSER_LIMIT, SESSION_PACKS, usd } from '@/lib/pricing';
import { ACCOUNT_PLANS, ACCOUNT_PLAN_ORDER, type AccountPlan } from '@stakeout/core/gbpPlans';

/**
 * /vs-scraper-credits: the paid-search landing page for the Closer Pack. Prices and allowances come
 * from the same price list as checkout. `ag` matches the headline to the ad group (?ag=reporting or
 * ?ag=ai; anything else gets the default).
 *
 * BRIEF_LINKS: the share links of the two example briefs (the Share button on each compiled brief).
 * Until one is set, its "Open the full brief" button stays hidden.
 */
const BRIEF_LINKS: { stuart: string | null; broderick: string | null } = { stuart: null, broderick: null };

const HEADLINES: Record<string, { eyebrow: string; h1: string }> = {
  default: { eyebrow: 'Real Android telemetry · zero casino credit math', h1: 'Stop buying 7,500 scraper credits to guess what a customer’s phone saw.' },
  reporting: { eyebrow: 'Client-ready revenue briefs · live county Google Ads prices', h1: 'Stop sending $5,000/mo retainers rainbow dot grids and spreadsheet homework.' },
  ai: { eyebrow: 'Real mobile AI Overview and map pack capture', h1: 'Track Google AI Overviews, single-listing takeovers and the map pack on real Android phones.' },
};

/** The brand mark, drawn for a light background (its light strokes take the text color). */
function Mark() {
  return (
    <svg viewBox="0 0 270 380" fill="none" aria-hidden="true">
      <g strokeWidth="13">
        <path d="M119 34C66 40 24 80 15 139M15 174C22 218 45 249 68 280L119 349" stroke="currentColor" />
        <path d="M151 34C204 41 244 81 252 139M252 174C246 217 222 249 200 280L135 363V243" stroke="#FF5A1F" />
        <path d="M119 69C85 75 57 103 50 139M50 174C57 212 84 242 119 249M151 69C185 76 211 103 218 139M218 174C211 212 185 242 151 249" stroke="currentColor" />
        <path d="M135 0V97M0 157H76M195 157H270" stroke="#FF5A1F" />
      </g>
      <g fill="#B58A40">
        {[131, 157, 183].flatMap((cy) => [109, 135, 161].map((cx) => <circle key={cx + '-' + cy} cx={cx} cy={cy} r="7.4" />))}
      </g>
    </svg>
  );
}

const WORDS = ['no', 'one', 'two', 'three', 'four'];

/** One line under each plan's allowance. */
const NOTE = (packs: string): Record<AccountPlan, string> => ({
  P_SCOUT: 'Unused ones roll over for a month.',
  P_AGENCY: 'Your logo, name and brand color on shared reports.',
  P_SCALE: `White-label too. Session packs (${packs}) never expire.`,
});

export default function VsScraperCredits({ ag }: { ag?: string }) {
  const head = HEADLINES[ag ?? ''] ?? HEADLINES.default;
  const price = usd(CLOSER.cents);
  const audits = Math.floor(CLOSER.credits / 25);
  const packs = SESSION_PACKS.map((p) => usd(p.cents)).join(' / ');
  // An example grid (not a real scan): strong near the business, rivals' single listings toward the edge.
  const pins = [
    ['100', 'pin-hi'], ['100', 'pin-hi'], ['70', 'pin-hi'], ['45', 'pin-mid'], ['20', 'pin-mid'],
    ['100', 'pin-hi'], ['70', 'pin-hi'], ['45', 'pin-mid'], ['×', 'pin-zero'], ['0', 'pin-zero'],
    ['70', 'pin-hi'], ['45', 'pin-mid'], ['×', 'pin-zero'], ['×', 'pin-zero'], ['0', 'pin-zero'],
    ['45', 'pin-mid'], ['20', 'pin-mid'], ['×', 'pin-zero'], ['0', 'pin-zero'], ['0', 'pin-zero'],
  ];

  return (
    <div className="vs">
      <header className="vs-head">
        <div className="wrap masthead">
          <a href="/" className="brand" aria-label="Stakeout Search home">
            <Mark />
            <span>STAKEOUT <em>SEARCH</em></span>
          </a>
          <div className="masthead-meta">
            <span className="rule-pill">1 PIN = 1 REAL ANDROID SESSION · NO MULTIPLIERS</span>
            <a href={HREF.closer} className="btn"><span className="long">Get the {price} Closer Pack →</span><span className="short">Closer Pack · {price}</span></a>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap">
            <p className="eyebrow">{head.eyebrow}</p>
            <h1>{head.h1}</h1>
            <p className="hero-sub">
              Credit-based grid trackers search each pin from a server, and many charge extra credits to check AI visibility or to add an AI summary. Stakeout runs every pin on a real Android phone and captures the map results, single-listing takeovers, Google’s AI answer, the ads and a timestamped screen recording in <strong>one pass</strong>.
            </p>

            <div className="hero-grid">
              <div className="video-stage">
                <div className="stage-top">
                  <span>UNROOTED ARM ANDROID · RECORDED</span>
                  <span>1 PIN = 1 SESSION</span>
                </div>
                <p className="stage-line">Every pin traces to a recorded phone screen.</p>
                <div className="stage-body">
                  <div aria-hidden="true">
                    <div className="pin-demo-grid">
                      {pins.map(([v, c], i) => <div key={i} className={'pin-dot ' + c}>{v}</div>)}
                    </div>
                    <p className="pin-key">Example grid · score at each pin · × a rival’s single listing</p>
                  </div>
                  <div className="floating-receipt">
                    <div className="receipt-head">
                      <span>CENTERPORT, NY · POINT R4·C4</span>
                      <span className="ok">● RECORDED</span>
                    </div>
                    <p className="receipt-score">100 <span className="unit">/ 100 visibility</span></p>
                    <p className="receipt-meta">First in the map results for “car accident lawyer”, below 1 sponsored result. Nov 19, 2026, 6:29 PM ET. Suffolk County average click for the firm’s searches: <strong>$157.40</strong>.</p>
                  </div>
                </div>

                <div className="stage-bar">
                  <span>See it for yourself:</span>
                  <span className="stage-links">
                    <a href={HREF.report}>Stuart’s Plumbing recorded report ↗</a>
                    {BRIEF_LINKS.stuart && <a href={BRIEF_LINKS.stuart}>Stuart’s brief ↗</a>}
                    {BRIEF_LINKS.broderick && <a href={BRIEF_LINKS.broderick}>Broderick’s brief ↗</a>}
                  </span>
                </div>
              </div>

              <div className="offer-card" id="closer-pack">
                <div>
                  <span className="offer-tag">Cold-pitch Closer Pack · No subscription</span>
                  <div className="offer-price-row">
                    <span className="offer-price">{price}</span>
                    <span className="offer-once">one-time · never expires</span>
                  </div>
                  <p className="offer-title">{CLOSER.credits} real-phone sessions + {CLOSER.briefs} brief credit</p>
                  <ul className="check-list">
                    <li><span className="chk" aria-hidden="true">✓</span><span><strong>{WORDS[audits][0].toUpperCase() + WORDS[audits].slice(1)} full 5×5 audits</strong> on real phones: the map results, single-listing takeovers, Google’s AI answer and the ads at all {CLOSER.credits} pins</span></li>
                    <li><span className="chk" aria-hidden="true">✓</span><span><strong>A screen recording at every pin</strong>, so a prospect never has to take a dot on trust</span></li>
                    <li><span className="chk" aria-hidden="true">✓</span><span><strong>{CLOSER.briefs} brief credit</strong> for a revenue brief priced with live county Google Ads rates</span></li>
                    <li><span className="chk" aria-hidden="true">✓</span><span><strong>A share link</strong> your prospect opens without an account, plus an offline copy</span></li>
                  </ul>
                </div>
                <div>
                  <a href={HREF.closer} className="btn btn-lg">Run your first audit for {price} →</a>
                  <p className="offer-fine">Up to {CLOSER_LIMIT} per account · Sessions added as soon as you pay · No recurring billing</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="vs-sec">
          <div className="wrap">
            <p className="eyebrow">1 pin = 1 credit? Do the real math</p>
            <h2>Why “7,500 credits” evaporates before you close a single retainer.</h2>
            <p className="sec-lead">Credit plans anchor you with a big monthly number. Then AI visibility checks and AI summaries draw extra credits, and on monthly plans whatever is left expires at the end of the month.</p>

            <aside className="lf-receipt" aria-label="What a 5×5 scan cost on Local Falcon">
              <p className="lf-kicker">We checked · Local Falcon · November 23, 2026</p>
              <div className="lf-grid">
                <div>
                  <p className="lf-label">Their help center</p>
                  <blockquote>“…a 5×5 grid scan has 25 points and uses 25 credits.”</blockquote>
                </div>
                <div>
                  <p className="lf-label">Their confirm box, for a 5×5 Google AI Overviews scan of Stuart’s Plumbing in Lakeland, one keyword</p>
                  <blockquote>“You are about to run 1 scan which will use 50 credits.”</blockquote>
                </div>
              </div>
              <p className="lf-math"><strong>25 pins, 50 credits</strong>, and that scan reads AI Overviews only: the map results are a separate scan, and Falcon AI analysis is 25 credits a report. On Stakeout, 25 pins are 25 phone sessions, each with the map results, the AI answer, the ads and a screen recording.</p>
            </aside>

            <div className="math-grid">
              <div className="ledger-box ledger-bad">
                <p className="ledger-kicker">A typical credit-based grid tracker</p>
                <p className="ledger-title">Two 5×5 keyword audits + pitch prep</p>
                <div className="ledger-row"><span>50 map pins, each searched from a server</span><span>50 credits</span></div>
                <div className="ledger-row"><span>AI visibility, checked as its own scan</span><span>Extra credits</span></div>
                <div className="ledger-row"><span>An AI summary of each scan report</span><span>Often +25 credits</span></div>
                <div className="ledger-row"><span>A screen recording of each pin</span><span className="no">Not available</span></div>
                <div className="ledger-row"><span>County Google Ads prices for the searches</span><span className="no">Manual lookup</span></div>
                <div className="ledger-row"><span>Turning dots into dollars for the pitch</span><span className="no">Your evening</span></div>
                <div className="ledger-total"><span>Unused credits on a monthly plan</span><strong>Expire monthly</strong></div>
              </div>

              <div className="ledger-box ledger-good">
                <p className="ledger-kicker">Stakeout Search · real phones</p>
                <p className="ledger-title">Two 5×5 keyword audits + a revenue brief</p>
                <div className="ledger-row"><span>50 pins, each searched on a real Android phone at that spot</span><span>50 sessions</span></div>
                <div className="ledger-row"><span>Google’s AI answer, its citations and rivals’ single-listing takeovers</span><span className="yes">Included</span></div>
                <div className="ledger-row"><span>Local Services Ads and sponsored results above you</span><span className="yes">Included</span></div>
                <div className="ledger-row"><span>A screen recording at every pin</span><span className="yes">Included</span></div>
                <div className="ledger-row"><span>U.S. Census household income layer</span><span className="yes">Included</span></div>
                <div className="ledger-row"><span>A revenue brief priced at county Google Ads rates</span><span>1 brief credit</span></div>
                <div className="ledger-total"><span>Closer Pack and bought sessions</span><strong>Never expire</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section className="vs-sec paper">
          <div className="wrap">
            <p className="eyebrow">Boardroom deliverables · zero AI slop</p>
            <h2>Works cold with no logins. Counts real calls and visits once the client connects Google.</h2>
            <p className="sec-lead">Two real briefs below. Switch between them, and drag the fee slider the way you would on a pitch call.</p>
            <VsBriefTabs links={BRIEF_LINKS} />
          </div>
        </section>

        <section className="vs-sec">
          <div className="wrap">
            <p className="eyebrow">How each one gets its numbers</p>
            <h2>Built for agencies closing $2,500–$10,000/mo retainers.</h2>
            <p className="sec-lead">Every shortcut a rank tracker takes shows up the moment a managing partner or CMO asks how you got your numbers.</p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">What you’re comparing</th>
                    <th scope="col">Credit-based grid trackers</th>
                    <th scope="col">All-in-one local SEO suites</th>
                    <th scope="col" className="col-stakeout">Stakeout Search</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">What runs each pin</th>
                    <td>A search sent from a server for that location</td>
                    <td>Rank checks run from servers</td>
                    <td className="col-stakeout"><strong>An unrooted ARM Android phone with its GPS set to the pin</strong></td>
                  </tr>
                  <tr>
                    <th scope="row">What one pin costs</th>
                    <td>1 credit; AI visibility checks and AI summaries draw more</td>
                    <td>Monthly grid credits, by plan</td>
                    <td className="col-stakeout"><strong>1 phone session: map results, single-listing takeover, AI answer, ads and a recording</strong></td>
                  </tr>
                  <tr>
                    <th scope="row">Proof at each pin</th>
                    <td>A rank and the businesses listed there</td>
                    <td>Ranking tables and grid maps</td>
                    <td className="col-stakeout"><strong>A screen recording of the phone</strong></td>
                  </tr>
                  <tr>
                    <th scope="row">Money in the report</th>
                    <td>Rankings</td>
                    <td>Rankings and listing data</td>
                    <td className="col-stakeout"><strong>Searches priced at county Google Ads rates</strong></td>
                  </tr>
                  <tr>
                    <th scope="row">What the client gets</th>
                    <td>Shareable grid reports</td>
                    <td>White-label reports</td>
                    <td className="col-stakeout"><strong>A revenue brief with its own share link; your branding on Agency and Scale</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="table-note">Credit details for other tools come from their public pricing and help pages, November 2026, and from a scan set up in our own Local Falcon account on November 23, 2026.</p>
          </div>
        </section>

        <section className="vs-sec paper">
          <div className="wrap">
            <p className="eyebrow">Zero bait-and-switch</p>
            <h2>Start with the {price} Closer Pack. Upgrade only if it wins you clients.</h2>
            <p className="sec-lead">No trial that turns into a bill. When you’re ready for monthly tracking, every plan uses the same rule: one pin, one phone session.</p>
            <div className="tiers-grid">
              <div className="tier-mini featured">
                <p className="tier-name">Closer Pack (start here)</p>
                <p className="tier-cost">{price} <span className="unit">once</span></p>
                <p className="tier-meta"><strong>{CLOSER.credits} sessions + {CLOSER.briefs} brief credit.</strong> Never expires. Up to {CLOSER_LIMIT} per account.</p>
              </div>
              {ACCOUNT_PLAN_ORDER.map((key) => {
                const p = ACCOUNT_PLANS[key];
                return (
                  <div key={key} className="tier-mini">
                    <p className="tier-name">{p.name} plan</p>
                    <p className="tier-cost">{usd(p.tiers[0].cents)}<span className="unit">/mo</span></p>
                    <p className="tier-meta">
                      <strong>{p.points.toLocaleString('en-US')} sessions + {p.briefs} brief credit{p.briefs === 1 ? '' : 's'} a month.</strong>{' '}
                      {NOTE(packs)[key]}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="table-note">Extra brief credits: {BRIEF_PACKS.map((b) => `${b.briefs} for ${usd(b.cents)}`).join(', ')}.</p>
          </div>
        </section>

        <section className="vs-sec">
          <div className="wrap">
            <h2>Questions switchers ask before spending {price}</h2>
            <div className="faq-grid">
              <div className="faq-item">
                <h3 className="faq-q">Does the {price} Closer Pack turn into a monthly subscription?</h3>
                <p className="faq-a">No. It’s a one-time {price} payment, up to {CLOSER_LIMIT} per account. Its {CLOSER.credits} phone sessions and brief credit never expire.</p>
              </div>
              <div className="faq-item">
                <h3 className="faq-q">Do I need my prospect’s Google Business Profile or Search Console login?</h3>
                <p className="faq-a">No. A cold brief runs on what the phones recorded, plus Google Ads search counts and county click prices. Once they sign, connect their Business Profile, Search Console and Analytics, and the brief counts their real calls and visits.</p>
              </div>
              <div className="faq-item">
                <h3 className="faq-q">Does AI Overview tracking really cost no extra sessions?</h3>
                <p className="faq-a">None. The phone loads Google’s mobile results at that spot, so one session captures the map results, any single-listing takeover, the AI answer and its citations, and the ads, along with the recording.</p>
              </div>
              <div className="faq-item">
                <h3 className="faq-q">What if Google Ads has no county prices for a niche trade?</h3>
                <p className="faq-a">The brief also checks the core trade search behind a longer one. If the county’s search volume is too thin for reliable local prices, it prices at U.S. top-of-page ad bids and says so on the brief. If the price lookup fails, the brief isn’t compiled and your brief credit isn’t used.</p>
              </div>
            </div>

            <div className="final-cta">
              <div>
                <p className="eyebrow">Walk into your next pitch with video receipts</p>
                <p className="final-line">Run {WORDS[audits]} 5×5 real-phone audits and a revenue brief today for {price}.</p>
              </div>
              <a href={HREF.closer} className="btn btn-lg">Get the {price} Closer Pack →</a>
            </div>
          </div>
        </section>
      </main>

      <div className="wrap">
        <footer className="vs-foot">
          <span>© 2026 Marketing Divine LLC d/b/a Stakeout Search. Not affiliated with Google LLC.</span>
          <nav aria-label="Legal">
            <a href={HREF.terms}>Terms</a>
            <a href={HREF.privacy}>Privacy</a>
          </nav>
        </footer>
      </div>
    </div>
  );
}
