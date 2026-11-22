import { pinAi } from './aiFlags';
/**
 * "Get listed here": the websites Google's AI Overview cited across a scan's points, turned into
 * a checklist. A site where a business can add or claim its own page (a directory, a review site,
 * a social profile) is something to act on; the rest are other businesses' and publishers' sites.
 * Pure rules: which sites are which, and how often each was cited.
 */

export type SiteKind = 'directory' | 'reviews' | 'social' | 'community' | 'booking';
export type KnownSite = { domain: string; name: string; kind: SiteKind; how: string; url: string };

const d = (domain: string, name: string, kind: SiteKind, how: string, url: string): KnownSite => ({ domain, name, kind, how, url });
const CLAIM = 'Claim or create the free business page', PROFILE = 'Create the business’s profile and link the website';

/** Sites a local business can get onto itself. `url` is where that starts. */
export const KNOWN_SITES: KnownSite[] = [
  d('yelp.com', 'Yelp', 'reviews', CLAIM, 'https://biz.yelp.com/'),
  d('bbb.org', 'Better Business Bureau', 'directory', 'Create the business profile (accreditation is optional)', 'https://www.bbb.org/get-listed'),
  d('angi.com', 'Angi', 'directory', CLAIM, 'https://www.angi.com/for-business'),
  d('homeadvisor.com', 'HomeAdvisor', 'directory', CLAIM, 'https://pro.homeadvisor.com/'),
  d('thumbtack.com', 'Thumbtack', 'directory', 'Create a pro profile', 'https://www.thumbtack.com/pro'),
  d('nextdoor.com', 'Nextdoor', 'community', 'Claim the free business page', 'https://business.nextdoor.com/'),
  d('facebook.com', 'Facebook', 'social', 'Create or complete the business Page', 'https://www.facebook.com/pages/create'),
  d('instagram.com', 'Instagram', 'social', PROFILE, 'https://business.instagram.com/'),
  d('youtube.com', 'YouTube', 'social', 'Create a channel and post videos that name the service and the town', 'https://www.youtube.com/'),
  d('linkedin.com', 'LinkedIn', 'social', 'Create the company page', 'https://www.linkedin.com/company/setup/new/'),
  d('tiktok.com', 'TikTok', 'social', PROFILE, 'https://www.tiktok.com/business/'),
  d('x.com', 'X', 'social', PROFILE, 'https://x.com/'),
  d('pinterest.com', 'Pinterest', 'social', PROFILE, 'https://business.pinterest.com/'),
  d('reddit.com', 'Reddit', 'community', 'Cannot be claimed: answer local questions honestly where the business is relevant', 'https://www.reddit.com/'),
  d('quora.com', 'Quora', 'community', 'Cannot be claimed: answer questions in the business’s field', 'https://www.quora.com/'),
  d('tripadvisor.com', 'Tripadvisor', 'reviews', CLAIM, 'https://www.tripadvisor.com/Owners'),
  d('trustpilot.com', 'Trustpilot', 'reviews', 'Claim the free business profile', 'https://business.trustpilot.com/'),
  d('yellowpages.com', 'Yellow Pages', 'directory', CLAIM, 'https://www.yellowpages.com/'),
  d('mapquest.com', 'MapQuest', 'directory', CLAIM, 'https://www.mapquest.com/'),
  d('foursquare.com', 'Foursquare', 'directory', CLAIM, 'https://foursquare.com/'),
  d('manta.com', 'Manta', 'directory', CLAIM, 'https://www.manta.com/'),
  d('chamberofcommerce.com', 'ChamberofCommerce.com', 'directory', CLAIM, 'https://www.chamberofcommerce.com/'),
  d('expertise.com', 'Expertise.com', 'directory', 'Apply to be reviewed for the town’s list', 'https://www.expertise.com/'),
  d('threebestrated.com', 'Three Best Rated', 'directory', 'Apply to be considered (they choose, at no cost)', 'https://threebestrated.com/'),
  d('porch.com', 'Porch', 'directory', CLAIM, 'https://pro.porch.com/'),
  d('houzz.com', 'Houzz', 'directory', 'Create a pro profile with project photos', 'https://www.houzz.com/for-pros'),
  d('bark.com', 'Bark', 'directory', 'Create a pro profile', 'https://www.bark.com/'),
  d('buildzoom.com', 'BuildZoom', 'directory', 'Claim the contractor profile', 'https://www.buildzoom.com/'),
  d('healthgrades.com', 'Healthgrades', 'reviews', 'Claim the provider profile', 'https://update.healthgrades.com/'),
  d('zocdoc.com', 'Zocdoc', 'booking', 'List the practice', 'https://www.zocdoc.com/join'),
  d('vitals.com', 'Vitals', 'reviews', 'Claim the provider profile', 'https://www.vitals.com/'),
  d('webmd.com', 'WebMD', 'directory', 'Claim the provider profile', 'https://doctor.webmd.com/'),
  d('realself.com', 'RealSelf', 'reviews', 'Claim the provider profile', 'https://www.realself.com/'),
  d('psychologytoday.com', 'Psychology Today', 'directory', 'Create a therapist profile', 'https://www.psychologytoday.com/'),
  d('avvo.com', 'Avvo', 'reviews', 'Claim the lawyer profile', 'https://www.avvo.com/'),
  d('justia.com', 'Justia', 'directory', 'Claim the free lawyer profile', 'https://www.justia.com/lawyers'),
  d('findlaw.com', 'FindLaw', 'directory', 'Claim the lawyer profile', 'https://lawyers.findlaw.com/'),
  d('lawyers.com', 'Lawyers.com', 'directory', 'Claim the lawyer profile', 'https://www.lawyers.com/'),
  d('martindale.com', 'Martindale-Hubbell', 'directory', 'Claim the lawyer profile', 'https://www.martindale.com/'),
  d('superlawyers.com', 'Super Lawyers', 'directory', 'Update the profile (selection is by nomination)', 'https://www.superlawyers.com/'),
  d('opentable.com', 'OpenTable', 'booking', 'List the restaurant', 'https://restaurant.opentable.com/'),
  d('doordash.com', 'DoorDash', 'booking', 'List the restaurant', 'https://get.doordash.com/'),
  d('ubereats.com', 'Uber Eats', 'booking', 'List the restaurant', 'https://merchants.ubereats.com/'),
  d('grubhub.com', 'Grubhub', 'booking', 'List the restaurant', 'https://get.grubhub.com/'),
  d('booksy.com', 'Booksy', 'booking', 'List the business for bookings', 'https://biz.booksy.com/'),
  d('vagaro.com', 'Vagaro', 'booking', 'List the business for bookings', 'https://www.vagaro.com/pro'),
  d('groupon.com', 'Groupon', 'directory', 'List an offer (they take a share of each sale)', 'https://www.groupon.com/merchant'),
  d('carfax.com', 'CARFAX', 'reviews', 'Claim the service shop page', 'https://www.carfax.com/'),
  d('cars.com', 'Cars.com', 'reviews', 'Claim the dealer or service page', 'https://www.cars.com/'),
  d('zillow.com', 'Zillow', 'directory', 'Create the agent profile', 'https://www.zillow.com/agent-resources/'),
  d('realtor.com', 'Realtor.com', 'directory', 'Claim the agent profile', 'https://www.realtor.com/'),
  d('care.com', 'Care.com', 'directory', 'Create the provider profile', 'https://www.care.com/'),
  d('theknot.com', 'The Knot', 'directory', 'List the wedding business', 'https://www.theknot.com/vendors'),
  d('weddingwire.com', 'WeddingWire', 'directory', 'List the wedding business', 'https://www.weddingwire.com/'),
  d('apple.com', 'Apple Maps', 'directory', 'Claim the place on Apple Business Connect', 'https://businessconnect.apple.com/'),
  d('bing.com', 'Bing Places', 'directory', 'Claim the listing (it can be imported from Google)', 'https://www.bingplaces.com/'),
];

/** A cited address as a bare site name: no scheme, path, port or "www.". Null when it is not one. */
export function siteOf(cited: unknown): string | null {
  if (typeof cited !== 'string') return null;
  const host = cited.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#:]/)[0].replace(/^(www|m|mobile)\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** The known site a host belongs to (yelp.com, or any page under it such as "biz.yelp.com"). */
export const knownSite = (host: string): KnownSite | null => KNOWN_SITES.find((s) => host === s.domain || host.endsWith('.' + s.domain)) ?? null;

/** Google's own pages are where the answer was shown, not somewhere to get listed. */
const isGoogle = (host: string) => /(^|\.)(google\.[a-z.]+|gstatic\.com|googleusercontent\.com|g\.co)$/.test(host);

export type CitedSite = { site: string; name: string; answers: number; share: number; known: KnownSite | null; own: boolean };
export type GetListed = {
  /** Points whose search showed an AI answer with at least one source. */
  answers: number;
  /** Sites the business can get onto, most cited first. */
  act: CitedSite[];
  /** Everything else that was cited: other businesses, publishers, "best of" lists. */
  others: CitedSite[];
  /** How many of the answers cited the business's own website (null when the website is not known). */
  ownAnswers: number | null;
};

/**
 * The checklist for one scan. Each point's AI answer counts a site once, however many of its
 * pages were cited. `website` is the business's own site, so its citations are counted apart.
 */
export function getListed(pins: { hasAiOverview?: boolean | null; aiCitations?: unknown; targetCitedInAi?: boolean | null; insights?: unknown }[], website?: string | null): GetListed {
  const own = siteOf(website ?? '');
  const isOwn = (site: string) => Boolean(own) && (site === own || site.endsWith('.' + own) || (own as string).endsWith('.' + site));
  const count = new Map<string, number>();
  let answers = 0;
  // The business's own website cited: by the flag "Website cited" (verified) where the answer was read
  // with the four flags, never where it could not be read, and on earlier points by its saved website.
  let ownCited = 0;
  let ownKnown = Boolean(own);
  for (const p of pins) {
    if (!p.hasAiOverview || !Array.isArray(p.aiCitations)) continue;
    const sites = new Set<string>();
    for (const c of p.aiCitations) {
      const host = siteOf(c);
      if (!host || isGoogle(host)) continue;
      sites.add(knownSite(host)?.domain ?? host);
    }
    if (!sites.size) continue;
    answers++;
    for (const s of sites) count.set(s, (count.get(s) ?? 0) + 1);
    const a = pinAi(p);
    if (a.state === 'parsed') {
      if (a.websiteCited === 'verified') {
        ownCited++;
        ownKnown = true;
      }
    } else if (a.state !== 'unparsed' && [...sites].some(isOwn)) ownCited++;
  }
  const rows: CitedSite[] = [...count].map(([site, n]) => {
    const known = knownSite(site);
    return { site, name: known?.name ?? site, answers: n, share: answers ? Math.round((n / answers) * 100) : 0, known, own: isOwn(site) };
  }).sort((a, b) => b.answers - a.answers || a.site.localeCompare(b.site));
  return {
    answers,
    act: rows.filter((r) => r.known && !r.own),
    others: rows.filter((r) => !r.known && !r.own),
    ownAnswers: ownKnown ? ownCited : null,
  };
}
