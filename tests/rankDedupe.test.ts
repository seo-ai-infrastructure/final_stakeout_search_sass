import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWebResults } from '../apps/worker/src/xmlParser';

test('stored ranks: an advertiser that also ranks organically keeps its organic place', () => {
  const xml = readFileSync(new URL('./fixtures/real-r3c2-finder.xml', import.meta.url), 'utf8');
  const r = parseWebResults(xml, [], [], 'McIntyre Painting');
  assert.equal(r.targetRank, 2);
  assert.equal(r.orderedBusinesses.length, 10);
  assert.equal(r.orderedBusinesses[4], 'Those Guys Painting Co');
  assert.ok(r.ads.some((a) => a.name === 'Those Guys Painting Co'), 'still listed as an ad too');
});
