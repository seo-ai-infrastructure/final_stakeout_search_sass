import test from 'node:test';
import assert from 'node:assert/strict';
import { mayRest } from '../packages/core/wake';

const MIN = 60000;
test('the worker rests only after a quiet spell, and still looks in on schedule', () => {
  const now = 100 * MIN;
  // Work seen 5 minutes ago: fully awake.
  assert.equal(mayRest(now, now - 5 * MIN, now - 10000, 15 * MIN, 20 * MIN), false);
  // Quiet for 16 minutes, looked in a minute ago: rest.
  assert.equal(mayRest(now, now - 16 * MIN, now - MIN, 15 * MIN, 20 * MIN), true);
  // Quiet for hours, last look-in 21 minutes ago: time to look in.
  assert.equal(mayRest(now, 0, now - 21 * MIN, 15 * MIN, 20 * MIN), false);
  // A wake-up call (work seen just now) ends the rest at once.
  assert.equal(mayRest(now, now, now - MIN, 15 * MIN, 20 * MIN), false);
});
