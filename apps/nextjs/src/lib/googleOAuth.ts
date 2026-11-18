import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { openToken, sealToken } from '@stakeout/core/tokenSeal';

export { sealToken };

/**
 * Sign in with Google, for reading a client's Search Console and Analytics. The app is our own
 * Google Cloud project (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET on Vercel), so Google's screen
 * names Stakeout Search. Read-only permissions; the refresh token is stored encrypted.
 */
export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/webmasters.readonly', 'https://www.googleapis.com/auth/analytics.readonly'];
export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
/** Must match the redirect URI entered in Google Cloud exactly. */
export const googleRedirect = () => process.env.GOOGLE_REDIRECT_URI || 'https://www.stakeoutsearch.com/api/google/callback';
export const STATE_COOKIE = 'stakeout_gstate';

export function googleAuthUrl(state: string) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirect(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    // offline + consent: Google returns a refresh token every time, so reconnecting always works.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  }).toString();
  return u.toString();
}

type TokenReply = { access_token?: string; refresh_token?: string; scope?: string; id_token?: string; error?: string; error_description?: string };

async function tokenCall(params: Record<string, string>): Promise<TokenReply> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  return (await r.json().catch(() => ({ error: 'bad_response' }))) as TokenReply;
}

/** Trades the code Google sent back for tokens, and reads which Google login it was. */
export async function exchangeCode(code: string) {
  const t = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: googleRedirect() });
  if (!t.access_token || !t.refresh_token) throw new InputError('Google did not complete the sign-in' + (t.error ? ' (' + t.error + ').' : '.'), 502);
  // The id_token came straight from Google over TLS in this same response, so its payload is read without checking the signature.
  let email = '';
  try {
    email = String(JSON.parse(Buffer.from(String(t.id_token).split('.')[1], 'base64url').toString('utf8')).email ?? '');
  } catch { /* no email claim */ }
  return { refreshToken: t.refresh_token, scopes: t.scope ?? '', email };
}

/** A short-lived access token for an account's Google connection. */
export async function googleAccess(userId: string): Promise<string> {
  const c = await db.googleConnection.findUnique({ where: { userId } });
  const refresh = c ? openToken(c.refreshToken) : null;
  if (!refresh) throw new InputError('Google is not connected.', 409);
  const t = await tokenCall({ refresh_token: refresh, grant_type: 'refresh_token' });
  if (!t.access_token) {
    // invalid_grant: access was removed in the Google account, or the test-mode token expired.
    if (t.error === 'invalid_grant') await db.googleConnection.delete({ where: { userId } }).catch(() => {});
    throw new InputError(t.error === 'invalid_grant' ? 'Google access has expired or was removed. Connect Google again.' : 'Google sign-in is not responding.', t.error === 'invalid_grant' ? 409 : 502);
  }
  return t.access_token;
}

/** Tells Google to forget the grant, then forgets it here. */
export async function googleDisconnect(userId: string) {
  const c = await db.googleConnection.findUnique({ where: { userId } });
  const refresh = c ? openToken(c.refreshToken) : null;
  if (refresh) await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(refresh), { method: 'POST', signal: AbortSignal.timeout(10000) }).catch(() => {});
  await db.googleConnection.deleteMany({ where: { userId } });
}

/** A JSON call to a Google API with an access token; failures are explained in plain words. */
export async function google<T>(token: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const said = String((j as { error?: { message?: string } })?.error?.message ?? '').slice(0, 300);
    if (r.status === 403 && /has not been used|is disabled|not enabled/i.test(said)) throw new InputError('This Google API is not switched on in the Google Cloud project yet. ' + said, 502);
    if (r.status === 403) throw new InputError('This Google login has no access to that.' + (said ? ' ' + said : ''), 403);
    if (r.status === 429) throw new InputError('Google is rate-limiting. Try again in a minute.', 429);
    throw new InputError('Google returned an error (' + r.status + ').' + (said ? ' ' + said : ''), 502);
  }
  return j as T;
}
