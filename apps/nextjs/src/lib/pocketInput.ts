/**
 * The $1 pocket test's form, checked (no database here, so it can be tested alone): who to email,
 * what to search, the business to look for, and the exact spot the buyer is standing at.
 */
export type PocketInput = { email: string; keyword: string; business: string; lat: number; lng: number; placeLabel: string | null };

/** Inside the United States: the lower 48, Alaska or Hawaii (the phones search from US addresses only). */
export function inUnitedStates(lat: number, lng: number): boolean {
  const within = (s: number, n: number, w: number, e: number) => lat >= s && lat <= n && lng >= w && lng <= e;
  return within(24.4, 49.5, -125, -66.9) || within(51, 71.5, -170, -129.9) || within(18.9, 22.3, -160.3, -154.8);
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max + 1) : '');

/** The form as it will be used, or what is wrong with it (said to the visitor). */
export function checkPocketInput(b: Record<string, unknown>): PocketInput | { error: string } {
  const email = clean(b.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || email.endsWith('@internal.invalid')) return { error: 'Enter the email address to send your result to.' };
  const keyword = clean(b.keyword, 80);
  if (keyword.length < 2 || keyword.length > 80) return { error: 'Enter the search to test, such as “plumber near me”.' };
  const business = clean(b.business, 100);
  if (business.length < 2 || business.length > 100) return { error: 'Enter your business name as Google shows it, so we can find it in the results.' };
  const lat = Number(b.lat), lng = Number(b.lng);
  if (typeof b.lat !== 'number' || typeof b.lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return { error: 'Set where you are: use your current location or search for an address.' };
  if (!inUnitedStates(lat, lng)) return { error: 'The pocket test runs in the United States only for now.' };
  const placeLabel = clean(b.placeLabel, 120).slice(0, 120) || null;
  return { email, keyword, business, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeLabel };
}

/** Two paid pocket tests per email, IP and card every 30 days, so it stays a test and not a way around a plan. */
export const POCKET_LIMIT = 2;
export const POCKET_WINDOW_DAYS = 30;

/** The browser's own note of its paid tests (a cookie of their times): how many fall inside the window. */
export const POCKET_COOKIE = 'so_pocket';
export const pocketTimes = (cookie: string | undefined, now = Date.now()) =>
  (cookie ?? '').split('.').map(Number).filter((t) => Number.isInteger(t) && t > now / 1000 - POCKET_WINDOW_DAYS * 86400 && t <= now / 1000 + 60);

/** A short reference to quote to support (the result page's address carries a long secret instead). */
export const pocketRef = (id: string) => 'PT-' + id.slice(-6).toUpperCase();

/** Where a pocket test is, for the buyer: nothing bought yet, waiting for a phone, searching, done, or refunded. */
export type PocketStage = 'unpaid' | 'starting' | 'waiting' | 'searching' | 'done' | 'refunded';
export function pocketStage(o: { paid: boolean; refunded: boolean; scan: { status: string } | null; pin: { status: string; startedAt: Date | null } | null }): PocketStage {
  if (o.refunded) return 'refunded';
  if (!o.paid) return 'unpaid';
  if (!o.scan || !o.pin) return 'starting';
  if (o.pin.status === 'COMPLETED') return 'done';
  // A point that failed for good (the scan is over without it) is refunded by the caller.
  if (o.pin.status === 'FAILED' || ['FAILED', 'CANCELLED', 'PARTIAL', 'COMPLETED'].includes(o.scan.status)) return 'refunded';
  return o.pin.startedAt ? 'searching' : 'waiting';
}

const MILE_LAT = 1 / 69.0;

/** The standard 21-pin circle (a 5×5 without its corners), a mile between pins: every pin but the centre. */
export function circleAround(lat: number, lng: number): { lat: number; lng: number }[] {
  const mileLng = MILE_LAT / Math.cos((lat * Math.PI) / 180);
  const out: { lat: number; lng: number }[] = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const corner = (r === 0 || r === 4) && (c === 0 || c === 4);
      if (corner || (r === 2 && c === 2)) continue;
      out.push({ lat: lat + (2 - r) * MILE_LAT, lng: lng + (c - 2) * mileLng });
    }
  return out;
}
