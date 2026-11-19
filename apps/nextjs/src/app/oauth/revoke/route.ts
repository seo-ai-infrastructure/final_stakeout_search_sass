import { revokeRequest } from '@/lib/oauth';
import { formOf, notHere, oauthError, originOf, preflight } from '@/lib/oauthHttp';

export const dynamic = 'force-dynamic';

/** POST /oauth/revoke: an app signs itself out (RFC 7009). The answer is the same whether or not the token was known. */
export async function POST(req: Request) {
  try {
    if (!originOf(req)) return notHere();
    await revokeRequest(req, await formOf(req));
    return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
  } catch (e) {
    return oauthError(e, 'revoke');
  }
}
export const OPTIONS = preflight;
