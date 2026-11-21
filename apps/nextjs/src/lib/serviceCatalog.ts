import { InputError } from '@stakeout/core/grid';

/**
 * The white-label services and their order forms: prices, who can see them, and the checks on
 * what an agency fills in. Kept free of the database so it can be tested on its own.
 */

export type ServiceType = 'citation_sync' | 'traffic_boost';
export type Service = { type: ServiceType; name: string; cents: number; monthly: boolean; resale: string; blurb: string };
export const SERVICES: Record<ServiceType, Service> = {
  citation_sync: {
    type: 'citation_sync',
    name: 'Local & AI Citation Sync',
    cents: 19700,
    monthly: false,
    resale: '$397–$500',
    blurb: '50+ verified local, GPS, voice and AI-crawled directories, duplicate suppression, an accelerated indexing pass, and an unbranded live-URL proof sheet in 7–10 business days.',
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

export type CitationIntake = { business: string; address: string; phone: string; website: string; category: string; hours: string; logo: string; oldNap: string };
export type TrafficIntake = { business: string; zips: string[]; keywords: string[]; destination: 'gbp' | 'landing'; url: string };

/** The order form, checked and tidied. */
export function intakeOf(type: ServiceType, raw: unknown): CitationIntake | TrafficIntake {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (type === 'citation_sync') {
    const i: CitationIntake = { business: line(b.business), address: line(b.address, 400), phone: line(b.phone, 60), website: line(b.website), category: line(b.category, 120), hours: block(b.hours, 600), logo: line(b.logo, 1000), oldNap: block(b.oldNap) };
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
  if (type === 'citation_sync')
    return [`Business: ${s(i.business)}`, `Address: ${s(i.address)}`, `Phone: ${s(i.phone)}`, `Website: ${s(i.website)}`, `Category: ${s(i.category)}`, `Hours: ${s(i.hours)}`, `Logo: ${s(i.logo)}`, `Old NAP / duplicates to suppress: ${s(i.oldNap)}`];
  return [`Business: ${s(i.business)}`, `ZIP codes: ${s(i.zips)}`, `Keywords: ${s(i.keywords)}`, `Destination: ${i.destination === 'landing' ? 'local landing page' : 'promoted Google listing'}, ${s(i.url)}`];
}
