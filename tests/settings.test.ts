import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSettings, defaultSettings, mergeSettings, ispAllowed } from '../packages/core/settings';

test('settings: defaults come from the environment, stored values win, bad stored values are ignored', () => {
  const base = defaultSettings({});
  assert.deepEqual(base, { searchGapSeconds: 120, ispExclude: ['Tillman Fiberco'], signupsOpen: false, costPerPointUsd: 0.033 });
  assert.equal(defaultSettings({ SEARCH_GAP_SECONDS: '45', SIGNUPS_OPEN: 'true' }).searchGapSeconds, 45);
  const merged = mergeSettings({ searchGapSeconds: '45', signupsOpen: 'true', ispExclude: '["A","B"]', costPerPointUsd: '"oops"', unknown: '1' }, base);
  assert.deepEqual(merged, { searchGapSeconds: 45, ispExclude: ['A', 'B'], signupsOpen: true, costPerPointUsd: 0.033 });
});

test('settings: what an admin types is checked', () => {
  assert.deepEqual(cleanSettings({ searchGapSeconds: 45 }), { searchGapSeconds: 45 });
  assert.deepEqual(cleanSettings({ ispExclude: ' Tillman Fiberco, Foo ,, Foo ' }), { ispExclude: ['Tillman Fiberco', 'Foo'] });
  assert.deepEqual(cleanSettings({ ispExclude: '' }), { ispExclude: [] });
  assert.throws(() => cleanSettings({ searchGapSeconds: 45.5 }), /whole number/);
  assert.throws(() => cleanSettings({ searchGapSeconds: 5000 }), /0 to 900/);
  assert.throws(() => cleanSettings({ signupsOpen: 'yes' }), /on or off/);
  assert.throws(() => cleanSettings({ costPerPointUsd: -1 }), /between 0 and 5/);
  assert.equal(ispAllowed(' tillman fiberco ', { ispExclude: ['Tillman Fiberco'] }), false);
  assert.equal(ispAllowed('Spectrum', { ispExclude: ['Tillman Fiberco'] }), true);
});
