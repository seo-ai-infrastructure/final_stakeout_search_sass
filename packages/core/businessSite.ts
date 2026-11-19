/**
 * A business's own website, kept on a scan as a bare domain ("stuartsplumbing.com"), so the report
 * can tell when an AI answer cites the business's own site.
 */

/**
 * The domain in whatever was typed or read from a listing: a full link, a link with tracking
 * tags, "www." in front, capitals. Null when it is not a website's address.
 */
export function siteDomain(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const d = input.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^[^/@]*@/, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  return d.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d) ? d : null;
}

/** Two business names that are the same business as typed: capitals, spacing and punctuation aside. */
export const sameBusiness = (a: string, b: string) => {
  const n = (x: string) => x.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return Boolean(n(a)) && n(a) === n(b);
};
