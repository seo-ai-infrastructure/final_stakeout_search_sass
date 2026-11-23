'use client';
import { WELCOME, WHITE_LABEL, usd } from '@/lib/pricing';
import { ACCENT, Arrow, Check, Faq, HREF, OfferBanner, SiteFoot, SiteNav, TONE } from './SiteKit';
import { AuditCard, CalculatorSection, CompareSection, Eyebrow, PRICING_FAQ, ProspectsSection, SeatsSection } from './PriceBlocks';
import './site.css';

/** The pricing page: seats per client, the $5 first audit, prospect audits and the extras. */
export default function PricingPage({ live }: { live: boolean }) {
  const promises = ['No setup or onboarding fees', 'Cancel any time', `White-label free from ${WHITE_LABEL.freeFrom} clients`, 'A video receipt at every grid point'];
  return (
    <div className="so">
      <OfferBanner live={live} href={live ? '#plans' : '#audit'} />
      <SiteNav page="pricing" />
      <main>
        <section id="top" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: 'clamp(56px, 7vw, 96px) clamp(16px, 2vw, 24px) clamp(40px, 5vw, 64px)' }}>
            <Eyebrow>PRICING</Eyebrow>
            <h1 style={{ margin: '18px 0 0', fontWeight: 400, fontSize: 'clamp(38px, 4.4vw, 62px)', lineHeight: 1.08, letterSpacing: '-0.03em', maxWidth: 900 }}>
              Priced per client.
              <br />
              Not per pin.
            </h1>
            <p style={{ margin: '24px 0 0', fontSize: 19, lineHeight: 1.65, color: '#CBD5E1', maxWidth: 760 }}>
              Each seat covers one client: scheduled scans of their keywords on real Android phones, a screen recording at every grid point, and AI Overview tracking. Command and Dominator add the Google listing tools.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '32px 0 0', display: 'flex', flexWrap: 'wrap', gap: '12px 28px', fontSize: 15, lineHeight: 1.5, color: '#CBD5E1' }}>
              {promises.map((p) => (
                <li key={p} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Check size={18} top={2} />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <AuditCard style={{ marginTop: 44 }} />
          </div>
        </section>
        <CalculatorSection />
        <SeatsSection />
        <ProspectsSection />
        <CompareSection />
        <Faq id="faq" items={PRICING_FAQ} />
        <section id="start">
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: 'clamp(56px, 7vw, 96px) clamp(16px, 2vw, 24px)' }}>
            <div style={{ border: `1px solid ${TONE.accentLine}`, background: TONE.accentSoft, borderRadius: 24, padding: 'clamp(28px, 4vw, 56px)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '24px 48px' }}>
              <div style={{ flex: '1 1 520px', minWidth: 0 }}>
                <h2 style={{ margin: 0, fontWeight: 800, fontSize: 'clamp(30px, 3.2vw, 46px)', lineHeight: 1.12, letterSpacing: '-0.025em' }}>Start with one {usd(WELCOME.cents)} audit.</h2>
                <p style={{ margin: '14px 0 0', fontSize: 17, lineHeight: 1.65, color: '#CBD5E1', maxWidth: 620 }}>See what a real phone sees at every point of your client’s grid. Your {usd(WELCOME.cents)} comes off your first month.</p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <a className="so-btn" href={HREF.firstAudit} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 52, boxSizing: 'border-box', background: ACCENT, color: '#0B1017', fontWeight: 700, fontSize: 16, lineHeight: 1.3, padding: '14px 24px', borderRadius: 12, whiteSpace: 'nowrap' }}>
                  Run your first audit for {usd(WELCOME.cents)}
                  <Arrow />
                </a>
                <a className="so-btn" href={HREF.support} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 52, boxSizing: 'border-box', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#F1F5F9', fontWeight: 600, fontSize: 16, lineHeight: 1.3, padding: '14px 22px', borderRadius: 12, whiteSpace: 'nowrap' }}>
                  Talk to us
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFoot note="Prices in US dollars. Seats are billed monthly per client; Command and Dominator are per Google listing." />
    </div>
  );
}
