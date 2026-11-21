'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BONUS_POINTS, DEMO_REPORT_URL, PROMO, PROSPECT_PACKS, WELCOME, usd } from '@/lib/pricing';

/** The pieces the home and pricing pages share: colors, links, icons, the header, the footer and the offer bar. */

export const ACCENT = '#FF5500';
export const TONE = { accent: ACCENT, accentSoft: ACCENT + '1F', accentLine: ACCENT + '66', accentGlow: ACCENT + '26' };
export const MONO = "'JetBrains Mono', ui-monospace, monospace";

const signUp = (next: string) => '/login?mode=register&next=' + encodeURIComponent(next);

/** Where the buttons go. A new visitor creates an account first, then lands on the right page of the app. */
export const HREF = {
  /** The $5 first audit: the points dialog opens on it, on the new-scan page. */
  firstAudit: signUp('/new-scan?buy=welcome'),
  /** Seats are bought on the Plan and billing page. */
  seats: signUp('/profiles?tab=plan'),
  /** A prospect audit pack, by its price list key. */
  prospects: (key: string) => signUp('/scans?buy=' + key),
  login: '/login',
  pricing: '/pricing',
  /** A real report anyone can open (Lakeland, FL, 5×5, 17 Nov 2026). */
  report: DEMO_REPORT_URL,
  /** The 7×7 scan the rank-tracker comparison is drawn from (Lakeland, FL, 15 Nov 2026). */
  sevenGrid: '/share/432807474370d4d4b14e2bc306975ceac268a3f055f93375',
  /** The hero point's own recording (point 5,5, 17 Nov 2026). */
  recording: '/api/media/hero',
  demo: '/demo',
  agency: '/agency',
  truth: '/truth',
  privacy: '/privacy',
  terms: '/terms',
  support: 'mailto:support@stakeoutsearch.com',
};

/** How many 5×5 Scan Now audits the Black Friday bonus buys. */
const BONUS_AUDITS = BONUS_POINTS / WELCOME.credits;
const FIVE_AUDITS = PROSPECT_PACKS.find((p) => p.audits === BONUS_AUDITS);

export function Check({ size = 18, top = 2 }: { size?: number; top?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', marginTop: top }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
export function Yes() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Included" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
export function No() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.6" strokeLinecap="round" role="img" aria-label="Not included" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M6 12h12" />
    </svg>
  );
}
export function Arrow({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </svg>
  );
}
export function Play({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15l12.5-7.5z" />
    </svg>
  );
}

function Wordmark({ size }: { size: number }) {
  return (
    <span style={{ fontWeight: 800, fontSize: size, lineHeight: 1.2, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
      STAKEOUT <span style={{ color: '#E8590C' }}>SEARCH</span>
    </span>
  );
}

/** The bar above the header: Black Friday while it lasts, then the $5 first audit. */
export function OfferBanner({ live, href }: { live: boolean; href: string }) {
  return (
    <a href={href} style={{ display: 'block', background: '#1A0F08', borderBottom: '1px solid rgba(255, 85, 0, 0.35)', color: '#FFD9C2', textAlign: 'center', padding: '11px clamp(16px, 2vw, 24px)', fontSize: 14, lineHeight: 1.5, fontWeight: 500 }}>
      {live ? (
        <>
          <span style={{ color: ACCENT, fontWeight: 700 }}>{PROMO.name}:</span> start your first seat by {PROMO.endsText} and get {BONUS_AUDITS} prospect audits free
          {FIVE_AUDITS ? ` (a ${usd(FIVE_AUDITS.cents)} value)` : ''}. Your first 5×5 audit is {usd(WELCOME.cents)} →
        </>
      ) : (
        <>
          <span style={{ color: ACCENT, fontWeight: 700 }}>First 5×5 real-device audit: {usd(WELCOME.cents)}.</span> It comes off your first month on any seat →
        </>
      )}
    </a>
  );
}

const NAV: [string, string][] = [
  ['real-vs-reported', 'Real vs. Reported'],
  ['ai-overviews', 'AI Overviews'],
  ['google-listings', 'GBP & Social Command'],
  ['watchdog', 'Listing Watchdog'],
];

const ctaSmall = { display: 'inline-flex', alignItems: 'center', minHeight: 44, boxSizing: 'border-box', background: ACCENT, color: '#0B1017', fontWeight: 700, padding: '10px 18px', borderRadius: 10, fontSize: 14, lineHeight: 1.3, whiteSpace: 'nowrap' } as const;

/** The sticky header. On the home page its links scroll; elsewhere they lead to the home page. */
export function SiteNav({ page, onWatchdog }: { page: 'home' | 'pricing'; onWatchdog?: () => void }) {
  const [open, setOpen] = useState(false);
  const home = page === 'home';
  const links = NAV.map(([id, label]) => ({
    id,
    label,
    href: (home ? '' : '/') + '#' + id,
    onClick: id === 'watchdog' && onWatchdog ? (e: React.MouseEvent) => { e.preventDefault(); setOpen(false); onWatchdog(); } : () => setOpen(false),
  }));
  const pricingLink = { padding: '13px 0', ...(page === 'pricing' ? { color: '#F1F5F9', fontWeight: 700, boxShadow: `inset 0 -2px 0 ${ACCENT}` } : {}) };
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(11, 16, 23, 0.94)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '8px clamp(16px, 2vw, 24px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px 28px' }}>
        <a href={home ? '#top' : '/'} aria-label="Stakeout Search home" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
          <img src="/brand/stakeout-mark.png" alt="" width={34} height={34} style={{ width: 34, height: 34 }} />
          <Wordmark size={18} />
        </a>
        <nav aria-label="Main" className="so-wide" style={{ flex: '1 1 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 20px', fontSize: 14, lineHeight: 1.4, color: '#CBD5E1' }}>
          {links.map((l) => (
            <a key={l.id} href={l.href} onClick={l.onClick} style={{ padding: '13px 0' }}>{l.label}</a>
          ))}
          <a href={HREF.pricing} aria-current={page === 'pricing' ? 'page' : undefined} style={pricingLink}>Pricing</a>
        </nav>
        <div className="so-wide" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href={HREF.login} style={{ padding: '13px 14px', fontSize: 14, lineHeight: 1.4, color: '#CBD5E1' }}>Log in</a>
          <a className="so-btn" href={HREF.firstAudit} style={ctaSmall}>Run your first scan — {usd(WELCOME.cents)}</a>
        </div>
        <button
          type="button"
          className="so-burger"
          aria-expanded={open}
          aria-controls="so-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen(!open)}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.16)', borderRadius: 10, color: '#F1F5F9' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      <nav id="so-menu" aria-label="Menu" className="so-menu" data-open={open} style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', padding: '8px clamp(16px, 2vw, 24px) 18px' }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', fontSize: 16, lineHeight: 1.4 }}>
          {links.map((l) => (
            <li key={l.id}>
              <a href={l.href} onClick={l.onClick} style={{ display: 'block', padding: '12px 0', color: '#CBD5E1' }}>{l.label}</a>
            </li>
          ))}
          <li>
            <a href={HREF.pricing} onClick={() => setOpen(false)} aria-current={page === 'pricing' ? 'page' : undefined} style={{ display: 'block', padding: '12px 0', color: page === 'pricing' ? '#F1F5F9' : '#CBD5E1', fontWeight: page === 'pricing' ? 700 : 400 }}>Pricing</a>
          </li>
          <li>
            <a href={HREF.login} style={{ display: 'block', padding: '12px 0', color: '#CBD5E1' }}>Log in</a>
          </li>
        </ul>
        <a className="so-btn" href={HREF.firstAudit} style={{ ...ctaSmall, marginTop: 10, width: '100%', justifyContent: 'center', minHeight: 48, fontSize: 16 }}>Run your first scan — {usd(WELCOME.cents)}</a>
      </nav>
    </header>
  );
}

/** The footer, with a line about where the page's numbers come from. */
export function SiteFoot({ note }: { note: ReactNode }) {
  const link = { padding: '13px 0' };
  return (
    <footer style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '40px clamp(16px, 2vw, 24px) 48px', display: 'flex', flexWrap: 'wrap', gap: '24px 48px', justifyContent: 'space-between' }}>
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/brand/stakeout-mark.png" alt="" width={28} height={28} style={{ width: 28, height: 28 }} />
            <Wordmark size={16} />
          </p>
          <p style={{ margin: '14px 0 0', fontSize: 13.5, lineHeight: 1.65, color: '#94A3B8', maxWidth: 580 }}>{note}</p>
          <p style={{ margin: '14px 0 0', fontSize: 12.5, lineHeight: 1.6, color: '#94A3B8' }}>© 2026 Marketing Divine LLC d/b/a Stakeout Search. Not affiliated with Google LLC.</p>
        </div>
        <nav aria-label="Footer" style={{ flex: '1 1 300px', display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: '0 22px', fontSize: 14, lineHeight: 1.4, color: '#CBD5E1' }}>
          <a href={HREF.pricing} style={link}>Pricing</a>
          <a href={HREF.demo} style={link}>Live demo</a>
          <a href={HREF.truth} style={link}>The truth about grids</a>
          <a href={HREF.agency} style={link}>Agency Rescue Sprints</a>
          <a href={HREF.privacy} style={link}>Privacy</a>
          <a href={HREF.terms} style={link}>Terms</a>
          <a href={HREF.login} style={link}>Log in</a>
          <a href={HREF.support} style={link}>support@stakeoutsearch.com</a>
        </nav>
      </div>
    </footer>
  );
}

export type FaqItem = [question: string, answer: ReactNode];

/** Questions and answers, one open at a time (the first to start with). */
export function Faq({ id, items, wide }: { id: string; items: FaqItem[]; wide?: boolean }) {
  const [open, setOpen] = useState(0);
  return (
    <section id={id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
      <div style={{ maxWidth: wide ? 900 : 920, margin: '0 auto', padding: wide ? 'clamp(64px, 8vw, 104px) clamp(16px, 2vw, 24px)' : 'clamp(56px, 7vw, 96px) clamp(16px, 2vw, 24px)' }}>
        <h2 style={{ margin: 0, fontWeight: 800, fontSize: wide ? 'clamp(32px, 3.6vw, 52px)' : 'clamp(30px, 3.2vw, 46px)', lineHeight: 1.12, letterSpacing: '-0.025em' }}>Questions</h2>
        <div style={{ marginTop: wide ? 32 : 28, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
          {items.map(([q, a], i) => {
            const on = i === open;
            return (
              <div key={q} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <h3 style={{ margin: 0, fontSize: 'inherit', lineHeight: 'inherit' }}>
                  <button
                    type="button"
                    id={`${id}-q${i + 1}`}
                    aria-expanded={on}
                    aria-controls={`${id}-a${i + 1}`}
                    onClick={() => setOpen(on ? -1 : i)}
                    style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 0', background: 'transparent', border: 'none', color: '#F1F5F9', fontFamily: 'inherit', fontSize: 17, lineHeight: 1.45, fontWeight: 600, textAlign: 'left' }}
                  >
                    <span>{q}</span>
                    <span aria-hidden="true" style={{ flex: 'none', width: 30, height: 30, borderRadius: 999, border: '1px solid rgba(255, 255, 255, 0.16)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1, color: ACCENT }}>{on ? '−' : '+'}</span>
                  </button>
                </h3>
                {on && (
                  <div id={`${id}-a${i + 1}`} role="region" aria-labelledby={`${id}-q${i + 1}`} style={{ padding: '0 48px 20px 0', fontSize: 15.5, lineHeight: 1.7, color: '#CBD5E1' }}>
                    {a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** The hero point's real screen recording, in a player over the page. */
export function RecordingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="so-dialog"
      aria-label="Screen recording of a real search"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: '#CBD5E1' }}>“emergency plumber near me” · point 5,5 · near Lakeland, FL · Nov 17, 2026</p>
        <button type="button" onClick={onClose} aria-label="Close the recording" style={{ flex: 'none', width: 40, height: 40, borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.2)', background: '#111823', color: '#F1F5F9', fontSize: 18, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ borderRadius: 28, border: '8px solid #1E2836', overflow: 'hidden', background: '#000' }}>
        {open && <video src={HREF.recording} controls autoPlay muted playsInline preload="metadata" style={{ display: 'block', width: '100%', aspectRatio: '9 / 16', maxHeight: '78vh', background: '#000' }} />}
      </div>
    </dialog>
  );
}
