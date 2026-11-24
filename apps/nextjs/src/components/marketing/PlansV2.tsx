'use client';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { ACCOUNT_PLANS, ACCOUNT_PLAN_ORDER, ANNUAL_MONTHS_PAID, FOUNDING, LINES, monthlyPoints, yearCents, type AccountPlan } from '@stakeout/core/gbpPlans';
import { BRIEF_PACKS, CLOSER, CLOSER_LIMIT, PLAN_TOPUP, SESSION_PACKS, usd } from '@/lib/pricing';
import { ACCENT, Arrow, Check, Faq, HREF, MONO, OfferBanner, SiteFoot, SiteNav, TONE, type FaqItem } from './SiteKit';
import { Eyebrow } from './PriceBlocks';
import './site.css';

/**
 * Pricing with the account plans (Scout, Agency, Scale per account, the listing add-on per Google
 * listing, the Closer Pack, top-ups and briefs). Every price and count comes from the price list the
 * checkout uses, so the page and the bill agree. Only features that work today are listed.
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

/** What every plan includes, in one pass at every grid point. */
const EVERY_PLAN = ['Map pack, single-listing takeovers, AI answer cards, ads and a screen recording in one phone session', 'U.S. Census income layer (ACS median household income)', 'Google Business Profile, Search Console and GA4, from the business’s own accounts'];

/** Just pitching one prospect: the Closer Pack, no subscription. */
export function CloserCard({ style }: { style?: CSSProperties }) {
  return (
    <div id="closer" style={{ border: `1px solid ${TONE.accentLine}`, background: TONE.accentSoft, borderRadius: 20, padding: '26px 28px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '20px 36px', ...style }}>
      <div style={{ flex: '1 1 560px', minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 12, lineHeight: 1.5, letterSpacing: '0.1em', color: ACCENT }}>PITCHING ONE PROSPECT TODAY?</p>
        <p style={{ margin: '6px 0 0', fontWeight: 800, fontSize: 24, lineHeight: 1.3, letterSpacing: '-0.01em' }}>Closer Pack — {usd(CLOSER.cents)} once</p>
        <p style={{ margin: '10px 0 0', fontSize: 15.5, lineHeight: 1.65, color: '#CBD5E1' }}>
          {n(CLOSER.credits)} phone sessions, enough for two full 5×5 audits on real Android phones, and {CLOSER.briefs === 1 ? 'one brief credit' : `${CLOSER.briefs} brief credits`} for a revenue brief priced with live county Google Ads rates. Walk into the pitch with recordings from their own streets and the dollars behind them.
        </p>
        <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.5, fontWeight: 700, color: '#F1F5F9' }}>No subscription. Never expires. Up to {CLOSER_LIMIT} per account.</p>
      </div>
      <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
        <a className="so-btn" href={HREF.closer} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 50, boxSizing: 'border-box', background: ACCENT, color: '#0B1017', fontWeight: 700, fontSize: 16, lineHeight: 1.3, padding: '14px 24px', borderRadius: 12, whiteSpace: 'nowrap' }}>
          Get the Closer Pack for {usd(CLOSER.cents)}
          <Arrow />
        </a>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#94A3B8' }}>A 5×5 is ready in about 15 minutes.</p>
      </div>
    </div>
  );
}

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

/** The founding offer, while spots are left. */
function FoundingNote({ left, style }: { left: number; style?: CSSProperties }) {
  if (left <= 0) return null;
  return (
    <p style={{ margin: 0, border: `1px solid ${TONE.accentLine}`, background: TONE.accentSoft, borderRadius: 14, padding: '14px 18px', fontSize: 15.5, lineHeight: 1.6, color: '#F1F5F9', ...style }}>
      <strong style={{ color: ACCENT }}>Founding members:</strong> the first {FOUNDING.seats} accounts to start a plan get {FOUNDING.bonus * 100}% more phone sessions every month, for as long as they have a plan. <strong>{left} of {FOUNDING.seats} spots left.</strong>
    </p>
  );
}

/** The three plans, side by side. */
export function PlanCards({ style, yearly = false, foundingLeft = 0 }: { style?: CSSProperties; yearly?: boolean; foundingLeft?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20, alignItems: 'stretch', ...style }}>
      {ACCOUNT_PLAN_ORDER.map((p) => {
        const d = ACCOUNT_PLANS[p], featured = p === FEATURED;
        const features = [...(d.whiteLabel ? ['Your logo, name and brand color on shared reports'] : ['Stakeout share links and offline copies of every report']), ...EVERY_PLAN];
        return (
          <div key={p} style={{ border: featured ? `2px solid ${ACCENT}` : LINE, borderRadius: 20, padding: featured ? 27 : 28, background: featured ? '#111927' : '#111823', display: 'flex', flexDirection: 'column', boxShadow: featured ? `0 0 48px ${TONE.accentGlow}` : undefined }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 12px' }}>
              <p style={{ margin: 0, fontFamily: MONO, fontSize: 12.5, lineHeight: 1.5, letterSpacing: '0.1em', color: featured ? ACCENT : '#CBD5E1' }}>{d.name.toUpperCase()}</p>
              {featured && <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, fontWeight: 700, color: '#0B1017', background: ACCENT, padding: '3px 10px', borderRadius: 999 }}>Most popular</p>}
            </div>
            <p style={{ margin: '12px 0 0', lineHeight: 1.2 }}>
              <span style={{ fontWeight: 800, fontSize: 48, letterSpacing: '-0.03em' }}>{usd(yearly ? yearCents(p) : d.tiers[0].cents)}</span> <span style={{ fontSize: 15, color: '#CBD5E1' }}>{yearly ? '/ year' : '/ month'}</span>
            </p>
            {yearly && <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.5, color: '#94A3B8' }}>{usd(Math.round(yearCents(p) / 12))} a month, billed once a year</p>}
            <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.6, color: '#CBD5E1' }}>{d.bestFor}.</p>
            <div style={{ marginTop: 18, borderRadius: 14, background: '#0B1017', border: featured ? `1px solid ${TONE.accentLine}` : '1px solid rgba(255, 255, 255, 0.08)', padding: '14px 16px' }}>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, fontFamily: MONO, letterSpacing: '0.08em', color: '#94A3B8' }}>EACH MONTH</p>
              <p style={{ margin: '6px 0 0', fontSize: 15, lineHeight: 1.5, fontWeight: 700 }}>{n(d.points)} real-phone sessions</p>
              <p style={{ margin: '2px 0 0', fontSize: 14, lineHeight: 1.5, color: '#CBD5E1' }}>{n(Math.floor(d.points / 25))} full 5×5 scans{foundingLeft > 0 ? ` · ${n(monthlyPoints({ [p]: 1 }, true))} for founding members` : ''}</p>
              <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.5, fontWeight: 700 }}>{d.briefs} brief credit{d.briefs === 1 ? '' : 's'}</p>
              <p style={{ margin: '2px 0 0', fontSize: 14, lineHeight: 1.5, color: '#CBD5E1' }}>County Google Ads rates included</p>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'grid', gap: 10, fontSize: 14.5, lineHeight: 1.5, color: '#CBD5E1' }}>
              {features.map((f) => (
                <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Check size={16} top={3} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 'auto', paddingTop: 26 }}>
              <a className="so-btn" href={yearly ? HREF.plansYearly : HREF.plans} style={featured ? btnPrimary : btnQuiet}>Start {d.name}{yearly ? ' yearly' : ''}</a>
            </div>
          </div>
        );
      })}
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

/** The listing add-on, top-ups and briefs. */
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
        <h2 style={H2}>Add listings, sessions and brief credits as you need them.</h2>
        <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 20 }}>
          <Box title="Listing add-on" price={`${usd(ADDON.tiers[0].cents)} / listing / month`}>
            <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.65, color: '#CBD5E1' }}>For each client Google listing you manage here:</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 9, fontSize: 14.5, lineHeight: 1.5, color: '#CBD5E1' }}>
              {['Safe Google Business Profile edits, posts with a content calendar', 'Review alerts and replies, the daily change watchdog, rival gaps', 'AI agents that work on the listing', `${n(ADDON.points)} more phone sessions and ${ADDON.briefs} more brief credit a month`].map((f) => (
                <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><Check size={16} top={3} /><span>{f}</span></li>
              ))}
            </ul>
          </Box>
          <Box title="Phone sessions" price="Any account">
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>{[...SESSION_PACKS, PLAN_TOPUP].map((i) => row(i.name, usd(i.cents), i.blurb))}</ul>
            <p style={{ margin: '12px 0 0', fontSize: 13.5, lineHeight: 1.55, color: '#94A3B8' }}>Bought sessions never expire, plan or no plan. The plan top-up is for accounts on Scout, Agency or Scale.</p>
          </Box>
          <Box title="Brief credits" price="Any account">
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>{BRIEF_PACKS.map((i) => row(i.name, usd(i.cents), i.blurb))}</ul>
            <p style={{ margin: '12px 0 0', fontSize: 13.5, lineHeight: 1.55, color: '#94A3B8' }}>One brief credit compiles a revenue brief, or updates one you compiled with your newest scan under the same link. Opening, sharing or changing the close-rate inputs is free.</p>
          </Box>
        </div>
      </div>
    </section>
  );
}

export const PLANS_FAQ: FaqItem[] = [
  ['What is a phone session?', 'One real Android phone run at one grid point: the phone’s GPS set there, the search recorded on video, and the page and AI Overview saved. A 3×3 scan is 9 phone sessions, a 5×5 is 25, a 7×7 is 49 and a 9×9 is 81. Points you choose to skip, over water or empty land, aren’t charged.'],
  ['What is a revenue brief?', 'A finished client report built from your scans: the local visibility score, where the business wins and loses on the map, the rivals’ ads above it, and what that visibility is worth at live county Google Ads prices. A brief credit compiles one, and it is kept as it is: it never recalculates when opened. Spend another brief credit to update it with your newest scan; the share link stays the same. Reopening it, sharing it or changing the close-rate inputs is free.'],
  ['Do unused sessions and brief credits roll over?', 'A plan’s sessions and brief credits roll over for one month, and last month’s are used first. Sessions and brief credits you buy never expire.'],
  ['What does the listing add-on add?', `For ${usd(ADDON.tiers[0].cents)} a month per Google listing, on top of any plan: the listing tools (safe edits, posts, review replies, the change watchdog, rival gaps), AI agents that work on the listing, ${n(ADDON.points)} more phone sessions and ${ADDON.briefs} more brief credit a month.`],
  ['What is the Closer Pack?', `${usd(CLOSER.cents)} once, no subscription: ${n(CLOSER.credits)} phone sessions (two full 5×5 audits) and ${CLOSER.briefs} brief credit, which never expire. Up to ${CLOSER_LIMIT} per account.`],
  ['Is there a yearly price?', `Yes: pay for ${ANNUAL_MONTHS_PAID} months and get 12. Scout is ${usd(yearCents('P_SCOUT'))}, Agency ${usd(yearCents('P_AGENCY'))} and Scale ${usd(yearCents('P_SCALE'))} a year. Phone sessions and brief credits still come every month and roll over for one month, as on a monthly plan.`],
  ['What is a founding member?', `One of the first ${FOUNDING.seats} accounts to start a plan, monthly or yearly. Founding members get ${FOUNDING.bonus * 100}% more of their plan’s phone sessions every month for as long as they have a plan: Scout ${n(monthlyPoints({ P_SCOUT: 1 }, true))}, Agency ${n(monthlyPoints({ P_AGENCY: 1 }, true))} and Scale ${n(monthlyPoints({ P_SCALE: 1 }, true))} a month.`],
  ['Can I change or cancel my plan?', 'Any time. A bigger plan charges the difference for the rest of the month (or year, on a yearly plan) straight away. A smaller one takes effect at once: nothing is refunded on a monthly plan, and on a yearly plan the unused part of the year comes off your next renewal. A cancelled plan works until the end of the month or year you paid for.'],
];

/** The pricing page with the account plans. */
export default function PricingPageV2({ live, foundingLeft = 0 }: { live: boolean; foundingLeft?: number }) {
  const [yearly, setYearly] = useState(false);
  const promises = ['No setup or onboarding fees', 'Cancel any time', `Yearly plans: ${12 - ANNUAL_MONTHS_PAID} months free`, 'Unused plan sessions and brief credits roll over for a month', 'A screen recording at every grid point'];
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
            <FoundingNote left={foundingLeft} style={{ marginTop: 20 }} />
            <PlanCards style={{ marginTop: 28 }} yearly={yearly} foundingLeft={foundingLeft} />
            <CloserCard style={{ marginTop: 28 }} />
          </div>
        </section>
        <ExtrasSection />
        <Faq id="faq" items={foundingLeft > 0 ? PLANS_FAQ : PLANS_FAQ.filter(([q]) => q !== 'What is a founding member?')} />
        <section id="start">
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: 'clamp(56px, 7vw, 96px) clamp(16px, 2vw, 24px)' }}>
            <div style={{ border: `1px solid ${TONE.accentLine}`, background: TONE.accentSoft, borderRadius: 24, padding: 'clamp(28px, 4vw, 56px)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '24px 48px' }}>
              <div style={{ flex: '1 1 520px', minWidth: 0 }}>
                <h2 style={{ margin: 0, fontWeight: 800, fontSize: 'clamp(30px, 3.2vw, 46px)', lineHeight: 1.12, letterSpacing: '-0.025em' }}>Start with one pitch.</h2>
                <p style={{ margin: '14px 0 0', fontSize: 17, lineHeight: 1.65, color: '#CBD5E1', maxWidth: 620 }}>The Closer Pack is two full 5×5 audits and a revenue brief for {usd(CLOSER.cents)}, no subscription.</p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <a className="so-btn" href={HREF.closer} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 52, boxSizing: 'border-box', background: ACCENT, color: '#0B1017', fontWeight: 700, fontSize: 16, lineHeight: 1.3, padding: '14px 24px', borderRadius: 12, whiteSpace: 'nowrap' }}>
                  Get the Closer Pack
                  <Arrow />
                </a>
                <a className="so-btn" href={HREF.plans} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 52, boxSizing: 'border-box', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#F1F5F9', fontWeight: 600, fontSize: 16, lineHeight: 1.3, padding: '14px 22px', borderRadius: 12 }}>
                  Choose a plan
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFoot note="Prices in US dollars. Phone sessions and brief credits are counted per account." />
    </div>
  );
}
