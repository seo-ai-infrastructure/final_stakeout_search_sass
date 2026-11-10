import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readLocalFinder } from '../packages/core/serpEvidence';

test('Local Finder: each listing keeps the distance Google showed, and none for hidden-address businesses', () => {
  const list = readLocalFinder(readFileSync('tests/fixtures/real-lf-2026-11-09.xml', 'utf8'));
  const by = (name: string) => list.find((l) => l.name === name);
  assert.equal(by('Southern Skye Plumbing')?.distance, '0.4 mi');
  assert.equal(by('Music City Plumbing And Solutions')?.distance, '0.7 mi');
  assert.equal(by('Covert Plumbing')?.distance, '2.6 mi');
  assert.equal(by('Great Plumber of Mt.Juliet')?.distance, null, 'a service-area business shows no distance');
  assert.equal(by('Pioneer Heating, Cooling, Electrical & Plumbing')?.distance, '9.3 mi', 'ads keep theirs too');
  assert.equal(by('Southern Skye Plumbing')?.pos, 2, 'positions are unchanged');
});
