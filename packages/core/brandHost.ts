/**
 * White-label domains: which hosts are ours, what a customer's domain may show, and how a typed
 * domain is cleaned. No imports, so the edge middleware can use it.
 */

/** Our own hosts: the app's address (with or without www), Vercel preview addresses, and local development. */
export function isPrimaryHost(host: string, appUrl: string | undefined = process.env.APP_URL): boolean {
  const h = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (!h || h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost') || h.endsWith('.vercel.app')) return true;
  // With no app address configured nothing can be told apart: treat every host as ours.
  if (!appUrl) return true;
  let app: string;
  try {
    app = new URL(appUrl).hostname.toLowerCase();
  } catch {
    return true;
  }
  const bare = (x: string) => x.replace(/^www\./, '');
  return bare(h) === bare(app);
}

/** The only paths a customer's domain serves: a shared report and what that page loads. */
export function allowedOnCustomDomain(pathname: string): boolean {
  return (
    /^\/share\/[^/]+\/?$/.test(pathname) ||
    /^\/api\/(share|evidence|proof|brand|census)\//.test(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  );
}

/**
 * A domain as typed by an admin ("https://Report.Example.com/") to its bare form
 * ("report.example.com"), or null when it is not a usable domain or is one of ours.
 */
export function cleanDomain(input: unknown, appUrl: string | undefined = process.env.APP_URL): string | null {
  const d = String(input ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  if (d.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) return null;
  return isPrimaryHost(d, appUrl ?? 'https://invalid.invalid') ? null : d;
}

/** The host a request arrived on, as the visitor typed it. */
export function hostOf(headers: { get(name: string): string | null }): string {
  return (headers.get('x-forwarded-host') ?? headers.get('host') ?? '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}
