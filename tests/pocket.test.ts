import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POCKET_LIMIT, checkPocketInput, circleAround, inUnitedStates, pocketRef, pocketStage, pocketTimes } from '../apps/nextjs/src/lib/pocketInput';

const good = { email: ' Owner@Agency.com ', keyword: '  emergency   plumber near me ', business: "Stuart's Plumbing", lat: 28.0447123456, lng: -81.9498123456, placeLabel: 'Near 210 E Main St, Lakeland, FL' };

test('the pocket test form: cleaned up, or told what is missing', () => {
  assert.deepEqual(checkPocketInput(good), { email: 'owner@agency.com', keyword: 'emergency plumber near me', business: "Stuart's Plumbing", lat: 28.044712, lng: -81.949812, placeLabel: 'Near 210 E Main St, Lakeland, FL' });
  for (const [bad, part] of [[{ email: 'nope' }, 'email'], [{ keyword: 'x' }, 'search'], [{ business: '' }, 'business name'], [{ lat: '28.04' }, 'where you are'], [{ lat: undefined }, 'where you are'], [{ lat: 51.5074, lng: -0.1278 }, 'United States'], [{ keyword: 'k'.repeat(81) }, 'search']] as const) {
    const r = checkPocketInput({ ...good, ...bad });
    assert.ok('error' in r && r.error.includes(part), JSON.stringify(bad) + ' → ' + JSON.stringify(r));
  }
});

test('US only: the lower 48, Alaska and Hawaii', () => {
  for (const [lat, lng] of [[28.04, -81.95], [47.6, -122.33], [44.8, -68.77], [61.22, -149.9], [21.31, -157.86]]) assert.equal(inUnitedStates(lat, lng), true, lat + ',' + lng);
  for (const [lat, lng] of [[51.5, -0.13], [19.43, -99.13], [53.5, -113.5], [0, 0], [18.47, -66.1]]) assert.equal(inUnitedStates(lat, lng), false, lat + ',' + lng);
});

test('where a pocket test is: it is always one point', () => {
  const pin = (status: string, startedAt: Date | null = null) => ({ status, startedAt });
  assert.equal(pocketStage({ paid: false, refunded: false, scan: null, pin: null }), 'unpaid');
  assert.equal(pocketStage({ paid: true, refunded: false, scan: null, pin: null }), 'starting');
  assert.equal(pocketStage({ paid: true, refunded: false, scan: { status: 'RUNNING' }, pin: pin('PENDING') }), 'waiting');
  assert.equal(pocketStage({ paid: true, refunded: false, scan: { status: 'RUNNING' }, pin: pin('PENDING', new Date()) }), 'searching');
  assert.equal(pocketStage({ paid: true, refunded: false, scan: { status: 'COMPLETED' }, pin: pin('COMPLETED', new Date()) }), 'done');
  // The worker tries a point again before it is FAILED; only then does the $1 go back.
  assert.equal(pocketStage({ paid: true, refunded: false, scan: { status: 'FAILED' }, pin: pin('FAILED', new Date()) }), 'refunded');
  assert.equal(pocketStage({ paid: true, refunded: true, scan: { status: 'COMPLETED' }, pin: pin('COMPLETED') }), 'refunded');
});

test('two per 30 days: the browser’s own note of its paid tests', () => {
  const now = Date.UTC(2026, 10, 25), s = Math.floor(now / 1000);
  assert.equal(POCKET_LIMIT, 2);
  assert.deepEqual(pocketTimes(undefined, now), []);
  assert.deepEqual(pocketTimes(`${s - 86400}.${s - 29 * 86400}`, now), [s - 86400, s - 29 * 86400]);
  assert.deepEqual(pocketTimes(`${s - 31 * 86400}.junk.${s + 99999}.${s - 5}`, now), [s - 5], 'old, broken and future entries do not count');
});

test('the upsell map is the standard 21-pin circle: the finished centre and twenty locked pins a mile apart', () => {
  const around = circleAround(28.0447, -81.9498);
  assert.equal(around.length, 20);
  const miles = (p: { lat: number; lng: number }) => Math.hypot((p.lat - 28.0447) * 69, (p.lng + 81.9498) * 69 * Math.cos((28.0447 * Math.PI) / 180));
  assert.ok(around.every((p) => miles(p) > 0.99 && miles(p) < 2.25), 'one to about 2.2 miles out, never the four far corners');
  assert.equal(around.filter((p) => Math.abs(miles(p) - 1) < 0.01).length, 4, 'four pins exactly a mile away');
  assert.equal(new Set(around.map((p) => p.lat.toFixed(5) + p.lng.toFixed(5))).size, 20);
});

test('the short reference never carries the secret', () => {
  assert.equal(pocketRef('cmx9zabcd0001xy4k2qx9'), 'PT-4K2QX9');
});
