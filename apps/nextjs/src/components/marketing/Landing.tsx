import { ArrowUpRight, Check, MapPin, Video, X } from 'lucide-react';
import { ACCOUNT_PLANS, ACCOUNT_PLAN_ORDER, LINES, type AccountPlan, type Line } from '@stakeout/core/gbpPlans';
import { DEMO, scanStats, shareReportUrl } from '@/lib/demo-real-scans';
import { CLOSER, WELCOME, usd } from '@/lib/pricing';
import { Arrow, OfferBanner, SiteFoot, SiteNav } from './SiteKit';
import { HREF } from './links';
import { FounderVideo } from './FounderVideo';
import PocketBanner, { PocketOpenButton } from '../pocket/PocketBanner';
import './site.css';
import './landing.css';

const scan = DEMO.scans.top25;
const result = scanStats(scan);
const report = shareReportUrl(scan);
const auditPrice = usd(WELCOME.cents);

function AuditLink({ plans }: { plans?: boolean }) {
  return plans
    ? <a className="lp-primary so-btn" href={HREF.closer}>Run two 5×5 grids · {usd(CLOSER.cents)} <Arrow size={17} /></a>
    : <a className="lp-primary so-btn" href={HREF.firstAudit}>Run my {auditPrice} audit <Arrow size={17} /></a>;
}

const seats: { key: Line; benefit: string; detail: string }[] = [
  { key: 'SCOUT', benefit: 'Track a client every other week', detail: 'Check five keywords on a 5×5 grid every other week. Share the recordings and results with your client.' },
  { key: 'COMMAND', benefit: 'Track weekly and manage the listing', detail: 'Check five keywords weekly, run an extra on-demand audit, manage Google posts and reviews, and monitor daily listing changes.' },
  { key: 'DOMINATOR', benefit: 'Cover more keywords or a larger area', detail: 'Get the Command listing tools, more scheduled coverage, and three on-demand 5×5 audits each month.' },
];

const planCopy: Record<AccountPlan, string> = {
  P_SCOUT: 'Track eight keywords for one location four times a month on full 5×5 grids.',
  P_AGENCY: 'Track four keywords for ten clients twice a month. Each client opens the report on your domain.',
  P_SCALE: 'Cover five keywords for twelve locations twice a month, with room for twenty more 5×5 grids.',
  P_MAX: 'Check five keywords at thirty locations twice a month on 21-pin circle grids. Give every account manager a seat.',
};

/** Why a grid from real phones differs from a simulated one (the section under the hero). */
const whyCards: { tag: string; title: string; body: string }[] = [
  { tag: 'THE SCRAPER CRACKDOWN', title: 'Maps API ≠ The Real Local Pack', body: 'Recent Google anti-scraping updates locked traditional scrapers out of live search pages. Most grid trackers quietly pivoted to raw Maps-only API feeds—meaning you’re measuring a desktop word-association map, NOT the real Google Search 3-Pack where mobile buyers actually tap and call.' },
  { tag: 'THE “MOBILE” ILLUSION', title: 'Headless Browsers Get Filtered', body: 'Shoving a mobile user-agent into a headless Chromium server doesn’t make it a phone, and legacy UULE coordinate tricks routinely snap back to the city center on “near me” keywords. Google flags synthetic browsers immediately and serves stripped-down fallback layouts.' },
  { tag: 'HARDWARE ATTESTATION', title: 'Real Android Silicon on Live 5G', body: 'True mobile SERP features—especially dynamic mobile AI Overviews and real carrier-level Local Packs—sit behind hardware attestation (Google Play Integrity API) that is virtually impossible to pass without a physical phone. Stakeout is the only tracker running real Android hardware over live 5G lines.' },
];
const whyLegacy = ['Pushed into Maps-only API feeds after Google’s scraper crackdown', 'Headless data-center browsers + spoofed UULE coordinates', 'Cannot pass Google Play Integrity hardware attestation', 'Blind to live mobile AI Overviews shoving the 3-Pack off-screen'];
const whyStakeout = ['Live Google Search & Local Pack captured on physical Android phones', 'Real 5G cellular lines—zero data-center proxies', 'Passes Play Integrity API natively on real device hardware', 'Video receipt + AI Overview + true Map Pack on every pin'];

/** The founder's story (the section under it), and the video it points to. */
const FOUNDER_VIDEO_TITLE = 'When Measurement Becomes Noisy, Optimization Becomes Superstition.';

export default function Landing({ live, plans }: { live: boolean; plans?: boolean }) {
  // The $1 pocket test (POCKET_TEST=off on the website takes it down, and its buttons with it).
  const pocket = process.env.POCKET_TEST !== 'off';
  return (
    <div id="top" className="so lp">
      <SiteNav page="home" plans={plans} quiet={pocket} />
      {pocket && <PocketBanner />}
      <main>
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-wrap lp-hero-layout">
            <div className="lp-intro lp-intro-bet">
              <p className="lp-kicker"><span className="lp-signal" /> REAL 5G ANDROID HARDWARE • VIDEO RECEIPTS INCLUDED</p>
              <h1 id="lp-title" className="lp-title-long">If Your Rank Tracker Can’t Match the Phone in Your Pocket, You’re Paying Monthly for <em>Fake Green Dots.</em></h1>
              <p className="lp-lead">Legacy map grids rely on Maps-only APIs and headless data-center scrapers—completely missing Local Service Ads, mobile ads, AI Overviews, and true 3-Pack shifts. Stakeout Search runs physical Android phones over live 5G cellular lines and records every search on video.</p>
              <div className="lp-actions">
                {pocket && <PocketOpenButton className="lp-hero-bet so-btn">Test Your Location Right Now · $1 <Arrow size={17} /></PocketOpenButton>}
                <a className={pocket ? 'lp-secondary' : 'lp-primary so-btn'} href="#pricing">See Monthly Grid Plans</a>
              </div>
              {pocket && <p className="lp-terms">Apple Pay &amp; Google Pay supported · No subscription · Matches your phone on cellular + private tab, or send a screenshot for a full $1 refund.</p>}
            </div>
            <figure id="real-vs-reported" className="lp-mapcard">
              <figcaption className="lp-maphead">
                <div><p className="lp-kicker">Recorded client audit</p><h2>Stuart’s Plumbing</h2></div>
                <span><MapPin size={14} aria-hidden="true" /> Lakeland, FL</span>
              </figcaption>
              <a href={report} className="lp-maplink" aria-label="Explore the 25 recorded locations in the Stuart’s Plumbing report">
                <img fetchPriority="high" width={978} height={518} src="/media/demo/top25-combined-map.jpg" alt="Map of the 25 Lakeland search locations, colored by local result and AI Overview placement." />
              </a>
              <p className="lp-query">“{DEMO.keyword}” <span>· {scan.date}</span></p>
              <div className="lp-stats">
                <div><strong>{result.named}<small> / {result.n}</small></strong><span>Named in the AI Overview</span></div>
                <div><strong>{result.n - result.notFound}<small> / {result.n}</small></strong><span>Found in local results</span></div>
                <div><strong>{result.notFoundButNamed}<small> / {result.n}</small></strong><span>AI mention without a local rank</span></div>
              </div>
            </figure>
          </div>
        </section>

        <section id="real-hardware" className="lp-band lp-why" aria-labelledby="lp-why-title">
          <div className="lp-wrap">
            <p className="lp-kicker"><span className="lp-signal" /> REAL HARDWARE VS. SIMULATED GRIDS</p>
            <h2 id="lp-why-title">Why We Are the Only Accurate Local Map Grid on the Market</h2>
            <p>Just because a rank tracker says “mobile results” doesn’t mean it’s actually pulling mobile results.</p>
            <div className="lp-why-cards">
              {whyCards.map((c) => (
                <article key={c.tag} className="lp-why-card">
                  <p className="lp-why-tag">{c.tag}</p>
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                </article>
              ))}
            </div>
            <div className="lp-why-versus">
              <div className="lp-why-col lp-why-legacy">
                <h3>Legacy Map Grid Trackers</h3>
                <ul>{whyLegacy.map((t) => <li key={t}><X size={17} aria-hidden="true" /><span>{t}</span></li>)}</ul>
              </div>
              <div className="lp-why-col lp-why-us">
                <h3>Stakeout Search</h3>
                <ul>{whyStakeout.map((t) => <li key={t}><Check size={17} aria-hidden="true" /><span>{t}</span></li>)}</ul>
              </div>
            </div>
          </div>
        </section>

        <section id="founder-story" className="lp-band lp-founder" aria-labelledby="lp-founder-title">
          <div className="lp-wrap">
            <div className="lp-founder-layout">
              <div className="lp-founder-story">
                <p className="lp-kicker"><span className="lp-signal" /> WHY WE BUILT STAKEOUT SEARCH</p>
                <h2 id="lp-founder-title">Bright Green Grids Nearly Cost Me Everything.</h2>
                <p>Before building Stakeout Search, I converted my traditional SEO agency into a 100% performance lead-generation business. No retainers to hide behind—if the phones didn’t ring, my family didn’t eat.</p>
                <p>Three months in, the phones went dead silent. Overnight, my revenue hit zero.</p>
                <p>When I opened the three different rank-tracking tools I was paying hundreds of dollars a month to run, I didn’t see red. Across every single location, my dashboards were glowing with bright green grids.</p>
                <blockquote className="lp-founder-quote">“On paper, three separate rank trackers swore we were dominating every neighborhood. In reality, the phones weren’t ringing—and I came within inches of losing my house, my cars, and everything I built for my family.”</blockquote>
                <p>Out of pure necessity, I went down the rabbit hole to prove what was really happening. When measurement becomes noisy, optimization becomes superstition. I put the top rank trackers head-to-head against real phones at the exact same coordinates and caught them completely missing mobile reality and AI local packs.</p>
                <p>I built Stakeout Search on real Android hardware and live 5G lines so a fake green grid could never blindside my livelihood again. Now you can run the exact same hardware for yours.</p>
              </div>
              <figure className="lp-founder-card">
                <p className="lp-founder-badge"><Video size={14} aria-hidden="true" /> RECORDED BEFORE STAKEOUT EXISTED • UNFILTERED BREAKDOWN</p>
                <h3>“{FOUNDER_VIDEO_TITLE}”</h3>
                <FounderVideo title={FOUNDER_VIDEO_TITLE} />
                <figcaption>Watch the original side-by-side breakdown: Putting traditional map grids up against real mobile phones on the exact same keyword, coordinates, and timestamp—exposing Maps API distortions and live mobile AI local packs that scrapers miss completely.</figcaption>
              </figure>
            </div>
            <div className="lp-why-cta">
              <p>Don’t take our word for it—and definitely don’t take your current tracker’s word for it. Pull out your phone and check us against your own pocket right now.</p>
              {pocket
                ? <PocketOpenButton className="lp-why-button">Run the $1 Pocket Test Live <Arrow size={17} /></PocketOpenButton>
                : <a className="lp-why-button so-btn" href="#pricing">See plans and pricing <Arrow size={17} /></a>}
            </div>
          </div>
        </section>

        <section id="ai-overviews" className="lp-band" aria-labelledby="lp-record-title">
          <div className="lp-wrap lp-evidence">
            <div className="lp-record-text">
              <p className="lp-kicker">Stuart’s Plumbing · Lakeland, Florida</p>
              <h2 id="lp-record-title">Google named this plumber in {result.notFoundButNamed} places the local rankings missed.</h2>
              <p>We searched “{DEMO.keyword}” at {result.n} locations. Google’s AI Overview named Stuart’s at {result.named} pins. The business appeared in the local results at {result.n - result.notFound}.</p>
              <p>Open pin <strong>R5·C2</strong> in the report. Stuart’s has no recorded local rank there, yet the AI answer names the business. Then play the <strong>Eaton Park</strong> pin. Stuart’s appears in both places there, and the AI answer shows its phone number and a Call button.</p>
              <div className="lp-evidence-links">
                <a className="lp-textlink" href={report}>Explore all {result.n} pins <ArrowUpRight size={16} aria-hidden="true" /></a>
                <a className="lp-textlink" href={HREF.recording}>Watch the full recording <ArrowUpRight size={16} aria-hidden="true" /></a>
              </div>
            </div>
            <figure id="lp-recording" className="lp-record">
              <div className="lp-record-meta"><span><i /> Phone recording</span><span>8 sec</span></div>
              <video controls playsInline preload="none" width={540} height={960}
                poster="/home/stuarts-lakeland-search-poster.webp" aria-label="Eight-second silent excerpt of an AI Overview showing Stuart’s Plumbing in Eaton Park"
                aria-describedby="lp-video-caption" src="/home/stuarts-lakeland-search-excerpt.mp4">
                <a href={HREF.recording}>Open the recording</a>
              </video>
              <figcaption id="lp-video-caption">R5·C5 · Eaton Park, FL<br />{scan.date} · Mobile Chrome<br />Network recorded as {scan.network}</figcaption>
            </figure>
          </div>
        </section>

        <section id="report" className="lp-band" aria-labelledby="lp-report-title">
          <div className="lp-wrap lp-report-layout">
            <a className="lp-report-img" href={report} aria-label="Open the full public report for Stuart’s Plumbing">
              <img loading="lazy" width={704} height={510} src="/home/stuarts-point-inspector-detail.webp" alt="The client report with point R3·C5 selected beside the phone recording and a grid of 25 search locations." />
            </a>
            <div>
              <p className="lp-kicker">The client report</p>
              <h2 id="lp-report-title">“I searched from home. Why didn’t I see us?”</h2>
              <p>Open the pin nearest their neighborhood and compare it with one near the office. You can see which businesses appeared, what Google put above the map and when each search ran.</p>
              <p id="honest-math">Send one report link. Your client can inspect the map and play the searches without an account. The local pack, mobile organic results and any AI Overview are included in the same session.</p>
              <a className="lp-textlink" href={report}>Open Stuart’s report <ArrowUpRight size={16} aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <section id="pricing" className="lp-band lp-plans" aria-labelledby="lp-plan-title">
          <div className="lp-wrap">
            <div>
              <p className="lp-kicker">Monthly tracking</p>
              <h2 id="lp-plan-title">{plans ? 'How many clients do you need to cover?' : 'Keep tracking the clients you manage.'}</h2>
              <p>{plans ? 'A full 5×5 grid uses 25 sessions for one keyword. Choose the monthly allowance that fits your clients and their reporting schedule.' : <>The included second scan gives you a week to compare. To keep measuring the same neighborhoods, choose a monthly seat for that client. We apply your {auditPrice} to the first month of your first seat.</>}</p>
            </div>
            {plans && <div id="watchdog" className="lp-seats lp-account-plans">
              {ACCOUNT_PLAN_ORDER.map((p) => (
                <article key={p} className={'lp-seat' + (p === 'P_AGENCY' ? ' lp-command' : '')}>
                  <h3>{ACCOUNT_PLANS[p].name}</h3>
                  <p className="lp-rate"><strong>{usd(ACCOUNT_PLANS[p].tiers[0].cents)}</strong> / month</p>
                  <h4>{ACCOUNT_PLANS[p].points.toLocaleString('en-US')} phone sessions · {ACCOUNT_PLANS[p].briefs} revenue brief{ACCOUNT_PLANS[p].briefs === 1 ? '' : 's'}</h4>
                  <p>{planCopy[p]}</p>
                </article>
              ))}
            </div>}
            {!plans && <div id="watchdog" className="lp-seats">
              {seats.map(({ key, benefit, detail }) => (
                <article key={key} className={'lp-seat' + (key === 'COMMAND' ? ' lp-command' : '')}>
                  <h3>{LINES[key].name}</h3>
                  <p className="lp-rate"><strong>{usd(LINES[key].tiers[0].cents)}</strong> / client / month</p>
                  <h4>{benefit}</h4>
                  <p>{detail}</p>
                </article>
              ))}
            </div>}
            <div className="lp-plan-links">
              <a href={plans ? HREF.plans : HREF.seats} className="lp-secondary">{plans ? 'Choose a plan' : 'Choose a monthly seat'} <Arrow size={16} /></a>
              <a href={HREF.pricing} className="lp-textlink">{plans ? 'Full pricing, the listing add-on and brief credits' : 'Full pricing and volume rates'} <ArrowUpRight size={16} aria-hidden="true" /></a>
            </div>
            <div id="google-listings" className="lp-listings">
              <h3>Manage the Google listing, too</h3>
              <p>{plans ? 'Add listing management when a client needs profile edits, posts, review replies or alerts about changes to their listing.' : 'Command and Dominator seats include Google listing management, posts, reviews and daily change monitoring.'} <a href={plans ? HREF.pricing + '#extras' : HREF.pricing}>See listing tools <ArrowUpRight size={14} aria-hidden="true" /></a></p>
            </div>
            {live && <div className="lp-promo"><OfferBanner live={live} href={HREF.pricing} plans={plans} /></div>}
          </div>
        </section>

        <section id="start" className="lp-close">
          <div className="lp-wrap">
            <div className="lp-close-copy">
              <h2>{plans ? 'Put your current tracker to a 25-pin test.' : 'Which client will you check first?'}</h2>
              <p>{plans ? 'Pick a client and a keyword that brings in work. Match the grid center and spacing in both tools. Open a pin where the map looks strong. What would someone see before they reached your client?' : 'Pick one business and one keyword. Your first audit checks 25 locations, and a second scan in seven days shows what changed.'}</p>
              <p className="lp-terms">{plans ? <>The {CLOSER.name} runs all 50 sessions over 5G and includes one revenue brief. One per account. No subscription. Sessions never expire.</> : <>Your {auditPrice} goes toward your first month if you choose a plan.</>}</p>
            </div>
            <AuditLink plans={plans} />
          </div>
        </section>
      </main>
      <SiteFoot note="The search map, report detail and phone recording on this page come from the November 17, 2026 audit of Stuart’s Plumbing in Lakeland, Florida." />
    </div>
  );
}
