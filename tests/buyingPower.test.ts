import test from 'node:test';
import assert from 'node:assert/strict';
import { buyingPower, passesFilters } from '../apps/nextjs/src/lib/buyingPower';

const tract = (id: string, inc: number, own: number, occ: number) => ({ v: 'acs2024', tract: { id, inc, own, occ, own_pct: Math.round((1000 * own) / occ) / 10 } });
// A rich, owner-heavy tract (2 points, both top 3) and a poorer, renter-heavy one (2 points, neither).
const pins = [
  { id: 'a', status: 'COMPLETED', rankFound: 1, census: tract('rich', 150000, 900, 1000) },
  { id: 'b', status: 'COMPLETED', rankFound: 2, census: tract('rich', 150000, 900, 1000) },
  { id: 'c', status: 'COMPLETED', rankFound: 8, census: tract('poor', 40000, 200, 1000) },
  { id: 'd', status: 'COMPLETED', rankFound: null, census: tract('poor', 40000, 200, 1000) },
  { id: 'e', status: 'FAILED', rankFound: null, census: tract('poor', 40000, 200, 1000) },
  { id: 'f', status: 'COMPLETED', rankFound: 3, census: { v: 'acs2024' } },
];

test('buying power: weighted by owner-occupied homes x income, tracts shared by their points', () => {
  const r = buyingPower(pins);
  assert.equal(r.observed, 5, 'failed points are not observations');
  assert.equal(r.top3, 3);
  assert.equal(r.standard, 60);
  // rich: 150000*900 = 135,000,000 (all captured); poor: 40000*200 = 8,000,000 (none captured)
  assert.equal(Math.round(r.buyingPower! * 100) / 100, Math.round((100 * 135e6) / 143e6 * 100) / 100);
  assert.equal(r.weightedPins, 4, 'the point without an estimate is left out of the weighting, not guessed');
  assert.equal(r.tracts, 2);
  assert.ok(r.delta! > 30);
});

test('buying power: filters keep only matching points, and the ranks shown can be swapped', () => {
  assert.equal(passesFilters(tract('x', 90000, 700, 1000), { minOwnerPct: 70, minIncome: 75000 }), true);
  assert.equal(passesFilters(tract('x', 90000, 690, 1000), { minOwnerPct: 70, minIncome: 0 }), false);
  assert.equal(passesFilters({ v: 'acs2024' }, { minOwnerPct: 50, minIncome: 0 }), false, 'no estimate: not assumed to match');
  const rich = buyingPower(pins, { minOwnerPct: 70, minIncome: 0 });
  assert.deepEqual([rich.eligible, rich.top3, rich.standard, rich.buyingPower], [2, 2, 100, 100]);
  const competitor = buyingPower(pins, undefined, (p) => (p.id === 'c' ? 1 : null));
  assert.equal(competitor.top3, 1);
  assert.equal(Math.round(competitor.buyingPower! * 10) / 10, Math.round((1000 * 4e6) / 143e6) / 10);
});

test('point worth: shares of the grid add up to 100%, and opportunities put the biggest share outside the top 3 first', async () => {
  const { pointShares, opportunityOrder } = await import('../apps/nextjs/src/lib/buyingPower');
  const shares = pointShares(pins);
  const sum = [...shares.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(shares.has('f'), false, 'no estimate: no share');
  // rich tract (2 points) holds 135M of 143M+8M/…: a and b split it equally
  assert.equal(shares.get('a'), shares.get('b'));
  assert.ok(shares.get('a')! > shares.get('c')!);
  // a, b are top 3; c (rank 8) and d (not found) are outside, equal shares (same tract); e failed; f no estimate
  assert.deepEqual(opportunityOrder(pins).sort(), ['c', 'd']);
  // a competitor view where a is outside the top 3 makes a the biggest opportunity
  assert.equal(opportunityOrder(pins, (p) => (p.id === 'a' ? 9 : p.rankFound))[0], 'a');
});
