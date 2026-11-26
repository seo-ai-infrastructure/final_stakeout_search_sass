import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWebResults, sameBusinessName } from '../apps/worker/src/xmlParser';

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

test('the business is matched without its company ending: customers rarely type it the way Google shows it', () => {
  // A real case: the customer typed the name without "L.L.C." and was shown as not found at a point where it was #1.
  assert.equal(sameBusinessName('D & M Master Electric L.L.C.', 'D & M Master Electric'), true);
  for (const [shown, typed] of [['Elite Electrical Contractors, LLC', 'Elite Electrical Contractors'], ['A-Z ELECTRIC INC', 'A-Z Electric'], ['Smith & Sons Plumbing Co.', 'Smith and Sons Plumbing'], ['The Drain Doctor', 'Drain Doctor'], ['Joe’s Pizza', "Joe's Pizza"], ['Peña Law, P.C.', 'Pena Law PC']])
    assert.equal(sameBusinessName(shown, typed), true, shown + ' / ' + typed);
  // A real case: Google shows a descriptor after the name; the customer typed the name alone.
  assert.equal(sameBusinessName('Local Contractors Marketing - Marketing Agency', 'local contractors marketing'), true);
  for (const [shown, typed] of [['iMedia Audiences - Local Digital Advertising and Social Media', 'iMedia Audiences'], ['Carnegie - Higher Ed Marketing & Enrollment Agency', 'Carnegie'], ['Smith Plumbing | Austin', 'Smith Plumbing LLC'], ['Peak Roofing: Residential & Commercial', 'Peak Roofing'], ['Smith Plumbing', 'Smith Plumbing - Austin']])
    assert.equal(sameBusinessName(shown, typed), true, shown + ' / ' + typed);
  for (const [shown, typed] of [['Smith Plumbing - Austin', 'Smith Plumbing - Dallas'], ['A-Z ELECTRIC INC', 'A'], ['Go - Marketing Agency', 'Go'], ['Digital Marketing Stream', 'Digital Marketing All'], ['Local Contractors Marketing - Marketing Agency', 'Marketing Agency']])
    assert.equal(sameBusinessName(shown, typed), false, shown + ' / ' + typed);
  // Still a different business: another word in the name, or only part of it.
  for (const [shown, typed] of [['D & M Master Electric L.L.C.', 'D & M Electric'], ['Walcheski Electric', 'Kith Electric'], ['First Class Electric', 'First Class Electric of Queens'], ['R Benimadho & Sons Electrical', 'Benimadho Electrical']])
    assert.equal(sameBusinessName(shown, typed), false, shown + ' / ' + typed);
  assert.equal(parseWebResults(finder, [], [], 'Champion Plumbing LLC').targetRank, 10, 'typed with an ending Google does not show');
  assert.equal(parseWebResults(finder, [], [], 'Mt Juliet Plumbing & Leak Detection, Inc.').targetRank, 1);
});
