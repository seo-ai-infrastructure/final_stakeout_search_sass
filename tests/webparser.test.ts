import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWebResults } from '../apps/worker/src/xmlParser';

// A real Chrome UI dump ("plumber near me", Mt. Juliet, TN), taken at the bottom
// of the business list after scrolling. 974 of its 1,078 nodes are off screen.
const finder = readFileSync(new URL('./fixtures/chrome-finder-plumber-near-me.xml', import.meta.url), 'utf8');

test('ranks only organic listings from one final Chrome dump', () => {
  const r = parseWebResults(finder, [], [], 'Champion Plumbing');
  assert.equal(r.orderedBusinesses.length, 10);
  assert.equal(r.orderedBusinesses[0], 'Mt. Juliet Plumbing And Leak Detection');
  assert.equal(r.orderedBusinesses[3], 'Music City Plumbing And Solutions');
  assert.equal(r.targetRank, 10);
});

test('reports the five ads separately and never ranks them', () => {
  const r = parseWebResults(finder, [], [], 'TN Plumbing Solutions');
  assert.equal(r.targetRank, null);
  assert.deepEqual(
    r.ads.map((a) => [a.name, a.kind]),
    [
      ['Pioneer Heating, Cooling, Electrical & Plumbing', 'local_services'],
      ['Busy Bee Plumbing Heating & Air Conditioning', 'local_services'],
      ['Robbins Plumbing and Drain Cleaning LLC', 'local_services'],
      ['Roscoe Brown Heating, Cooling, and Plumbing', 'sponsored'],
      ['TN Plumbing Solutions', 'sponsored'],
    ],
  );
});

test('reads how Google located the search and flags IP-based location', () => {
  const r = parseWebResults(finder, [], [], 'Champion Plumbing');
  assert.equal(r.locationSource, 'Mt. Juliet, Tennessee - From your IP address');
  assert.equal(r.locationFromIp, true);
});

test('finds the screen on which the target was actually visible', () => {
  const r = parseWebResults(finder, [finder.replaceAll('Champion Plumbing', 'Someone Else'), finder], [], 'Champion Plumbing');
  assert.equal(r.matchedDumpIndex, 1);
});
