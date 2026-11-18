/**
 * A client's website in Search Console and Analytics: which Search Console property covers a
 * website, and two periods of numbers compared. Pure logic; the Google calls live in the web app.
 */

const host = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * The Search Console property to read for a website, from the properties the Google login can see.
 * A domain property (sc-domain:) covering the site wins; then a URL property on the same host,
 * https before http. A site on a subdomain is covered by its parent's domain property. Unverified
 * properties cannot be read and are skipped. Null when none covers the site.
 */
export function propertyFor(website: string, sites: { siteUrl: string; permissionLevel?: string }[]): string | null {
  const h = host(website);
  if (!h) return null;
  let best: { url: string; score: number } | null = null;
  for (const s of sites) {
    if (s.permissionLevel === 'siteUnverifiedUser') continue;
    let score = 0;
    if (s.siteUrl.startsWith('sc-domain:')) {
      const d = s.siteUrl.slice(10).toLowerCase();
      if (h === d) score = 100;
      else if (h.endsWith('.' + d)) score = 90 - (h.length - d.length);
    } else if (host(s.siteUrl) === h) {
      // A URL property on a sub-path only covers that path: lower than one on the whole host.
      const path = (() => { try { return new URL(s.siteUrl).pathname; } catch { return '/'; } })();
      score = (s.siteUrl.startsWith('https://') ? 60 : 50) - (path !== '/' ? 20 : 0);
    }
    if (score > 0 && (!best || score > best.score)) best = { url: s.siteUrl, score };
  }
  return best?.url ?? null;
}

/** The two date ranges compared: the `days` ending `lag` days ago (Google's data runs behind), and the `days` before. */
export function periods(today: Date, days = 28, lag = 3) {
  const day = (ago: number) => new Date(today.getTime() - ago * 86400000).toISOString().slice(0, 10);
  return { recent: { from: day(lag + days - 1), to: day(lag) }, before: { from: day(lag + days * 2 - 1), to: day(lag + days) }, days };
}

/** Percent change, or null when there is nothing to compare with. */
export function pct(now: number, before: number): number | null {
  return before ? Math.round(((now - before) / before) * 100) : null;
}
