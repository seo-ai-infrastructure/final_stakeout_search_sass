import test from 'node:test';
import assert from 'node:assert/strict';
import { brandedQuery, deviceFlag, hostLabel, lowMobileCtr, scanBridge } from '../packages/core/upgradeTriggers';

test('lowMobileCtr: seen near the top on phones and not clicked; never a search by name', () => {
  const q = (query: string, clicks: number, impressions: number, position: number) => ({ query, clicks, impressions, position });
  assert.equal(hostLabel('https://www.stuart-plumbing.com/lakeland'), 'stuartplumbing');
  assert.ok(brandedQuery('stuart plumbing reviews', 'stuart-plumbing.com'));
  const r = lowMobileCtr([q('plumber lakeland', 5, 400, 4.2), q('stuart plumbing', 2, 900, 1.1), q('water heater repair', 20, 300, 3), q('drain cleaning', 1, 260, 9.5), q('leak detection', 1, 240, 2), q('emergency plumber', 3, 1000, 7.9)], 'stuart-plumbing.com');
  assert.equal(r.fallback, false);
  // 1.3% and 0.3% at positions 4.2 and 7.9; the rest are by name, clicked enough, too low or too rare.
  assert.deepEqual(r.rows.map((x) => [x.query, x.ctr]), [['emergency plumber', 0.3], ['plumber lakeland', 1.3]]);
});

test('lowMobileCtr: with nothing flagged, the three most-shown local searches', () => {
  const q = (query: string, impressions: number) => ({ query, clicks: impressions / 10, impressions, position: 3 });
  const r = lowMobileCtr([q('plumber near me', 100), q('how to fix a tap', 900), q('plumber in lakeland', 80), q('acme plumbing', 500)], 'acmeplumbing.com');
  assert.equal(r.fallback, true);
  assert.deepEqual(r.rows.map((x) => x.query), ['plumber near me', 'plumber in lakeland']);
  assert.deepEqual(lowMobileCtr([q('how to fix a tap', 900)], 'acmeplumbing.com').rows.map((x) => x.query), ['how to fix a tap']);
});

test('deviceFlag: mostly phones, or much lower on phones', () => {
  const d = (device: string, impressions: number, position: number) => ({ device, impressions, position });
  assert.deepEqual(deviceFlag([d('MOBILE', 700, 6), d('DESKTOP', 300, 5)]), { mobileShare: 70, gap: 1, why: 'share' });
  assert.deepEqual(deviceFlag([d('MOBILE', 400, 9), d('DESKTOP', 600, 6)]), { mobileShare: 40, gap: 3, why: 'position' });
  assert.equal(deviceFlag([d('MOBILE', 400, 6), d('DESKTOP', 600, 6)]), null);
  assert.equal(deviceFlag([]), null);
});

test('scanBridge: a finished 5×5 with four or more weak points', () => {
  const pin = (rankFound: number | null, ai = false, cited = false) => ({ status: 'COMPLETED', rankFound, hasAiOverview: ai, targetCitedInAi: cited });
  const scan = { status: 'COMPLETED', totalPins: 25, trackAiOverviews: true };
  const strong = Array.from({ length: 21 }, () => pin(1));
  assert.deepEqual(scanBridge(scan, [...strong, pin(4), pin(null), pin(9), pin(7)]), { weak: 4, total: 25, why: 'rank' });
  assert.equal(scanBridge(scan, [...strong, pin(4), pin(2), pin(3), pin(1)]), null);
  assert.deepEqual(scanBridge(scan, [...strong, pin(1, true), pin(1, true), pin(2, true), pin(3, true)]), { weak: 4, total: 25, why: 'ai' });
  assert.equal(scanBridge({ ...scan, totalPins: 9 }, [pin(9), pin(9), pin(9), pin(9)]), null, 'only for a 5×5');
  assert.equal(scanBridge({ ...scan, status: 'RUNNING' }, [...strong, pin(4), pin(5), pin(9), pin(7)]), null);
});
