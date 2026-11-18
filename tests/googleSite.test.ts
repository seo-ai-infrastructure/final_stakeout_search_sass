import test from 'node:test';
import assert from 'node:assert/strict';
import { pct, periods, propertyFor } from '../packages/core/googleSite';
import { openToken, sealToken } from '../packages/core/tokenSeal';

test('the Search Console property that covers a website is chosen, domain property first', () => {
  const sites = [
    { siteUrl: 'http://acmeplumbing.com/', permissionLevel: 'siteOwner' },
    { siteUrl: 'https://www.acmeplumbing.com/', permissionLevel: 'siteFullUser' },
    { siteUrl: 'https://www.acmeplumbing.com/blog/', permissionLevel: 'siteOwner' },
    { siteUrl: 'sc-domain:other.com', permissionLevel: 'siteOwner' },
  ];
  assert.equal(propertyFor('https://acmeplumbing.com/?utm_source=google', sites), 'https://www.acmeplumbing.com/');
  assert.equal(propertyFor('https://acmeplumbing.com/', [...sites, { siteUrl: 'sc-domain:acmeplumbing.com', permissionLevel: 'siteOwner' }]), 'sc-domain:acmeplumbing.com');
  // A subdomain is covered by the parent's domain property; an unverified property is not readable.
  assert.equal(propertyFor('https://lakeland.acme.com/', [{ siteUrl: 'sc-domain:acme.com' }]), 'sc-domain:acme.com');
  assert.equal(propertyFor('https://notacme.com/', [{ siteUrl: 'sc-domain:acme.com' }]), null);
  assert.equal(propertyFor('https://acme.com/', [{ siteUrl: 'sc-domain:acme.com', permissionLevel: 'siteUnverifiedUser' }]), null);
  assert.equal(propertyFor('not a link', sites), null);
});

test('two 28-day periods ending three days ago, back to back', () => {
  const p = periods(new Date('2026-11-18T15:00:00Z'));
  assert.deepEqual(p.recent, { from: '2026-10-19', to: '2026-11-15' });
  assert.deepEqual(p.before, { from: '2026-09-21', to: '2026-10-18' });
  assert.equal(pct(120, 100), 20);
  assert.equal(pct(5, 0), null);
});

test('a stored Google token is unreadable without the secret and cannot be altered', () => {
  const sealed = sealToken('1//refresh-token-value', 'a'.repeat(40));
  assert.ok(!sealed.includes('refresh-token-value'));
  assert.equal(openToken(sealed, 'a'.repeat(40)), '1//refresh-token-value');
  assert.equal(openToken(sealed, 'b'.repeat(40)), null);
  assert.equal(openToken(sealed.slice(0, -4) + 'AAAA', 'a'.repeat(40)), null);
  assert.equal(openToken('garbage', 'a'.repeat(40)), null);
  // Sealing twice gives different text (a fresh nonce each time).
  assert.notEqual(sealToken('x', 'a'.repeat(40)), sealToken('x', 'a'.repeat(40)));
});
