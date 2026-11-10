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

test('Maps evidence: the list is rebuilt card by card from the real screens, ads first and unranked', async () => {
  const { readMapsList, isMapsList } = await import('../packages/core/serpEvidence');
  assert.equal(isMapsList(top), true);
  const list = readMapsList([top, swiped, scrolled]);
  assert.deepEqual(list.map((c) => [c.name, c.ad, c.adKind, c.pos, c.listPos]), [
    ['Those Guys Painting Co', true, 'local_services', null, 1],
    ['Nash Painting', true, 'local_services', null, 2],
  ]);
  const a = list[0];
  assert.deepEqual([a.rating, a.reviews], ['5.0', '165']);
  assert.deepEqual(a.lines, ['Painter · 12+ years in business', 'Open · Closes 7 PM · Serves Mt. Juliet', 'Free estimate · Flat rate pricing']);
  assert.deepEqual(list[1].lines, ['Painter · 17+ years in business']);
  assert.equal(readMapsList([scrolled]).length, 0, 'a screen with no card names adds nothing');
});

test('Maps insights: ads are recorded as Maps results ads, and Chrome points are unaffected', async () => {
  const { buildPinInsights } = await import('../packages/core/pinInsights');
  const i = buildPinInsights({ serp: null, finder: scrolled, mapsScreens: [top, swiped, scrolled], target: 'McIntyre Painting' });
  assert.deepEqual(i.ads, [{ name: 'Those Guys Painting Co', where: 'maps' }, { name: 'Nash Painting', where: 'maps' }]);
  assert.deepEqual(i.you, { pos: null, miles: null });
  assert.equal(i.adsAboveYou, null, 'not listed: no count');
  assert.equal(i.finder.length, 2);
  const chrome = buildPinInsights({ serp: null, finder: readFileSync('tests/fixtures/real-lf-2026-11-09.xml', 'utf8'), target: 'Southern Skye Plumbing' });
  assert.equal(chrome.you.pos, 2, 'the Local Finder path is unchanged');
});

test('Maps scans never carry (or pay for) the AI add-on until Ask Maps is captured', async () => {
  const { parseSpec } = await import('../packages/core/grid');
  const base = { keyword: 'painters near me', targetBusiness: 'McIntyre Painting', centerLat: 36.2, centerLng: -86.5, gridSize: 3, spacingKm: 1.60934, trackAiOverviews: true, scheduleType: 'once' };
  assert.equal(parseSpec({ ...base, targetType: 'mobile_maps' }).trackAiOverviews, false);
  assert.equal(parseSpec({ ...base, targetType: 'mobile_chrome' }).trackAiOverviews, true);
});
