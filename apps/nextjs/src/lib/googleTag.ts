/**
 * Google Ads measurement. NEXT_PUBLIC_GOOGLE_ADS_ID ("AW-…") and NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL
 * come from the purchase conversion's tag in Google Ads (its send_to is "AW-…/label"). While the ID is
 * unset nothing loads at all; both are read at build time, so setting them needs a redeploy.
 *
 * Where it loads: the public pages people land on from an ad (so the ad click is remembered), and in
 * the app only at the moment a payment is confirmed. Never on share links, password links or the rest
 * of the app, whose addresses can carry private tokens. Ad personalization signals are off: the tag
 * counts sign-ups and purchases from ads, it doesn't build audiences (the privacy policy says so).
 */
export const GOOGLE_ADS_ID = (process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? '').trim();
export const PURCHASE_LABEL = (process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL ?? '').trim();
export const adsReady = () => /^AW-\d{5,15}$/.test(GOOGLE_ADS_ID);

/** The public pages an ad can land on. */
const AD_LANDING = ['/', '/pricing', '/vs-scraper-credits', '/truth', '/demo', '/privacy', '/terms'];
export const isAdLanding = (path: string) => AD_LANDING.some((p) => (p === '/' ? path === '/' : path === p || path.startsWith(p + '/')));

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let configured = false;

/** Loads Google's tag once; a page view goes with it only on an ad landing page. */
export function loadGoogleTag(pageView: boolean): Gtag | null {
  if (!adsReady() || typeof window === 'undefined') return null;
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    // gtag.js reads the Arguments object itself, so this is Google's own snippet as written.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('js', new Date());
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GOOGLE_ADS_ID);
    document.head.appendChild(s);
  }
  if (!configured) {
    configured = true;
    window.gtag('config', GOOGLE_ADS_ID, { send_page_view: pageView, allow_ad_personalization_signals: false });
  }
  return window.gtag;
}

/**
 * A paid checkout, as a Google Ads purchase conversion: its amount, and the Stripe checkout as the
 * transaction ID, so Google counts it once however often the page reports it. Free checkouts (a
 * promotion code covering the price) and refunded ones aren't sent.
 */
export function trackPurchase(p: { id: string; cents: number }) {
  if (!PURCHASE_LABEL || !(p.cents > 0) || !p.id) return;
  const gtag = loadGoogleTag(false);
  if (!gtag) return;
  gtag('event', 'conversion', { send_to: GOOGLE_ADS_ID + '/' + PURCHASE_LABEL, value: p.cents / 100, currency: 'USD', transaction_id: p.id });
}
