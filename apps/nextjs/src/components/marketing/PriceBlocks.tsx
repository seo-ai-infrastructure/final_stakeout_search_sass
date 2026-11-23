'use client';
import { useState, type ReactNode } from 'react';
import { LINES, SCAN_NOW_5X5, lineCents, type Line } from '@stakeout/core/gbpPlans';
import { PROSPECT_PACKS, TOPUP, WELCOME, WHITE_LABEL, usd } from '@/lib/pricing';
import { ACCENT, Arrow, Check, HREF, MONO, No, TONE, Yes, type FaqItem } from './SiteKit';

/**
 * The price blocks of the pricing page; the home page shows the first three. Every price and
 * point count comes from the price list the checkout uses (gbpPlans and pricing), so the page and
 * the bill always agree.
 */

const LINE = '1px solid rgba(255, 255, 255, 0.1)';
const SECTION = { borderBottom: '1px solid rgba(255, 255, 255, 0.06)' };
const WRAP = { maxWidth: 1240, margin: '0 auto', padding: 'clamp(56px, 7vw, 96px) clamp(16px, 2vw, 24px)' };
const H2 = { margin: '14px 0 0', fontWeight: 800, fontSize: 'clamp(30px, 3.2vw, 46px)', lineHeight: 1.12, letterSpacing: '-0.025em' } as const;
const LEAD = { margin: '16px 0 0', fontSize: 17, lineHeight: 1.65, color: '#CBD5E1', maxWidth: 820 };
const btnPrimary = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, boxSizing: 'border-box', background: ACCENT, color: '#0B1017', fontWeight: 700, fontSize: 15, lineHeight: 1.3, padding: 12, borderRadius: 12 } as const;
const btnQuiet = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, boxSizing: 'border-box', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#F1F5F9', fontWeight: 700, fontSize: 15, lineHeight: 1.3, padding: 12, borderRadius: 12 } as const;

const points = (n: number) => n.toLocaleString('en-US');
/** $383, or $38.30 when there are cents. */
const money = (dollars: number) => {
  const r = Math.round(dollars * 100) / 100;
  return '$' + r.toLocaleString('en-US', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
};
/** "1–9 clients", "10–24", "25–99", "100+" with each bracket's price. */
function brackets(line: Line) {
  let from = 1;
  return LINES[line].tiers.map((t, i) => {
    const label = t.upTo === null ? `${from}+` : `${from}–${t.upTo}${i === 0 ? ' clients' : ''}`;
    from = (t.upTo ?? 0) + 1;
    return { label, price: usd(t.cents) };
  });
}
const from = (line: Line) => usd(LINES[line].tiers[0].cents);
/** Scan Now 5×5s a seat's phone sessions cover on top of its weekly keywords (a Scan Now 5×5 is 25, like a scheduled one). */
const SCAN_NOW_INCLUDED: Partial<Record<Line, number>> = { COMMAND: 2, DOMINATOR: 6 };
const scheduled5x5 = (line: Line) => (LINES[line].points - (SCAN_NOW_INCLUDED[line] ?? 0) * SCAN_NOW_5X5) / 25;

export function Eyebrow({ children, color = ACCENT }: { children: ReactNode; color?: string }) {
  return <p style={{ margin: 0, fontFamily: MONO, fontSize: 12.5, lineHeight: 1.5, letterSpacing: '0.12em', color }}>{children}</p>;
}

/** The way in: one 5×5 audit for $5. */
export function AuditCard({ style }: { style?: React.CSSProperties }) {
  return (
    <div id="audit" style={{ border: `1px solid ${TONE.accentLine}`, background: TONE.accentSoft, borderRadius: 20, padding: '26px 28px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '20px 36px', ...style }}>
      <div style={{ flex: '1 1 560px', minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 12, lineHeight: 1.5, letterSpacing: '0.1em', color: ACCENT }}>START HERE</p>
        <p style={{ margin: '6px 0 0', fontWeight: 800, fontSize: 24, lineHeight: 1.3, letterSpacing: '-0.01em' }}>First 5×5 real-device audit — {usd(WELCOME.cents)} once</p>
        <p style={{ margin: '10px 0 0', fontSize: 15.5, lineHeight: 1.65, color: '#CBD5E1' }}>
          25 real Android phone runs across a full 5×5 grid: a screen recording at every point, the AI Overview and Map Pack at each one, the Census buying-power map, and a link you can send a client. We run it again free 7 days later, so you can see what moved.
        </p>
        <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.5, fontWeight: 700, color: '#F1F5F9' }}>Your {usd(WELCOME.cents)} comes off your first month on any seat.</p>
      </div>
      <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
        <a className="so-btn" href={HREF.firstAudit} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 50, boxSizing: 'border-box', background: ACCENT, color: '#0B1017', fontWeight: 700, fontSize: 16, lineHeight: 1.3, padding: '14px 24px', borderRadius: 12, whiteSpace: 'nowrap' }}>
          Run your first audit for {usd(WELCOME.cents)}
          <Arrow />
        </a>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#94A3B8' }}>One per account. Ready in about 15 minutes.</p>
      </div>
    </div>
  );
}

/** The bracket a roster's newest seats fall in. */
const BRACKET = (n: number) =>
  n <= 9 ? 'Standard bracket' : n <= 24 ? 'Volume bracket unlocked · seats 10–24 discounted' : n <= 99 ? 'Scale bracket unlocked · seats 25–99 discounted' : 'Enterprise bracket unlocked · seats 100+ discounted';
const PRESETS: [number, string][] = [[350, 'Proof add-on'], [500, 'Standard local + AI'], [1000, 'Market dominance']];
const TIERS: Line[] = ['SCOUT', 'COMMAND', 'DOMINATOR'];
const SUITE: Partial<Record<Line, boolean>> = { COMMAND: true, DOMINATOR: true };
const dollarsOf = (cents: number) => money(cents / 100);

/**
 * What an agency keeps: retainers in, seats out, with the graduated brackets worked out exactly as
 * Stripe bills them (lineCents), and what the seats include.
 */
export function ProfitCalculator({ style }: { style?: React.CSSProperties }) {
  const [clients, setClients] = useState(15);
  const [retainer, setRetainer] = useState(500);
  const [line, setLine] = useState<Line>('COMMAND');
  const revenue = clients * retainer;
  const cost = lineCents(line, clients) / 100;
  const profit = revenue - cost;
  const margin = revenue ? (profit / revenue) * 100 : 0;
  const boosts = clients * (SCAN_NOW_INCLUDED[line] ?? 0);
  const pool = clients * scheduled5x5(line) * 25;
  const label = clients === 1 ? '1 client' : clients + ' clients';
  const slider = { display: 'block', width: '100%', height: 40, margin: '6px 0 0', accentColor: ACCENT, cursor: 'pointer' } as const;
  const fieldHead = { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '4px 12px' } as const;
  const pill = (on: boolean) => ({ minHeight: 40, padding: '8px 12px', borderRadius: 999, border: `1px solid ${on ? ACCENT : 'rgba(255, 255, 255, 0.16)'}`, background: on ? TONE.accentSoft : 'transparent', color: on ? '#F1F5F9' : '#CBD5E1', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.3, fontWeight: 600 });
  const row = { display: 'flex', justifyContent: 'space-between', gap: 14, padding: '10px 0', borderBottom: '1px dashed rgba(255, 255, 255, 0.12)' };
  const fig = { fontFamily: MONO, flex: 'none', textAlign: 'right' as const };
  return (
    <div style={{ border: LINE, borderRadius: 20, background: '#111827', padding: 'clamp(20px, 2.6vw, 30px)', ...style }}>
      <p style={{ margin: 0, fontFamily: MONO, fontSize: 12, lineHeight: 1.5, letterSpacing: '0.1em', color: ACCENT }}>AGENCY PROFIT CALCULATOR</p>
      <h3 style={{ margin: '8px 0 0', fontWeight: 800, fontSize: 'clamp(22px, 2.2vw, 30px)', lineHeight: 1.2, letterSpacing: '-0.015em' }}>Turn {from('COMMAND')} seats into high-margin agency retainers.</h3>
      <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.6, color: '#94A3B8', maxWidth: 720 }}>Model your exact monthly wholesale cost and net retainer profit as your client roster scales.</p>
      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 'clamp(20px, 3vw, 36px)', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 22 }}>
          <div>
            <div style={fieldHead}>
              <label htmlFor="client-count" style={{ fontWeight: 700, fontSize: 16 }}>Active clients</label>
              <output htmlFor="client-count" style={{ fontFamily: MONO, fontWeight: 700, fontSize: 18, color: ACCENT }}>{label}</output>
            </div>
            <input id="client-count" type="range" min={1} max={120} step={1} value={clients} onChange={(e) => setClients(Math.min(120, Math.max(1, Math.round(Number(e.target.value)))))} aria-valuetext={label} style={slider} />
            <p style={{ margin: '4px 0 0', display: 'inline-block', fontSize: 12.5, lineHeight: 1.4, fontWeight: 600, color: clients > 9 ? '#34D399' : '#94A3B8', border: `1px solid ${clients > 9 ? 'rgba(16, 185, 129, 0.45)' : 'rgba(255, 255, 255, 0.14)'}`, background: clients > 9 ? 'rgba(16, 185, 129, 0.1)' : 'transparent', borderRadius: 999, padding: '4px 10px' }}>{BRACKET(clients)}</p>
          </div>
          <div>
            <div style={fieldHead}>
              <label htmlFor="retainer" style={{ fontWeight: 700, fontSize: 16 }}>Monthly retainer per client</label>
              <output htmlFor="retainer" style={{ fontFamily: MONO, fontWeight: 700, fontSize: 18, color: ACCENT }}>{money(retainer)} / mo</output>
            </div>
            <input id="retainer" type="range" min={250} max={1500} step={50} value={retainer} onChange={(e) => setRetainer(Math.min(1500, Math.max(250, Math.round(Number(e.target.value) / 50) * 50)))} aria-valuetext={money(retainer) + ' a month'} style={slider} />
            <div role="group" aria-label="Common retainers" style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PRESETS.map(([v, name]) => (
                <button key={v} type="button" aria-pressed={retainer === v} onClick={() => setRetainer(v)} style={pill(retainer === v)}>
                  {money(v)}/mo · {name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p id="seat-pick" style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Seat</p>
            <div role="group" aria-labelledby="seat-pick" style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TIERS.map((t) => (
                <button key={t} type="button" aria-pressed={line === t} onClick={() => setLine(t)} style={pill(line === t)}>
                  {LINES[t].name} <span style={{ fontFamily: MONO, fontWeight: 500 }}>{from(t)}→{dollarsOf(LINES[t].tiers[LINES[t].tiers.length - 1].cents)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div aria-live="polite" style={{ border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 16, background: '#0B1017', padding: 'clamp(18px, 2.2vw, 24px)', fontSize: 14, lineHeight: 1.5, color: '#CBD5E1' }}>
          <p style={{ margin: 0, fontFamily: MONO, fontSize: 12, letterSpacing: '0.1em', color: '#94A3B8' }}>NET MONTHLY PROFIT</p>
          <p style={{ margin: '4px 0 0', fontFamily: MONO, fontWeight: 700, fontSize: 'clamp(30px, 3.4vw, 42px)', lineHeight: 1.15, color: '#10B981' }}>{money(profit)}<span style={{ fontSize: 16, color: '#94A3B8' }}> / mo</span></p>
          <p style={{ margin: '10px 0 0', display: 'inline-block', fontFamily: MONO, fontSize: 12.5, color: '#34D399', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.45)', borderRadius: 999, padding: '4px 10px' }}>
            {money(profit * 12)} / yr net · {margin.toFixed(1)}% agency margin
          </p>
          <div style={{ marginTop: 14 }}>
            <div style={row}>
              <span>Client retainers ({clients} × {money(retainer)})</span>
              <span style={fig}>{money(revenue)} / mo</span>
            </div>
            <div style={row}>
              <span>Stakeout {LINES[line].name} seats ({money(cost / clients)} a seat, blended)</span>
              <span style={fig}>−{money(cost)} / mo</span>
            </div>
            <div style={{ ...row, borderBottom: 'none' }}>
              <span>Overage fees and AI add-on charges</span>
              <span style={fig}>$0</span>
            </div>
          </div>
          <p style={{ margin: '14px 0 0', fontFamily: MONO, fontSize: 12, letterSpacing: '0.1em', color: '#94A3B8' }}>INCLUDED EACH MONTH</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 8 }}>
            <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Check size={16} top={3} />
              <span>{points(pool)} pooled phone sessions ({points(pool / 25)} scheduled 5×5 audits on real Android phones)</span>
            </li>
            {boosts > 0 && (
              <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Check size={16} top={3} />
                <span>{points(boosts)} Scan Now 5×5{boosts === 1 ? '' : 's'}, ahead of the queue</span>
              </li>
            )}
            {SUITE[line] && (
              <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Check size={16} top={3} />
                <span>{label === '1 client' ? '1 Google listing suite' : `${clients} Google listing suites`} with the daily watchdog and review inbox</span>
              </li>
            )}
          </ul>
          {clients >= WHITE_LABEL.freeFrom ? (
            <p style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.45, fontWeight: 700, color: '#34D399', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.45)', borderRadius: 10, padding: '8px 12px' }}>
              ★ Free white-label portal and domain unlocked: saves {usd(WHITE_LABEL.cents)}
            </p>
          ) : (
            <p style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.45, color: '#94A3B8' }}>
              Add {WHITE_LABEL.freeFrom - clients} more client{WHITE_LABEL.freeFrom - clients === 1 ? '' : 's'} to unlock white-label free and volume seat pricing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

type Seat = { line: Line; tagline: string; covers: string[]; heading?: string; features: string[]; featured?: boolean };
const SEAT_CARDS: Seat[] = [
  {
    line: 'SCOUT',
    tagline: 'Light tracking for smaller clients.',
    covers: ['5 keywords every other week on a 5×5', 'or 6 keywords weekly on a 3×3'],
    features: ['AI Overview and Map Pack tracked together', 'A screen recording at every grid point', 'Census buying-power map', 'Share links your clients open without a login', 'Search Console and Analytics', 'Scan Now any time, at the same price'],
  },
  {
    line: 'COMMAND',
    tagline: 'Weekly tracking plus the Google listing tools.',
    covers: ['5 keywords weekly on a 5×5', 'or 10 keywords every other week', 'plus 2 Scan Now 5×5s'],
    heading: 'Everything in Scout, plus:',
    features: ['Rival gaps against the businesses above you', 'Safe Google Business Profile editor', 'Google posts with a content calendar (Facebook and LinkedIn coming soon)', 'Review alerts and replies', 'Daily listing watchdog', 'AI agents for the everyday listing work'],
    featured: true,
  },
  {
    line: 'DOMINATOR',
    tagline: 'More keywords and bigger grids.',
    covers: ['10 keywords weekly on a 5×5', 'or 5 weekly on a 7×7, or 6 every other week on a 9×9', 'plus 6 Scan Now 5×5s'],
    heading: 'Everything in Command, plus:',
    features: ['Twice the keywords of Command', 'Room for 7×7 and 9×9 grids across wide service areas', '6 Scan Now 5×5s every month'],
  },
];

/** The three seats, side by side. */
export function SeatCards({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20, alignItems: 'stretch' }}>
        {SEAT_CARDS.map((s) => {
          const def = LINES[s.line];
          const edge = s.featured ? TONE.accentLine : 'rgba(255, 255, 255, 0.1)';
          return (
            <div key={s.line} style={{ border: s.featured ? `2px solid ${ACCENT}` : LINE, borderRadius: 20, padding: s.featured ? 27 : 28, background: s.featured ? '#111927' : '#111823', display: 'flex', flexDirection: 'column', boxShadow: s.featured ? `0 0 48px ${TONE.accentGlow}` : undefined }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 12px' }}>
                <p style={{ margin: 0, fontFamily: MONO, fontSize: 12.5, lineHeight: 1.5, letterSpacing: '0.1em', color: s.featured ? ACCENT : '#CBD5E1' }}>{def.name.toUpperCase()}</p>
                {s.featured && <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, fontWeight: 700, color: '#0B1017', background: ACCENT, padding: '3px 10px', borderRadius: 999 }}>Most agencies pick this</p>}
              </div>
              <p style={{ margin: '12px 0 0', lineHeight: 1.2 }}>
                <span style={{ fontWeight: 800, fontSize: 48, letterSpacing: '-0.03em' }}>{from(s.line)}</span> <span style={{ fontSize: 15, color: '#CBD5E1' }}>/ client / mo</span>
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.6, color: '#CBD5E1' }}>{s.tagline}</p>
              <ul aria-label={`${def.name} price by number of clients`} style={{ listStyle: 'none', padding: 0, margin: '18px 0 0', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, fontFamily: MONO, fontSize: 12.5, lineHeight: 1.4 }}>
                {brackets(s.line).map((b) => (
                  <li key={b.label} style={{ border: `1px solid ${edge}`, borderRadius: 10, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', gap: 8, color: '#CBD5E1' }}>
                    <span>{b.label}</span>
                    <strong style={{ color: '#F1F5F9' }}>{b.price}</strong>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 18, borderRadius: 14, background: '#0B1017', border: s.featured ? `1px solid ${TONE.accentLine}` : '1px solid rgba(255, 255, 255, 0.08)', padding: '14px 16px' }}>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, fontFamily: MONO, letterSpacing: '0.08em', color: '#94A3B8' }}>COVERS EACH MONTH</p>
                {s.covers.map((c, i) => (
                  <p key={c} style={i === 0 ? { margin: '6px 0 0', fontSize: 15, lineHeight: 1.5, fontWeight: 700 } : { margin: '2px 0 0', fontSize: 14, lineHeight: 1.5, color: '#CBD5E1' }}>{c}</p>
                ))}
                <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#94A3B8' }}>{points(def.points)} phone sessions a month</p>
              </div>
              {s.heading && <p style={{ margin: '20px 0 0', fontSize: 14.5, lineHeight: 1.5, fontWeight: 600, color: '#F1F5F9' }}>{s.heading}</p>}
              <ul style={{ listStyle: 'none', padding: 0, margin: s.heading ? '12px 0 0' : '20px 0 0', display: 'grid', gap: 10, fontSize: 14.5, lineHeight: 1.5, color: '#CBD5E1' }}>
                {s.features.map((f) => (
                  <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Check size={16} top={3} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 'auto', paddingTop: 26 }}>
                <a className="so-btn" href={HREF.seats} style={s.featured ? btnPrimary : btnQuiet}>Start {def.name}</a>
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ margin: '20px 0 0', fontSize: 13.5, lineHeight: 1.6, color: '#94A3B8' }}>
        A phone session is one real Android phone run at one grid point. A 5×5 scan is 25 phone sessions, a 7×7 is 49, a 9×9 is 81, scheduled or Scan Now. Unused seat sessions roll over for one month.
      </p>
    </div>
  );
}

export function CalculatorSection() {
  return (
    <section id="calculator" style={SECTION}>
      <div style={{ ...WRAP, padding: 'clamp(48px, 6vw, 80px) clamp(16px, 2vw, 24px)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px 40px' }}>
          <div style={{ flex: '1 1 520px', minWidth: 0 }}>
            <Eyebrow>YOUR MONTH</Eyebrow>
            <h2 style={H2}>What your roster costs, and what you keep.</h2>
          </div>
          <p style={{ flex: '1 1 380px', margin: 0, fontSize: 15, lineHeight: 1.6, color: '#94A3B8', maxWidth: 520 }}>
            Graduated: your first 9 clients are at the first price, clients 10 to 24 at the next, then 25 to 99, then 100 and up. Each price applies only to the clients in its bracket.
          </p>
        </div>
        <ProfitCalculator style={{ marginTop: 32 }} />
      </div>
    </section>
  );
}

export function SeatsSection() {
  return (
    <section id="plans" style={SECTION}>
      <div style={WRAP}>
        <Eyebrow>SEATS</Eyebrow>
        <h2 style={H2}>One seat per client. Pick the one each client needs.</h2>
        <p style={LEAD}>Mix them freely: a light client on Scout, your core retainers on Command, the big service areas on Dominator.</p>
        <SeatCards style={{ marginTop: 40 }} />
      </div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'grid', gap: 12, fontSize: 15, lineHeight: 1.55, color: '#CBD5E1' }}>
      {items.map((t) => (
        <li key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Check size={16} top={4} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function SpeedsSection() {
  const chip = { margin: 0, fontFamily: MONO, fontSize: 12, lineHeight: 1.4, borderRadius: 999, padding: '4px 10px' };
  const icon = { width: 44, height: 44, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
  return (
    <section id="speeds" style={SECTION}>
      <div style={WRAP}>
        <Eyebrow>TWO SPEEDS</Eyebrow>
        <h2 style={H2}>On your schedule, or right now. Same price.</h2>
        <p style={LEAD}>Most agencies set their keywords once and let them run until reporting day. When a prospect is on the call, Scan Now jumps the line. Either way, one grid point is one phone session.</p>
        <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', gap: 20 }}>
          <div style={{ border: LINE, borderRadius: 20, padding: 28, background: '#111823' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 14px' }}>
              <span style={{ ...icon, background: 'rgba(16, 185, 129, 0.12)', color: '#34D399' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              </span>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: 24, lineHeight: 1.25 }}>Scheduled</h3>
              <p style={{ ...chip, color: '#34D399', border: '1px solid rgba(16, 185, 129, 0.45)' }}>DEFAULT</p>
            </div>
            <Bullets items={['Run it as soon as the phones are free, or pick a day and hour at least 2 hours ahead', 'Results within 3 hours of the time you pick', 'Weekly means 4 runs a month; every other week means 2', 'We flag hours when the business is closed: Google ranks closed businesses lower']} />
          </div>
          <div style={{ border: `1px solid ${TONE.accentLine}`, borderRadius: 20, padding: 28, background: '#111927' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 14px' }}>
              <span style={{ ...icon, background: TONE.accentSoft, color: ACCENT }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
              </span>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: 24, lineHeight: 1.25 }}>Scan Now</h3>
              <p style={{ ...chip, color: ACCENT, border: `1px solid ${TONE.accentLine}` }}>FIRST IN LINE</p>
            </div>
            <Bullets items={['Jumps ahead of every scheduled scan', 'A 5×5 in about 15 minutes', 'Same one phone session a grid point', `Prospect audits and your ${usd(WELCOME.cents)} first audit always run this way`]} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function ProspectsSection() {
  const extras: [string, string, string][] = [
    ['TOP-UP', `${usd(TOPUP.cents)} per ${points(TOPUP.credits)} phone sessions`, 'For seat holders who run short. They never expire, though a bigger seat is always cheaper per session.'],
    ['WHITE-LABEL', `Free from ${WHITE_LABEL.freeFrom} clients, or ${usd(WHITE_LABEL.cents)} once`, 'Your logo and your domain on every report and share link.'],
    ['NO EXTRA FEES', 'No setup or onboarding fees', 'Cancel any time. A seat keeps working until the end of the month you paid for.'],
  ];
  return (
    <section id="prospects" style={SECTION}>
      <div style={WRAP}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px 40px' }}>
          <div style={{ flex: '1 1 560px', minWidth: 0 }}>
            <Eyebrow>NO SUBSCRIPTION</Eyebrow>
            <h2 style={H2}>Prospect audits for your pitches.</h2>
            <p style={{ ...LEAD, maxWidth: 720 }}>Full 5×5 audits that run right away, for the businesses you haven’t signed yet. Show the prospect the recording from their own street while you’re still on the call.</p>
          </div>
          <p style={{ margin: 0, fontFamily: MONO, fontSize: 13, lineHeight: 1.5, color: '#94A3B8' }}>Valid for 90 days</p>
        </div>
        <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
          {PROSPECT_PACKS.map((p) => (
            <div key={p.key} style={{ border: p.featured ? `1px solid ${TONE.accentLine}` : LINE, borderRadius: 18, padding: 24, background: p.featured ? '#111927' : '#111823', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 17, lineHeight: 1.4 }}>{p.audits === 1 ? '1 audit' : `${p.audits} audits`}</p>
                {p.saves > 0 && <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, fontWeight: 700, color: ACCENT }}>Save {usd(p.saves)}</p>}
              </div>
              <p style={{ margin: '8px 0 0', fontWeight: 800, fontSize: 40, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{usd(p.cents)}</p>
              <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: '#94A3B8' }}>{p.audits === 1 ? 'One prospect, one keyword' : `${usd(Math.round(p.cents / p.audits))} an audit`}</p>
              <div style={{ marginTop: 'auto', paddingTop: 20 }}>
                <a className="so-btn" href={HREF.prospects(p.key)} style={{ ...(p.featured ? btnPrimary : btnQuiet), minHeight: 46, padding: 11 }}>Buy {p.audits === 1 ? '1 audit' : `${p.audits} audits`}</a>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 48, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
          {extras.map(([tag, title, body]) => (
            <div key={tag} style={{ borderTop: '1px solid rgba(255, 255, 255, 0.12)', paddingTop: 18 }}>
              <p style={{ margin: 0, fontFamily: MONO, fontSize: 12, lineHeight: 1.5, letterSpacing: '0.08em', color: '#94A3B8' }}>{tag}</p>
              <p style={{ margin: '6px 0 0', fontWeight: 800, fontSize: 20, lineHeight: 1.35 }}>{title}</p>
              <p style={{ margin: '6px 0 0', fontSize: 14.5, lineHeight: 1.6, color: '#CBD5E1' }}>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const SCAN_NOW_TEXT = (n: number) => (n === 0 ? 'None' : n + ' a month');
type Row = [feature: string, scout: ReactNode, command: ReactNode, dominator: ReactNode];
const ROWS: Row[] = [
  ['Phone sessions a month', points(LINES.SCOUT.points), points(LINES.COMMAND.points), points(LINES.DOMINATOR.points)],
  ['5×5 keywords covered', '5 every other week', '5 weekly', '10 weekly'],
  ['Scan Now 5×5s included', SCAN_NOW_TEXT(0), SCAN_NOW_TEXT(SCAN_NOW_INCLUDED.COMMAND ?? 0), SCAN_NOW_TEXT(SCAN_NOW_INCLUDED.DOMINATOR ?? 0)],
  ['AI Overview and Map Pack tracking', true, true, true],
  ['Screen recording at every grid point', true, true, true],
  ['Census buying-power map', true, true, true],
  ['Share links, Search Console and Analytics', true, true, true],
  ['Rival gaps and the safe GBP editor', false, true, true],
  ['Google posts and content calendar', false, true, true],
  ['Review alerts and replies', false, true, true],
  ['Daily listing watchdog', false, true, true],
  ['AI agents', false, true, true],
];

export function CompareSection() {
  const cell = (last: boolean) => ({ textAlign: 'center' as const, padding: '14px 16px', borderBottom: last ? undefined : '1px solid rgba(255, 255, 255, 0.06)' });
  const show = (v: ReactNode, mono: boolean) => (v === true ? <Yes /> : v === false ? <No /> : mono ? <span style={{ fontFamily: MONO }}>{v}</span> : v);
  const heads: [Line, boolean][] = [['SCOUT', false], ['COMMAND', true], ['DOMINATOR', false]];
  return (
    <section id="compare" style={SECTION}>
      <div style={WRAP}>
        <Eyebrow>SIDE BY SIDE</Eyebrow>
        <h2 style={H2}>Compare seats.</h2>
        <div style={{ marginTop: 32, overflowX: 'auto', border: LINE, borderRadius: 18, background: '#111823' }}>
          <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', fontSize: 15, lineHeight: 1.5 }}>
            <caption style={{ captionSide: 'top', textAlign: 'left', padding: '16px 22px 0', fontSize: 13.5, color: '#94A3B8' }}>Prices are per client per month for your first 9 clients.</caption>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: '18px 22px', fontWeight: 600, color: '#94A3B8', borderBottom: LINE }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em' }}>FEATURE</span>
                </th>
                {heads.map(([line, hi]) => (
                  <th key={line} scope="col" style={{ textAlign: 'center', padding: '18px 16px', borderBottom: LINE, background: hi ? TONE.accentSoft : undefined }}>
                    <span style={{ display: 'block', fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', color: hi ? ACCENT : '#CBD5E1' }}>{LINES[line].name.toUpperCase()}</span>
                    <span style={{ display: 'block', marginTop: 4, fontWeight: 800, fontSize: 22 }}>{from(line)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([feature, ...vals], r) => {
                const last = r === ROWS.length - 1;
                return (
                  <tr key={feature}>
                    <th scope="row" style={{ textAlign: 'left', padding: '14px 22px', fontWeight: 500, color: '#CBD5E1', borderBottom: last ? undefined : '1px solid rgba(255, 255, 255, 0.06)' }}>{feature}</th>
                    {vals.map((val, i) => (
                      <td key={i} style={{ ...cell(last), background: i === 1 ? TONE.accentSoft : undefined, color: val === 'None' ? '#94A3B8' : undefined }}>{show(val, r === 0)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export const PRICING_FAQ: FaqItem[] = [
  ['What is a phone session?', 'One real Android phone run at one grid point: the phone’s GPS set there, the search recorded on video, and the page and AI Overview saved. A 3×3 scan is 9 phone sessions, a 5×5 is 25, a 7×7 is 49 and a 9×9 is 81, scheduled or Scan Now. Points you choose to skip, over water or empty land, aren’t charged.'],
  ['How does the graduated pricing work?', `Each bracket’s price applies only to the clients inside it. Twelve clients on Command cost 9 × ${usd(LINES.COMMAND.tiers[0].cents)} plus 3 × ${usd(LINES.COMMAND.tiers[1].cents)}: ${usd(lineCents('COMMAND', 12))} a month. Brackets count each seat type on its own.`],
  ['Can I choose when my scans run?', 'Yes. Pick the day and hour for each keyword, even 2 AM. If the business is closed at that hour we’ll tell you, because Google ranks closed businesses lower, so results can look worse than in the daytime. Keep each keyword at the same time every run and the weeks compare fairly.'],
  ['What’s the difference between Scheduled and Scan Now?', 'Only timing; both use one phone session a grid point. A scheduled scan runs as soon as the phones are free, or at a time you pick at least 2 hours ahead, and finishes within 3 hours of it. Scan Now jumps ahead of every scheduled scan: a 5×5 takes about 15 minutes.'],
  ['What happens to phone sessions I don’t use?', 'Unused seat sessions roll over for one month. Top-up sessions never expire. Prospect audits are valid for 90 days from purchase.'],
  ['Can my clients be on different seats?', 'Yes. Put each client on the seat it needs and move it up or down whenever you like.'],
  ['Is there a setup or onboarding fee?', 'No. You pay for your seats and anything extra you choose to buy, nothing else.'],
  ['Can I cancel?', 'Any time. A seat keeps working until the end of the month you paid for.'],
];
