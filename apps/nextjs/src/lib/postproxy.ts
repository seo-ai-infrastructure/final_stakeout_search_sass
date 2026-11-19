import { InputError } from '@stakeout/core/grid';

/**
 * Postproxy: the service our Google Business Profile reads and edits go through. It holds the
 * Google approval; we hold one API key (POSTPROXY_API_KEY, set on Vercel only).
 */
const BASE = 'https://api.postproxy.dev';

export const postproxyConfigured = () => Boolean(process.env.POSTPROXY_API_KEY);

/** What went wrong, in words an admin can act on, from a failed Postproxy response. */
export function postproxyProblem(status: number, body: unknown, retryAfter: string | null): string {
  const said = typeof (body as { error?: unknown })?.error === 'string' ? String((body as { error: string }).error).slice(0, 400) : '';
  if (status === 401) return 'Postproxy rejected the API key. Check POSTPROXY_API_KEY on Vercel.';
  // The service's own plan limit (profile groups, for one) comes back as a refusal too: it is not Google's.
  if (status === 403 && /limit reached|upgrade/i.test(said)) return 'Postproxy plan limit: ' + said;
  if (status === 403) return 'Google refused this for the connected account.' + (said ? ' ' + said : '');
  if (status === 404) return 'This location is not reachable from the connected Google account.';
  if (status === 429) return 'Google is rate-limiting this profile. Try again' + (retryAfter ? ` in ${retryAfter} seconds.` : ' in a minute.');
  if (status === 422 || status === 400) return said || 'Google rejected the request.';
  return 'Postproxy is not responding (' + status + ').' + (said ? ' ' + said : '');
}

export async function postproxy<T = unknown>(
  path: string,
  o: { method?: 'GET' | 'PATCH' | 'POST' | 'DELETE'; query?: Record<string, string | undefined>; body?: unknown } = {},
): Promise<T> {
  const key = process.env.POSTPROXY_API_KEY;
  if (!key) throw new InputError('Postproxy is not set up: add POSTPROXY_API_KEY on Vercel.', 503);
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(o.query ?? {})) if (v) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: o.method ?? 'GET',
    headers: { Authorization: 'Bearer ' + key, ...(o.body ? { 'Content-Type': 'application/json' } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new InputError(postproxyProblem(res.status, body, res.headers.get('retry-after')), res.status === 429 ? 429 : 502);
  return body as T;
}

/** A location's path under one connected profile. */
export const gbpPath = (profileId: string, what: string) => '/api/profiles/' + encodeURIComponent(profileId) + '/google_business/' + what;

/** Google's category search by name. A name of several words has to be quoted, or Google refuses the search. */
export const categoryFilter = (name: string) => 'displayName=' + (/\s/.test(name.trim()) ? '"' + name.trim().replace(/"/g, '') + '"' : name.trim());
