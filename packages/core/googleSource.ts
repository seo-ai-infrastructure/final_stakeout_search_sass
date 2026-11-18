/* No imports: safe for the browser (report pages) and the worker alike. */

/**
 * A cited source that is Google itself: google.com in any form (an AI Overview links each business
 * it names to its Google profile, Maps or Search), Google's short links (g.page, goo.gl, g.co,
 * share.google), or a source named "Google ..." ("Google", "Google Maps"). Never counted as a
 * website the AI cited: the profile is the business itself, not a separate source.
 */
export function isGoogleSource(source: string | null | undefined): boolean {
  const t = (source ?? '').trim().toLowerCase();
  if (!t) return false;
  // A name rather than an address: "Google", "Google Maps", "Google Business Profile".
  if (!/[./]/.test(t)) return /^google\b/.test(t);
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(t) ? t : 'https://' + t).hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
  return /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host) || /(^|\.)(g\.page|goo\.gl|g\.co|share\.google)$/.test(host);
}
