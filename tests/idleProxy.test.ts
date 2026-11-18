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
