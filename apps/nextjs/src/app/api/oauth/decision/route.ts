import { canonicalResource, challengeOk, redirectMatches } from '@stakeout/core/oauth';
import { getAuthenticatedUser, teamSession } from '@/lib/auth';
import { approve, clientOf, originOf, ticketOk, type Ask } from '@/lib/oauth';
import { answer } from '@/lib/oauthAsk';

export const dynamic = 'force-dynamic';
const page = (status: number, text: string) => new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/**
 * POST /api/oauth/decision: the Allow or Cancel on the approval page. It only counts when it
 * comes from that page (the ticket ties it to the signed-in person and to the exact request they
 * were shown), and the app and its callback are checked again before anyone is sent anywhere.
 */
export async function POST(req: Request) {
  const origin = originOf(req);
  if (!origin) return page(404, 'Not found');
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return page(401, 'Sign in and start again from the app.');
  // An app's access outlives a team member's seat: only the account owner connects apps.
  const team = await teamSession().catch(() => null);
  if (team && !team.paused) return page(403, 'Only the account owner can connect apps to this account. Ask them to connect it.');
  const f = await req.formData().catch(() => null);
  const s = (k: string) => { const v = f?.get(k); return typeof v === 'string' ? v : ''; };
  const ask: Ask = { clientId: s('client_id'), redirectUri: s('redirect_uri'), challenge: s('code_challenge'), resource: s('resource'), scope: s('scope'), state: s('state') };
  if (!ticketOk(s('ticket'), user.id, ask)) return page(400, 'This approval page has expired. Start again from the app.');
  const client = await clientOf(ask.clientId).catch(() => null);
  if (!client || !redirectMatches(client.redirectUris, ask.redirectUri) || !challengeOk(ask.challenge) || ask.resource !== canonicalResource(origin)) return page(400, 'This sign-in could not be completed. Start again from the app.');
  const to = s('decision') === 'allow'
    ? answer(ask.redirectUri, origin, ask.state, { code: await approve(user.id, client, ask) })
    : answer(ask.redirectUri, origin, ask.state, { error: 'access_denied', error_description: 'The person did not approve the app.' });
  return new Response(null, { status: 303, headers: { Location: to, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
