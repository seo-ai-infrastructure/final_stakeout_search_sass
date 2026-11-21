import { InputError } from '@stakeout/core/grid';

/**
 * The white-label services and their order forms: prices, who can see them, and the checks on
 * what an agency fills in. Kept free of the database so it can be tested on its own.
 */

export type ServiceType = 'citation_sync' | 'traffic_boost';
/** A service card shows either a short blurb or a list of what is included, each with a note. */
export type Service = { type: ServiceType; name: string; cents: number; monthly: boolean; resale: string; blurb?: string; includes?: { title: string; note: string }[] };
export const SERVICES: Record<ServiceType, Service> = {
  citation_sync: {
    type: 'citation_sync',
    name: 'Local & AI-Trusted Directory Build (100 Manual Citations)',
    cents: 19700,
    monthly: false,
    resale: '$397–$500',
    includes: [
      { title: 'Pre-Build Citation Audit & Existing Listing Check', note: 'verifies existing listings first so no new duplicates are created' },
      { title: '100 Manual High-Authority, Niche & Local Directory Submissions', note: 'rich media included: logo, photos, hours, categories & unique descriptions' },
      { title: 'Indexing Pass Included', note: 'pushes new live profile URLs for faster search & AI discovery' },
      { title: 'Unbranded White-Label Report + Full Account Logins', note: 'delivered in 7–10 business days—your client owns every listing forever, zero Yext-style lock-in' },
    ],
  },
  traffic_boost: {
    type: 'traffic_boost',
    name: 'Outer-Ring Local Traffic & Pin Boost',
    cents: 29700,
    monthly: true,
    resale: '$497–$697/mo',
    blurb: 'Turnkey Google Maps, YouTube Mobile and Discover campaigns geo-fenced to the client’s weak outer-ring scan areas and custom search-intent keywords. Media spend included.',
  },
};
export const isService = (v: unknown): v is ServiceType => v === 'citation_sync' || v === 'traffic_boost';
/** awaiting_payment is never shown: it is a checkout that was opened and not (yet) paid. */
export const STATUSES = ['awaiting_payment', 'intake_submitted', 'live', 'completed', 'paused'] as const;
export type Status = (typeof STATUSES)[number];

/** Who can open White-Label Services: admins only, until it opens to agencies. */
export const servicesOpen = (u: { role: string }) => u.role === 'ADMIN';
export function servicesGate(u: { role: string }) {
  if (!servicesOpen(u)) throw new InputError('White-Label Services is not open on this account yet.', 403);
}

export const line = (v: unknown, max = 300) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const block = (v: unknown, max = 3000) => (typeof v === 'string' ? v.replace(/\r/g, '').trim().slice(0, max) : '');
const list = (v: unknown, max = 40) => [...new Set((Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\n]/) : []).map((x) => line(x, 120)).filter(Boolean))].slice(0, max);
export const httpUrl = (v: string) => /^https?:\/\/\S+$/i.test(v);

export type CitationIntake = { business: string; address: string; phone: string; website: string; category: string; hours: string; description: string; logo: string; photos: string[]; oldNap: string };
export type TrafficIntake = { business: string; zips: string[]; keywords: string[]; destination: 'gbp' | 'landing'; url: string };

/** How many photos a citation build takes, and how long its base description can be. */
export const PHOTO_MAX = 10;
export const DESCRIPTION_CAP = 2000;

/** A public https link: all a directory can take a photo from. */
export function publicLink(v: string): boolean {
  if (v.length > 2000) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname.includes('.') && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(u.hostname);
  } catch {
    return false;
  }
}

function photoLinks(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\s+/) : [];
  const links = [...new Set(raw.map((x) => line(x, 2100)).filter(Boolean))];
  if (links.some((x) => !publicLink(x))) throw new InputError('Each photo should be a public link starting with https://.');
  if (links.length > PHOTO_MAX) throw new InputError(`Give up to ${PHOTO_MAX} photos.`);
  return links;
}

/** A photo or video on a Google listing, as Google lists it. */
export type MediaItem = { mediaFormat?: string; locationAssociation?: { category?: string }; googleUrl?: string; thumbnailUrl?: string; createTime?: string };

/**
 * The listing's own photos to send with a citation build: the cover first, then the newest, up to
 * PHOTO_MAX, leaving out videos, the logo and whichever picture is already the logo.
 */
export function pickPhotos(items: MediaItem[], logo: string | null): { url: string; thumb: string }[] {
  const photos = items.filter((m) => m.googleUrl && publicLink(m.googleUrl) && (m.mediaFormat ?? 'PHOTO') === 'PHOTO' && m.locationAssociation?.category !== 'LOGO' && m.googleUrl !== logo);
  const cover = (m: MediaItem) => (m.locationAssociation?.category === 'COVER' ? 0 : 1);
  photos.sort((a, b) => cover(a) - cover(b) || (b.createTime ?? '').localeCompare(a.createTime ?? ''));
  const out: { url: string; thumb: string }[] = [];
  for (const m of photos) {
    const url = m.googleUrl as string;
    if (out.some((p) => p.url === url)) continue;
    out.push({ url, thumb: m.thumbnailUrl && publicLink(m.thumbnailUrl) ? m.thumbnailUrl : url });
    if (out.length === PHOTO_MAX) break;
  }
  return out;
}

/** The order form, checked and tidied. */
export function intakeOf(type: ServiceType, raw: unknown): CitationIntake | TrafficIntake {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (type === 'citation_sync') {
    const i: CitationIntake = {
      business: line(b.business),
      address: line(b.address, 400),
      phone: line(b.phone, 60),
      website: line(b.website),
      category: line(b.category, 120),
      hours: block(b.hours, 600),
      description: block(b.description, DESCRIPTION_CAP),
      logo: line(b.logo, 1000),
      photos: photoLinks(b.photos),
      oldNap: block(b.oldNap),
    };
    if (i.business.length < 2) throw new InputError('Give the business name as it shows on Google.');
    if (i.address.length < 5) throw new InputError('Give the business address.');
    if (i.phone.replace(/\D/g, '').length < 7) throw new InputError('Give the business phone number.');
    if (i.website && !httpUrl(i.website)) throw new InputError('The website should start with https://.');
    return i;
  }
  const i: TrafficIntake = {
    business: line(b.business),
    zips: list(b.zips).filter((z) => /^\d{5}$/.test(z)),
    keywords: list(b.keywords, 25),
    destination: b.destination === 'landing' ? 'landing' : 'gbp',
    url: line(b.url, 1000),
  };
  if (i.business.length < 2) throw new InputError('Give the business name.');
  if (!i.zips.length) throw new InputError('Give at least one five-digit ZIP code to target.');
  if (!i.keywords.length) throw new InputError('Give at least one keyword.');
  if (!httpUrl(i.url)) throw new InputError(i.destination === 'landing' ? 'Give the landing page address, starting with https://.' : 'Give the Google listing’s Maps link, starting with https://.');
  return i;
}

/** The order form as lines of an email. */
export function intakeLines(type: string, i: Record<string, unknown>): string[] {
  const s = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).trim() || '(not given)';
  if (type === 'citation_sync') {
    const photos = Array.isArray(i.photos) ? i.photos.map((p) => String(p ?? '').trim()).filter(Boolean) : [];
    return [
      `Business: ${s(i.business)}`,
      `Address: ${s(i.address)}`,
      `Phone: ${s(i.phone)}`,
      `Website: ${s(i.website)}`,
      `Category: ${s(i.category)}`,
      `Hours: ${s(i.hours)}`,
      `Description: ${s(i.description)}`,
      `Logo: ${s(i.logo)}`,
      ...(photos.length ? photos.map((p, n) => `Photo ${n + 1}: ${p}`) : ['Photos: (not given)']),
      `Existing listings or old NAP variations to watch for during audit: ${s(i.oldNap)}`,
    ];
  }
  return [`Business: ${s(i.business)}`, `ZIP codes: ${s(i.zips)}`, `Keywords: ${s(i.keywords)}`, `Destination: ${i.destination === 'landing' ? 'local landing page' : 'promoted Google listing'}, ${s(i.url)}`];
}
