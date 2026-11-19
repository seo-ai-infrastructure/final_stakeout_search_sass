import { OAuthFailure, originOf } from '@/lib/oauth';

/**
 * How the OAuth endpoints answer. They are called by apps, some of them from a browser on another
 * site, with no cookies involved: any origin may read the answers, and nothing is ever cached.
 */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version', 'Access-Control-Max-Age': '86400' };
export const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Pragma: 'no-cache', ...CORS, ...headers } });
export const preflight = () => new Response(null, { status: 204, headers: CORS });
export const notHere = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

/** An OAuth error as its own JSON shape; anything unexpected is logged and reported as a server error. */
export function oauthError(e: unknown, where: string) {
  if (e instanceof OAuthFailure) return reply({ error: e.error, error_description: e.description }, e.status, e.status === 401 ? { 'WWW-Authenticate': 'Basic realm="oauth"' } : {});
  console.error('[oauth] ' + where + ' failed', e instanceof Error ? e.message : e);
  return reply({ error: 'server_error', error_description: 'Stakeout could not do that right now. Try again in a minute.' }, 500);
}

/** A request's fields, whether it was sent as a form (what OAuth asks for) or as JSON. */
export async function formOf(req: Request): Promise<URLSearchParams> {
  const type = (req.headers.get('content-type') ?? '').toLowerCase();
  const raw = await req.text();
  if (raw.length > 20000) throw new OAuthFailure('invalid_request', 'The request is too large.');
  if (type.includes('application/json')) {
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      return new URLSearchParams(Object.entries(j ?? {}).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, v as string]));
    } catch {
      throw new OAuthFailure('invalid_request', 'The request is not valid JSON.');
    }
  }
  const form = new URLSearchParams(raw);
  // A field sent twice is refused: which one counts would be a guess.
  for (const k of new Set(form.keys())) if (form.getAll(k).length > 1 && k !== 'resource') throw new OAuthFailure('invalid_request', 'The field ' + k + ' was sent more than once.');
  return form;
}
export { originOf };
