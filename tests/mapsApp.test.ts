import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePinXmlBundle } from '../apps/worker/src/xmlParser';

const read = (f: string) => readFileSync('tests/fixtures/' + f, 'utf8');
const top = read('real-maps-results-top-2026-11-10.xml'),
  swiped = read('real-maps-after-swipe-2026-11-10.xml'),
  scrolled = read('real-maps-scrolled-2026-11-10.xml');

test('Maps app (real screens): the two "Sponsored · Google Verified" cards are ads, never organic ranks', () => {
  const r = parsePinXmlBundle([top, swiped, scrolled], [], 'Nash Painting');
  assert.deepEqual(r.ads.map((a) => [a.name, a.kind]), [['Those Guys Painting Co', 'local_services'], ['Nash Painting', 'local_services']]);
  assert.deepEqual(r.orderedBusinesses, [], 'only ads were on these screens');
  assert.equal(r.targetRank, null, 'an ad is not a ranking');
});

test('Maps app: organic cards rank in list order across screens, each business once', () => {
  // The real "after swipe" screen with Nash Painting's card made organic (its "Sponsored" label removed).
  const organic = swiped.replace(/<node[^>]*text="Sponsored"[^>]*bounds="\[60,1628\]\[239,1678\]"[^>]*\/?>(<\/node>)?/, '');
  assert.notEqual(organic, swiped, 'the label was removed');
  const r = parsePinXmlBundle([top, organic, organic, scrolled], [], 'Nash Painting');
  assert.deepEqual(r.orderedBusinesses, ['Nash Painting']);
  assert.equal(r.targetRank, 1);
  assert.deepEqual(r.ads.map((a) => a.name), ['Those Guys Painting Co']);
});

test('Maps app: a screen with no card titles (photos, hours) adds nothing and is not an error on its own with ads', () => {
  assert.throws(() => parsePinXmlBundle([scrolled], [], 'x'), /UNRECOGNIZED_RESULT_LAYOUT/);
  assert.doesNotThrow(() => parsePinXmlBundle([top, scrolled], [], 'x'));
});
