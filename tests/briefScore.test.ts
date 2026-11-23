import test from 'node:test';
import assert from 'node:assert/strict';
import { brandSearch, isBranded, matchedChange, paidUnitsAbove, scorePoints, summarize, weights, type Point } from '../apps/nextjs/src/lib/briefScore';
import { scorePin } from '../apps/nextjs/src/lib/scoringV2';

const pt = (x: Partial<Point>): Point => ({ r: 0, c: 0, lat: 28, lng: -82, area: 'Lakeland', rank: null, pack: true, oneBox: null, aiShown: false, old: false, state: 'none', featured: null, named: false, listing: null, website: null, first: [], aiFirst: [], ...x });

test('engine fixes: the AI answer on top takes the larger share; a hidden card 3 never drops below card 4', () => {
  const base = { r: 0, c: 0, pack: true, rank: 1, aiShown: true, state: 'parsed' as const };
  const r1 = (x: number | null) => Math.round((x ?? 0) * 10) / 10;
  assert.equal(r1(scorePin({ ...base, moduleOrder: 'ai_above_pack', featured: { card: 1 }, rank: 11 }).baseScore), 55);
  assert.equal(r1(scorePin({ ...base, moduleOrder: 'pack_above_ai', featured: { card: 1 }, rank: 11 }).baseScore), 40);
  const hidden3 = scorePin({ r: 0, c: 0, pack: false, rank: null, aiShown: true, state: 'parsed', featured: { card: 3, afterMore: true } }).baseScore!;
  const card4 = scorePin({ r: 0, c: 0, pack: false, rank: null, aiShown: true, state: 'parsed', featured: { card: 4 } }).baseScore!;
  assert.ok(hidden3 >= card4, `${hidden3} >= ${card4}`);
});

test('an unreadable AI answer adds nothing; an earlier reading counts as named or not', () => {
  const [unread, legacyNamed, legacyNot, parsedAbsent] = scorePoints([
    pt({ rank: 1, aiShown: true, state: 'unparsed' }),
    pt({ rank: 1, aiShown: true, state: 'legacy', old: true }),
    pt({ rank: 1, aiShown: true, state: 'legacy', old: false }),
    pt({ rank: 1, aiShown: true, state: 'parsed' }),
  ]);
  assert.equal(unread.score, parsedAbsent.score, 'unreadable = read and absent');
  assert.equal(Math.round(unread.score), 55);
  assert.ok(legacyNamed.score > legacyNot.score);
  assert.equal(Math.round(legacyNamed.score * 10) / 10, 64.9); // 0.55 × 100 + 0.45 × 22
});

test('ads above: a Local Services Ads block once, each sponsored result once, map-result ads not at all', () => {
  assert.equal(paidUnitsAbove(pt({ ads: [{ n: 'A', w: 'local_services' }, { n: 'B', w: 'local_services' }, { n: 'C', w: 'local_services' }] })), 1);
  assert.equal(paidUnitsAbove(pt({ ads: [{ n: 'A', w: 'local_services' }, { n: 'D', w: 'results' }, { n: 'E', w: 'finder' }] })), 2);
  const [one, two] = scorePoints([pt({ rank: 1, ads: [{ n: 'A', w: 'local_services' }] }), pt({ rank: 1, ads: [{ n: 'A', w: 'local_services' }, { n: 'D', w: 'results' }] })]);
  assert.equal(one.afterAds, 88);
  assert.equal(two.afterAds, 75);
});

test('weights: income band × households, an empty tract counts 0', () => {
  const w = weights([pt({ inc: 30000, hh: 1000 }), pt({ inc: 200000, hh: 500 }), pt({ inc: 90000, hh: 0 })]);
  assert.deepEqual(w, [600, 925, 0]);
  const s = summarize(scorePoints([pt({ rank: 1, inc: 30000, hh: 1000 }), pt({ rank: null, inc: 200000, hh: 500 })]));
  assert.equal(s.score, 50);
  assert.equal(Math.round(s.weighted! * 10) / 10, Math.round((100 * 600) / 1525 * 10) / 10);
});

test('change: each point against its earlier average; only the map part when earlier answers were read the old way', () => {
  const now = scorePoints([0, 1, 2, 3].map((i) => pt({ r: i, lat: 28 + i * 0.03, rank: 1 })));
  const was1 = scorePoints([0, 1, 2, 3].map((i) => pt({ r: i, lat: 28 + i * 0.03 + 0.0005, rank: 2 })));
  const was2 = scorePoints([0, 1, 2, 3].map((i) => pt({ r: i, lat: 28 + i * 0.03, rank: 3 })));
  const c = matchedChange(now, [was1, was2])!;
  assert.equal(c.points, 4);
  assert.equal(Math.round(c.change * 10) / 10, 42.5); // 100 − (70 + 45) / 2
  assert.equal(c.map, false);
  const legacy = scorePoints([0, 1, 2, 3].map((i) => pt({ r: i, lat: 28 + i * 0.03, rank: 2, aiShown: true, state: 'legacy', old: true })));
  const c2 = matchedChange(now, [legacy])!;
  assert.equal(c2.map, true);
  assert.equal(c2.change, 30);
  assert.equal(matchedChange(now.slice(0, 3), [was1]), null, 'fewer than 4 matched points says nothing');
});

test('branded searches and the brand search itself', () => {
  assert.equal(brandSearch("Stuart's Plumbing"), 'stuarts plumbing');
  assert.equal(brandSearch('Brandon J. Broderick, Personal Injury Attorney at Law'), 'brandon j broderick');
  assert.equal(isBranded('stuarts plumbing lakeland', "Stuart's Plumbing"), true);
  assert.equal(isBranded('emergency plumber near me', "Stuart's Plumbing"), false);
  assert.equal(isBranded('broderick law firm', 'Brandon J. Broderick, Personal Injury Attorney at Law'), true);
  assert.equal(isBranded('personal injury lawyer', 'Brandon J. Broderick, Personal Injury Attorney at Law'), false);
});
