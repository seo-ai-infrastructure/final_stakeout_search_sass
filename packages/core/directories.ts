/**
 * Directories, review sites, social networks and publishers. An AI answer cites them, but they are
 * never a business's own website: they are listed apart and never score for any business. No
 * imports: safe for the browser and the worker alike.
 */
const DIRECTORIES = new Set([
  // Reviews and local listings
  'yelp.com', 'bbb.org', 'angi.com', 'angieslist.com', 'homeadvisor.com', 'thumbtack.com', 'houzz.com', 'porch.com',
  'nextdoor.com', 'yellowpages.com', 'yp.com', 'superpages.com', 'manta.com', 'mapquest.com', 'chamberofcommerce.com',
  'bizapedia.com', 'buildzoom.com', 'expertise.com', 'threebestrated.com', 'bestprosintown.com', 'birdeye.com',
  'trustpilot.com', 'tripadvisor.com', 'foursquare.com', 'groupon.com', 'networx.com', 'fixr.com', 'homeguide.com',
  'modernize.com', 'bark.com', 'taskrabbit.com', 'handy.com', 'dexknows.com', 'citysearch.com', 'local.com', 'hotfrog.com',
  'brownbook.net', 'cylex.us.com', 'n49.com', 'merchantcircle.com', 'alignable.com', 'bestplumbers.com', 'consumeraffairs.com',
  'clutch.co', 'upcity.com', 'birdeye.com', 'podium.com', 'judysbook.com', 'showmelocal.com', 'loc8nearme.com', 'cityfos.com',
  'bestcompaniesaz.com', 'top10.com', 'thebestof.com', 'bestthings.com',
  // Legal
  'avvo.com', 'superlawyers.com', 'findlaw.com', 'justia.com', 'lawyers.com', 'martindale.com', 'nolo.com', 'lawinfo.com',
  'attorneys.com', 'legalmatch.com', 'lawyer.com', 'all-injuries.com', 'bestlawyers.com', 'expertise.com', 'lawlink.com',
  // Health
  'healthgrades.com', 'vitals.com', 'zocdoc.com', 'webmd.com', 'ratemds.com', 'castleconnolly.com', 'doximity.com',
  'sharecare.com', 'realself.com', 'opencare.com', 'wellness.com', 'caredash.com', 'md.com', 'mayoclinic.org',
  'clevelandclinic.org', 'medlineplus.gov', 'hopkinsmedicine.org', 'orthoinfo.aaos.org',
  // Social, video, forums, reference
  'facebook.com', 'instagram.com', 'linkedin.com', 'x.com', 'twitter.com', 'tiktok.com', 'youtube.com', 'pinterest.com',
  'reddit.com', 'quora.com', 'wikipedia.org', 'medium.com',
  // Publishers and guides
  'forbes.com', 'usnews.com', 'nerdwallet.com', 'bobvila.com', 'thisoldhouse.com', 'familyhandyman.com', 'bankrate.com',
  'investopedia.com', 'patch.com', 'glassdoor.com', 'indeed.com', 'apple.com', 'bing.com', 'waze.com',
  // Platforms a business's page can sit on: they belong to nobody in particular
  'squareup.com', 'square.site', 'wixsite.com', 'godaddysites.com', 'linktr.ee', 'weebly.com', 'wordpress.com', 'blogspot.com',
  'carrd.co', 'sites.google.com', 'business.site',
]);

/** Whether a cited site is a directory, review site or publisher ("attorneys.superlawyers.com" too). */
export function isDirectory(domain: string | null | undefined): boolean {
  const d = (domain ?? '').trim().toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  if (!d) return false;
  const labels = d.split('.');
  for (let i = 0; i < labels.length - 1; i++) if (DIRECTORIES.has(labels.slice(i).join('.'))) return true;
  return false;
}
