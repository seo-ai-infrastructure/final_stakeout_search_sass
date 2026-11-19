import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  GRACE_SECONDS, authorizationServer, canonicalResource, challenge, challengeOk, grantedScope, isAppScheme, isLoopback, isMetadataClientId, pkceOk, privateAddress, protectedResource,
  readClientDocument, readRegistration, redirectHost, redirectMatches, redirectProblem, refreshVerdict, resourceMetadataUrl, resourceOk,
} from '../packages/core/oauth';

const ORIGIN = 'https://www.stakeoutsearch.com';

test('the server says where to sign in, and for which address', () => {
  assert.equal(canonicalResource(ORIGIN), 'https://www.stakeoutsearch.com/api/mcp');
  assert.equal(canonicalResource(ORIGIN + '/'), 'https://www.stakeoutsearch.com/api/mcp');
  const pr = protectedResource(ORIGIN);
  assert.equal(pr.resource, 'https://www.stakeoutsearch.com/api/mcp');
  assert.deepEqual(pr.authorization_servers, [ORIGIN]);
  // Refresh tokens are not something the resource asks for, so offline_access is only named by the sign-in server.
  assert.deepEqual(pr.scopes_supported, ['mcp']);
  const as = authorizationServer(ORIGIN);
  assert.equal(as.issuer, ORIGIN);
  assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
  assert.equal(as.client_id_metadata_document_supported, true);
  assert.equal(as.authorization_response_iss_parameter_supported, true);
  assert.equal(as.registration_endpoint, ORIGIN + '/oauth/register');
  assert.ok(as.scopes_supported.includes('offline_access'));
  assert.ok(as.grant_types_supported.includes('refresh_token'));
  assert.equal(resourceMetadataUrl(ORIGIN), ORIGIN + '/.well-known/oauth-protected-resource/api/mcp');
  assert.equal(challenge(ORIGIN), 'Bearer resource_metadata="https://www.stakeoutsearch.com/.well-known/oauth-protected-resource/api/mcp", scope="mcp"');
  assert.match(challenge(ORIGIN, { error: 'invalid_token', description: 'Expired "now"' }), /error="invalid_token", error_description="Expired now"$/);
});

test('the resource an app names has to be this MCP server exactly', () => {
  assert.equal(resourceOk('https://www.stakeoutsearch.com/api/mcp', ORIGIN), true);
  // Capitals in the scheme and host are the same address.
  assert.equal(resourceOk('HTTPS://WWW.StakeoutSearch.com/api/mcp', ORIGIN), true);
  // Left out by an older app: the one resource there is.
  assert.equal(resourceOk(null, ORIGIN), true);
  assert.equal(resourceOk('', ORIGIN), true);
  for (const bad of [
    'https://www.stakeoutsearch.com/api/mcp/', 'https://www.stakeoutsearch.com', 'https://www.stakeoutsearch.com/', 'https://www.stakeoutsearch.com/api/MCP',
    'https://www.stakeoutsearch.com/api/mcp?x=1', 'https://www.stakeoutsearch.com/api/mcp#x', 'https://stakeoutsearch.com/api/mcp', 'http://www.stakeoutsearch.com/api/mcp',
    'https://evil.example/api/mcp', 'https://www.stakeoutsearch.com@evil.example/api/mcp', 'www.stakeoutsearch.com/api/mcp', 'https://www.stakeoutsearch.com/api/mcp/../mcp',
  ]) assert.equal(resourceOk(bad, ORIGIN), false, bad);
});

test('which callback addresses an app may register', () => {
  for (const ok of ['https://claude.ai/api/mcp/auth_callback', 'https://chatgpt.com/connector_platform_oauth_redirect', 'http://127.0.0.1:53124/callback', 'http://localhost:3000/callback', 'http://[::1]:9000/cb', 'cursor://anysphere.cursor-mcp/oauth/callback'])
    assert.equal(redirectProblem(ok), null, ok);
  assert.match(String(redirectProblem('http://example.com/cb')), /https/);
  assert.match(String(redirectProblem('http://127.0.0.1.evil.com/cb')), /https/);
  assert.match(String(redirectProblem('https://claude.ai/cb#frag')), /fragment/);
  assert.match(String(redirectProblem('https://user:pw@claude.ai/cb')), /login/);
  assert.match(String(redirectProblem('javascript:alert(1)')), /not accepted/);
  assert.match(String(redirectProblem('data:text/html,x')), /not accepted/);
  assert.match(String(redirectProblem('not an address')), /not an address/);
  assert.match(String(redirectProblem(42)), /address/);
  assert.equal(isLoopback('http://127.0.0.1:1/cb'), true);
  assert.equal(isLoopback('https://127.0.0.1/cb'), false);
  assert.equal(isAppScheme('cursor://x/cb'), true);
  assert.equal(isAppScheme('https://claude.ai/cb'), false);
  assert.equal(redirectHost('https://claude.ai/api/mcp/auth_callback'), 'claude.ai');
  assert.equal(redirectHost('http://127.0.0.1:53124/callback'), '127.0.0.1:53124');
});

test('a callback has to match one that was registered, to the letter', () => {
  const web = ['https://claude.ai/api/mcp/auth_callback'];
  assert.equal(redirectMatches(web, 'https://claude.ai/api/mcp/auth_callback'), true);
  for (const bad of ['https://claude.ai/api/mcp/auth_callback/', 'https://claude.ai/api/mcp/auth_callback?x=1', 'https://claude.ai.evil.com/api/mcp/auth_callback', 'https://CLAUDE.ai/api/mcp/auth_callback', 'http://claude.ai/api/mcp/auth_callback'])
    assert.equal(redirectMatches(web, bad), false, bad);
  // A program on the person's own machine picks a new port each time: only the port may differ.
  const local = ['http://127.0.0.1:3000/callback'];
  assert.equal(redirectMatches(local, 'http://127.0.0.1:53124/callback'), true);
  assert.equal(redirectMatches(local, 'http://127.0.0.1/callback'), true);
  assert.equal(redirectMatches(local, 'http://127.0.0.1:53124/other'), false);
  assert.equal(redirectMatches(local, 'http://localhost:53124/callback'), false);
  assert.equal(redirectMatches(local, 'https://127.0.0.1:53124/callback'), false);
  // A website's callback never gets the same leeway.
  assert.equal(redirectMatches(['https://app.example:3000/cb'], 'https://app.example:4000/cb'), false);
});

test('an app known by its metadata address', () => {
  const url = 'https://claude.ai/oauth/claude-code-client-metadata';
  assert.equal(isMetadataClientId(url), true);
  for (const bad of ['http://claude.ai/client.json', 'https://claude.ai', 'https://claude.ai/', 'https://localhost/client.json', 'https://10.0.0.5/client.json', 'https://[::1]/client.json', 'https://intranet/client.json', 'https://a.internal/c.json', 'https://claude.ai/a/../client.json', 'https://claude.ai/client.json#x', 'https://u:p@claude.ai/client.json', 'https://claude.ai:8443/client.json', 'dcr_abc'])
    assert.equal(isMetadataClientId(bad), false, bad);
  const doc = { client_id: url, client_name: 'Claude Code', client_uri: 'https://claude.ai', redirect_uris: ['http://127.0.0.1:3000/callback', 'http://localhost:3000/callback'], grant_types: ['authorization_code', 'refresh_token'], token_endpoint_auth_method: 'none' };
  assert.deepEqual(readClientDocument(url, doc), { name: 'Claude Code', redirectUris: doc.redirect_uris, uri: 'https://claude.ai' });
  // The document has to name the very address it was fetched from, or anyone could pass as anyone.
  assert.equal((readClientDocument('https://evil.example/c.json', doc) as { error: string }).error, 'invalid_client');
  assert.match((readClientDocument(url, { ...doc, client_name: '' }) as { error_description: string }).error_description, /client_name/);
  assert.match((readClientDocument(url, { ...doc, redirect_uris: [] }) as { error_description: string }).error_description, /redirect_uris/);
  assert.match((readClientDocument(url, { ...doc, redirect_uris: ['http://evil.example/cb'] }) as { error_description: string }).error_description, /https/);
  assert.equal((readClientDocument(url, { ...doc, token_endpoint_auth_method: 'client_secret_post' }) as { error: string }).error, 'invalid_client');
  assert.equal((readClientDocument(url, [doc]) as { error: string }).error, 'invalid_client');
});

test('an app that registers itself', () => {
  const r = readRegistration({ client_name: 'ChatGPT', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', application_type: 'web' });
  assert.deepEqual(r, { name: 'ChatGPT', redirectUris: ['https://chatgpt.com/connector_platform_oauth_redirect'], uri: null, secret: false, authMethod: 'none' });
  assert.equal((readRegistration({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'client_secret_post' }) as { secret: boolean; name: string }).secret, true);
  assert.equal((readRegistration({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }) as { name: string }).name, 'An AI app');
  assert.equal((readRegistration({ redirect_uris: ['http://evil.example/cb'] }) as { error: string }).error, 'invalid_redirect_uri');
  assert.equal((readRegistration({}) as { error: string }).error, 'invalid_redirect_uri');
  assert.equal((readRegistration({ redirect_uris: ['https://a.example/cb'], grant_types: ['client_credentials'] }) as { error: string }).error, 'invalid_client_metadata');
  assert.equal((readRegistration({ redirect_uris: ['https://a.example/cb'], response_types: ['token'] }) as { error: string }).error, 'invalid_client_metadata');
  assert.equal((readRegistration({ redirect_uris: ['https://a.example/cb'], token_endpoint_auth_method: 'private_key_jwt' }) as { error: string }).error, 'invalid_client_metadata');
  assert.equal((readRegistration('x') as { error: string }).error, 'invalid_client_metadata');
});

test('PKCE: only the app that started the sign-in can finish it', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  // The pair from RFC 7636, Appendix B.
  assert.equal(pkceOk(verifier, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'), true);
  assert.equal(pkceOk(verifier, createHash('sha256').update(verifier).digest('base64url')), true);
  assert.equal(pkceOk(verifier + 'x', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'), false);
  // "plain" is never accepted: the verifier itself is not its own challenge.
  assert.equal(pkceOk(verifier, verifier), false);
  assert.equal(pkceOk('short', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'), false);
  assert.equal(pkceOk(undefined, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'), false);
  assert.equal(challengeOk('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'), true);
  assert.equal(challengeOk('too-short'), false);
  assert.equal(challengeOk(undefined), false);
});

test('a refresh token is good once, with a short allowance for a retry', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const later = new Date('2027-01-01T00:00:00Z');
  const ago = (s: number) => new Date(now.getTime() - s * 1000);
  assert.equal(refreshVerdict({ expiresAt: later, rotatedAt: null }, now), 'use');
  assert.equal(refreshVerdict({ expiresAt: ago(1), rotatedAt: null }, now), 'expired');
  // The app did not get the answer and asks again straight away: it is let through.
  assert.equal(refreshVerdict({ expiresAt: later, rotatedAt: ago(5) }, now), 'retry');
  assert.equal(refreshVerdict({ expiresAt: later, rotatedAt: ago(GRACE_SECONDS) }, now), 'retry');
  // An old copy turning up later means someone else holds it: the connection is ended.
  assert.equal(refreshVerdict({ expiresAt: later, rotatedAt: ago(GRACE_SECONDS + 1) }, now), 'reuse');
  assert.equal(refreshVerdict({ expiresAt: ago(1), rotatedAt: ago(3600) }, now), 'reuse');
  assert.equal(grantedScope('mcp offline_access'), 'mcp offline_access');
  assert.equal(grantedScope('offline_access'), 'mcp offline_access');
  assert.equal(grantedScope('mcp'), 'mcp');
  assert.equal(grantedScope(undefined), 'mcp');
  assert.equal(grantedScope('admin everything'), 'mcp');
});

test('addresses a metadata fetch must never reach', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', 'not-an-ip'])
    assert.equal(privateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '100.63.0.1', '160.79.104.10', '2606:4700::1111', '::ffff:8.8.8.8'])
    assert.equal(privateAddress(ip), false, ip);
});
