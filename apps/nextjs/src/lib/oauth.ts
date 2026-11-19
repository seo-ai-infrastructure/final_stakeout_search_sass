import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { db } from '@stakeout/db';
import { hostOf, isPrimaryHost } from '@stakeout/core/brandHost';
import {
  ACCESS_SECONDS, CODE_SECONDS, REFRESH_DAYS, canonicalResource, isMetadataClientId, pkceOk, privateAddress, readClientDocument, readRegistration, refreshVerdict, sha256,
  type ClientInfo, type OAuthError,
} from '@stakeout/core/oauth';

/**
 * The OAuth side of the MCP server: the apps that sign people in, the one-time codes, and the
 * access and refresh tokens. Only hashes of codes, tokens and secrets are kept, so nothing in the
 * database can be replayed. A person's approval is an OAuthGrant; revoking it ends everything
 * issued under it at once.
 */
export class OAuthFailure extends Error {
  constructor(public error: string, public description: string, public status = 400) { super(description); }
}
const failure = (e: OAuthError, status = 400) => new OAuthFailure(e.error, e.error_description, status);
const token = (prefix: string) => prefix + randomBytes(32).toString('base64url');

/**
 * This site's own address for a request, or null on any host that is not ours (a customer's
 * white-label domain never signs anyone in). Everything is derived from it, so the addresses an
 * app is told always match the one it connected to.
 */
export function originOf(req: Request | { get(name: string): string | null }): string | null {
  const h = req instanceof Request ? req.headers : req;
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim().toLowerCase();
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/.test(host) || !isPrimaryHost(hostOf(h))) return null;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || /\.localhost(:\d+)?$/.test(host);
  return (local ? 'http://' : 'https://') + host;
}

/* ───────────── Apps ───────────── */

export type Client = ClientInfo & { id: string; secretHash: string | null; /** Registered here, or known by its own metadata address. */ kind: 'registered' | 'document' };

/** Registers an app (RFC 7591). Its secret, when it asked for one, is shown this once. */
export async function registerClient(body: unknown) {
  const r = readRegistration(body);
  if ('error' in r) throw failure(r);
  const id = 'dcr_' + randomBytes(18).toString('base64url');
  const secret = r.secret ? token('scs_') : null;
  await db.oAuthClient.create({ data: { id, name: r.name, redirectUris: r.redirectUris, secretHash: secret ? sha256(secret) : null, uri: r.uri } });
  return {
    client_id: id, client_name: r.name, redirect_uris: r.redirectUris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    token_endpoint_auth_method: r.authMethod, client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}), ...(r.uri ? { client_uri: r.uri } : {}),
  };
}

const DOC_KEEP = 3600;
const kept = new Map<string, { at: number; info: ClientInfo }>();

/**
 * Fetches an app's metadata document. The address is public https only: the name must not resolve
 * to this machine or a private network, redirects are refused, the answer has to be JSON and
 * small, and it is given five seconds. A good document is kept for an hour by the server that fetched it.
 */
async function clientDocument(url: string): Promise<ClientInfo> {
  const mine = kept.get(url);
  if (mine && Date.now() - mine.at < DOC_KEEP * 1000) return mine.info;
  const bad = (why: string) => new OAuthFailure('invalid_client', why);
  const addresses = await Promise.race([lookup(new URL(url).hostname, { all: true }).catch(() => []), new Promise<never[]>((done) => setTimeout(() => done([]), 4000))]);
  if (!addresses.length || addresses.some((a) => privateAddress(a.address))) throw bad('The client metadata address cannot be fetched.');
  let doc: unknown;
  try {
    const res = await fetch(url, { redirect: 'error', headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(String(res.status));
    if (!/json/i.test(res.headers.get('content-type') ?? '')) throw new Error('not JSON');
    const raw = await res.text();
    if (raw.length > 20000) throw new Error('too large');
    doc = JSON.parse(raw);
  } catch {
    throw bad('The client metadata document could not be read from its address.');
  }
  const info = readClientDocument(url, doc);
  if ('error' in info) throw failure(info);
  kept.set(url, { at: Date.now(), info });
  if (kept.size > 500) kept.delete(kept.keys().next().value as string);
  return info;
}

/** The app a client id names: one registered here, or one known by its own metadata address. */
export async function clientOf(clientId: unknown): Promise<Client> {
  const id = typeof clientId === 'string' ? clientId : '';
  if (!id) throw new OAuthFailure('invalid_client', 'client_id is missing.', 401);
  if (/^dcr_[A-Za-z0-9_-]{24}$/.test(id)) {
    const row = await db.oAuthClient.findUnique({ where: { id } });
    if (!row) throw new OAuthFailure('invalid_client', 'Unknown client. Register again.', 401);
    return { id, name: row.name, redirectUris: (row.redirectUris as string[]) ?? [], uri: row.uri, secretHash: row.secretHash, kind: 'registered' };
  }
  if (isMetadataClientId(id)) return { id, ...(await clientDocument(id)), secretHash: null, kind: 'document' };
  throw new OAuthFailure('invalid_client', 'Unknown client.', 401);
}

/** The app making a token request, with its secret checked when it has one. A secret may come in the body or as HTTP Basic. */
async function authenticatedClient(req: Request, form: URLSearchParams): Promise<Client> {
  let id = form.get('client_id') ?? '', secret = form.get('client_secret') ?? '';
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  if (basic) {
    const [u, ...p] = Buffer.from(basic[1], 'base64').toString('utf8').split(':');
    id = id || decodeURIComponent(u ?? ''); secret = secret || decodeURIComponent(p.join(':'));
  }
  const client = await clientOf(id);
  if (client.secretHash) {
    const a = Buffer.from(sha256(secret)), b = Buffer.from(client.secretHash);
    if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) throw new OAuthFailure('invalid_client', 'The client secret is wrong.', 401);
  }
  return client;
}

/* ───────────── The approval a person gives ───────────── */

const signer = () => {
  const key = process.env.AUTH_SECRET;
  if (!key || key.length < 32) throw new Error('Set AUTH_SECRET to a random secret of at least 32 characters.');
  return key;
};
export type Ask = { clientId: string; redirectUri: string; challenge: string; resource: string; scope: string; state: string };
const askText = (userId: string, a: Ask, until: number) => JSON.stringify(['oauth-consent', userId, a.clientId, a.redirectUri, a.challenge, a.resource, a.scope, a.state, until]);

/**
 * A ticket put in the approval form: it ties the Allow button to the exact request the person was
 * shown and to their own sign-in, for ten minutes. Another site cannot make someone approve
 * something by posting a form of its own.
 */
export function consentTicket(userId: string, a: Ask): string {
  const until = Math.floor(Date.now() / 1000) + 600;
  return until + '.' + createHmac('sha256', signer()).update(askText(userId, a, until)).digest('base64url');
}
export function ticketOk(ticket: unknown, userId: string, a: Ask): boolean {
  const [until, mac] = String(ticket ?? '').split('.');
  if (!/^\d{10}$/.test(until ?? '') || Number(until) < Date.now() / 1000 || !mac) return false;
  const x = Buffer.from(mac), y = Buffer.from(createHmac('sha256', signer()).update(askText(userId, a, Number(until))).digest('base64url'));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The person said yes: their approval is recorded (or found, when they approved this app before) and a one-time code is made. */
export async function approve(userId: string, client: Client, a: Ask): Promise<string> {
  const had = await db.oAuthGrant.findFirst({ where: { userId, clientId: client.id, resource: a.resource, revokedAt: null }, select: { id: true } });
  const grant = had ?? (await db.oAuthGrant.create({ data: { userId, clientId: client.id, clientName: client.name, resource: a.resource, scope: a.scope }, select: { id: true } }));
  if (had) await db.oAuthGrant.update({ where: { id: had.id }, data: { clientName: client.name, scope: a.scope } });
  // An app known by its metadata address never registered: what its document said when it was approved is kept beside the registered apps.
  if (client.kind === 'document') await db.oAuthClient.upsert({ where: { id: client.id }, update: { name: client.name, redirectUris: client.redirectUris, uri: client.uri }, create: { id: client.id, name: client.name, redirectUris: client.redirectUris, uri: client.uri } }).catch(() => {});
  const code = token('stc_');
  await db.oAuthCode.create({ data: { hash: sha256(code), grantId: grant.id, clientId: client.id, redirectUri: a.redirectUri, codeChallenge: a.challenge, resource: a.resource, scope: a.scope, expiresAt: new Date(Date.now() + CODE_SECONDS * 1000) } });
  return code;
}

/* ───────────── Tokens ───────────── */

async function issue(grant: { id: string; scope: string }) {
  const access = token('sto_'), refresh = token('str_');
  const now = Date.now();
  await db.oAuthToken.createMany({ data: [
    { hash: sha256(access), grantId: grant.id, kind: 'access', expiresAt: new Date(now + ACCESS_SECONDS * 1000) },
    { hash: sha256(refresh), grantId: grant.id, kind: 'refresh', expiresAt: new Date(now + REFRESH_DAYS * 86400000) },
  ] });
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: grant.scope };
}

/** Ends an approval: every token under it stops working at once. */
async function endGrant(id: string) {
  await db.oAuthGrant.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  await db.oAuthToken.deleteMany({ where: { grantId: id } });
  await db.oAuthCode.deleteMany({ where: { grantId: id } });
}

async function liveGrant(id: string) {
  const grant = await db.oAuthGrant.findUnique({ where: { id } });
  if (!grant || grant.revokedAt) return null;
  const user = await db.user.findUnique({ where: { id: grant.userId } });
  return user && user.role !== 'BLOCKED' ? { grant, user } : null;
}

/** POST /oauth/token: a one-time code for tokens, or a refresh token for new ones. */
export async function tokenRequest(req: Request, form: URLSearchParams, origin: string) {
  const type = form.get('grant_type');
  const client = await authenticatedClient(req, form);
  const resource = form.get('resource');
  const invalid = (why: string) => new OAuthFailure('invalid_grant', why);

  if (type === 'authorization_code') {
    const row = await db.oAuthCode.findUnique({ where: { hash: sha256(form.get('code') ?? '') } });
    if (!row || row.clientId !== client.id) throw invalid('The code is not valid.');
    // A code is good once. Presented again, it may have been stolen: what it led to is ended.
    const first = await db.oAuthCode.updateMany({ where: { hash: row.hash, usedAt: null }, data: { usedAt: new Date() } });
    if (!first.count) { await endGrant(row.grantId); throw invalid('The code has already been used.'); }
    if (row.expiresAt.getTime() < Date.now()) throw invalid('The code has expired.');
    const back = form.get('redirect_uri');
    if (back !== null && back !== row.redirectUri) throw invalid('redirect_uri is not the one the code was issued to.');
    if (!pkceOk(form.get('code_verifier'), row.codeChallenge)) throw invalid('The code_verifier does not match.');
    if (resource && resource !== row.resource) throw new OAuthFailure('invalid_target', 'The resource is not the one that was approved.');
    if (row.resource !== canonicalResource(origin)) throw new OAuthFailure('invalid_target', 'The code was issued for another address.');
    const live = await liveGrant(row.grantId);
    if (!live) throw invalid('This connection has been revoked.');
    return issue(live.grant);
  }

  if (type === 'refresh_token') {
    const row = await db.oAuthToken.findUnique({ where: { hash: sha256(form.get('refresh_token') ?? '') } });
    if (!row || row.kind !== 'refresh') throw invalid('The refresh token is not valid.');
    const live = await liveGrant(row.grantId);
    if (!live || live.grant.clientId !== client.id) throw invalid('The refresh token is not valid.');
    if (resource && resource !== live.grant.resource) throw new OAuthFailure('invalid_target', 'The resource is not the one that was approved.');
    const verdict = refreshVerdict(row, new Date());
    if (verdict === 'expired') throw invalid('The refresh token has expired. Sign in again.');
    // An old refresh token turning up long after it was swapped means two parties hold this connection: it is ended.
    if (verdict === 'reuse') { await endGrant(row.grantId); throw invalid('The refresh token was already used. Sign in again.'); }
    if (verdict === 'use') await db.oAuthToken.updateMany({ where: { hash: row.hash, rotatedAt: null }, data: { rotatedAt: new Date() } });
    // Tokens that can no longer be used are cleared as the connection goes along.
    await db.oAuthToken.deleteMany({ where: { grantId: row.grantId, OR: [{ expiresAt: { lt: new Date() } }, { rotatedAt: { lt: new Date(Date.now() - 7 * 86400000) } }] } }).catch(() => {});
    await db.oAuthCode.deleteMany({ where: { grantId: row.grantId, expiresAt: { lt: new Date(Date.now() - 86400000) } } }).catch(() => {});
    return issue(live.grant);
  }
  throw new OAuthFailure('unsupported_grant_type', 'Use authorization_code or refresh_token.');
}

/** POST /oauth/revoke (RFC 7009): the app signs itself out. An unknown token is not an error. */
export async function revokeRequest(req: Request, form: URLSearchParams) {
  const client = await authenticatedClient(req, form);
  const row = await db.oAuthToken.findUnique({ where: { hash: sha256(form.get('token') ?? '') } });
  if (!row) return;
  const grant = await db.oAuthGrant.findUnique({ where: { id: row.grantId }, select: { clientId: true } });
  if (grant?.clientId !== client.id) return;
  if (row.kind === 'refresh') await endGrant(row.grantId);
  else await db.oAuthToken.delete({ where: { hash: row.hash } }).catch(() => {});
}

/**
 * The account an access token acts as, or null: unknown, expired, revoked, issued for another
 * address than the one this request came to, or the account is blocked.
 */
export async function accountOfToken(value: string, origin: string) {
  if (!/^sto_[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const row = await db.oAuthToken.findUnique({ where: { hash: sha256(value) } });
  if (!row || row.kind !== 'access' || row.expiresAt.getTime() < Date.now()) return null;
  const live = await liveGrant(row.grantId);
  if (!live || live.grant.resource !== canonicalResource(origin)) return null;
  if (!live.grant.lastUsedAt || Date.now() - live.grant.lastUsedAt.getTime() > 3600000) await db.oAuthGrant.update({ where: { id: live.grant.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { user: live.user, keyId: 'oauth:' + live.grant.id };
}

/* ───────────── What a person sees on the AI agents page ───────────── */

export const listGrants = (userId: string) =>
  db.oAuthGrant.findMany({ where: { userId, revokedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, clientId: true, clientName: true, createdAt: true, lastUsedAt: true } })
    .then((rows: { id: string; clientId: string; clientName: string; createdAt: Date; lastUsedAt: Date | null }[]) => rows.map((g) => ({ id: g.id, name: g.clientName, from: /^https:\/\//.test(g.clientId) ? new URL(g.clientId).host : null, createdAt: g.createdAt, lastUsedAt: g.lastUsedAt })));

export async function revokeGrant(userId: string, id: string): Promise<boolean> {
  const g = await db.oAuthGrant.findFirst({ where: { id, userId, revokedAt: null }, select: { id: true } });
  if (!g) return false;
  await endGrant(g.id);
  return true;
}
