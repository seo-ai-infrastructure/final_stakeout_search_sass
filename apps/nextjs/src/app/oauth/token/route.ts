import { tokenRequest } from '@/lib/oauth';
import { formOf, notHere, oauthError, originOf, preflight, reply } from '@/lib/oauthHttp';

export const dynamic = 'force-dynamic';

/**
 * POST /oauth/token (application/x-www-form-urlencoded, or JSON): swaps a one-time code for an
 * access token and a refresh token, or a refresh token for a new pair. A refresh token is good
 * once; the one it is swapped for replaces it.
 */
export async function POST(req: Request) {
  try {
    const origin = originOf(req);
    if (!origin) return notHere();
    return reply(await tokenRequest(req, await formOf(req), origin));
  } catch (e) {
    return oauthError(e, 'token');
  }
}
export const OPTIONS = preflight;
