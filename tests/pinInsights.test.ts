import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPinInsights, toCount, toMiles } from '../packages/core/pinInsights';

const read = (f: string) => readFileSync('tests/fixtures/' + f, 'utf8');

test('units: distances become miles, review counts become numbers', () => {
  assert.equal(toMiles('0.4 mi'), 0.4);
  assert.equal(toMiles('2640 ft'), 0.5);
  assert.equal(toMiles('1.6 km'), 0.99);
  assert.equal(toMiles(null), null);
  assert.equal(toCount('6.5K'), 6500);
  assert.equal(toCount('1,234'), 1234);
  assert.equal(toCount('85'), 85);
});

test('insights from a real Local Finder: your position and distance, and the ads shown above you', () => {
  const i = buildPinInsights({ serp: null, finder: read('real-lf-2026-11-09.xml'), target: 'Southern Skye Plumbing' });
  assert.deepEqual(i.you, { pos: 2, miles: 0.4 });
  assert.equal(i.adsAboveYou, 4, "Michael's, SteadyFlo, Airstream and Pioneer come before Southern Skye");
  assert.equal(i.finder.filter((l) => !l.ad).length, 10);
  assert.equal(i.ads.filter((a) => a.where === 'finder').length, 7);
  const great = i.finder.find((l) => l.name === 'Great Plumber of Mt.Juliet')!;
  assert.equal(great.miles, null, 'service-area business: no distance');
  assert.ok(great.rating! >= 4 && great.reviews! > 0);
  const nobody = buildPinInsights({ serp: null, finder: read('real-lf-2026-11-09.xml'), target: 'McIntyre Painting' });
  assert.deepEqual([nobody.you.pos, nobody.adsAboveYou], [null, null]);
});

test('insights from a real results page: the sponsored map-pack card is an advertiser', () => {
  const i = buildPinInsights({ serp: read('real-pack-2026-11-09.xml'), finder: null, target: 'Great Plumber of Mt.Juliet' });
  assert.ok(i.ads.some((a) => a.where === 'results' && /Pioneer/.test(a.name)));
  assert.equal(i.finder.length, 0);
});

test("insights from Google's own copied AI Overview: cited websites in order, and the businesses it named", () => {
  const i = buildPinInsights({ serp: null, finder: null, aiCopy: read('real-aio-copy-2026-11-09.txt'), target: 'x' });
  assert.equal(i.ai.shown, true);
  assert.ok(i.ai.named.length >= 3);
  assert.ok(i.ai.sources.length >= 1 && i.ai.sources.every((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)), JSON.stringify(i.ai.sources));
  assert.equal(new Set(i.ai.sources).size, i.ai.sources.length, 'each website once');
});

test('AI Overview "shown" only when a snapshot really holds one (not because an aio_ file exists)', () => {
  const none = buildPinInsights({ serp: null, finder: null, aiExpanded: read('real-uidump-mappack-noaio.xml'), target: 'x' });
  assert.equal(none.ai.shown, false, 'a map-pack page with no AI Overview');
  const some = buildPinInsights({ serp: null, finder: null, aiExpanded: read('real-aio-list-no-finder.xml'), target: 'x' });
  assert.equal(some.ai.shown, true);
});
