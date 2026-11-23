import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSettings, creditsPerPoint, defaultSettings, mergeSettings, ispAllowed } from '../packages/core/settings';

test('settings: defaults come from the environment, stored values win, bad stored values are ignored', () => {
  const base = defaultSettings({});
  assert.deepEqual(base, { searchGapSeconds: 120, ispExclude: ['Tillman Fiberco'], signupsOpen: false, costPerPointUsd: 0.033, powerSave: false, idleOffMinutes: 10, mobileCreditsPerPoint: 1, mobileForCustomers: false, aiFlagsForCustomers: false, pageOneShareForCustomers: false, newPlansLive: false, newPlansPreview: [], newPlansLiveAt: null });
  assert.equal(defaultSettings({ SEARCH_GAP_SECONDS: '45', SIGNUPS_OPEN: 'true' }).searchGapSeconds, 45);
  const merged = mergeSettings({ searchGapSeconds: '45', signupsOpen: 'true', ispExclude: '["A","B"]', costPerPointUsd: '"oops"', unknown: '1' }, base);
  assert.deepEqual(merged, { searchGapSeconds: 45, ispExclude: ['A', 'B'], signupsOpen: true, costPerPointUsd: 0.033, powerSave: false, idleOffMinutes: 10, mobileCreditsPerPoint: 1, mobileForCustomers: false, aiFlagsForCustomers: false, pageOneShareForCustomers: false, newPlansLive: false, newPlansPreview: [], newPlansLiveAt: null });
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

test('settings: power saving is off until an admin turns it on, and the idle time is bounded', () => {
  assert.equal(defaultSettings({ DUOPLUS_POWER_SAVE: 'true', POWER_IDLE_OFF_MINUTES: '5' }).idleOffMinutes, 5);
  assert.deepEqual(cleanSettings({ powerSave: true, idleOffMinutes: 15 }), { powerSave: true, idleOffMinutes: 15 });
  assert.throws(() => cleanSettings({ powerSave: 'yes' }), /on or off/);
  assert.throws(() => cleanSettings({ idleOffMinutes: 1 }), /2 to 240/);
  assert.throws(() => cleanSettings({ idleOffMinutes: 2.5 }), /2 to 240/);
});

test('settings: mobile data price and who can choose it', () => {
  assert.deepEqual(cleanSettings({ mobileCreditsPerPoint: 3, mobileForCustomers: true }), { mobileCreditsPerPoint: 3, mobileForCustomers: true });
  assert.throws(() => cleanSettings({ mobileCreditsPerPoint: 0 }), /1 to 10 phone sessions/);
  assert.throws(() => cleanSettings({ mobileCreditsPerPoint: 2.5 }), /1 to 10 phone sessions/);
  assert.throws(() => cleanSettings({ mobileForCustomers: 'yes' }), /on or off/);
  assert.equal(defaultSettings({ MOBILE_CREDITS_PER_POINT: '3', MOBILE_FOR_CUSTOMERS: 'true' }).mobileCreditsPerPoint, 3);
  assert.equal(creditsPerPoint('mobile', { mobileCreditsPerPoint: 2 }), 2);
  assert.equal(creditsPerPoint('residential', { mobileCreditsPerPoint: 2 }), 1);
  assert.equal(creditsPerPoint(undefined, { mobileCreditsPerPoint: 2 }), 1);
});

import { reconcile } from '../packages/core/kept';

test('bringing the Redis copy and the lasting copy together', () => {
  // First time: only Redis has anything, so all of it is written to the lasting copy.
  const first = reconcile({ searchGapSeconds: '45', powerSave: 'true' }, []);
  assert.deepEqual(first.all, { searchGapSeconds: '45', powerSave: 'true' });
  assert.deepEqual(first.toKeep, [['searchGapSeconds', '45'], ['powerSave', 'true']]);
  assert.deepEqual(first.toRestore, []);
  // Redis was emptied: everything comes back from the lasting copy.
  const wiped = reconcile({}, [{ key: 'searchGapSeconds', value: '45' }, { key: 'powerSave', value: 'true' }]);
  assert.deepEqual(wiped.all, { searchGapSeconds: '45', powerSave: 'true' });
  assert.deepEqual(wiped.toKeep, []);
  assert.equal(wiped.toRestore.length, 2);
  // Emptied, then one value saved again before anything was read: the rest is restored, and where they differ the lasting copy wins.
  const partial = reconcile({ powerSave: 'false', fresh: '1' }, [{ key: 'searchGapSeconds', value: '45' }, { key: 'powerSave', value: 'true' }]);
  assert.deepEqual(partial.all, { powerSave: 'true', fresh: '1', searchGapSeconds: '45' });
  assert.deepEqual(partial.toKeep, [['fresh', '1']]);
  assert.deepEqual(partial.toRestore.map((r) => r.key).sort(), ['powerSave', 'searchGapSeconds']);
  // Both the same: nothing to do.
  assert.deepEqual(reconcile({ a: '1' }, [{ key: 'a', value: '1' }]).toRestore, []);
});

test('new plans: admins and preview accounts see them before launch, everyone after', async () => {
  const { newPlansFor, cleanSettings } = await import('../packages/core/settings');
  const off = { newPlansLive: false, newPlansPreview: ['test@agency.com'] };
  assert.equal(newPlansFor({ email: 'a@b.com', role: 'AGENCY' }, off), false);
  assert.equal(newPlansFor({ email: 'Test@Agency.com', role: 'AGENCY' }, off), true);
  assert.equal(newPlansFor({ email: 'a@b.com', role: 'ADMIN' }, off), true);
  assert.equal(newPlansFor({ email: 'a@b.com', role: 'AGENCY' }, { ...off, newPlansLive: true }), true);
  assert.deepEqual(cleanSettings({ newPlansPreview: 'One@x.com, two@y.org' }), { newPlansPreview: ['one@x.com', 'two@y.org'] });
  assert.throws(() => cleanSettings({ newPlansPreview: 'not an email' }), /account emails/);
});
