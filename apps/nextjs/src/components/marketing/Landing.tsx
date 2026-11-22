import { ArrowUpRight, MapPin, Radio, CalendarDays } from 'lucide-react';
import { LINES, type Line } from '@stakeout/core/gbpPlans';
import { DEMO, scanStats, shareReportUrl } from '@/lib/demo-real-scans';
import { WELCOME, usd } from '@/lib/pricing';
import { Arrow, OfferBanner, SiteFoot, SiteNav } from './SiteKit';
import { HREF } from './links';
import './site.css';
import './landing.css';

const scan = DEMO.scans.top25;
const result = scanStats(scan);
const report = shareReportUrl(scan);
const auditPrice = usd(WELCOME.cents);

function AuditLink() {
  return <a className="lp-primary so-btn" href={HREF.firstAudit}>Run my {auditPrice} audit <Arrow size={17} /></a>;
}

const seats: { key: Line; benefit: string; detail: string }[] = [
  { key: 'SCOUT', benefit: 'Track a client every other week', detail: 'Check five keywords on a 5×5 grid every other week. Share the recordings and results with your client.' },
  { key: 'COMMAND', benefit: 'Track weekly and manage the listing', detail: 'Check five keywords weekly, run an extra on-demand audit, manage Google posts and reviews, and monitor daily listing changes.' },
  { key: 'DOMINATOR', benefit: 'Cover more keywords or a larger area', detail: 'Get the Command listing tools, more scheduled coverage, and three on-demand 5×5 audits each month.' },
];

export default function Landing({ live }: { live: boolean }) {
  return (
    <div id="top" className="so lp">
      <SiteNav page="home" />
      <main>
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-wrap lp-hero-layout">
            <div className="lp-intro">
              <p className="lp-kicker"><span className="lp-signal" /> Every data point comes with a receipt.</p>
              <h1 id="lp-title">Show clients where Google <em>recommends them.</em></h1>
              <p className="lp-lead">Track the local pack and AI Overviews on real Android phones. When a client asks “What shows up on my side of town?” open their pin and play the search.</p>
              <div className="lp-actions">
                <AuditLink />
                <a className="lp-secondary" href={report}>View sample report <ArrowUpRight size={16} aria-hidden="true" /></a>
              </div>
              <p className="lp-terms">One keyword. 25 locations. A second scan in 7 days.<br />Your {auditPrice} goes toward your first month if you choose a plan.</p>
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
              </div>
            </figure>
          </div>
        </section>

        <section id="ai-overviews" className="lp-band" aria-labelledby="lp-record-title">
          <div className="lp-wrap lp-evidence">
            <div className="lp-record-text">
              <p className="lp-kicker"><Radio size={16} aria-hidden="true" /> The recorded search</p>
              <h2 id="lp-record-title">See the result a customer could actually call.</h2>
              <p>Watch what appeared for “emergency plumber near me” in Eaton Park. Google’s AI Overview expands to show Stuart’s Plumbing, its phone number and a Call button.</p>
              <p>Across the audit, Google’s AI answer named Stuart’s at {result.notFoundButNamed} locations where the business had no recorded local rank. A client looking only at the local rankings would miss those appearances.</p>
              <a className="lp-textlink" href={HREF.recording}>Watch the full recording <ArrowUpRight size={16} aria-hidden="true" /></a>
            </div>
            <figure className="lp-record">
              <div className="lp-record-meta"><span><i /> Phone recording</span><span>8 sec</span></div>
              <video controls playsInline preload="none" width={540} height={960}
                poster="/home/stuarts-lakeland-search-poster.webp" aria-label="Eight-second silent excerpt of an AI Overview showing Stuart’s Plumbing in Eaton Park"
                aria-describedby="lp-video-caption" src="/home/stuarts-lakeland-search-excerpt.mp4">
                <a href={HREF.recording}>Open the recording</a>
              </video>
              <figcaption id="lp-video-caption">Point R5·C5 · Eaton Park, FL<br />Nov 17, 2026 · Mobile Chrome</figcaption>
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
              <h2 id="lp-report-title">Bring the answer to your next client call.</h2>
              <p>Send one link. Your client can open a neighborhood, see who appeared ahead of them and watch what Google displayed. They can explore the report without an account.</p>
              <p id="honest-math">Each phone records the whole search. AI Overviews and the local pack are included in the same audit, with no extra scan charge to check both.</p>
              <a className="lp-textlink" href={report}>Open Stuart’s report <ArrowUpRight size={16} aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <section id="pricing" className="lp-band lp-plans" aria-labelledby="lp-plan-title">
          <div className="lp-wrap">
            <div id="google-listings">
              <p className="lp-kicker"><CalendarDays size={16} aria-hidden="true" /> Monthly tracking</p>
              <h2 id="lp-plan-title">Keep tracking the clients you manage.</h2>
              <p>The included second scan gives you a week to compare. To keep measuring the same neighborhoods, choose a monthly seat for that client. We apply your {auditPrice} to the first month of your first seat.</p>
            </div>
            <div id="watchdog" className="lp-seats">
              {seats.map(({ key, benefit, detail }) => (
                <article key={key} className={'lp-seat' + (key === 'COMMAND' ? ' lp-command' : '')}>
                  <h3>{LINES[key].name}</h3>
                  <p className="lp-rate"><strong>{usd(LINES[key].tiers[0].cents)}</strong> / client / month</p>
                  <h4>{benefit}</h4>
                  <p>{detail}</p>
                </article>
              ))}
            </div>
            <div className="lp-plan-links">
              <a href={HREF.seats} className="lp-secondary">Choose a monthly seat <Arrow size={16} /></a>
              <a href={HREF.pricing} className="lp-textlink">Full pricing and volume rates <ArrowUpRight size={16} aria-hidden="true" /></a>
            </div>
            {live && <div className="lp-promo"><OfferBanner live={live} href={HREF.pricing} /></div>}
          </div>
        </section>

        <section id="start" className="lp-close">
          <div className="lp-wrap">
            <div><p className="lp-kicker">Your first audit</p><h2>Which client will you check first?</h2>
            <p>Pick one business and the local search that matters most to them.</p></div>
            <AuditLink />
          </div>
        </section>
      </main>
      <SiteFoot note="The search map, report detail and phone recording on this page come from the November 17, 2026 audit of Stuart’s Plumbing in Lakeland, Florida." />
    </div>
  );
}
