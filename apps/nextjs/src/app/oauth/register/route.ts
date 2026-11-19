import { limit, clientKey } from '@/lib/limits';
import { OAuthFailure, registerClient } from '@/lib/oauth';
import { notHere, oauthError, originOf, preflight, reply } from '@/lib/oauthHttp';

export const dynamic = 'force-dynamic';

/**
 * POST /oauth/register: an app registers itself (RFC 7591). Kept for apps that do not yet
 * identify themselves by a metadata address. Registering gives no access to anything: a person
 * still has to sign in and approve the app.
 */
export async function POST(req: Request) {
  try {
    if (!originOf(req)) return notHere();
    const ip = clientKey(req);
    if (ip) await limit('oauth-register', ip, 30, 3600).catch(() => { throw new OAuthFailure('invalid_request', 'Too many registrations from this address. Try again later.', 429); });
    const raw = await req.text();
    if (raw.length > 20000) throw new OAuthFailure('invalid_client_metadata', 'The request is too large.');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new OAuthFailure('invalid_client_metadata', 'Send the client metadata as JSON.'); }
    return reply(await registerClient(body), 201);
  } catch (e) {
    return oauthError(e, 'register');
  }
}
export const OPTIONS = preflight;
