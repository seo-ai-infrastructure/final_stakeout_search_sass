import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedOnCustomDomain, cleanDomain, hostOf, isPrimaryHost } from '../packages/core/brandHost';

const APP = 'https://www.stakeoutsearch.com';

test('white label: which hosts are ours', () => {
  for (const h of ['www.stakeoutsearch.com', 'stakeoutsearch.com', 'STAKEOUTSEARCH.COM', 'www.stakeoutsearch.com:443', 'localhost', 'localhost:3000', '127.0.0.1', 'final-stakeout-abc123-team.vercel.app'])
    assert.equal(isPrimaryHost(h, APP), true, h);
  for (const h of ['report.gridlock.rsvp', 'gridlock.rsvp', 'stakeoutsearch.com.evil.com', 'notstakeoutsearch.com', 'reports.stakeoutsearch.com'])
    assert.equal(isPrimaryHost(h, APP), false, h);
  assert.equal(isPrimaryHost('report.gridlock.rsvp', undefined), true, 'with no app address configured, nothing is restricted');
});

test('white label: a customer domain serves shared reports and nothing else', () => {
  for (const p of ['/share/abc123', '/share/abc123/', '/api/share/abc123', '/api/evidence/pin1', '/api/proof/pin1', '/api/brand/logo', '/api/census/acs2024.pmtiles', '/_next/static/chunks/x.js', '/favicon.ico'])
    assert.equal(allowedOnCustomDomain(p), true, p);
  for (const p of ['/', '/login', '/pricing', '/scans', '/new-scan', '/admin/devices', '/share', '/share/a/b', '/api/scans', '/api/scans/abc', '/api/auth/login', '/api/admin/ops', '/api/paypal/order', '/set-password', '/demo'])
    assert.equal(allowedOnCustomDomain(p), false, p);
});

test('white label: a typed domain is cleaned, and ours or a non-domain is refused', () => {
  assert.equal(cleanDomain('report.gridlock.rsvp', APP), 'report.gridlock.rsvp');
  assert.equal(cleanDomain('  HTTPS://Report.GridLock.rsvp/some/path?x=1 ', APP), 'report.gridlock.rsvp');
  assert.equal(cleanDomain('reports.example.com:8443', APP), 'reports.example.com');
  assert.equal(cleanDomain('reports.example.com.', APP), 'reports.example.com');
  for (const bad of ['', 'gridlock', 'not a domain', 'http://', '-bad.example.com', 'bad-.example.com', 'a..b.com', 'www.stakeoutsearch.com', 'stakeoutsearch.com', 'localhost', 'x.vercel.app', '192.168.1.1', 'exa mple.com', 'example.c'])
    assert.equal(cleanDomain(bad, APP), null, JSON.stringify(bad));
});

test('white label: the host a visitor typed', () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  assert.equal(hostOf(h({ host: 'Report.GridLock.rsvp:443' })), 'report.gridlock.rsvp');
  assert.equal(hostOf(h({ 'x-forwarded-host': 'report.gridlock.rsvp', host: 'internal.vercel.app' })), 'report.gridlock.rsvp');
  assert.equal(hostOf(h({})), '');
});
