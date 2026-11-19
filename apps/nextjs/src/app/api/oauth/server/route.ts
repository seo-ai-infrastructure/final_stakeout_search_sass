import { authorizationServer } from '@stakeout/core/oauth';
import { notHere, originOf, preflight, reply } from '@/lib/oauthHttp';

export const dynamic = 'force-dynamic';

/** GET /.well-known/oauth-authorization-server: where an app registers, sends the person, and swaps a code for tokens (RFC 8414). */
export function GET(req: Request) {
  const origin = originOf(req);
  return origin ? reply(authorizationServer(origin), 200, { 'Cache-Control': 'public, max-age=300' }) : notHere();
}
export const OPTIONS = preflight;
