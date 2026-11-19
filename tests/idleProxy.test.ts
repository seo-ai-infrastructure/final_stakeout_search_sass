import test from 'node:test';
import assert from 'node:assert/strict';
import { assignIdleProxies, groupProxyIds } from '../packages/core/idleProxy';

test('idle proxies are the ones in the chosen DuoPlus proxy group', () => {
  const rows = [
    { id: 'p3', group_ids: ['BU7hQ'] },
    { id: 'p1', group_ids: ['other', 'BU7hQ'] },
    { id: 'p2', group_ids: ['other'] },
    { id: 'p4' },
    null,
    { id: 'p1', group_ids: ['BU7hQ'] },
  ];
  assert.deepEqual(groupProxyIds(rows, 'BU7hQ'), ['p1', 'p3']);
  assert.deepEqual(groupProxyIds(rows, 'nope'), []);
});

test('one idle proxy per phone, the same one every time', () => {
  const phones = ['UXsp5', 'x0Puo', 'ouVAT'];
  const first = assignIdleProxies(phones, ['a', 'b', 'c', 'd'], {}, new Set());
  assert.deepEqual(first.map, { UXsp5: 'a', x0Puo: 'b', ouVAT: 'c' });
  assert.deepEqual(first.without, []);
  // Stable: each phone keeps its proxy, even when the group's order changes.
  assert.deepEqual(assignIdleProxies(phones, ['d', 'c', 'b', 'a'], first.map, new Set()).map, first.map);
  // A proxy that left the group is replaced by a free one; no two phones ever share one.
  const next = assignIdleProxies(phones, ['a', 'c', 'd'], first.map, new Set());
  assert.deepEqual(next.map, { UXsp5: 'a', x0Puo: 'd', ouVAT: 'c' });
  assert.equal(new Set(Object.values(next.map)).size, 3);
});

test('a phone’s own search proxy is never used as an idle proxy, and spare phones get none', () => {
  const r = assignIdleProxies(['UXsp5', 'x0Puo', 'ouVAT'], ['a', 'own1', 'b'], { ouVAT: 'own1' }, new Set(['own1']));
  assert.deepEqual(r.map, { UXsp5: 'a', x0Puo: 'b' });
  assert.deepEqual(r.without, ['ouVAT']);
});

import { dueForIdle, listsToRelease, type IdlePhone } from '../packages/core/idleProxy';

const phone = (over: Partial<IdlePhone>): IdlePhone => ({ imageId: 'a', locked: false, busy: false, freeSince: 1000, restEndsAt: 0, wantsIdle: true, refusedUntil: 0, ...over });

test('a free phone moves to its idle proxy on its own, whatever the fleet is doing', () => {
  const now = 100000;
  // Free for 20 s with nothing waiting: it moves. Not yet 20 s: it waits.
  assert.deepEqual(dueForIdle([phone({ freeSince: now - 20000 })], now, 20000, 0), ['a']);
  assert.deepEqual(dueForIdle([phone({ freeSince: now - 19000 })], now, 20000, 0), []);
  // Running a point, having its evidence pulled, already on its idle proxy, or without one: left alone.
  for (const over of [{ locked: true }, { busy: true }, { wantsIdle: false }, { freeSince: 0 }])
    assert.deepEqual(dueForIdle([phone({ freeSince: now - 60000, ...over })], now, 20000, 0), []);
  // DuoPlus refused it: not asked again until the wait is over.
  assert.deepEqual(dueForIdle([phone({ freeSince: now - 60000, refusedUntil: now + 1 })], now, 20000, 0), []);
  assert.deepEqual(dueForIdle([phone({ freeSince: now - 60000, refusedUntil: now })], now, 20000, 0), ['a']);
});

test('while points wait, a phone about to get one keeps its proxy; a resting or unused phone still moves', () => {
  const now = 1000000;
  const free = now - 30000;
  // Rest over, points waiting: it is about to be given one.
  assert.deepEqual(dueForIdle([phone({ freeSince: free, restEndsAt: now - 1 })], now, 20000, 3), []);
  assert.deepEqual(dueForIdle([phone({ freeSince: free, restEndsAt: now + 30000 })], now, 20000, 3), []);
  // A long rest ahead: it moves for the rest.
  assert.deepEqual(dueForIdle([phone({ freeSince: free, restEndsAt: now + 90000 })], now, 20000, 3), ['a']);
  // Free for three minutes although points wait: none of them can use it.
  assert.deepEqual(dueForIdle([phone({ freeSince: now - 180000, restEndsAt: 0 })], now, 20000, 3), ['a']);
  // Only its own state counts: other phones being busy does not hold it.
  assert.deepEqual(dueForIdle([phone({ imageId: 'b', locked: true }), phone({ freeSince: free })], now, 20000, 0), ['a']);
});

test('a proxy list goes three minutes after its last use, unless an open scan needs it', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  const at = (minsAgo: number) => new Date(now - minsAgo * 60000);
  const lists = [
    { id: 'fresh', region: 'Florida', lastUsedAt: at(2) },
    { id: 'old', region: 'Florida', lastUsedAt: at(4) },
    { id: 'georgia', region: 'Georgia', lastUsedAt: at(40) },
    { id: 'next-state', region: 'South Carolina', lastUsedAt: at(25) },
    { id: 'long-ago', region: 'Texas', lastUsedAt: at(90) },
  ];
  const ids = (open: { regions: Set<string>; oldestAt: Date | null }) => listsToRelease(lists, open, now, 3 * 60000).map((l) => l.id);
  // No scan open: everything unused for three minutes.
  assert.deepEqual(ids({ regions: new Set(), oldestAt: null }), ['old', 'georgia', 'next-state', 'long-ago']);
  // A Georgia scan opened 30 minutes ago: its state's lists stay, and so does the list across
  // the state line it touched since (anything used since it began may be its own). A list last
  // used well before it began belongs to an earlier scan elsewhere, and goes.
  assert.deepEqual(ids({ regions: new Set(['Georgia']), oldestAt: at(30) }), ['long-ago']);
});
