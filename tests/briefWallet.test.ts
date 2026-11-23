import test from 'node:test';
import assert from 'node:assert/strict';
import { briefGrant, briefSource, briefsLeft } from '../packages/core/briefWallet';

test('plan briefs: a new month brings its briefs and carries last month\'s unused ones for one month', () => {
  assert.deepEqual(briefGrant('subscription_create', 20, { plan: 0, carry: 0, granted: 0 }), { plan: 20, carry: 0, granted: 20 });
  // 7 left of 20, 3 still carried from the month before: the 3 lapse, the 7 carry over.
  assert.deepEqual(briefGrant('subscription_cycle', 20, { plan: 7, carry: 3, granted: 20 }), { plan: 20, carry: 7, granted: 20 });
  // A listing add-on mid-month brings its brief at once.
  assert.deepEqual(briefGrant('subscription_update', 21, { plan: 4, carry: 2, granted: 20 }), { plan: 5, carry: 2, granted: 21 });
  assert.equal(briefGrant('subscription_update', 20, { plan: 4, carry: 2, granted: 20 }), null, 'nothing added, nothing granted');
  assert.equal(briefGrant('manual', 20, { plan: 4, carry: 2, granted: 20 }), null);
});

test('compiling uses last month\'s briefs first, then this month\'s, then bought ones; plan briefs need a paying subscription', () => {
  assert.equal(briefSource({ plan: 5, carry: 2, bought: 1, paying: true }), 'carry');
  assert.equal(briefSource({ plan: 5, carry: 0, bought: 1, paying: true }), 'plan');
  assert.equal(briefSource({ plan: 0, carry: 0, bought: 1, paying: true }), 'bought');
  assert.equal(briefSource({ plan: 5, carry: 2, bought: 1, paying: false }), 'bought');
  assert.equal(briefSource({ plan: 0, carry: 0, bought: 0, paying: true }), null);
  assert.equal(briefsLeft({ plan: 5, carry: 2, bought: 1, paying: true }), 8);
  assert.equal(briefsLeft({ plan: 5, carry: 2, bought: 1, paying: false }), 1);
});
