import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVICES, intakeLines, intakeOf, isService, servicesOpen } from '../apps/nextjs/src/lib/serviceCatalog';

test('services: the two wholesale prices, admins only for now', () => {
  assert.deepEqual([SERVICES.citation_sync.cents, SERVICES.citation_sync.monthly], [19700, false], '$197 once');
  assert.equal(SERVICES.citation_sync.name, 'Local & AI-Trusted Directory Build (100 Manual Citations)');
  assert.deepEqual(
    SERVICES.citation_sync.includes?.map((x) => x.title),
    ['Pre-Build Citation Audit & Existing Listing Check', '100 Manual High-Authority, Niche & Local Directory Submissions', 'Indexing Pass Included', 'Unbranded White-Label Report + Full Account Logins'],
    'the four things the build delivers, in order',
  );
  assert.deepEqual([SERVICES.traffic_boost.cents, SERVICES.traffic_boost.monthly], [29700, true], '$297 a month, media included');
  assert.equal(isService('citation_sync'), true);
  assert.equal(isService('ads'), false);
  assert.equal(servicesOpen({ role: 'ADMIN' }), true);
  assert.equal(servicesOpen({ role: 'USER' }), false, 'agencies do not see it yet');
});

test('services: the citation order form needs the name, address and phone', () => {
  const ok = intakeOf('citation_sync', { business: '  Stuart’s   Plumbing ', address: '3233 US-98, Lakeland, FL 33803', phone: '(863) 877-3108', website: 'https://stuartsplumbing.com', oldNap: 'Old: 123 Main St\nDupes: Stuarts Plumbing LLC' });
  assert.equal((ok as { business: string }).business, 'Stuart’s Plumbing', 'spaces tidied');
  assert.match((ok as { oldNap: string }).oldNap, /\n/, 'the notes keep their lines');
  assert.throws(() => intakeOf('citation_sync', { business: 'Stuart’s Plumbing', address: '3233 US-98', phone: '12' }), /phone number/);
  assert.throws(() => intakeOf('citation_sync', { business: 'Stuart’s Plumbing', address: '3233 US-98', phone: '8638773108', website: 'stuarts.com' }), /https/);
  const lines = intakeLines('citation_sync', ok as Record<string, unknown>);
  assert.ok(lines.includes('Phone: (863) 877-3108') && lines.includes('Category: (not given)'));
  assert.ok(lines.some((x) => x.startsWith('Existing listings or old NAP variations to watch for during audit: Old: 123 Main St')), 'the audit notes reach the order email under the new label');
});

test('services: the traffic order form needs ZIP codes, keywords and where the ads go', () => {
  const ok = intakeOf('traffic_boost', { business: 'Stuart’s Plumbing', zips: '33801, 33803,33801, 3380', keywords: ['emergency plumber near me', ' water heater repair '], destination: 'gbp', url: 'https://www.google.com/maps/place/?q=place_id:abc' });
  assert.deepEqual((ok as { zips: string[] }).zips, ['33801', '33803'], 'five-digit, once each');
  assert.deepEqual((ok as { keywords: string[] }).keywords, ['emergency plumber near me', 'water heater repair']);
  assert.throws(() => intakeOf('traffic_boost', { business: 'X Co', zips: '', keywords: 'a', url: 'https://x.com' }), /ZIP/);
  assert.throws(() => intakeOf('traffic_boost', { business: 'X Co', zips: '33801', keywords: 'plumber', destination: 'landing', url: 'x.com' }), /landing page/);
  assert.ok(intakeLines('traffic_boost', ok as Record<string, unknown>).includes('ZIP codes: 33801, 33803'));
});
