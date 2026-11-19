import { canonicalResource, challengeOk, grantedScope, redirectMatches, resourceOk } from '@stakeout/core/oauth';
import { OAuthFailure, clientOf, type Ask, type Client } from '@/lib/oauth';

/**
 * Reads a request to sign in. Two kinds of problem are told apart. An unknown app or a callback
 * it did not register is shown to the person and goes nowhere (`stop`): sending anyone to an
 * address we cannot vouch for is how an open redirect is made. Anything else is the app's own
 * mistake, and is sent back to its callback as an error (`back`).
 */
export type AskResult =
  | { stop: string }
  | { back: string; client: Client }
  | { ask: Ask; client: Client };

const one = (v: string | string[] | undefined | null) => (Array.isArray(v) ? v[0] : v) ?? '';

/** The callback address with the answer on it: a code, or an error, plus the state the app sent and who is answering (RFC 9207). */
export function answer(redirectUri: string, origin: string, state: string, fields: Record<string, string>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(fields)) u.searchParams.set(k, v);
  if (state) u.searchParams.set('state', state);
  u.searchParams.set('iss', origin);
  return u.toString();
}

export async function readAsk(q: Record<string, string | string[] | undefined>, origin: string): Promise<AskResult> {
  let client: Client;
  try {
    client = await clientOf(one(q.client_id));
  } catch (e) {
    return { stop: e instanceof OAuthFailure ? e.description : 'This app could not be looked up just now. Try again in a minute.' };
  }
  const redirectUri = one(q.redirect_uri) || (client.redirectUris.length === 1 ? client.redirectUris[0] : '');
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) return { stop: 'This app asked to send you back to an address it has not registered, so the sign-in was stopped.' };
  const state = one(q.state).slice(0, 2000);
  const back = (error: string, error_description: string) => ({ back: answer(redirectUri, origin, state, { error, error_description }), client });
  if (one(q.response_type) !== 'code') return back('unsupported_response_type', 'Only response_type=code is supported.');
  if (!challengeOk(one(q.code_challenge)) || (one(q.code_challenge_method) || 'plain') !== 'S256') return back('invalid_request', 'PKCE is required: send code_challenge with code_challenge_method=S256.');
  if (Array.isArray(q.resource) && q.resource.length > 1) return back('invalid_target', 'Ask for one resource.');
  if (!resourceOk(one(q.resource) || null, origin)) return back('invalid_target', 'The resource must be exactly ' + canonicalResource(origin) + '.');
  return { client, ask: { clientId: client.id, redirectUri, challenge: one(q.code_challenge), resource: canonicalResource(origin), scope: grantedScope(one(q.scope)), state } };
}
