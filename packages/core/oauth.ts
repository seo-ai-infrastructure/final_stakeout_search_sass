/**
 * Signing an AI app in to Stakeout (OAuth 2.1, as the MCP authorization spec of 2026-07-28 asks):
 * what the server says about itself, which apps and callback addresses are acceptable, the PKCE
 * check, and what happens to a refresh token that is used twice. Pure rules; the website keeps
 * the codes and tokens (apps/nextjs/src/lib/oauth.ts).
 *
 * One resource is protected: the MCP server at <origin>/api/mcp. A token is issued for that
 * address exactly and is refused anywhere else.
 */
import { createHash } from 'node:crypto';

export const ACCESS_SECONDS = 3600;
/** A refresh token lives this long from the last time it was used. */
export const REFRESH_DAYS = 90;
export const CODE_SECONDS = 300;
/** A refresh token that was just swapped still works for this long, so a retry after a dropped answer does not sign the app out. */
export const GRACE_SECONDS = 30;
export const SCOPE = 'mcp';
export const MCP_PATH = '/api/mcp';

export type OAuthError = { error: string; error_description: string };
const fail = (error: string, error_description: string): OAuthError => ({ error, error_description });

/* ───────────── The server's own addresses ───────────── */

/** The MCP server's address as tokens name it: no trailing slash, no query, no fragment. */
export const canonicalResource = (origin: string) => origin.replace(/\/+$/, '') + MCP_PATH;
export const resourceMetadataUrl = (origin: string) => origin + '/.well-known/oauth-protected-resource' + MCP_PATH;

/**
 * Whether a `resource` an app sent names this MCP server. The scheme and host may be in capitals;
 * the path has to be exactly /api/mcp, so "/api/mcp/" is not it. Left out, the one resource there is, is meant.
 */
export function resourceOk(resource: string | null | undefined, origin: string): boolean {
  if (resource === null || resource === undefined || resource === '') return true;
  const m = /^(https?):\/\/([^/?#@]+)(.*)$/i.exec(resource);
  return Boolean(m) && (m![1] + '://' + m![2]).toLowerCase() === origin.replace(/\/+$/, '').toLowerCase() && m![3] === MCP_PATH;
}

/** RFC 9728: what the MCP server protects and who signs apps in to it. */
export const protectedResource = (origin: string) => ({
  resource: canonicalResource(origin),
  authorization_servers: [origin],
  scopes_supported: [SCOPE],
  bearer_methods_supported: ['header'],
  resource_name: 'Stakeout Search',
});

/** RFC 8414: where an app registers, sends the person, and swaps a code for tokens. */
export const authorizationServer = (origin: string) => ({
  issuer: origin,
  authorization_endpoint: origin + '/oauth/authorize',
  token_endpoint: origin + '/oauth/token',
  registration_endpoint: origin + '/oauth/register',
  revocation_endpoint: origin + '/oauth/revoke',
  response_types_supported: ['code'],
  response_modes_supported: ['query'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  scopes_supported: [SCOPE, 'offline_access'],
  client_id_metadata_document_supported: true,
  authorization_response_iss_parameter_supported: true,
});

/** The WWW-Authenticate header on a 401 (or, with `scope`, a 403): where an app finds out how to sign in. */
export function challenge(origin: string, problem?: { error: 'invalid_token' | 'insufficient_scope'; description: string }): string {
  const q = (v: string) => '"' + v.replace(/[\\"]/g, '') + '"';
  return ['Bearer resource_metadata=' + q(resourceMetadataUrl(origin)), 'scope=' + q(SCOPE), ...(problem ? ['error=' + q(problem.error), 'error_description=' + q(problem.description)] : [])].join(', ');
}

/** What is granted for what was asked: always the one scope, with offline_access when the app asked for it. */
export const grantedScope = (asked: string | null | undefined) => (String(asked ?? '').split(/\s+/).includes('offline_access') ? SCOPE + ' offline_access' : SCOPE);

/* ───────────── Callback addresses ───────────── */

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const BAD_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'about:', 'blob:', 'ftp:', 'ws:', 'wss:', 'mailto:', 'tel:']);
const parse = (uri: string) => { try { return new URL(uri); } catch { return null; } };

/** A callback on the person's own machine (a command-line or desktop app listening locally). */
export const isLoopback = (uri: string) => { const u = parse(uri); return Boolean(u && u.protocol === 'http:' && LOOPBACK.has(u.hostname)); };
/** An app-claimed scheme (cursor://…): a desktop app's own callback, not a website. */
export const isAppScheme = (uri: string) => { const u = parse(uri); return Boolean(u && !/^https?:$/.test(u.protocol)); };

/**
 * Why a callback address cannot be registered, or null. Allowed: any https address; http only on
 * the person's own machine (127.0.0.1, localhost, [::1]); a desktop app's own scheme. Never a
 * fragment, a login in the address, or a scheme a browser would run.
 */
export function redirectProblem(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri || uri.length > 2000) return 'A redirect URI must be an address of at most 2,000 characters.';
  const u = parse(uri);
  if (!u) return '“' + uri.slice(0, 80) + '” is not an address.';
  if (uri.includes('#')) return 'A redirect URI cannot have a fragment.';
  if (u.username || u.password) return 'A redirect URI cannot carry a login.';
  if (BAD_SCHEMES.has(u.protocol)) return 'That kind of redirect URI is not accepted.';
  if (u.protocol === 'http:' && !LOOPBACK.has(u.hostname)) return 'A redirect URI must use https, unless it is on 127.0.0.1 or localhost.';
  return null;
}

/**
 * Whether the callback an app presents is one it registered. The whole address has to match
 * exactly. The one exception is the port of a callback on the person's own machine, which such
 * apps pick afresh each time.
 */
export function redirectMatches(registered: string[], presented: string): boolean {
  if (registered.includes(presented)) return true;
  if (!isLoopback(presented)) return false;
  const p = parse(presented)!;
  return registered.some((r) => {
    const u = parse(r);
    return Boolean(u && isLoopback(r) && u.hostname === p.hostname && u.pathname === p.pathname && u.search === p.search);
  });
}

/** The host shown to the person before they approve: where the sign-in is sent back to. */
export const redirectHost = (uri: string) => { const u = parse(uri); return !u ? uri : /^https?:$/.test(u.protocol) ? u.host : u.protocol + '//' + (u.host || ''); };

/* ───────────── Apps ───────────── */

export type ClientInfo = { name: string; redirectUris: string[]; uri: string | null };

/** Whether a client id is a Client ID Metadata Document address: https, a real host, a path, nothing odd in it. */
export function isMetadataClientId(id: string): boolean {
  if (id.length > 500 || /[\s#]/.test(id)) return false;
  const u = parse(id);
  if (!u || u.protocol !== 'https:' || u.username || u.password || u.pathname === '/' || !u.pathname) return false;
  // As typed, before any tidying: a path that climbs (/a/../b) is not one address but a trick.
  if (/\/\.{1,2}(\/|$|\?)/.test(id) || /%2e/i.test(id)) return false;
  // A name on the public internet: not an address by number, not a local name.
  return u.hostname.includes('.') && !/^[\d.]+$/.test(u.hostname) && !u.hostname.startsWith('[') && !/(^|\.)(localhost|local|internal|lan|home|test|invalid)$/i.test(u.hostname) && (u.port === '' || u.port === '443');
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function uris(v: unknown): string[] | string {
  if (!Array.isArray(v) || !v.length) return 'redirect_uris must list at least one address.';
  if (v.length > 20) return 'At most 20 redirect URIs.';
  for (const r of v) { const p = redirectProblem(r); if (p) return p; }
  return [...new Set(v as string[])];
}

/** An app's metadata document, checked against the address it was fetched from. */
export function readClientDocument(url: string, doc: unknown): ClientInfo | OAuthError {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return fail('invalid_client', 'The client metadata document is not a JSON object.');
  const d = doc as Record<string, unknown>;
  if (d.client_id !== url) return fail('invalid_client', 'The client_id in the metadata document is not the address it was fetched from.');
  const name = text(d.client_name, 120);
  if (!name) return fail('invalid_client', 'The client metadata document has no client_name.');
  const list = uris(d.redirect_uris);
  if (typeof list === 'string') return fail('invalid_client', list);
  // A document cannot hold a shared secret: an app that needs one registers instead.
  const method = d.token_endpoint_auth_method;
  if (method !== undefined && method !== 'none') return fail('invalid_client', 'Only token_endpoint_auth_method "none" is supported for a client metadata document.');
  return { name, redirectUris: list, uri: /^https:\/\//.test(text(d.client_uri, 500)) ? text(d.client_uri, 500) : null };
}

/** A registration request (RFC 7591): what is kept, or what is wrong with it. */
export function readRegistration(body: unknown): (ClientInfo & { secret: boolean; authMethod: string }) | OAuthError {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('invalid_client_metadata', 'Send the client metadata as a JSON object.');
  const d = body as Record<string, unknown>;
  const list = uris(d.redirect_uris);
  if (typeof list === 'string') return fail('invalid_redirect_uri', list);
  const method = d.token_endpoint_auth_method === undefined ? 'none' : String(d.token_endpoint_auth_method);
  if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method)) return fail('invalid_client_metadata', 'token_endpoint_auth_method must be none, client_secret_post or client_secret_basic.');
  const grants = Array.isArray(d.grant_types) ? d.grant_types.map(String) : ['authorization_code'];
  if (grants.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) return fail('invalid_client_metadata', 'Only the authorization_code and refresh_token grants are supported.');
  if (Array.isArray(d.response_types) && d.response_types.some((r) => r !== 'code')) return fail('invalid_client_metadata', 'Only the code response type is supported.');
  return { name: text(d.client_name, 120) || 'An AI app', redirectUris: list, uri: /^https:\/\//.test(text(d.client_uri, 500)) ? text(d.client_uri, 500) : null, secret: method !== 'none', authMethod: method };
}

/* ───────────── Codes and tokens ───────────── */

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** PKCE, S256 only: the verifier the app kept has to hash to the challenge it sent when it started. */
export function pkceOk(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return createHash('sha256').update(verifier).digest('base64url') === challenge;
}
export const challengeOk = (c: unknown): c is string => typeof c === 'string' && /^[A-Za-z0-9_-]{43}$/.test(c);

/**
 * What to do with a refresh token that is presented: `use` it (and swap it); accept it once more
 * within the grace window after a swap (`retry`: the app did not get the answer the first time);
 * or treat it as stolen (`reuse`: swapped long ago, so someone has an old copy) and end the connection.
 */
export function refreshVerdict(t: { expiresAt: Date; rotatedAt: Date | null }, now: Date): 'use' | 'retry' | 'reuse' | 'expired' {
  if (t.rotatedAt) return now.getTime() - t.rotatedAt.getTime() <= GRACE_SECONDS * 1000 ? 'retry' : 'reuse';
  return t.expiresAt.getTime() <= now.getTime() ? 'expired' : 'use';
}

/** Addresses a server must never be sent to fetch from: this machine, private networks, link-local, and the like. */
export function privateAddress(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (v.includes(':')) {
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return privateAddress(mapped[1]);
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('2001:db8') || v.startsWith('64:ff9b');
  }
  const p = v.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
