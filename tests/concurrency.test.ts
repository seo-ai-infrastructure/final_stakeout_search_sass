import test from 'node:test';
import assert from 'node:assert/strict';
import { targetConcurrency } from '../packages/core/concurrency';

test('the worker runs one point per ready phone, with an optional ceiling', () => {
  // No ceiling: follow the phones.
  assert.deepEqual([3, 5, 6, 12].map((p) => targetConcurrency(p, undefined).n), [3, 5, 6, 12]);
  assert.deepEqual(targetConcurrency(5, undefined), { n: 5, capped: false });
  // Never below one, even with no phone ready.
  assert.deepEqual([0, -1].map((p) => targetConcurrency(p, undefined).n), [1, 1]);
  // A ceiling holds it down, and says so; below the ceiling it still follows the phones.
  assert.deepEqual(targetConcurrency(5, '3'), { n: 3, capped: true });
  assert.deepEqual(targetConcurrency(2, '3'), { n: 2, capped: false });
  assert.deepEqual(targetConcurrency(5, '5'), { n: 5, capped: false });
  // A ceiling that is not a whole number above zero is ignored.
  for (const bad of ['', '  ', '0', '-2', 'abc', '2.5', 'NaN']) assert.deepEqual(targetConcurrency(5, bad), { n: 5, capped: false }, JSON.stringify(bad));
  // Before the first fleet check: the ceiling, or three.
  assert.equal(targetConcurrency(null, undefined).n, 3);
  assert.equal(targetConcurrency(null, '5').n, 5);
});
