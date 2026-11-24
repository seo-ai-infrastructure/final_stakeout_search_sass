import { ArrowUpRight, MapPin } from 'lucide-react';
import { ACCOUNT_PLANS, ACCOUNT_PLAN_ORDER, LINES, type AccountPlan, type Line } from '@stakeout/core/gbpPlans';
import { DEMO, scanStats, shareReportUrl } from '@/lib/demo-real-scans';
import { CLOSER, WELCOME, usd } from '@/lib/pricing';
import { Arrow, OfferBanner, SiteFoot, SiteNav } from './SiteKit';
import { HREF } from './links';
import { RecordedSearchLink } from './RecordedSearchLink';
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

export default function Landing({ live, plans }: { live: boolean; plans?: boolean }) {
  return (
    <div id="top" className="so lp">
      <SiteNav page="home" plans={plans} />
      <main>
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-wrap lp-hero-layout">
            <div className="lp-intro">
              <p className="lp-kicker"><span className="lp-signal" /> Every data point comes with a receipt.</p>
              <h1 id="lp-title">Show clients the Google search <em>behind every map pin.</em></h1>
              <p className="lp-lead">At every grid pin, a real Android phone runs your keyword and records the screen. See where your client makes the local pack, where their website shows up and which businesses Google’s AI names.</p>
              <div className="lp-actions">
                <RecordedSearchLink />
                {plans
                  ? <a className="lp-secondary" href={HREF.pricing + '#plans'}>Plans from {usd(ACCOUNT_PLANS.P_SCOUT.tiers[0].cents)}/mo <Arrow size={15} /></a>
                  : <AuditLink plans={false} />}
              </div>
              {plans && <p className="lp-terms"><a className="lp-proof-link" href={HREF.closer}>Test your own keyword over 5G · {usd(CLOSER.cents)}</a> · Two 5×5 grids. No subscription.</p>}
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
