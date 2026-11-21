'use client';
import { useCallback, useEffect, useState } from 'react';
import { LINES, type Line } from '@stakeout/core/gbpPlans';
import { WELCOME, WHITE_LABEL, usd } from '@/lib/pricing';
import { ACCENT, Arrow, Check, Faq, HREF, MONO, OfferBanner, Play, RecordingDialog, SiteFoot, SiteNav, TONE, type FaqItem } from './SiteKit';
import { AuditCard, Calculator, Eyebrow, SeatCards } from './PriceBlocks';
import './site.css';

/**
 * The home page. Its sections were drawn on the design canvas and carried over as they are, with
 * the prices, links and wording that match what the app does today. Every screenshot and number
 * comes from real scans (see NOTE).
 */

const NOTE = 'Every scan screenshot and number on this page comes from real Stakeout scans: Lakeland, FL on Nov 15 and Nov 17, 2026, and Mt. Juliet, TN.';

const from = (line: Line) => usd(LINES[line].tiers[0].cents);
const tier = (line: Line, i: number) => usd(LINES[line].tiers[i].cents);

/** One point of a 7×7 grid: its label, background, text colour, and whether it is the circled point. */
type Raw = [label: string, bg: string, fg: string, ring: number];
/** The rank a leading rank-grid tool reported at each point (Lakeland, FL, 15 Nov 2026). */
const TRACKER: Raw[] = [
  ["13","#af0a00","#ffffff",0],
  ["12","#af0a00","#ffffff",0],
  ["11","#af0a00","#ffffff",0],
  ["9","#af0a00","#ffffff",0],
  ["9","#af0a00","#ffffff",0],
  ["8","#c03f00","#ffffff",0],
  ["5","#f7c701","#0f172a",0],
  ["10","#af0a00","#ffffff",0],
  ["8","#c03f00","#ffffff",0],
  ["7","#d26e00","#0f172a",0],
  ["8","#c03f00","#ffffff",0],
  ["6","#e59c00","#0f172a",0],
  ["4","#c6b100","#0f172a",0],
  ["4","#c6b100","#0f172a",0],
  ["12","#af0a00","#ffffff",0],
  ["8","#c03f00","#ffffff",0],
  ["7","#d26e00","#0f172a",0],
  ["5","#f7c701","#0f172a",0],
  ["5","#f7c701","#0f172a",0],
  ["4","#c6b100","#0f172a",0],
  ["1","#2a6600","#ffffff",0],
  ["11","#af0a00","#ffffff",0],
  ["7","#d26e00","#0f172a",0],
  ["4","#c6b100","#0f172a",0],
  ["3","#2a6600","#ffffff",0],
  ["2","#2a6600","#ffffff",0],
  ["2","#2a6600","#ffffff",0],
  ["1","#2a6600","#ffffff",0],
  ["10","#af0a00","#ffffff",0],
  ["5","#f7c701","#0f172a",0],
  ["4","#c6b100","#0f172a",0],
  ["2","#2a6600","#ffffff",0],
  ["1","#2a6600","#ffffff",0],
  ["1","#2a6600","#ffffff",0],
  ["1","#2a6600","#ffffff",0],
  ["11","#af0a00","#ffffff",0],
  ["8","#c03f00","#ffffff",0],
  ["5","#f7c701","#0f172a",0],
  ["3","#2a6600","#ffffff",0],
  ["1","#2a6600","#ffffff",0],
  ["1","#2a6600","#ffffff",0],
  ["1","#2a6600","#ffffff",0],
  ["11","#af0a00","#ffffff",1],
  ["7","#d26e00","#0f172a",0],
  ["4","#c6b100","#0f172a",0],
  ["3","#2a6600","#ffffff",0],
  ["1","#2a6600","#ffffff",0],
  ["1","#2a6600","#ffffff",0],
  ["1","#2a6600","#ffffff",0],
];
/** The business's place in Google's AI Overview at the same points, from a real phone. */
const PHONE: Raw[] = [
  ["#4","#9333EA","#ffffff",0],
  ["#3","#9333EA","#ffffff",0],
  ["#4","#c6b100","#0f172a",0],
  ["#4","#9333EA","#ffffff",0],
  ["#5","#9333EA","#ffffff",0],
  ["#4","#9333EA","#ffffff",0],
  ["no","#4c1d95","#ddd6fe",0],
  ["#4","#9333EA","#ffffff",0],
  ["#3","#9333EA","#ffffff",0],
  ["no","#4c1d95","#ddd6fe",0],
  ["#5","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["#2","#9333EA","#ffffff",0],
  ["#3","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["no","#4c1d95","#ddd6fe",0],
  ["#3","#9333EA","#ffffff",0],
  ["#2","#9333EA","#ffffff",0],
  ["#1","#2a6600","#ffffff",0],
  ["#2","#9333EA","#ffffff",0],
  ["#2","#9333EA","#ffffff",0],
  ["#2","#9333EA","#ffffff",0],
  ["#2","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["#2","#9333EA","#ffffff",0],
  ["✓","#9333EA","#ffffff",0],
  ["#3","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["#4","#9333EA","#ffffff",0],
  ["#2","#9333EA","#ffffff",0],
  ["#2","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["✓","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",1],
  ["#2","#9333EA","#ffffff",0],
  ["no","#4c1d95","#ddd6fe",0],
  ["#1","#9333EA","#ffffff",0],
  ["#1","#2a6600","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
  ["#1","#9333EA","#ffffff",0],
];

const HOME_FAQ: FaqItem[] = [
  ['How is this different from other grid trackers?', 'Most grid trackers query Google from a data-center server and split Maps and AI Overviews into separate paid API scans. Stakeout runs every point as a real Android phone session in Chrome or the Google Maps app on a local ISP, records the full screen on video, and tracks the AI Overview right alongside the map pack in a single run—25 points for a scheduled 5×5 grid.'],
  ['How do GBP API edits protect my listings from suspension?', 'Everyday fields—description, tracking tags, hours, holiday hours, additional categories, attributes, links and photos—are marked Safe. Identity fields that can trigger video verification—name, primary category, primary phone and address—stay locked behind an explicit switch. Once unlocked, it’s one identity field per save and one every 7 days per listing, with an extra warning on lines of business Google checks closely, like personal injury attorneys.'],
  ['How does the listing watchdog work?', 'Once a day, Stakeout reads every connected listing from Google and compares its name, primary category, phone numbers, website, hours, holiday hours, additional categories, description, address and open status with how you left them. Anything that changed without you—Google’s own rewrite, a public “suggest an edit”, or another manager—shows up under Changes we did not make, so you can keep it or change it back. A review of 2 stars or fewer is emailed to you within the hour.'],
  ['Can I post to social media at the same time as Google Business Profile?', 'Not yet. Today you compose once, preview it, and publish or schedule it to Google Business Profile from one calendar that covers every location you manage. Publishing to Facebook and LinkedIn is coming soon.'],
  ['What happens if a scan point fails?', 'You can re-run it in one click, and its points go back to your balance automatically.'],
  ['Do points expire?', 'Seat points roll over for one month. Top-up points never expire. Prospect audits are valid for 90 days.'],
  ['Can my clients see the recordings without logging in?', `Yes. Send one share link—no login needed. White-label puts your agency’s logo and custom domain on every report and link: free from ${WHITE_LABEL.freeFrom} clients, or ${usd(WHITE_LABEL.cents)} once.`],
];

/** The page's moving parts: the report and listing tabs, the 7×7 grids and the recording player. */
function useHome(live: boolean) {
  const [tab, setTab] = useState(0);
  const [feat, setFeat] = useState(0);
  const [watching, setWatching] = useState(false);
  // "Listing Watchdog" opens the watchdog tab of the listing suite, from this page or from another (/#watchdog).
  const goWatch = useCallback(() => {
    setFeat(3);
    document.getElementById('google-listings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  useEffect(() => {
    const check = () => window.location.hash === '#watchdog' && goWatch();
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [goWatch]);
  const ring = (on: number) => (on ? { outline: `3px solid ${ACCENT}`, outlineOffset: '3px' } : {});
  const cells = (list: Raw[]) => list.map(([label, bg, fg, on]) => ({ label, bg, fg, ring: ring(on) }));
  const pill = (on: boolean) => (on ? { background: ACCENT, color: '#0B1017', borderColor: ACCENT } : { background: 'transparent', color: '#CBD5E1', borderColor: 'rgba(255, 255, 255, 0.16)' });
  const card = (on: boolean) => (on ? { background: '#151E2C', color: '#F1F5F9', borderColor: ACCENT } : { background: 'transparent', color: '#CBD5E1', borderColor: 'rgba(255, 255, 255, 0.1)' });
  const pick = (i: number, cur: number, set: (n: number) => void, look: (on: boolean) => React.CSSProperties) => ({ on: i === cur, pressed: i === cur, style: look(i === cur), pick: () => set(i) });
  return {
    ...TONE,
    live,
    tracker: cells(TRACKER),
    phone: cells(PHONE),
    r0: pick(0, tab, setTab, pill),
    r1: pick(1, tab, setTab, pill),
    r2: pick(2, tab, setTab, pill),
    r3: pick(3, tab, setTab, pill),
    f0: pick(0, feat, setFeat, card),
    f1: pick(1, feat, setFeat, card),
    f2: pick(2, feat, setFeat, card),
    f3: pick(3, feat, setFeat, card),
    f4: pick(4, feat, setFeat, card),
    goWatch,
    /** Play the hero point's recording over the page (the link still opens the video on its own). */
    watch: (e: React.MouseEvent) => {
      e.preventDefault();
      setWatching(true);
    },
    watching,
    stopWatching: () => setWatching(false),
  };
}
type V = ReturnType<typeof useHome>;

/** Pricing on the home page: the $5 audit, the three seats and the roster calculator. */
function HomePricing() {
  return (
    <section id="pricing" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: 'clamp(64px, 8vw, 104px) clamp(16px, 2vw, 24px)' }}>
        <Eyebrow>PRICING</Eyebrow>
        <h2 style={{ margin: '16px 0 0', fontWeight: 800, fontSize: 'clamp(32px, 3.6vw, 52px)', lineHeight: 1.12, letterSpacing: '-0.025em', maxWidth: 960 }}>Priced per Client. Not per Pin.</h2>
        <p style={{ margin: '20px 0 0', fontSize: 18, lineHeight: 1.65, color: '#CBD5E1', maxWidth: 820 }}>
          Each seat covers one client: scheduled scans of their keywords on real Android phones, a screen recording at every grid point, and AI Overview tracking. Command and Dominator add the Google listing tools. No setup fees, cancel any time.
        </p>
        <AuditCard style={{ marginTop: 36 }} />
        <SeatCards style={{ marginTop: 28 }} />
        <Calculator style={{ marginTop: 28 }} />
        <p style={{ margin: '24px 0 0', fontSize: 15.5, lineHeight: 1.6 }}>
          <a href={HREF.pricing} style={{ color: ACCENT, fontWeight: 700 }}>See full pricing: prospect audits, top-ups, white-label and the seat comparison →</a>
        </p>
      </div>
    </section>
  );
}

/* section#top */
function STop({ v }: { v: V }) {
  return (
    <section id="top" style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "clamp(48px, 6vw, 88px) clamp(16px, 2vw, 24px) 48px", display: "flex", flexWrap: "wrap", gap: "56px", alignItems: "center" }}>
        <div style={{ flex: "1 1 480px", minWidth: "0" }}>
          <p style={{ margin: "0", display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", background: "#111823", borderRadius: "18px", padding: "7px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.4", color: "#CBD5E1" }}><span aria-hidden="true" style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "999px", background: "#EF4444" }}></span>REC · Real Android Phones · GBP Command · Listing Watchdog</p>
          <h1 style={{ margin: "24px 0 0", letterSpacing: "-0.025em", color: "#FF4040" }}><span style={{ display: "block", fontWeight: "400", fontSize: "clamp(34px, 3.6vw, 52px)", lineHeight: "1.12", color: "rgb(255, 255, 255)" }}>The Map Pack Isn’t the Top of Google Anymore.</span></h1>
          <p style={{ margin: "24px 0 0", fontSize: "18px", lineHeight: "1.65", color: "#CBD5E1", maxWidth: "640px" }}>On more and more local searches, Google answers with an AI Overview first, and sometimes shows a single business instead of a map pack. Stakeout sends a real Android phone to every point of your grid to record what customers actually see, then lets you fix GBP rival gaps, post to Google (Facebook &amp; LinkedIn coming soon), and guard every client pin every day from one dashboard.</p>
          <div style={{ marginTop: "32px", display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <a className="so-btn" href={HREF.firstAudit} style={{ display: "inline-flex", alignItems: "center", gap: "10px", minHeight: "50px", boxSizing: "border-box", background: v.accent, color: "#0B1017", fontWeight: "700", fontSize: "16px", lineHeight: "1.3", padding: "14px 24px", borderRadius: "12px" }}>Run your first scan for $5<Arrow size={18} /></a>
            <a className="so-btn" href={HREF.recording} onClick={v.watch} style={{ display: "inline-flex", alignItems: "center", gap: "10px", minHeight: "50px", boxSizing: "border-box", background: "rgba(255, 255, 255, 0.06)", border: "1px solid rgba(255, 255, 255, 0.14)", color: "#F1F5F9", fontWeight: "600", fontSize: "16px", lineHeight: "1.3", padding: "14px 22px", borderRadius: "12px" }}><Play size={14} />Watch a recorded search</a>
          </div>
          <p style={{ margin: "14px 0 0", fontSize: "14px", lineHeight: "1.6", color: "#94A3B8", maxWidth: "640px" }}>Your first 5×5 audit is {usd(WELCOME.cents)}, and it comes off your first month. Seats from {from('SCOUT')} per client a month; Command, with the Google listing tools, from {from('COMMAND')}.</p>
          <ul style={{ listStyle: "none", padding: "0", margin: "32px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "14px 28px", fontSize: "15px", lineHeight: "1.5", color: "#CBD5E1" }}>
            <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><Check size={18} top={2} /><span>MP4 screen recording + SHA-256 receipt at every grid point</span></li>
            <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><Check size={18} top={2} /><span>The phone’s GPS set at each point + real city-level residential ISPs (provider named)</span></li>
            <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><Check size={18} top={2} /><span>AI Overview + Map Pack tracked together in one run</span></li>
            <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><Check size={18} top={2} /><span>1-click GBP API edits, Google posts &amp; a daily listing watchdog</span></li>
          </ul>
        </div>
        <div style={{ flex: "1.1 1 540px", minWidth: "0", display: "flex", flexWrap: "wrap", gap: "24px", justifyContent: "center", alignItems: "flex-start" }}>
          <figure style={{ margin: "0", flex: "0 1 290px", minWidth: "0" }}>
            <div style={{ borderRadius: "36px", border: "9px solid #1E2836", overflow: "hidden", background: "#FFFFFF", boxShadow: "0 40px 80px -30px rgba(0, 0, 0, 0.85)" }}>
              <img src="/home/hero-plumber-ai-overview.jpg" width={720} height={1320} decoding="async" alt="Google results on an Android phone: an AI Overview names Stuart’s Plumbing in its first sentence with its phone number, then a single business card and a Yelp result. There is no map pack." style={{ display: "block", width: "100%", height: "auto" }} />
            </div>
            <figcaption style={{ marginTop: "14px", fontSize: "12.5px", lineHeight: "1.55", color: "#94A3B8" }}>Real Google results on an Android phone: “emergency plumber near me”, Lakeland, FL. The AI Overview names one plumber and its number. No map pack on the page.</figcaption>
          </figure>
          <div style={{ flex: "1 1 260px", maxWidth: "330px", minWidth: "0", background: "#111823", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "22px", fontFamily: "'JetBrains Mono', monospace", fontSize: "12.5px", lineHeight: "1.5", color: "#CBD5E1", boxShadow: "0 30px 70px -25px rgba(0, 0, 0, 0.8)" }}>
            <p style={{ margin: "0", fontWeight: "700", letterSpacing: "0.08em", color: "#F1F5F9" }}>RECEIPT{' '}<span style={{ color: v.accent }}>#cmwkpqpk40010</span></p>
            <p style={{ margin: "10px 0 0", display: "inline-block", border: "1px solid rgba(16, 185, 129, 0.45)", background: "rgba(16, 185, 129, 0.1)", color: "#34D399", borderRadius: "999px", padding: "3px 10px", fontSize: "11.5px", lineHeight: "1.5" }}>One real point. Not a mock-up.</p>
            <dl style={{ margin: "16px 0 0", paddingTop: "14px", borderTop: "1px dashed rgba(255, 255, 255, 0.16)", display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "10px 14px" }}>
              <dt style={{ color: "#94A3B8" }}>Search</dt>
              <dd style={{ margin: "0", color: "#F1F5F9" }}>“emergency plumber near me”</dd>
              <dt style={{ color: "#94A3B8" }}>Business</dt>
              <dd style={{ margin: "0", color: "#F1F5F9" }}>Stuart’s Plumbing</dd>
              <dt style={{ color: "#94A3B8" }}>Point</dt>
              <dd style={{ margin: "0", color: "#F1F5F9" }}>5,5 of a 5×5 grid · Eaton Park, near Lakeland, FL 33840</dd>
              <dt style={{ color: "#94A3B8" }}>Time</dt>
              <dd style={{ margin: "0", color: "#F1F5F9" }}>Nov 17, 2026 · 8:29 AM EST</dd>
              <dt style={{ color: "#94A3B8" }}>Device</dt>
              <dd style={{ margin: "0", color: "#F1F5F9" }}>Android phone · Chrome</dd>
              <dt style={{ color: "#94A3B8" }}>Network</dt>
              <dd style={{ margin: "0", color: "#F1F5F9" }}>Spectrum</dd>
              <dt style={{ color: "#94A3B8" }}>Local result</dt>
              <dd style={{ margin: "0", color: "#F1F5F9" }}>#1, the only business shown</dd>
              <dt style={{ color: "#94A3B8" }}>AI Overview</dt>
              <dd style={{ margin: "0", color: "#C4A1FF" }}>Named (first of 5)</dd>
              <dt style={{ color: "#94A3B8" }}>SHA-256</dt>
              <dd style={{ margin: "0", color: "#F1F5F9", wordBreak: "break-all" }}>177788ca4a4b57db…a85e55c56</dd>
            </dl>
            <a className="so-btn" href={HREF.recording} onClick={v.watch} style={{ marginTop: "18px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "44px", boxSizing: "border-box", border: "1px solid rgba(255, 255, 255, 0.16)", borderRadius: "10px", padding: "10px 12px", color: "#F1F5F9", fontFamily: "Inter, sans-serif", fontWeight: "600", fontSize: "14px", lineHeight: "1.3" }}><Play size={13} />Watch this point’s recording</a>
            <p style={{ margin: "16px 0 0", textAlign: "center", color: "#7C8BA1", fontSize: "10.5px", lineHeight: "1.5", letterSpacing: "0.1em" }}>EVERY DATA POINT COMES WITH A RECEIPT</p>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "0 clamp(16px, 2vw, 24px) 64px" }}>
        <div style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "18px", background: "#111823", padding: "24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: "20px 28px" }}>
          <div>
            <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.08em", color: "#94A3B8" }}>THE SCAN BEHIND THIS RECEIPT</p>
            <p style={{ margin: "8px 0 0", fontSize: "15px", lineHeight: "1.5", color: "#CBD5E1" }}>Lakeland, FL · 5×5 grid · Nov 17, 2026</p>
          </div>
          <div>
            <p style={{ margin: "0", fontWeight: "800", fontSize: "32px", lineHeight: "1.15", letterSpacing: "-0.02em" }}>25 of 25</p>
            <p style={{ margin: "6px 0 0", fontSize: "14px", lineHeight: "1.5", color: "#94A3B8" }}>points done in under 20 minutes</p>
          </div>
          <div>
            <p style={{ margin: "0", fontWeight: "800", fontSize: "32px", lineHeight: "1.15", letterSpacing: "-0.02em", color: "#C4A1FF" }}>21 of 25</p>
            <p style={{ margin: "6px 0 0", fontSize: "14px", lineHeight: "1.5", color: "#94A3B8" }}>named in Google’s AI Overview</p>
          </div>
          <div>
            <p style={{ margin: "0", fontWeight: "800", fontSize: "32px", lineHeight: "1.15", letterSpacing: "-0.02em" }}>9 of 25</p>
            <p style={{ margin: "6px 0 0", fontSize: "14px", lineHeight: "1.5", color: "#94A3B8" }}>in the local results—a map-pack-only grid would report the other 16 as “not found”</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* section#honest-math */
function SHonestMath({ v }: { v: V }) {
  return (
    <section id="honest-math" style={{ background: "#0E141D", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "clamp(64px, 8vw, 104px) clamp(16px, 2vw, 24px)" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", textAlign: "center" }}>
          <p style={{ margin: "0", display: "inline-flex", alignItems: "center", gap: "12px", background: "#0B0F14", border: "3px solid #FF2424", borderRadius: "999px", padding: "10px 22px 10px 16px", fontWeight: "800", fontSize: "15px", lineHeight: "1.3", letterSpacing: "0.06em", color: "#FFFFFF" }}><span aria-hidden="true" style={{ flex: "none", display: "inline-block", width: "14px", height: "14px", borderRadius: "999px", background: "#FF2424" }}></span>THE 100-CREDIT SHELL GAME</p>
          <h2 style={{ margin: "24px 0 0", fontWeight: "800", fontSize: "clamp(34px, 4vw, 58px)", lineHeight: "1.12", letterSpacing: "-0.025em" }}>Don’t Punish Us for Being Honest.</h2>
          <p style={{ margin: "24px 0 0", fontSize: "18px", lineHeight: "1.7", color: "#CBD5E1" }}>Only one question matters in local SEO:{' '}<span style={{ color: "#FFFFFF", fontWeight: "600" }}>“What does my customer actually see when they pull out their phone and search?”</span>{' '}Your customer doesn’t search Google from a dropdown menu—so why are you burning up to 4× the credits running separate API scans just to guess what’s on one screen?</p>
        </div>
        <ol style={{ listStyle: "none", padding: "0", margin: "52px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "20px" }}>
          <li style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "24px", background: "#111823" }}>
            <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.06em", color: "#F87171" }}>01 · THE PRE-ENABLED +25 TRAP</p>
            <p style={{ margin: "12px 0 0", fontSize: "15px", lineHeight: "1.65", color: "#CBD5E1" }}>Pick 1 keyword on a 5×5 grid (25 pins). An unlabeled sparkle switch sits{' '}<strong style={{ color: "#FFFFFF" }}>ON by default</strong>{' '}next to Run Scan—instantly turning a 25-pin check into a{' '}<strong style={{ color: "#F87171" }}>50-credit</strong>{' '}charge (and turning a 9-pin 3×3 into 34 credits).</p>
          </li>
          <li style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "24px", background: "#111823" }}>
            <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.06em", color: "#F87171" }}>02 · FORCED SEPARATE SCANS</p>
            <p style={{ margin: "12px 0 0", fontSize: "15px", lineHeight: "1.65", color: "#CBD5E1" }}>Google Maps and Google AI Overviews live in{' '}<strong style={{ color: "#FFFFFF" }}>separate single-select dropdowns</strong>. Checking both forces you to run{' '}<strong style={{ color: "#F87171" }}>two separate 5×5 scans</strong>{' '}(up to 100 credits total) for one keyword.</p>
          </li>
          <li style={{ border: `1px solid ${v.accentLine}`, borderRadius: "16px", padding: "24px", background: "#111823" }}>
            <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.06em", color: v.accent }}>03 · ONE PHONE CAPTURES EVERYTHING</p>
            <p style={{ margin: "12px 0 0", fontSize: "15px", lineHeight: "1.65", color: "#CBD5E1" }}>Stakeout deploys a real Android phone on a local ISP at every GPS point—recording{' '}<strong style={{ color: "#FFFFFF" }}>Ads, AI Overviews, Cited URLs, and the Local Pack</strong>{' '}together on one screen for{' '}<strong style={{ color: v.accent }}>25 points flat</strong> on a scheduled scan.</p>
          </li>
        </ol>
        <div style={{ marginTop: "28px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 480px), 1fr))", gap: "24px", alignItems: "stretch" }}>
          <div style={{ border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "20px", background: "#111823", padding: "28px", display: "flex", flexDirection: "column" }}>
            <p style={{ margin: "0", display: "inline-block", alignSelf: "flex-start", fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px", lineHeight: "1.5", color: "#F87171", background: "rgba(239, 68, 68, 0.12)", padding: "4px 10px", borderRadius: "8px" }}>UP TO 4× BURN</p>
            <p style={{ margin: "14px 0 0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.06em", color: "#F87171" }}>THE “1 PIN = 1 CREDIT” INDUSTRY LEADER</p>
            <p style={{ margin: "6px 0 0", fontWeight: "700", fontSize: "21px", lineHeight: "1.3" }}>Split Dropdowns &amp; Pre-Checked Surcharges</p>
            <div style={{ marginTop: "20px", background: "#FFFFFF", color: "#0F172A", borderRadius: "12px", padding: "18px", textAlign: "center" }}>
              <p style={{ margin: "0", fontSize: "13px", lineHeight: "1.4", fontWeight: "700" }}>Confirm Scans</p>
              <p style={{ margin: "8px 0 0", fontSize: "14px", lineHeight: "1.5" }}>You are about to run{' '}<strong>1 scan</strong>{' '}which will use{' '}<strong style={{ color: "#B91C1C" }}>50 credits</strong>.</p>
              <p style={{ margin: "8px 0 0", fontSize: "12px", lineHeight: "1.5", color: "#475569" }}>5×5 Grid (25 pins) · 1 Keyword · Checks ONLY 1 dropdown surface</p>
            </div>
            <ul style={{ listStyle: "none", padding: "0", margin: "20px 0 0", fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", lineHeight: "1.5", display: "grid", gap: "10px" }}>
              <li style={{ display: "flex", justifyContent: "space-between", gap: "14px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", paddingBottom: "10px", color: "#CBD5E1" }}><span>5×5 Map Grid (25 pins)</span><span style={{ flex: "none" }}>25 credits</span></li>
              <li style={{ display: "flex", justifyContent: "space-between", gap: "14px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", paddingBottom: "10px", color: "#F87171" }}><span>+ Unlabeled AI Switch (On by default)</span><span style={{ flex: "none" }}>+25 credits</span></li>
              <li style={{ display: "flex", justifyContent: "space-between", gap: "14px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", paddingBottom: "10px", color: "#F87171" }}><span>+ 2nd Separate Scan for AI Overviews</span><span style={{ flex: "none" }}>+50 credits</span></li>
              <li style={{ display: "flex", justifyContent: "space-between", gap: "14px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", paddingBottom: "10px", color: "#94A3B8" }}><span>Proves if AI wiped out the 3-Pack?</span><span style={{ flex: "none" }}>No (Split APIs)</span></li>
              <li style={{ display: "flex", justifyContent: "space-between", gap: "14px", color: "#94A3B8" }}><span>Unused monthly credits</span><span style={{ flex: "none" }}>Wiped every 30 days</span></li>
            </ul>
            <div style={{ marginTop: "auto", paddingTop: "24px" }}>
              <div style={{ borderTop: "1px solid rgba(239, 68, 68, 0.25)", paddingTop: "18px" }}>
                <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", color: "#94A3B8" }}>REAL BURN (MAPS + AIO · 5×5)</p>
                <p style={{ margin: "6px 0 0", fontFamily: "'JetBrains Mono', monospace", fontWeight: "700", fontSize: "24px", lineHeight: "1.3", color: "#F87171" }}>100 CREDITS · 2 SCANS</p>
              </div>
            </div>
          </div>
          <div style={{ border: `2px solid ${v.accent}`, borderRadius: "20px", background: "#111927", padding: "28px", display: "flex", flexDirection: "column", boxShadow: `0 0 44px ${v.accentGlow}` }}>
            <p style={{ margin: "0", display: "inline-block", alignSelf: "flex-start", fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px", lineHeight: "1.5", color: v.accent, background: v.accentSoft, padding: "4px 10px", borderRadius: "8px" }}>ALL-IN-ONE</p>
            <p style={{ margin: "14px 0 0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.06em", color: v.accent }}>STAKEOUT SEARCH · REAL ANDROID TELEMETRY</p>
            <p style={{ margin: "6px 0 0", fontWeight: "700", fontSize: "21px", lineHeight: "1.3" }}>One Real Phone. One Unified Screen.</p>
            <div style={{ marginTop: "20px", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "12px", background: "#0B1017", padding: "18px" }}>
              <p style={{ margin: "0", display: "flex", alignItems: "center", gap: "8px", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.06em", color: v.accent }}><span aria-hidden="true" style={{ flex: "none", display: "inline-block", width: "8px", height: "8px", borderRadius: "999px", background: "#EF4444" }}></span>REC · EXACTLY WHAT YOUR CUSTOMER SEES</p>
              <p style={{ margin: "10px 0 0", fontSize: "14px", lineHeight: "1.65", color: "#E2E8F0" }}>Every grid point runs a real Android session on a local ISP—capturing{' '}<strong>Ads, Google’s AI Overview, Cited Sources, and the Local Pack</strong>{' '}together on video in a single run.</p>
            </div>
            <ul style={{ listStyle: "none", padding: "0", margin: "20px 0 0", fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", lineHeight: "1.5", display: "grid", gap: "10px" }}>
              <li style={{ display: "flex", justifyContent: "space-between", gap: "14px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "10px", color: "#F1F5F9" }}><span>5×5 Real-Device Grid (25 phone sessions)</span><span style={{ flex: "none", fontWeight: "700" }}>25 points</span></li>
              <li style={{ display: "flex", justifyContent: "space-between", gap: "14px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "10px", color: "#34D399" }}><span>+ Google AI Overview &amp; Cited URLs</span><span style={{ flex: "none" }}>0 EXTRA</span></li>
              <li style={{ display: "flex", justifyContent: "space-between", gap: "14px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "10px", color: "#34D399" }}><span>+ 25 MP4 Screen Recordings + SHA-256 Proof</span><span style={{ flex: "none" }}>0 EXTRA</span></li>
              <li style={{ display: "flex", justifyContent: "space-between", gap: "14px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "10px", color: "#34D399" }}><span>+ 2D &amp; 3D U.S. Census Buying-Power Map</span><span style={{ flex: "none" }}>0 EXTRA</span></li>
              <li style={{ display: "flex", justifyContent: "space-between", gap: "14px", color: "#34D399" }}><span>Unused points</span><span style={{ flex: "0 1 auto", textAlign: "right" }}>Seat points roll over 1 mo · Top-ups NEVER EXPIRE</span></li>
            </ul>
            <div style={{ marginTop: "auto", paddingTop: "24px" }}>
              <div style={{ borderTop: `1px solid ${v.accentLine}`, paddingTop: "18px" }}>
                <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", color: "#94A3B8" }}>REAL BURN (MAPS + AIO · 5×5)</p>
                <p style={{ margin: "6px 0 0", fontFamily: "'JetBrains Mono', monospace", fontWeight: "700", fontSize: "24px", lineHeight: "1.3", color: v.accent }}>25 POINTS. 1 SCAN.</p><p style={{ margin: "6px 0 0", fontSize: "12.5px", lineHeight: "1.5", color: "#94A3B8" }}>Scheduled. Scan Now jumps the queue for 50.</p>
              </div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: "28px", overflowX: "auto", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "18px", background: "#111823" }}>
          <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse", fontSize: "14.5px", lineHeight: "1.55" }}>
            <caption style={{ textAlign: "left", padding: "22px 24px 8px", fontWeight: "700", fontSize: "20px", lineHeight: "1.3", color: "#F1F5F9" }}>Side by Side, Line by Line</caption>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left", verticalAlign: "bottom", padding: "14px 24px", width: "30%", color: "#94A3B8", fontWeight: "600", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>What Happens on One 5×5 Keyword Audit (25 Pins)</th>
                <th scope="col" style={{ textAlign: "left", verticalAlign: "bottom", padding: "14px 24px", width: "36%", color: "#F87171", fontWeight: "600", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>The “1 Pin = 1 Credit” Industry Leader</th>
                <th scope="col" style={{ textAlign: "left", verticalAlign: "bottom", padding: "14px 24px", color: v.accent, fontWeight: "700", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>Stakeout Search</th>
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "16px 24px", fontWeight: "600", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>How the Search Runs</th><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#CBD5E1", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Split server queries picked one-by-one from a dropdown menu</td><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#F1F5F9", fontWeight: "600", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>1 real Android phone capturing the actual customer screen</td></tr>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "16px 24px", fontWeight: "600", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>5×5 Map Grid (25 Pins)</th><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#CBD5E1", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>25 credits</span></td><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#F1F5F9", fontFamily: "'JetBrains Mono', monospace", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>25 points scheduled · 50 Scan Now</td></tr>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "16px 24px", fontWeight: "600", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Unlabeled AI Summary Switch (On by Default)</th><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#CBD5E1", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}><span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F87171" }}>+25 credit surcharge</span>{' '}<em>(50 credits total for 1 scan)</em></td><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}><span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#34D399" }}>0 extra</span>{' '}(No hidden toggles)</td></tr>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "16px 24px", fontWeight: "600", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Google AI Overview + Cited Sources</th><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#CBD5E1", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}><span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F87171" }}>+50 credits</span>{' '}<em>(requires running a 2nd separate scan)</em></td><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}><span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#34D399" }}>0 extra</span>{' '}(Captured on the exact same phone screen)</td></tr>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "16px 24px", fontWeight: "600", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Shows If AI Replaced the 3-Pack{' '}<span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px", fontWeight: "500", color: "#CBD5E1", border: "1px solid rgba(255, 255, 255, 0.14)", borderRadius: "6px", padding: "1px 6px" }}>No LP</span>?</th><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#CBD5E1", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}><strong style={{ color: "#F87171" }}>Never</strong>{' '}<em>(two separate grids—blind to real page layout)</em></td><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}><strong style={{ color: "#34D399" }}>Yes</strong>{' '}(Recorded on MP4 video with SHA-256 receipt)</td></tr>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "16px 24px", fontWeight: "600", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>2D &amp; 3D U.S. Census Buying-Power Map</th><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#94A3B8", fontStyle: "italic", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Not available</td><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}><span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#34D399" }}>0 extra</span>{' '}(Included on every report)</td></tr>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "16px 24px", fontWeight: "600", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Unused at Month-End</th><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#CBD5E1", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Confiscated at billing reset</td><td style={{ verticalAlign: "top", padding: "16px 24px", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Seat points roll over 1 month · top-ups never expire</td></tr>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "18px 24px", fontWeight: "800", color: "#F1F5F9", letterSpacing: "0.02em" }}>REAL COST OF ONE COMPLETE 5×5 AUDIT</th><td style={{ verticalAlign: "top", padding: "18px 24px", color: "#F87171", fontWeight: "700" }}>Up to 100 Credits + 2 Separate Scans{' '}<em style={{ fontWeight: "400", color: "#CBD5E1" }}>(for spoofed dots)</em></td><td style={{ verticalAlign: "top", padding: "18px 24px", color: v.accent, fontWeight: "800" }}>25 Points. 1 Scan. 25 Real Video Receipts.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* section#real-vs-reported */
function SRealVsReported({ v }: { v: V }) {
  return (
    <section id="real-vs-reported" style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "clamp(64px, 8vw, 104px) clamp(16px, 2vw, 24px)" }}>
        <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12.5px", lineHeight: "1.5", letterSpacing: "0.12em", color: v.accent }}>SAME KEYWORD · SAME BUSINESS · SAME 49 POINTS</p>
        <h2 style={{ margin: "16px 0 0", fontWeight: "800", fontSize: "clamp(32px, 3.6vw, 52px)", lineHeight: "1.12", letterSpacing: "-0.025em", maxWidth: "960px" }}>The Rank Tracker Said #11. Google’s AI Named Them First.</h2>
        <p style={{ margin: "20px 0 0", fontSize: "18px", lineHeight: "1.65", color: "#CBD5E1", maxWidth: "820px" }}>We scanned Stuart’s Plumbing for “emergency plumber near me” in Lakeland, FL on the exact same 7×7 grid a leading rank-grid tool tracks. Where that tool reported #8 or worse, a real phone found Google’s AI Overview naming the business at 15 of those 16 points.</p>
        <div style={{ marginTop: "44px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", gap: "24px" }}>
          <div style={{ background: "#111823", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "18px", padding: "clamp(16px, 2.4vw, 28px)" }}>
            <p style={{ margin: "0", fontWeight: "700", fontSize: "20px", lineHeight: "1.3" }}>A leading rank-grid tool</p>
            <p style={{ margin: "6px 0 24px", fontSize: "14px", lineHeight: "1.5", color: "#94A3B8" }}>The local rank it reported at each point</p>
            <div role="img" aria-label="A leading rank-grid tool’s 7 by 7 map: ranks 8 to 13 across the west and north, 1 to 3 only in the south-east" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "clamp(4px, 0.6vw, 8px)", maxWidth: "400px", margin: "0 auto" }}>
              {v.tracker.map((c, i) => (
                <div key={i} style={{ aspectRatio: "1 / 1", borderRadius: "999px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: "clamp(10px, 1vw, 13px)", lineHeight: "1", fontWeight: "700", border: "2px solid rgba(255, 255, 255, 0.85)", background: c.bg, color: c.fg, ...c.ring }}>{c.label}</div>
              ))}
            </div>
          </div>
          <div style={{ background: "#111823", border: "1px solid rgba(168, 85, 247, 0.35)", borderRadius: "18px", padding: "clamp(16px, 2.4vw, 28px)" }}>
            <p style={{ margin: "0", fontWeight: "700", fontSize: "20px", lineHeight: "1.3" }}>Stakeout — a real phone at each point</p>
            <p style={{ margin: "6px 0 24px", fontSize: "14px", lineHeight: "1.5", color: "#94A3B8" }}>Place in Google’s AI Overview</p>
            <div role="img" aria-label="Stakeout’s 7 by 7 map of the same points: an AI Overview at 46 of 49 points, naming the business at 42 and first at 18" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "clamp(4px, 0.6vw, 8px)", maxWidth: "400px", margin: "0 auto" }}>
              {v.phone.map((c, i) => (
                <div key={i} style={{ aspectRatio: "1 / 1", borderRadius: "999px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: "clamp(10px, 1vw, 13px)", lineHeight: "1", fontWeight: "700", border: "2px solid rgba(255, 255, 255, 0.85)", background: c.bg, color: c.fg, ...c.ring }}>{c.label}</div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: "20px", display: "flex", flexWrap: "wrap", gap: "10px 22px", fontSize: "13px", lineHeight: "1.5", color: "#94A3B8" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}><span aria-hidden="true" style={{ flex: "none", width: "11px", height: "11px", borderRadius: "999px", background: "#2a6600", display: "inline-block" }}></span>#1–3 local rank</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}><span aria-hidden="true" style={{ flex: "none", width: "11px", height: "11px", borderRadius: "999px", background: "#f7c701", display: "inline-block" }}></span>#4–5</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}><span aria-hidden="true" style={{ flex: "none", width: "11px", height: "11px", borderRadius: "999px", background: "#d26e00", display: "inline-block" }}></span>#6–8</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}><span aria-hidden="true" style={{ flex: "none", width: "11px", height: "11px", borderRadius: "999px", background: "#af0a00", display: "inline-block" }}></span>#9 and below</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}><span aria-hidden="true" style={{ flex: "none", width: "11px", height: "11px", borderRadius: "999px", background: "#9333EA", display: "inline-block" }}></span>#1–5: place in the AI Overview (✓ named, no place)</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}><span aria-hidden="true" style={{ flex: "none", width: "11px", height: "11px", borderRadius: "999px", background: "#4c1d95", display: "inline-block" }}></span>no: left out of the AI Overview</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}><span aria-hidden="true" style={{ flex: "none", width: "13px", height: "13px", borderRadius: "999px", border: `3px solid ${v.accent}`, boxSizing: "border-box", display: "inline-block" }}></span>the same point on both maps: tool #11, AI Overview #1</span>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: "13px", lineHeight: "1.5", color: "#94A3B8" }}>On the phone map, the 3 points with no AI Overview show the local rank instead.</p>
        <div style={{ marginTop: "40px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
          <div style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "22px 24px", background: "#111823" }}>
            <p style={{ margin: "0", fontWeight: "800", fontSize: "36px", lineHeight: "1.15", letterSpacing: "-0.02em" }}>46 of 49</p>
            <p style={{ margin: "8px 0 0", fontSize: "15px", lineHeight: "1.5", color: "#94A3B8" }}>points showed an AI Overview</p>
          </div>
          <div style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "22px 24px", background: "#111823" }}>
            <p style={{ margin: "0", fontWeight: "800", fontSize: "36px", lineHeight: "1.15", letterSpacing: "-0.02em", color: "#C4A1FF" }}>42 of 49</p>
            <p style={{ margin: "8px 0 0", fontSize: "15px", lineHeight: "1.5", color: "#94A3B8" }}>named Stuart’s Plumbing in it (first at 18)</p>
          </div>
          <div style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "22px 24px", background: "#111823" }}>
            <p style={{ margin: "0", fontWeight: "800", fontSize: "36px", lineHeight: "1.15", letterSpacing: "-0.02em" }}>25 of 49</p>
            <p style={{ margin: "8px 0 0", fontSize: "15px", lineHeight: "1.5", color: "#94A3B8" }}>showed one business instead of a map pack</p>
          </div>
        </div>
        <p style={{ margin: "24px 0 0", fontSize: "13px", lineHeight: "1.6", color: "#94A3B8", maxWidth: "860px" }}>Stakeout scan of Nov 15, 2026: 7×7 grid, points 1 mile apart, Android phone in Chrome on home internet at each point.</p>
        <a className="so-btn" href={HREF.sevenGrid} style={{ marginTop: "12px", display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "44px", color: v.accent, fontWeight: "700", fontSize: "16px", lineHeight: "1.4" }}>Open this scan’s live report<Arrow size={16} /></a>
      </div>
    </section>
  );
}

/* section#ai-overviews */
function SAiOverviews({ v }: { v: V }) {
  return (
    <section id="ai-overviews" style={{ background: "#0E141D", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "clamp(64px, 8vw, 104px) clamp(16px, 2vw, 24px)" }}>
        <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12.5px", lineHeight: "1.5", letterSpacing: "0.12em", color: "#C4A1FF" }}>AI OVERVIEWS · THE NEW LOCAL PACK</p>
        <h2 style={{ margin: "16px 0 0", fontWeight: "800", fontSize: "clamp(32px, 3.6vw, 52px)", lineHeight: "1.12", letterSpacing: "-0.025em", maxWidth: "960px" }}>This Is Where the Calls Start Now.</h2>
        <p style={{ margin: "20px 0 0", fontSize: "18px", lineHeight: "1.65", color: "#CBD5E1", maxWidth: "800px" }}>Google’s AI Overview can name a business, print its phone number in the first sentence, and sit above the paid ads. A tracker that only reads the map pack reports none of it.</p>
        <div style={{ marginTop: "44px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "28px" }}>
          <figure style={{ margin: "0", display: "flex", flexDirection: "column", gap: "18px" }}>
            <img src="/home/aio-lakeland-plumber.jpg" width={720} height={1320} loading="lazy" decoding="async" alt="An AI Overview for an emergency plumber in Lakeland that names a plumber and prints its phone number in the first sentence, above the sponsored ads and the map pack" style={{ display: "block", width: "100%", height: "520px", objectFit: "cover", objectPosition: "top", borderRadius: "18px", border: "1px solid rgba(255, 255, 255, 0.1)", background: "#FFFFFF" }} />
            <figcaption>
              <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.08em", color: v.accent }}>01 · TAP TO CALL</p>
              <p style={{ margin: "8px 0 0", fontWeight: "700", fontSize: "21px", lineHeight: "1.3", color: "#F1F5F9" }}>A phone number in the first sentence.</p>
              <p style={{ margin: "8px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}>Above the paid ads and above the map pack. The customer calls without scrolling. Lakeland, FL.</p>
            </figcaption>
          </figure>
          <figure style={{ margin: "0", display: "flex", flexDirection: "column", gap: "18px" }}>
            <img src="/home/aio-tampa-water-damage.jpg" width={720} height={1320} loading="lazy" decoding="async" alt="An AI Overview for water damage restoration in Tampa with its own map and a business card with Call, Directions and Website buttons, followed by Servpro and Yelp, with no map pack" style={{ display: "block", width: "100%", height: "520px", objectFit: "cover", objectPosition: "top", borderRadius: "18px", border: "1px solid rgba(255, 255, 255, 0.1)", background: "#FFFFFF" }} />
            <figcaption>
              <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.08em", color: v.accent }}>02 · ITS OWN MAP</p>
              <p style={{ margin: "8px 0 0", fontWeight: "700", fontSize: "21px", lineHeight: "1.3", color: "#F1F5F9" }}>The AI Overview has the map now.</p>
              <p style={{ margin: "8px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}>Business cards with Call, Directions and Website buttons inside the answer. Servpro and Yelp underneath. No 3-pack on the page. Tampa, FL.</p>
            </figcaption>
          </figure>
          <figure style={{ margin: "0", display: "flex", flexDirection: "column", gap: "18px" }}>
            <img src="/home/aio-tampa-plumber.jpg" width={514} height={852} loading="lazy" decoding="async" alt="An AI Overview for an emergency plumber in Tampa naming a plumber with its phone number, directly above the sponsored Local Services Ads" style={{ display: "block", width: "100%", height: "520px", objectFit: "cover", objectPosition: "top", borderRadius: "18px", border: "1px solid rgba(255, 255, 255, 0.1)", background: "#FFFFFF" }} />
            <figcaption>
              <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.08em", color: v.accent }}>03 · ABOVE THE ADS</p>
              <p style={{ margin: "8px 0 0", fontWeight: "700", fontSize: "21px", lineHeight: "1.3", color: "#F1F5F9" }}>Ahead of the paid listings.</p>
              <p style={{ margin: "8px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}>The AI Overview names a plumber and its number directly above the Local Services Ads. Tampa, FL.</p>
            </figcaption>
          </figure>
        </div>
        <div style={{ marginTop: "56px" }}>
          <p style={{ margin: "0", fontWeight: "700", fontSize: "24px", lineHeight: "1.3" }}>What Stakeout records about the AI Overview, at every point</p>
          <ol style={{ listStyle: "none", padding: "0", margin: "24px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "16px" }}>
            <li style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "22px", background: "#111823" }}>
              <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", color: "#C4A1FF" }}>01</p>
              <p style={{ margin: "8px 0 0", fontWeight: "700", fontSize: "17px", lineHeight: "1.35" }}>Whether one appeared</p>
              <p style={{ margin: "6px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}>Point by point, so you see where the AI answers first.</p>
            </li>
            <li style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "22px", background: "#111823" }}>
              <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", color: "#C4A1FF" }}>02</p>
              <p style={{ margin: "8px 0 0", fontWeight: "700", fontSize: "17px", lineHeight: "1.35" }}>Your place in its list</p>
              <p style={{ margin: "6px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}>First, named further down, or left out.</p>
            </li>
            <li style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "22px", background: "#111823" }}>
              <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", color: "#C4A1FF" }}>03</p>
              <p style={{ margin: "8px 0 0", fontWeight: "700", fontSize: "17px", lineHeight: "1.35" }}>Position zero</p>
              <p style={{ margin: "6px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}>Named in its opening sentence, ahead of any list.</p>
            </li>
            <li style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "22px", background: "#111823" }}>
              <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", color: "#C4A1FF" }}>04</p>
              <p style={{ margin: "8px 0 0", fontWeight: "700", fontSize: "17px", lineHeight: "1.35" }}>Every site it cited</p>
              <p style={{ margin: "6px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}>And whether your own website is one of them.</p>
            </li>
            <li style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "22px", background: "#111823" }}>
              <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", color: "#C4A1FF" }}>05</p>
              <p style={{ margin: "8px 0 0", fontWeight: "700", fontSize: "17px", lineHeight: "1.35" }}>Every business it named</p>
              <p style={{ margin: "6px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}>In order, right next to their local rank.</p>
            </li>
            <li style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "22px", background: "#111823" }}>
              <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", color: "#C4A1FF" }}>06</p>
              <p style={{ margin: "8px 0 0", fontWeight: "700", fontSize: "17px", lineHeight: "1.35" }}>N/A, not 20+, when there’s no map pack</p>
              <p style={{ margin: "6px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}>A page where Google removed the 3-pack isn’t falsely counted as a rank loss.</p>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}

/* section#how-it-works */
function SHowItWorks({ v }: { v: V }) {
  return (
    <section id="how-it-works" style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "clamp(64px, 8vw, 104px) clamp(16px, 2vw, 24px)" }}>
        <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12.5px", lineHeight: "1.5", letterSpacing: "0.12em", color: v.accent }}>HOW A SCAN RUNS</p>
        <h2 style={{ margin: "16px 0 0", fontWeight: "800", fontSize: "clamp(32px, 3.6vw, 52px)", lineHeight: "1.12", letterSpacing: "-0.025em", maxWidth: "960px" }}>A Real Phone at Every Point. A Recording of Every Search.</h2>
        <ol style={{ listStyle: "none", padding: "0", margin: "44px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "20px" }}>
          <li style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "24px", background: "#111823" }}>
            <p style={{ margin: "0", display: "inline-flex", width: "38px", height: "38px", alignItems: "center", justifyContent: "center", borderRadius: "10px", background: v.accentSoft, color: v.accent, fontFamily: "'JetBrains Mono', monospace", fontWeight: "700", lineHeight: "1" }}>1</p>
            <p style={{ margin: "16px 0 0", fontWeight: "700", fontSize: "20px", lineHeight: "1.3" }}>Pick a grid</p>
            <p style={{ margin: "8px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}>Business, keyword, and a 3×3 to 9×9 grid with points 0.5 to 5 miles apart—or put points directly in the highest-income neighborhoods.</p>
          </li>
          <li style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "24px", background: "#111823" }}>
            <p style={{ margin: "0", display: "inline-flex", width: "38px", height: "38px", alignItems: "center", justifyContent: "center", borderRadius: "10px", background: v.accentSoft, color: v.accent, fontFamily: "'JetBrains Mono', monospace", fontWeight: "700", lineHeight: "1" }}>2</p>
            <p style={{ margin: "16px 0 0", fontWeight: "700", fontSize: "20px", lineHeight: "1.3" }}>A phone goes to every point</p>
            <p style={{ margin: "8px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}>Its GPS is set to that spot, searching on home internet in that point’s city or on a mobile carrier. Many points run in parallel.</p>
          </li>
          <li style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "24px", background: "#111823" }}>
            <p style={{ margin: "0", display: "inline-flex", width: "38px", height: "38px", alignItems: "center", justifyContent: "center", borderRadius: "10px", background: v.accentSoft, color: v.accent, fontFamily: "'JetBrains Mono', monospace", fontWeight: "700", lineHeight: "1" }}>3</p>
            <p style={{ margin: "16px 0 0", fontWeight: "700", fontSize: "20px", lineHeight: "1.3" }}>Every search is recorded</p>
            <p style={{ margin: "8px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}>The MP4 video, ranked results with ads set aside, the full Local Finder list, AI Overview text + citations, and a SHA-256 fingerprint.</p>
          </li>
        </ol>
        <p style={{ margin: "60px 0 0", fontWeight: "700", fontSize: "24px", lineHeight: "1.3" }}>One real point, three frames from its recording</p>
        <p style={{ margin: "6px 0 0", fontSize: "15px", lineHeight: "1.5", color: "#94A3B8" }}>Mt. Juliet, TN · exterior painting contractor</p>
        <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "28px" }}>
          <figure style={{ margin: "0", display: "flex", flexDirection: "column", gap: "16px" }}><img src="/home/mt-juliet-location.jpg" width={540} height={560} loading="lazy" decoding="async" alt="Google’s own location line on the phone reading Mt. Juliet, TN" style={{ display: "block", width: "100%", height: "360px", objectFit: "cover", objectPosition: "top", borderRadius: "16px", border: "1px solid rgba(255, 255, 255, 0.1)" }} /><figcaption>
  <p style={{ margin: "0", fontWeight: "700", fontSize: "17px", lineHeight: "1.35", color: "#F1F5F9" }}>Google placed the phone</p>
  <p style={{ margin: "6px 0 0", fontSize: "14.5px", lineHeight: "1.6", color: "#94A3B8" }}>Google’s own location line reads “Mt. Juliet, TN”, set by the phone’s GPS.</p>
</figcaption></figure>
          <figure style={{ margin: "0", display: "flex", flexDirection: "column", gap: "16px" }}><img src="/home/mt-juliet-map-pack.jpg" width={540} height={620} loading="lazy" decoding="async" alt="The map pack as Google showed it on the phone: a sponsored card, then #1 Steve And Son Painting and #2 McIntyre Painting" style={{ display: "block", width: "100%", height: "360px", objectFit: "cover", objectPosition: "top", borderRadius: "16px", border: "1px solid rgba(255, 255, 255, 0.1)" }} /><figcaption>
  <p style={{ margin: "0", fontWeight: "700", fontSize: "17px", lineHeight: "1.35", color: "#F1F5F9" }}>The ranks, as Google showed them</p>
  <p style={{ margin: "6px 0 0", fontSize: "14.5px", lineHeight: "1.6", color: "#94A3B8" }}>Sponsored cards are set apart and never counted as a rank: #1 Steve And Son Painting, #2 McIntyre Painting.</p>
</figcaption></figure>
          <figure style={{ margin: "0", display: "flex", flexDirection: "column", gap: "16px" }}><img src="/home/mt-juliet-local-finder.jpg" width={540} height={620} loading="lazy" decoding="async" alt="The Local Finder list that opens behind the map pack" style={{ display: "block", width: "100%", height: "360px", objectFit: "cover", objectPosition: "top", borderRadius: "16px", border: "1px solid rgba(255, 255, 255, 0.1)" }} /><figcaption>
  <p style={{ margin: "0", fontWeight: "700", fontSize: "17px", lineHeight: "1.35", color: "#F1F5F9" }}>The full list behind the map pack</p>
  <p style={{ margin: "6px 0 0", fontSize: "14.5px", lineHeight: "1.6", color: "#94A3B8" }}>Tapping “More businesses” opens the Local Finder, so every ranked competitor is captured in order.</p>
</figcaption></figure>
        </div>
        <div style={{ marginTop: "60px", overflowX: "auto", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "18px", background: "#111823" }}>
          <table style={{ width: "100%", minWidth: "720px", borderCollapse: "collapse", fontSize: "15px", lineHeight: "1.55" }}>
            <caption style={{ textAlign: "left", padding: "22px 24px 8px", fontWeight: "700", fontSize: "20px", lineHeight: "1.3", color: "#F1F5F9" }}>A colored dot is a claim. A recording is proof.</caption>
            <thead>
              <tr><th scope="col" style={{ textAlign: "left", padding: "14px 24px", width: "20%", color: "#94A3B8", fontWeight: "600", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>Feature</th><th scope="col" style={{ textAlign: "left", padding: "14px 24px", width: "34%", color: "#94A3B8", fontWeight: "600", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>Typical rank tracker</th><th scope="col" style={{ textAlign: "left", padding: "14px 24px", color: v.accent, fontWeight: "700", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>Stakeout Search</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "15px 24px", fontWeight: "600", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Where it searches</th><td style={{ verticalAlign: "top", padding: "15px 24px", color: "#94A3B8", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>A server or an API request</td><td style={{ verticalAlign: "top", padding: "15px 24px", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>A real Android phone, in Chrome or the Google Maps app</td></tr>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "15px 24px", fontWeight: "600", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Location</th><td style={{ verticalAlign: "top", padding: "15px 24px", color: "#94A3B8", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Coordinates passed into a query</td><td style={{ verticalAlign: "top", padding: "15px 24px", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>The phone’s GPS set at each point, with Google’s own location line recorded</td></tr>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "15px 24px", fontWeight: "600", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Network</th><td style={{ verticalAlign: "top", padding: "15px 24px", color: "#94A3B8", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Data-center or random IPs</td><td style={{ verticalAlign: "top", padding: "15px 24px", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Home internet in the point’s city, or a mobile carrier, named on every receipt</td></tr>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "15px 24px", fontWeight: "600", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>AI Overview</th><td style={{ verticalAlign: "top", padding: "15px 24px", color: "#94A3B8", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>A yes or no flag, if tracked at all</td><td style={{ verticalAlign: "top", padding: "15px 24px", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>The full text, your place in it, and the sites it cited</td></tr>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "15px 24px", fontWeight: "600", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Ads</th><td style={{ verticalAlign: "top", padding: "15px 24px", color: "#94A3B8", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Often mixed into the ranks</td><td style={{ verticalAlign: "top", padding: "15px 24px", color: "#F1F5F9", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>Listed separately and never counted as a rank</td></tr>
              <tr><th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "15px 24px", fontWeight: "600" }}>Proof</th><td style={{ verticalAlign: "top", padding: "15px 24px", color: "#94A3B8" }}>A colored dot on a map</td><td style={{ verticalAlign: "top", padding: "15px 24px", color: "#F1F5F9" }}>A screen recording and SHA-256 fingerprint for every point</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* section#report */
function SReport({ v }: { v: V }) {
  return (
    <section id="report" style={{ background: "#0E141D", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "clamp(64px, 8vw, 104px) clamp(16px, 2vw, 24px)" }}>
        <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12.5px", lineHeight: "1.5", letterSpacing: "0.12em", color: v.accent }}>THE REPORT YOUR CLIENT OPENS</p>
        <h2 style={{ margin: "16px 0 0", fontWeight: "800", fontSize: "clamp(32px, 3.6vw, 52px)", lineHeight: "1.12", letterSpacing: "-0.025em", maxWidth: "960px" }}>Open Any Point. Watch What the Phone Saw.</h2>
        <p style={{ margin: "20px 0 0", fontSize: "18px", lineHeight: "1.65", color: "#CBD5E1", maxWidth: "840px" }}>Send one link, no login. Your client clicks any point and watches the recording, the results, the AI Overview, and who is ahead, street by street. Every point saves the whole top 10—holding up to 250 competitor positions in one 5×5 scan.</p>
        <div role="group" aria-label="Report views" style={{ marginTop: "40px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <button type="button" aria-pressed={v.r0.pressed} onClick={v.r0.pick} style={{ minHeight: "44px", padding: "10px 16px", borderRadius: "999px", borderWidth: "1px", borderStyle: "solid", fontFamily: "Inter, sans-serif", fontSize: "14px", lineHeight: "1.3", fontWeight: "600", cursor: "pointer", ...v.r0.style }}>Evidence for every point</button>
          <button type="button" aria-pressed={v.r1.pressed} onClick={v.r1.pick} style={{ minHeight: "44px", padding: "10px 16px", borderRadius: "999px", borderWidth: "1px", borderStyle: "solid", fontFamily: "Inter, sans-serif", fontSize: "14px", lineHeight: "1.3", fontWeight: "600", cursor: "pointer", ...v.r1.style }}>Your place in the AI Overview, mapped</button>
          <button type="button" aria-pressed={v.r2.pressed} onClick={v.r2.pick} style={{ minHeight: "44px", padding: "10px 16px", borderRadius: "999px", borderWidth: "1px", borderStyle: "solid", fontFamily: "Inter, sans-serif", fontSize: "14px", lineHeight: "1.3", fontWeight: "600", cursor: "pointer", ...v.r2.style }}>What the AI trusts</button>
          <button type="button" aria-pressed={v.r3.pressed} onClick={v.r3.pick} style={{ minHeight: "44px", padding: "10px 16px", borderRadius: "999px", borderWidth: "1px", borderStyle: "solid", fontFamily: "Inter, sans-serif", fontSize: "14px", lineHeight: "1.3", fontWeight: "600", cursor: "pointer", ...v.r3.style }}>Who’s winning your best neighborhoods</button>
        </div>
        {v.r0.on && (
          <>
            <figure style={{ margin: "24px 0 0", display: "flex", flexDirection: "column", gap: "16px" }}>
              <img src="/home/report-point-inspector.jpg" width={1498} height={722} loading="lazy" decoding="async" alt="The point inspector of a real report: the phone recording, the 3-pack, the Local Finder and the AI Overview for one point, with paid advertisers kept apart and the neighborhood’s Census median income" style={{ display: "block", width: "100%", height: "auto", borderRadius: "18px", border: "1px solid rgba(255, 255, 255, 0.12)", boxShadow: "0 40px 90px -40px rgba(0, 0, 0, 0.9)" }} />
              <figcaption style={{ fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}><strong style={{ color: "#F1F5F9" }}>Evidence for every point.</strong>{' '}Point R3·C5: the recording, #1 in the 3-pack, #1 in the Local Finder and #1 in the AI Overview, with paid advertisers kept apart and the neighborhood’s Census median household income ($109,563).</figcaption>
            </figure>
          </>
        )}
        {v.r1.on && (
          <>
            <figure style={{ margin: "24px 0 0", display: "flex", flexDirection: "column", gap: "16px" }}>
              <img src="/home/report-ai-overview-map.jpg" width={969} height={518} loading="lazy" decoding="async" alt="A real map of the business’s place in Google’s AI Overview at each point in Lakeland" style={{ display: "block", width: "100%", height: "auto", borderRadius: "18px", border: "1px solid rgba(255, 255, 255, 0.12)", boxShadow: "0 40px 90px -40px rgba(0, 0, 0, 0.9)" }} />
              <figcaption style={{ fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}><strong style={{ color: "#F1F5F9" }}>Your place in the AI Overview, mapped.</strong>{' '}Purple pins mark your place in the AI Overview at every point, in 2D or 3D, with Combined, Pack rank, AI place and Ads above views.</figcaption>
            </figure>
          </>
        )}
        {v.r2.on && (
          <>
            <figure style={{ margin: "24px 0 0", display: "flex", flexDirection: "column", gap: "16px" }}>
              <img src="/home/report-ai-overview-coverage.jpg" width={1481} height={715} loading="lazy" decoding="async" alt="AI Overview coverage for a real scan: the websites the AI cited and the businesses it named" style={{ display: "block", width: "100%", height: "auto", borderRadius: "18px", border: "1px solid rgba(255, 255, 255, 0.12)", boxShadow: "0 40px 90px -40px rgba(0, 0, 0, 0.9)" }} />
              <figcaption style={{ fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}><strong style={{ color: "#F1F5F9" }}>What the AI trusts.</strong>{' '}An AI Overview at 25 of 25 points, Stuart’s Plumbing named at 21, every domain it cited, and every business it named.</figcaption>
            </figure>
          </>
        )}
        {v.r3.on && (
          <>
            <figure style={{ margin: "24px 0 0", display: "flex", flexDirection: "column", gap: "16px" }}>
              <img src="/home/report-leaderboard.jpg" width={1488} height={728} loading="lazy" decoding="async" alt="Competitor leaderboard of a real scan: top-3 share, buying-power share, average rank, found share, rank spread and AI mentions for each business" style={{ display: "block", width: "100%", height: "auto", borderRadius: "18px", border: "1px solid rgba(255, 255, 255, 0.12)", boxShadow: "0 40px 90px -40px rgba(0, 0, 0, 0.9)" }} />
              <figcaption style={{ fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}><strong style={{ color: "#F1F5F9" }}>Who’s winning your best neighborhoods.</strong>{' '}Top-3 share, buying-power share, average rank, how often each was found, rank spread, and how often the AI named them.</figcaption>
            </figure>
          </>
        )}
      </div>
    </section>
  );
}

/* section#buying-power */
function SBuyingPower({ v }: { v: V }) {
  return (
    <section id="buying-power" style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "clamp(64px, 8vw, 104px) clamp(16px, 2vw, 24px)", display: "flex", flexWrap: "wrap", gap: "48px", alignItems: "center" }}>
        <div style={{ flex: "1 1 440px", minWidth: "0" }}>
          <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12.5px", lineHeight: "1.5", letterSpacing: "0.12em", color: v.accent }}>U.S. CENSUS BUYING POWER</p>
          <h2 style={{ margin: "16px 0 0", fontWeight: "800", fontSize: "clamp(32px, 3.6vw, 52px)", lineHeight: "1.12", letterSpacing: "-0.025em" }}>Rank Where the Money Is, Not Just Where the Map Is.</h2>
          <p style={{ margin: "20px 0 0", fontSize: "17px", lineHeight: "1.7", color: "#CBD5E1" }}>A #1 rank in a neighborhood of renters isn’t worth a #1 among $800K homeowners. Every Stakeout report weighs rank by owner-occupied homes and median household income (U.S. Census ACS) at each point—proving when being visible to 31% of searches actually captures 46% of the market’s buying power. Or skip the square grid completely and drop pins strictly in the highest-income neighborhoods.</p>
          <a className="so-btn" href={HREF.report} style={{ marginTop: "18px", display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "44px", color: v.accent, fontWeight: "700", fontSize: "16px", lineHeight: "1.4" }}>Open a live report, no account needed<Arrow size={16} /></a>
        </div>
        <figure style={{ flex: "1.2 1 520px", minWidth: "0", margin: "0" }}>
          <img src="/media/real-report-3d.jpg" width={842} height={422} loading="lazy" decoding="async" alt="The 3D buying-power view of a real report near Mt. Juliet, TN: a column over each grid point, taller where more of the grid's buying power sits, colored by the business's rank there" style={{ display: "block", width: "100%", height: "auto", borderRadius: "18px", border: "1px solid rgba(255, 255, 255, 0.12)", boxShadow: "0 40px 90px -40px rgba(0, 0, 0, 0.9)" }} />
          <figcaption style={{ marginTop: "12px", fontSize: "13.5px", lineHeight: "1.55", color: "#94A3B8" }}>3D buying-power view of a real report, Mt. Juliet, TN. Column height: each point’s share of the grid’s buying power. Color: the rank there.</figcaption>
        </figure>
      </div>
    </section>
  );
}

/** What Command does after a scan, in four cards (two by two on a wide screen). */
const COMMAND_CARDS: { tag: string; title: string; body: string; soon?: string }[] = [
  {
    tag: 'Rival Gaps & Safe Listing Edits',
    title: 'See what the #1 listing has that your client is missing.',
    body: 'Every scan already captures the businesses beating your client street by street. Command diffs their Google Business Profiles against yours—exposing missing categories, services, attributes, and the exact directories Google’s AI Overviews cited—then lets you update hours, services, photos, and descriptions right from Stakeout. (Connect your own AI agents too, with hard locks that never touch a client’s business name, phone, address, or website.)',
  },
  {
    tag: 'Daily GBP Watchdog & Review Inbox',
    title: 'Catch silent Google edits before the phone stops ringing.',
    body: 'Google accepts competitor “Suggested Edits,” drops services, and rewrites business hours without asking. Command checks every client listing every day and flags unauthorized changes the morning they happen—while pulling new Google reviews into one central inbox so nothing sits unanswered.',
  },
  {
    // Facebook and LinkedIn posting is open to admins only for now; say so until it opens.
    tag: 'Google, Facebook & LinkedIn in One Calendar',
    soon: 'Facebook & LinkedIn: coming soon',
    title: 'Publish every client’s posts from one calendar.',
    body: 'Publish updates, job photos, and offers to Google Business Profile from a single composer and calendar, so client profiles stay active across the exact local surfaces Google’s Map Pack and AI Overviews crawl. Facebook and LinkedIn are next—and with them, you drop another $29–$49/month posting tool from your agency bill.',
  },
  {
    tag: 'Live Proof Links & Monthly Numbers',
    title: 'Walk into monthly reviews with calls, leads, and video proof.',
    body: 'Send a no-login share link with your 3D Buying-Power map and MP4 receipts—under your agency’s logo and domain with white-label. Each Command client’s GBP calls and direction requests, Search Console clicks, GA4 leads (including visits from AI assistants), and AI Overview share sit in the same account as its scans.',
  },
];

/* section#command */
function SCommand() {
  return (
    <section id="command" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: 'clamp(64px, 8vw, 104px) clamp(16px, 2vw, 24px)' }}>
        <Eyebrow>AFTER THE SCAN · STAKEOUT COMMAND</Eyebrow>
        <h2 style={{ margin: '16px 0 0', fontWeight: 800, fontSize: 'clamp(32px, 3.6vw, 52px)', lineHeight: 1.12, letterSpacing: '-0.025em', maxWidth: 960 }}>A Scan Proves the Gap. Command Closes It Every Week.</h2>
        <p style={{ margin: '20px 0 0', fontSize: 18, lineHeight: 1.65, color: '#CBD5E1', maxWidth: 820 }}>
          Most rank trackers hand you a map of red pins and leave you to log into four other tools to do the work. Stakeout Command puts the proof, the fixes, the publishing, and the client report on one screen—for one price per client, without spending an extra scan point.
        </p>
        <div style={{ marginTop: 44, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 20 }}>
          {COMMAND_CARDS.map((c, i) => (
            <article key={c.tag} style={{ border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 20, background: '#111823', padding: 'clamp(22px, 2.6vw, 30px)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 12px' }}>
                <p style={{ margin: 0, fontFamily: MONO, fontSize: 12, lineHeight: 1.5, letterSpacing: '0.1em', color: ACCENT }}>{String(i + 1).padStart(2, '0')} · {c.tag.toUpperCase()}</p>
                {c.soon && <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.4, fontWeight: 600, color: '#FBBF24', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.5)', borderRadius: 999, padding: '4px 10px' }}>{c.soon}</p>}
              </div>
              <h3 style={{ margin: '12px 0 0', fontWeight: 800, fontSize: 'clamp(20px, 1.9vw, 24px)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>{c.title}</h3>
              <p style={{ margin: '12px 0 0', fontSize: 15.5, lineHeight: 1.7, color: '#CBD5E1' }}>{c.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* section#google-listings */
function SGoogleListings({ v }: { v: V }) {
  return (
    <section id="google-listings" style={{ background: "#0E141D", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "clamp(64px, 8vw, 104px) clamp(16px, 2vw, 24px)" }}>
        <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12.5px", lineHeight: "1.5", letterSpacing: "0.12em", color: v.accent }}>BEYOND THE GRID · FULL EXECUTION &amp; DEFENSE SUITE</p>
        <h2 style={{ margin: "16px 0 0", fontWeight: "800", fontSize: "clamp(32px, 3.6vw, 52px)", lineHeight: "1.12", letterSpacing: "-0.025em", maxWidth: "1000px" }}>Spot the Gap on the Grid. Fix the Listing in One Click. Then Guard It.</h2>
        <p style={{ margin: "20px 0 0", fontSize: "18px", lineHeight: "1.65", color: "#CBD5E1", maxWidth: "860px" }}>Why pay for four disconnected SEO, social, and monitoring tools? Connect Google Business Profile, Search Console and Analytics right beside your scans (Facebook and LinkedIn are coming soon)—turning rank insights into live profile updates, scheduled posts, and a daily check for hijacked listings.</p>
        <div style={{ marginTop: "44px", display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "flex-start" }}>
          <div role="group" aria-label="Execution and defense suite" style={{ flex: "1 1 300px", minWidth: "0", display: "grid", gap: "10px" }}>
            <button type="button" aria-pressed={v.f0.pressed} onClick={v.f0.pick} style={{ width: "100%", minHeight: "60px", display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderRadius: "14px", borderWidth: "1px", borderStyle: "solid", fontFamily: "Inter, sans-serif", fontSize: "15.5px", lineHeight: "1.35", fontWeight: "600", textAlign: "left", cursor: "pointer", ...v.f0.style }}><span style={{ flex: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: v.accent }}>01</span><span>1-Click Rival Gap Closer</span></button>
            <button type="button" aria-pressed={v.f1.pressed} onClick={v.f1.pick} style={{ width: "100%", minHeight: "60px", display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderRadius: "14px", borderWidth: "1px", borderStyle: "solid", fontFamily: "Inter, sans-serif", fontSize: "15.5px", lineHeight: "1.35", fontWeight: "600", textAlign: "left", cursor: "pointer", ...v.f1.style }}><span style={{ flex: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: v.accent }}>02</span><span>Suspension-Safe GBP API Editor</span></button>
            <button type="button" aria-pressed={v.f2.pressed} onClick={v.f2.pick} style={{ width: "100%", minHeight: "60px", display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderRadius: "14px", borderWidth: "1px", borderStyle: "solid", fontFamily: "Inter, sans-serif", fontSize: "15.5px", lineHeight: "1.35", fontWeight: "600", textAlign: "left", cursor: "pointer", ...v.f2.style }}><span style={{ flex: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: v.accent }}>03</span><span>1-Click Google Post Publisher</span></button>
            <button type="button" aria-pressed={v.f3.pressed} onClick={v.f3.pick} style={{ width: "100%", minHeight: "60px", display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderRadius: "14px", borderWidth: "1px", borderStyle: "solid", fontFamily: "Inter, sans-serif", fontSize: "15.5px", lineHeight: "1.35", fontWeight: "600", textAlign: "left", cursor: "pointer", ...v.f3.style }}><span style={{ flex: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: v.accent }}>04</span><span>Daily Edit Watchdog + Instant Review Alerts</span></button>
            <button type="button" aria-pressed={v.f4.pressed} onClick={v.f4.pick} style={{ width: "100%", minHeight: "60px", display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderRadius: "14px", borderWidth: "1px", borderStyle: "solid", fontFamily: "Inter, sans-serif", fontSize: "15.5px", lineHeight: "1.35", fontWeight: "600", textAlign: "left", cursor: "pointer", ...v.f4.style }}><span style={{ flex: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: v.accent }}>05</span><span>GBP Insights + Search Console + GA4 + AI Agents</span></button>
          </div>
          <div style={{ flex: "999 1 600px", minWidth: "0" }}>
            {v.f0.on && (
              <>
                <div style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "20px", background: "#111823", padding: "clamp(20px, 3vw, 32px)" }}>
                  <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.1em", color: v.accent }}>01 · RIVAL GAP CLOSER</p>
                  <h3 style={{ margin: "10px 0 0", fontWeight: "800", fontSize: "clamp(24px, 2.4vw, 32px)", lineHeight: "1.2", letterSpacing: "-0.015em" }}>Steal What Top-3 Rivals Have on Their Listing—In One Click.</h3>
                  <p style={{ margin: "14px 0 0", fontSize: "16px", lineHeight: "1.7", color: "#CBD5E1" }}>Stakeout reads the top-ranking competitors from your scan and flags exactly what your listing is missing: 46 services missing a description, 22 unset attributes, missing booking links, or upcoming Holiday hours missing (Thanksgiving in 6d). Simply tick the missing rival services (Car Accident Lawyer · 1 of 3 top rivals) or attributes that apply and push them live via the GBP API.</p>
                  <div style={{ marginTop: "18px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <span style={{ fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "#FBBF24", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.5)", borderRadius: "999px", padding: "5px 12px" }}>Holiday hours missing (Thanksgiving in 6d)</span>
                    <span style={{ fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "#FBBF24", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.5)", borderRadius: "999px", padding: "5px 12px" }}>46 services missing a description</span>
                    <span style={{ fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "#FBBF24", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.5)", borderRadius: "999px", padding: "5px 12px" }}>22 unset attributes</span>
                  </div>
                </div>
              </>
            )}
            {v.f1.on && (
              <>
                <div style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "20px", background: "#111823", padding: "clamp(20px, 3vw, 32px)" }}>
                  <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.1em", color: v.accent }}>02 · SUSPENSION-SAFE EDITOR</p>
                  <h3 style={{ margin: "10px 0 0", fontWeight: "800", fontSize: "clamp(24px, 2.4vw, 32px)", lineHeight: "1.2", letterSpacing: "-0.015em" }}>Update Listings Fast—Without Triggering Video Verification.</h3>
                  <p style={{ margin: "14px 0 0", fontSize: "16px", lineHeight: "1.7", color: "#CBD5E1" }}>Built-in suspension guardrails separate green Safe Everyday Edits (descriptions, 1-click UTM tracking tags, categories, hours, holiday chips, social links, attributes, and photos—what Google draws on for its AI answers) from Identity: verification risk fields (name, primary category, primary phone, address). High-risk identity edits stay locked behind an explicit safety switch, enforce a 1-field-per-7-days cooldown, and warn operators on high-scrutiny verticals like Personal Injury Attorney before saving.</p>
                  <div style={{ marginTop: "18px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "#34D399", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.45)", borderRadius: "999px", padding: "5px 12px" }}><span aria-hidden="true" style={{ flex: "none", display: "inline-block", width: "7px", height: "7px", borderRadius: "999px", background: "#10B981" }}></span>Safe everyday edits</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "#FBBF24", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.5)", borderRadius: "999px", padding: "5px 12px" }}><span aria-hidden="true" style={{ flex: "none", display: "inline-block", width: "7px", height: "7px", borderRadius: "999px", background: "#F59E0B" }}></span>Identity: verification risk · locked</span>
                  </div>
                </div>
              </>
            )}
            {v.f2.on && (
              <>
                <div style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "20px", background: "#111823", padding: "clamp(20px, 3vw, 32px)" }}>
                  <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.1em", color: v.accent }}>03 · ONE-CLICK PUBLISHER</p>
                  <h3 style={{ margin: "10px 0 0", fontWeight: "800", fontSize: "clamp(24px, 2.4vw, 32px)", lineHeight: "1.2", letterSpacing: "-0.015em" }}>Write Once. Publish to Google in One Click.</h3>
                  <p style={{ margin: "14px 0 0", fontSize: "16px", lineHeight: "1.7", color: "#CBD5E1" }}>Compose an update once, preview it, and publish or schedule it to your Google Business Profile in a single click. Facebook and LinkedIn publishing is coming soon. Manage 86+ client locations on one master monthly calendar—complete with a “Nothing coming up” radar that flags any client with an empty week in the next four weeks alongside a 1-click Plan its posts button.</p>
                  <div style={{ marginTop: "18px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <span style={{ fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "#34D399", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.45)", borderRadius: "999px", padding: "5px 12px" }}>Google</span>
                    <span style={{ fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "#34D399", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.45)", borderRadius: "999px", padding: "5px 12px" }}>Facebook · soon</span>
                    <span style={{ fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "#34D399", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.45)", borderRadius: "999px", padding: "5px 12px" }}>LinkedIn · soon</span>
                    <span style={{ fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "#FBBF24", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.5)", borderRadius: "999px", padding: "5px 12px" }}>Nothing coming up: 1-click Plan its posts</span>
                  </div>
                </div>
              </>
            )}
            {v.f3.on && (
              <>
                <div style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "20px", background: "#111823", padding: "clamp(20px, 3vw, 32px)" }}>
                  <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.1em", color: v.accent }}>04 · WATCHDOG &amp; REVIEW ALERTS</p>
                  <h3 style={{ margin: "10px 0 0", fontWeight: "800", fontSize: "clamp(24px, 2.4vw, 32px)", lineHeight: "1.2", letterSpacing: "-0.015em" }}>If Someone Edits Your Listing, You Know by Morning.</h3>
                  <p style={{ margin: "14px 0 0", fontSize: "16px", lineHeight: "1.7", color: "#CBD5E1" }}>Never lose rankings silently to a malicious “Suggest an edit” or an unannounced Google rewrite. Every morning, the Watchdog reads each connected listing and compares its name, categories, phone numbers, website, hours, holiday hours, description, address and open status with how you left them—anything you didn’t make shows up under Changes we did not make. Instant Review Alerts email your team within the hour whenever a review of 2 stars or fewer lands—with direct 1-click in-app replies.</p>
                  <div style={{ marginTop: "18px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <span style={{ fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "#FBBF24", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.5)", borderRadius: "999px", padding: "5px 12px" }}>Changes we did not make</span>
                    <span style={{ fontSize: "13px", lineHeight: "1.4", fontWeight: "600", color: "#F87171", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.45)", borderRadius: "999px", padding: "5px 12px" }}>2 stars or fewer: emailed within the hour</span>
                  </div>
                </div>
              </>
            )}
            {v.f4.on && (
              <>
                <div style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "20px", background: "#111823", padding: "clamp(20px, 3vw, 32px)" }}>
                  <p style={{ margin: "0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0.1em", color: v.accent }}>05 · INSIGHTS, GSC, GA4 &amp; AI AGENTS</p>
                  <h3 style={{ margin: "10px 0 0", fontWeight: "800", fontSize: "clamp(24px, 2.4vw, 32px)", lineHeight: "1.2", letterSpacing: "-0.015em" }}>Rank Is the Cause. Calls Are the Proof.</h3>
                  <p style={{ margin: "14px 0 0", fontSize: "16px", lineHeight: "1.7", color: "#CBD5E1" }}>Track GBP calls, direction requests, website clicks, Search Console queries/indexation, and GA4 visits sent by AI assistants on one screen—plus programmatic access for your own internal AI agents included.</p>
                </div>
              </>
            )}
          </div>
        </div>
        <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: "16px" }}>
          <div style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "18px", padding: "24px", background: "#111823" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px 16px" }}>
              <p style={{ margin: "0", fontWeight: "700", fontSize: "19px", lineHeight: "1.3" }}>Your Website</p>
              <p style={{ margin: "0", fontSize: "13px", lineHeight: "1.5", fontWeight: "700", color: "#34D399", background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.35)", padding: "3px 10px", borderRadius: "999px" }}>Free</p>
            </div>
            <p style={{ margin: "12px 0 0", fontSize: "15px", lineHeight: "1.65", color: "#CBD5E1" }}>Connect Search Console &amp; Google Analytics (clicks, queries, page indexation, real leads/calls, and AI assistant referral traffic) free with any account.</p>
          </div>
          <div style={{ border: `1px solid ${v.accentLine}`, borderRadius: "18px", padding: "24px", background: "#111823" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px 16px" }}>
              <p style={{ margin: "0", fontWeight: "700", fontSize: "19px", lineHeight: "1.3" }}>Command</p>
              <p style={{ margin: "0", fontSize: "13px", lineHeight: "1.5", fontWeight: "700", color: v.accent, background: v.accentSoft, border: `1px solid ${v.accentLine}`, padding: "3px 10px", borderRadius: "999px" }}>from {from('COMMAND')} / client / mo</p>
            </div>
            <p style={{ margin: "12px 0 0", fontSize: "15px", lineHeight: "1.65", color: "#CBD5E1" }}>Weekly real-phone tracking plus Full GBP Insights, Rival Gap Closer, Suspension-Safe GBP API Editor, 1-Click Google Post Publisher, Multi-Listing Calendar, Daily Edit Watchdog, &lt;1-Hour Review Alerts and AI agents ({tier('COMMAND', 1)} a client from 10 clients, {tier('COMMAND', 2)} from 25, {tier('COMMAND', 3)} from 100). Dominator, from {from('DOMINATOR')}, adds more keywords and bigger grids.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* section#start */
function SStart({ v }: { v: V }) {
  return (
    <section id="start">
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "clamp(64px, 8vw, 104px) clamp(16px, 2vw, 24px)" }}>
        <div style={{ border: `1px solid ${v.accentLine}`, borderRadius: "26px", background: "#111823", padding: "clamp(32px, 5vw, 64px)", textAlign: "center" }}>
          <h2 style={{ margin: "0", fontWeight: "800", fontSize: "clamp(34px, 4.2vw, 60px)", lineHeight: "1.1", letterSpacing: "-0.025em" }}>Stop Defending the Dashboard.{' '}<span style={{ color: v.accent }}>Show Them the Search.</span></h2>
          <p style={{ margin: "20px auto 0", fontSize: "18px", lineHeight: "1.65", color: "#CBD5E1", maxWidth: "640px" }}>Open a real report with no account—then run your first 5×5 grid for $5.</p>
          <div style={{ marginTop: "30px", display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "center" }}>
            <a className="so-btn" href={HREF.firstAudit} style={{ display: "inline-flex", alignItems: "center", gap: "10px", minHeight: "50px", boxSizing: "border-box", background: v.accent, color: "#0B1017", fontWeight: "700", fontSize: "16px", lineHeight: "1.3", padding: "14px 24px", borderRadius: "12px" }}>Run your first scan for $5<Arrow size={18} /></a>
            <a className="so-btn" href={HREF.report} style={{ display: "inline-flex", alignItems: "center", minHeight: "50px", boxSizing: "border-box", background: "rgba(255, 255, 255, 0.06)", border: "1px solid rgba(255, 255, 255, 0.14)", color: "#F1F5F9", fontWeight: "600", fontSize: "16px", lineHeight: "1.3", padding: "14px 22px", borderRadius: "12px" }}>Explore the live demo</a>
          </div>
          <p style={{ margin: "24px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#94A3B8" }}>Want it done for you?{' '}<a href={HREF.agency} style={{ color: v.accent, fontWeight: "700" }}>See Agency Rescue Sprints →</a></p>
        </div>
      </div>
    </section>
  );
}

function Body({ v }: { v: V }) {
  return (
    <>
      <OfferBanner live={v.live} href="#pricing" />
      <SiteNav page="home" onWatchdog={v.goWatch} />
      <STop v={v} />
      <SHonestMath v={v} />
      <SRealVsReported v={v} />
      <SAiOverviews v={v} />
      <SHowItWorks v={v} />
      <SReport v={v} />
      <SBuyingPower v={v} />
      <SCommand />
      <SGoogleListings v={v} />
      <HomePricing />
      <Faq id="faq" items={HOME_FAQ} wide />
      <SStart v={v} />
      <SiteFoot note={NOTE} />
    </>
  );
}



export default function Landing({ live }: { live: boolean }) {
  const v = useHome(live);
  return (
    <div className="so">
      <Body v={v} />
      <RecordingDialog open={v.watching} onClose={v.stopWatching} />
    </div>
  );
}
