'use client';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ACCOUNT_PLANS, ACCOUNT_PLAN_ORDER, ANNUAL_MONTHS_PAID, FOUNDING, FOUNDING_PLANS, LINES, carryCap, monthlyPoints, rolloverMonths, yearCents, type AccountPlan } from '@stakeout/core/gbpPlans';
import { shapeSkips } from '@stakeout/core/gridSizes';
import { BOOST, BOOST_BELOW, BRIEF_PACKS, CLOSER, usd } from '@/lib/pricing';
import { ACCENT, Check, Faq, HREF, MONO, OfferBanner, SiteFoot, SiteNav, TONE, type FaqItem } from './SiteKit';
import { Eyebrow } from './PriceBlocks';
import './site.css';

/**
 * Pricing with the account plans (Scout, Agency, Scale, Agency Max per account, monthly or yearly;
 * the listing add-on per Google listing; brief credits). The $19 Live 5G Proof Pack is a quiet link
 * under the plans and the offer shown to a visitor about to leave. Every price and count comes from
 * the price list the checkout uses, so the page and the bill agree. Only features that work today
 * are listed.
 */
const LINE = '1px solid rgba(255, 255, 255, 0.1)';
const SECTION = { borderBottom: '1px solid rgba(255, 255, 255, 0.06)' };
const WRAP = { maxWidth: 1240, margin: '0 auto', padding: 'clamp(56px, 7vw, 96px) clamp(16px, 2vw, 24px)' };
const H2 = { margin: '14px 0 0', fontWeight: 800, fontSize: 'clamp(30px, 3.2vw, 46px)', lineHeight: 1.12, letterSpacing: '-0.025em' } as const;
const LEAD = { margin: '16px 0 0', fontSize: 17, lineHeight: 1.65, color: '#CBD5E1', maxWidth: 820 };
const btnPrimary = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, boxSizing: 'border-box', background: ACCENT, color: '#0B1017', fontWeight: 700, fontSize: 15, lineHeight: 1.3, padding: 12, borderRadius: 12 } as const;
const btnQuiet = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, boxSizing: 'border-box', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#F1F5F9', fontWeight: 700, fontSize: 15, lineHeight: 1.3, padding: 12, borderRadius: 12 } as const;
const n = (v: number) => v.toLocaleString('en-US');
const FEATURED: AccountPlan = 'P_AGENCY';
const ADDON = LINES.LISTING;
/** Grid points in a 5×5, square and circle (the circle keeps the centre and drops the corners). */
const SQUARE_5 = 25;
const CIRCLE_5 = 25 - shapeSkips('round', 5).length;
/** Cents a phone session, on the plan's monthly or yearly price. */
const perSession = (p: AccountPlan, yearly: boolean) => (yearly ? yearCents(p) / (ACCOUNT_PLANS[p].points * 12) : ACCOUNT_PLANS[p].tiers[0].cents / ACCOUNT_PLANS[p].points);
const cents = (v: number) => v.toFixed(2) + '¢';
/** How much less a session costs than on Scout billed the same way (Scout yearly: than Scout monthly). */
const saves = (p: AccountPlan, yearly: boolean) => Math.round((1 - perSession(p, yearly) / perSession('P_SCOUT', p === 'P_SCOUT' ? false : yearly)) * 100);
/** What a plan does with unused sessions, in a few words. */
function rollover(p: AccountPlan, yearly: boolean) {
  const m = rolloverMonths(p, yearly ? 'year' : 'month');
  if (m === 0) return 'reset each month';
  return `roll over ${m === 1 ? 'one month' : m === 2 ? 'two months' : m + ' months'} (bank up to ${n(m * ACCOUNT_PLANS[p].points)})`;
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** Who can sign in to a plan's account, the owner included. */
const seatText = (p: AccountPlan) => (ACCOUNT_PLANS[p].seats === null ? 'Unlimited team seats' : ACCOUNT_PLANS[p].seats === 1 ? 'One seat (just you)' : `${ACCOUNT_PLANS[p].seats} team seats (you and ${(ACCOUNT_PLANS[p].seats as number) - 1} more)`);
const foundingNames = FOUNDING_PLANS.map((p) => ACCOUNT_PLANS[p].name).join(', ').replace(/, ([^,]*)$/, ' and $1');

/** Monthly or yearly prices on the plan cards. */
function BillingSwitch({ yearly, onChange }: { yearly: boolean; onChange: (yearly: boolean) => void }) {
  const opt = (on: boolean): CSSProperties => ({ border: 0, cursor: 'pointer', minHeight: 40, padding: '8px 18px', borderRadius: 999, fontSize: 15, lineHeight: 1.3, fontWeight: 700, background: on ? '#F1F5F9' : 'transparent', color: on ? '#0B1017' : '#CBD5E1' });
  return (
    <div role="group" aria-label="Billing" style={{ display: 'inline-flex', gap: 4, padding: 4, border: LINE, borderRadius: 999, background: '#0B1017' }}>
      <button type="button" aria-pressed={!yearly} onClick={() => onChange(false)} style={opt(!yearly)}>Monthly</button>
      <button type="button" aria-pressed={yearly} onClick={() => onChange(true)} style={opt(yearly)}>Yearly · {12 - ANNUAL_MONTHS_PAID} months free</button>
    </div>
  );
}

/** The founding offer on a plan that earns it, while spots are left. */
function FoundingBar({ plan, left }: { plan: AccountPlan; left: number }) {
  if (left <= 0 || !ACCOUNT_PLANS[plan].founding) return null;
  return (
    <p style={{ margin: '0 0 16px', borderRadius: 10, background: TONE.accentSoft, border: `1px solid ${TONE.accentLine}`, padding: '8px 12px', fontSize: 13.5, lineHeight: 1.45, color: '#F1F5F9' }}>
      <strong style={{ color: ACCENT }}>First {FOUNDING.seats} founding agencies:</strong> {n(monthlyPoints({ [plan]: 1 }, true))} sessions a month (+{FOUNDING.bonus * 100}%) for as long as you stay. {left} of {FOUNDING.seats} spots left.
    </p>
  );
}

/** The four plans, side by side. */
export function PlanCards({ style, yearly = false, foundingLeft = 0 }: { style?: CSSProperties; yearly?: boolean; foundingLeft?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 262px), 1fr))', gap: 18, alignItems: 'stretch', ...style }}>
      {ACCOUNT_PLAN_ORDER.map((p) => {
        const d = ACCOUNT_PLANS[p], featured = p === FEATURED;
        const features = [
          `${d.briefs} brief credit${d.briefs === 1 ? '' : 's'} a month`,
          d.locations === null ? 'Unlimited tracked businesses' : `Up to ${d.locations} tracked businesses a month`,
          d.whiteLabel ? 'White-label reports on your own domain' : 'Share links with the Stakeout badge',
          seatText(p),
          ...(d.priority ? ['Priority queue: first to the phones and the 5G lines'] : []),
          `Unused sessions ${rollover(p, yearly)}`,
        ];
        return (
          <div key={p} style={{ border: featured ? `2px solid ${ACCENT}` : LINE, borderRadius: 20, padding: featured ? 23 : 24, background: featured ? '#111927' : '#111823', display: 'flex', flexDirection: 'column', boxShadow: featured ? `0 0 48px ${TONE.accentGlow}` : undefined }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 12px' }}>
              <p style={{ margin: 0, fontFamily: MONO, fontSize: 12.5, lineHeight: 1.5, letterSpacing: '0.1em', color: featured ? ACCENT : '#CBD5E1' }}>{d.name.toUpperCase()}</p>
              {featured && <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, fontWeight: 700, color: '#0B1017', background: ACCENT, padding: '3px 10px', borderRadius: 999 }}>Most popular</p>}
            </div>
            <p style={{ margin: '12px 0 0', lineHeight: 1.2 }}>
              <span style={{ fontWeight: 800, fontSize: 44, letterSpacing: '-0.03em' }}>{usd(yearly ? yearCents(p) : d.tiers[0].cents)}</span> <span style={{ fontSize: 15, color: '#CBD5E1' }}>{yearly ? '/ year' : '/ month'}</span>
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.5, color: '#94A3B8' }}>{yearly ? `${usd(Math.round(yearCents(p) / 12))} a month, billed once a year` : d.bestFor}</p>
            <div style={{ marginTop: 16, borderRadius: 14, background: '#0B1017', border: featured ? `1px solid ${TONE.accentLine}` : '1px solid rgba(255, 255, 255, 0.08)', padding: '14px 16px' }}>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, fontFamily: MONO, letterSpacing: '0.08em', color: '#94A3B8' }}>EACH MONTH</p>
              <p style={{ margin: '6px 0 0', fontSize: 15, lineHeight: 1.5, fontWeight: 700 }}>{n(d.points)} real-phone sessions</p>
              <p style={{ margin: '2px 0 0', fontSize: 14, lineHeight: 1.5, color: '#CBD5E1' }}>{n(Math.floor(d.points / SQUARE_5))} square 5×5s or {n(Math.floor(d.points / CIRCLE_5))} circles</p>
              <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: '#CBD5E1' }}>{cents(perSession(p, yearly))} a session{p !== 'P_SCOUT' ? ` · ${saves(p, yearly)}% less than Scout` : yearly ? ` · ${saves(p, true)}% less than monthly` : ''}</p>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 0', display: 'grid', gap: 9, fontSize: 14.5, lineHeight: 1.5, color: '#CBD5E1' }}>
              {features.map((f) => (
                <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Check size={16} top={3} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 'auto', paddingTop: 24 }}>
              <FoundingBar plan={p} left={foundingLeft} />
              <a className="so-btn" href={yearly ? HREF.plansYearly : HREF.plans} style={featured ? btnPrimary : btnQuiet}>Start {d.name}{yearly ? ' yearly' : ''}</a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The plans row by row: only what each plan does today. */
function CompareTable({ yearly }: { yearly: boolean }) {
  const all = (v: ReactNode) => ACCOUNT_PLAN_ORDER.map(() => v);
  const rows: [string, ReactNode[]][] = [
    ['Monthly', ACCOUNT_PLAN_ORDER.map((p) => `${usd(ACCOUNT_PLANS[p].tiers[0].cents)} / month`)],
    [`Yearly (${12 - ANNUAL_MONTHS_PAID} months free)`, ACCOUNT_PLAN_ORDER.map((p) => `${usd(yearCents(p))} / year (${usd(Math.round(yearCents(p) / 12))} / month)`)],
    ['Real-phone sessions a month', ACCOUNT_PLAN_ORDER.map((p) => `${n(ACCOUNT_PLANS[p].points)} (${n(Math.floor(ACCOUNT_PLANS[p].points / SQUARE_5))} square 5×5s or ${n(Math.floor(ACCOUNT_PLANS[p].points / CIRCLE_5))} circles)`)],
    ['Price per session', ACCOUNT_PLAN_ORDER.map((p) => `${cents(perSession(p, false))} (${cents(perSession(p, true))} yearly)`)],
    [`Founding members (first ${FOUNDING.seats})`, ACCOUNT_PLAN_ORDER.map((p) => (ACCOUNT_PLANS[p].founding ? `${n(monthlyPoints({ [p]: 1 }, true))} sessions a month, bank up to ${n(carryCap(p, 'month', monthlyPoints({ [p]: 1 }, true)))}` : '—'))],
    ['Brief credits a month', ACCOUNT_PLAN_ORDER.map((p) => n(ACCOUNT_PLANS[p].briefs))],
    ['Tracked businesses a month', ACCOUNT_PLAN_ORDER.map((p) => (ACCOUNT_PLANS[p].locations === null ? 'Unlimited' : `Up to ${ACCOUNT_PLANS[p].locations}`))],
    ['Priority queue (first to the phones and 5G lines)', ACCOUNT_PLAN_ORDER.map((p) => (ACCOUNT_PLANS[p].priority ? 'Included' : '—'))],
    ['Team seats (you included)', ACCOUNT_PLAN_ORDER.map((p) => (ACCOUNT_PLANS[p].seats === null ? 'Unlimited' : ACCOUNT_PLANS[p].seats === 1 ? '1 (just you)' : n(ACCOUNT_PLANS[p].seats as number)))],
    ['Google Maps, mobile organic and AI Overviews', all('All in one session')],
    ['Screen recording at every point', all('Included')],
    ['Client reports', ACCOUNT_PLAN_ORDER.map((p) => (ACCOUNT_PLANS[p].whiteLabel ? 'White-label on your own domain' : 'Share links with the Stakeout badge'))],
    ['Unused sessions', ACCOUNT_PLAN_ORDER.map((p) => (p === 'P_SCOUT' ? `${cap(rollover(p, false))} (one month rolls over on yearly)` : cap(rollover(p, yearly))))],
    ['Print, PDF and offline copies of reports', all('Included')],
  ];
  const cell: CSSProperties = { padding: '12px 14px', borderBottom: '1px solid rgba(255, 255, 255, 0.07)', fontSize: 14.5, lineHeight: 1.5, color: '#CBD5E1', verticalAlign: 'top', textAlign: 'left' };
  return (
    <div style={{ marginTop: 40, overflowX: 'auto', border: LINE, borderRadius: 16 }}>
      <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>The four plans compared</caption>
        <thead>
          <tr>
            <th scope="col" style={{ ...cell, color: '#94A3B8', fontWeight: 600 }}>Each plan</th>
            {ACCOUNT_PLAN_ORDER.map((p) => (
              <th key={p} scope="col" style={{ ...cell, color: p === FEATURED ? ACCENT : '#F1F5F9', fontWeight: 800 }}>{ACCOUNT_PLANS[p].name}<span style={{ display: 'block', fontWeight: 400, fontSize: 13, color: '#94A3B8' }}>{ACCOUNT_PLANS[p].bestFor}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, values]) => (
            <tr key={label}>
              <th scope="row" style={{ ...cell, color: '#F1F5F9', fontWeight: 600 }}>{label}</th>
              {values.map((v, i) => <td key={i} style={cell}>{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The quiet way in for a visitor who wants proof first. */
function ProofLink({ style }: { style?: CSSProperties }) {
  return (
    <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: '#CBD5E1', ...style }}>
      Want to verify one live grid first?{' '}
      <a href={HREF.closer} style={{ color: ACCENT, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>Run a {usd(CLOSER.cents)} Live 5G Proof Audit</a>
      <span style={{ color: '#94A3B8' }}> · {n(CLOSER.credits)} sessions on our 5G lines and {CLOSER.briefs} brief credit, one per account, no subscription.</span>
    </p>
  );
}

/** The Proof Audit, offered once a visit to a visitor whose pointer leaves the page. */
function ExitOffer() {
  const [open, setOpen] = useState(false);
  const go = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    let seen = false;
    try { seen = window.sessionStorage.getItem('stakeout:exit-offer') === '1'; } catch { /* storage refused: offer once on this page */ }
    if (seen) return;
    const leave = (e: MouseEvent) => {
      if (e.relatedTarget || e.clientY > 0) return;
      setOpen(true);
      try { window.sessionStorage.setItem('stakeout:exit-offer', '1'); } catch { /* once on this page then */ }
      document.removeEventListener('mouseout', leave);
    };
    // A moment on the page first, so it never greets someone on arrival.
    const t = window.setTimeout(() => document.addEventListener('mouseout', leave), 5000);
    return () => { window.clearTimeout(t); document.removeEventListener('mouseout', leave); };
  }, []);
  useEffect(() => {
    if (!open) return;
    go.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  if (!open) return null;
  return (
    <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(5, 8, 12, 0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="exit-offer-title" onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 100%)', borderRadius: 20, border: `1px solid ${TONE.accentLine}`, background: '#111823', padding: 'clamp(22px, 4vw, 32px)', boxShadow: `0 0 64px ${TONE.accentGlow}` }}>
        <h2 id="exit-offer-title" style={{ margin: 0, fontWeight: 800, fontSize: 28, lineHeight: 1.2, letterSpacing: '-0.02em' }}>See one live grid for {usd(CLOSER.cents)} before you decide.</h2>
        <p style={{ margin: '12px 0 0', fontSize: 16, lineHeight: 1.6, color: '#CBD5E1' }}>
          The {CLOSER.name}: {n(CLOSER.credits)} phone sessions run on our 5G lines (two 5×5 audits, with a screen recording at every point) and {CLOSER.briefs} brief credit. No subscription, one per account.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
          <a ref={go} className="so-btn" href={HREF.closer} style={{ ...btnPrimary, padding: '12px 20px' }}>Run a {usd(CLOSER.cents)} Live 5G Proof Audit</a>
          <button type="button" onClick={() => setOpen(false)} style={{ ...btnQuiet, cursor: 'pointer', background: 'transparent', padding: '12px 20px' }}>No thanks</button>
        </div>
      </section>
    </div>
  );
}

function Box({ title, price, children }: { title: string; price: string; children: ReactNode }) {
  return (
    <div style={{ border: LINE, borderRadius: 20, padding: 28, background: '#111823' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px 16px' }}>
        <h3 style={{ margin: 0, fontWeight: 800, fontSize: 22, lineHeight: 1.3 }}>{title}</h3>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 17, color: '#F1F5F9' }}>{price}</p>
      </div>
      {children}
    </div>
  );
}

/** The listing add-on, brief credits and the Boost, on top of a plan. */
export function ExtrasSection() {
  const row = (name: string, price: string, note: string) => (
    <li key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.07)', fontSize: 15, lineHeight: 1.5 }}>
      <span><span style={{ fontWeight: 700, color: '#F1F5F9' }}>{name}</span><span style={{ display: 'block', fontSize: 13.5, color: '#94A3B8' }}>{note}</span></span>
      <strong style={{ whiteSpace: 'nowrap' }}>{price}</strong>
    </li>
  );
  return (
    <section id="extras" style={SECTION}>
      <div style={WRAP}>
        <Eyebrow>ON TOP OF ANY PLAN</Eyebrow>
        <h2 style={H2}>Add listings and brief credits as you need them.</h2>
        <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20 }}>
          <Box title="Listing add-on" price={`${usd(ADDON.tiers[0].cents)} / listing / month`}>
            <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.65, color: '#CBD5E1' }}>For each client Google listing you manage here:</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 9, fontSize: 14.5, lineHeight: 1.5, color: '#CBD5E1' }}>
              {['Safe Google Business Profile edits, posts with a content calendar', 'Review alerts and replies, the daily change watchdog, rival gaps', 'AI agents that work on the listing', `${n(ADDON.points)} more phone sessions and ${ADDON.briefs} more brief credit a month`].map((f) => (
                <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><Check size={16} top={3} /><span>{f}</span></li>
              ))}
            </ul>
          </Box>
          <Box title="Brief credits" price="Any account">
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>{BRIEF_PACKS.map((i) => row(i.name, usd(i.cents), i.blurb))}</ul>
            <p style={{ margin: '12px 0 0', fontSize: 13.5, lineHeight: 1.55, color: '#94A3B8' }}>One brief credit compiles a revenue brief, or updates one you compiled with your newest scan under the same link. Opening, sharing or changing the close-rate inputs is free.</p>
          </Box>
          <Box title="Running low mid-month?" price={`${usd(BOOST.cents)} Boost`}>
            <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.65, color: '#CBD5E1' }}>Plan holders with less than {Math.round(BOOST_BELOW * 100)}% of the month’s sessions left can add {n(BOOST.credits)} more in the app; Boost sessions never expire. Or move up a plan: the difference is charged for the rest of the month only.</p>
          </Box>
        </div>
      </div>
    </section>
  );
}

export const PLANS_FAQ: FaqItem[] = [
  ['What is a phone session?', `One real Android phone run at one grid point: the phone’s GPS set there, the search recorded on video, and the page and AI Overview saved. A 3×3 scan is 9 phone sessions, a 5×5 is 25, a 7×7 is 49 and a 9×9 is 81. A circle grid drops the corners (a 5×5 circle is ${CIRCLE_5}), and points you switch off, over water or empty land, aren’t charged.`],
  ['Is there a yearly price?', `Yes: pay for ${ANNUAL_MONTHS_PAID} months and get 12. Scout is ${usd(yearCents('P_SCOUT'))}, Agency ${usd(yearCents('P_AGENCY'))}, Scale ${usd(yearCents('P_SCALE'))} and Agency Max ${usd(yearCents('P_MAX'))} a year. Phone sessions and brief credits still come every month.`],
  ['Do unused sessions roll over?', `On Scout paid monthly they reset each month; on Scout paid yearly, one month’s roll over. On Agency, one month’s roll over (up to ${n(ACCOUNT_PLANS.P_AGENCY.points)}); on Scale and Agency Max, two months’ (up to ${n(2 * ACCOUNT_PLANS.P_SCALE.points)} and ${n(2 * ACCOUNT_PLANS.P_MAX.points)}). Founding members bank on their larger allowance: up to ${n(carryCap('P_AGENCY', 'month', monthlyPoints({ P_AGENCY: 1 }, true)))}, ${n(carryCap('P_SCALE', 'month', monthlyPoints({ P_SCALE: 1 }, true)))} and ${n(carryCap('P_MAX', 'month', monthlyPoints({ P_MAX: 1 }, true)))}. Brief credits roll over for a month wherever sessions do. Sessions and brief credits you buy never expire.`],
  ['What is a founding member?', `One of the first ${FOUNDING.seats} accounts to start ${foundingNames}, monthly or yearly. Founding members get ${FOUNDING.bonus * 100}% more of their plan’s phone sessions every month for as long as they stay on one of those plans: Agency ${n(monthlyPoints({ P_AGENCY: 1 }, true))}, Scale ${n(monthlyPoints({ P_SCALE: 1 }, true))} and Agency Max ${n(monthlyPoints({ P_MAX: 1 }, true))} a month.`],
  ['What is a revenue brief?', 'A finished client report built from your scans: the local visibility score, where the business wins and loses on the map, the rivals’ ads above it, and what that visibility is worth at live county Google Ads prices. A brief credit compiles one, and it is kept as it is: it never recalculates when opened. Spend another brief credit to update it with your newest scan; the share link stays the same. Reopening it, sharing it or changing the close-rate inputs is free.'],
  ['What is a tracked business?', `A business you scan: Scout tracks up to ${ACCOUNT_PLANS.P_SCOUT.locations} a billing month, Agency ${ACCOUNT_PLANS.P_AGENCY.locations}, Scale ${ACCOUNT_PLANS.P_SCALE.locations} and Agency Max as many as you like. Scanning the same business again, with any keyword or grid, never counts twice, and every business with a repeating scan stays tracked. Once the month’s are in use, a new business waits for next month or a bigger plan.`],
  ['How do team seats work?', `Add people by email on the Plan and billing page. They sign in with their own email and password and work in your account: they run scans and open reports, using its phone sessions. The plan, billing and API keys stay with you, and you can take anyone off at any time. Agency has ${ACCOUNT_PLANS.P_AGENCY.seats} seats, Scale ${ACCOUNT_PLANS.P_SCALE.seats} and Agency Max no limit, you included; Scout is for one person.`],
  ['What does the listing add-on add?', `For ${usd(ADDON.tiers[0].cents)} a month per Google listing, on top of any plan: the listing tools (safe edits, posts, review replies, the change watchdog, rival gaps), AI agents that work on the listing, ${n(ADDON.points)} more phone sessions and ${ADDON.briefs} more brief credit a month.`],
  ['Can I try it before a plan?', `Yes: the ${CLOSER.name} is ${usd(CLOSER.cents)} once, no subscription. ${n(CLOSER.credits)} phone sessions run on our 5G lines (two 5×5 audits) and ${CLOSER.briefs} brief credit, which never expire. One per account.`],
  ['Can I change or cancel my plan?', 'Any time. A bigger plan charges the difference for the rest of the month (or year, on a yearly plan) straight away. A smaller one takes effect at once: nothing is refunded on a monthly plan, and on a yearly plan the unused part of the year comes off your next renewal. A cancelled plan works until the end of the month or year you paid for.'],
];

/** The pricing page with the account plans. */
export default function PricingPageV2({ live, foundingLeft = 0 }: { live: boolean; foundingLeft?: number }) {
  const [yearly, setYearly] = useState(false);
  const promises = ['No setup or onboarding fees', 'Cancel any time', `Yearly plans: ${12 - ANNUAL_MONTHS_PAID} months free`, 'Unused sessions roll over on Agency and up', 'A screen recording at every grid point'];
  return (
    <div className="so">
      {live && <OfferBanner live={live} href="#plans" plans />}
      <SiteNav page="pricing" plans />
      <main>
        <section id="top" style={SECTION}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: 'clamp(56px, 7vw, 96px) clamp(16px, 2vw, 24px) clamp(40px, 5vw, 64px)' }}>
            <Eyebrow>PRICING</Eyebrow>
            <h1 style={{ margin: '18px 0 0', fontWeight: 400, fontSize: 'clamp(38px, 4.4vw, 62px)', lineHeight: 1.08, letterSpacing: '-0.03em', maxWidth: 940 }}>
              One pin, one phone session.
              <br />
              Every surface in one run.
            </h1>
            <p style={{ margin: '24px 0 0', fontSize: 19, lineHeight: 1.65, color: '#CBD5E1', maxWidth: 780 }}>
              Every grid point runs on a real Android phone with its GPS set there. One phone session captures the map results, a single-listing takeover, the AI answer cards, the ads and a screen recording together. Plans include phone sessions, and brief credits for revenue briefs priced with live county Google Ads rates.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '32px 0 0', display: 'flex', flexWrap: 'wrap', gap: '12px 28px', fontSize: 15, lineHeight: 1.5, color: '#CBD5E1' }}>
              {promises.map((p) => (
                <li key={p} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><Check size={18} top={2} /><span>{p}</span></li>
              ))}
            </ul>
          </div>
        </section>
        <section id="plans" style={SECTION}>
          <div style={WRAP}>
            <Eyebrow>PLANS</Eyebrow>
            <h2 style={H2}>Real-phone sessions and brief credits, every month.</h2>
            <p style={LEAD}>One plan per account, paid monthly or yearly. Add the listing add-on for each client Google listing you manage here.</p>
            <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px 24px' }}>
              <BillingSwitch yearly={yearly} onChange={setYearly} />
              {yearly && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: '#CBD5E1' }}>Pay for {ANNUAL_MONTHS_PAID} months, get 12. Sessions and brief credits still come every month.</p>}
            </div>
            <PlanCards style={{ marginTop: 28 }} yearly={yearly} foundingLeft={foundingLeft} />
            <ProofLink style={{ marginTop: 26 }} />
            <CompareTable yearly={yearly} />
          </div>
        </section>
        <ExtrasSection />
        <Faq id="faq" items={foundingLeft > 0 ? PLANS_FAQ : PLANS_FAQ.filter(([q]) => q !== 'What is a founding member?')} />
        <section id="start">
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: 'clamp(56px, 7vw, 96px) clamp(16px, 2vw, 24px)' }}>
            <div style={{ border: `1px solid ${TONE.accentLine}`, background: TONE.accentSoft, borderRadius: 24, padding: 'clamp(28px, 4vw, 56px)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '24px 48px' }}>
              <div style={{ flex: '1 1 520px', minWidth: 0 }}>
                <h2 style={{ margin: 0, fontWeight: 800, fontSize: 'clamp(30px, 3.2vw, 46px)', lineHeight: 1.12, letterSpacing: '-0.025em' }}>Pick the plan that fits your clients.</h2>
                <p style={{ margin: '14px 0 0', fontSize: 17, lineHeight: 1.65, color: '#CBD5E1', maxWidth: 620 }}>Agency is where most teams start: {n(ACCOUNT_PLANS.P_AGENCY.points)} real-phone sessions and white-label reports for {usd(ACCOUNT_PLANS.P_AGENCY.tiers[0].cents)} a month.</p>
                <ProofLink style={{ marginTop: 14, fontSize: 15 }} />
              </div>
              <a className="so-btn" href={HREF.plans} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 52, boxSizing: 'border-box', background: ACCENT, color: '#0B1017', fontWeight: 700, fontSize: 16, lineHeight: 1.3, padding: '14px 24px', borderRadius: 12, whiteSpace: 'nowrap' }}>
                Choose a plan
              </a>
            </div>
          </div>
        </section>
      </main>
      <ExitOffer />
      <SiteFoot note="Prices in US dollars. Phone sessions and brief credits are counted per account." />
    </div>
  );
}
