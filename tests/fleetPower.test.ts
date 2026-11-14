import test from 'node:test';
import assert from 'node:assert/strict';
import { planPower, type PowerPhone } from '../packages/core/fleetPower';

const off = (id: string, canStart = true): PowerPhone => ({ id, status: 2, canStart });
const on = (id: string): PowerPhone => ({ id, status: 1, canStart: false });
const MIN = 60000;
const base = { idleMs: 0, idleOffMs: 10 * MIN };

test('power saving: a scan switches on one phone per waiting point, up to every phone', () => {
  const five = ['a', 'b', 'c', 'd', 'e'].map((id) => off(id));
  assert.deepEqual(planPower({ ...base, phones: five, pending: 25 }).on, ['a', 'b', 'c', 'd', 'e']);
  // A single re-run starts one phone, not five.
  assert.deepEqual(planPower({ ...base, phones: five, pending: 1 }).on, ['a']);
  // MOBILE_CONCURRENCY still holds phones back.
  assert.deepEqual(planPower({ ...base, phones: five, pending: 25, max: 3 }).on, ['a', 'b', 'c']);
  // Phones already on or starting count: only the shortfall is started, and nothing is switched off.
  const mixed = [on('a'), { id: 'b', status: 10, canStart: false }, off('c'), off('d')];
  assert.deepEqual(planPower({ ...base, phones: mixed, pending: 3 }), { on: ['c'], off: [], active: 2, want: 3 });
  assert.deepEqual(planPower({ ...base, phones: mixed, pending: 2 }).on, []);
});

test('power saving: phones that may not be started are left off; a named test phone is started', () => {
  const phones = [off('a', false), off('b'), on('c')];
  assert.deepEqual(planPower({ ...base, phones, pending: 9 }).on, ['b']);
  // An admin test point on phone b: started although another phone is already on.
  assert.deepEqual(planPower({ ...base, phones: [on('c'), off('a'), off('b')], pending: 1, mustIds: ['b'] }).on, ['b']);
  // A named phone that cannot be started is not forced.
  assert.deepEqual(planPower({ ...base, phones, pending: 1, mustIds: ['a'] }).on, []);
});

test('power saving: phones go off only after the queue has stayed empty, never while points wait', () => {
  const phones = [on('a'), on('b'), { id: 'c', status: 11, canStart: false }, off('d')];
  assert.deepEqual(planPower({ phones, pending: 0, idleMs: 9 * MIN, idleOffMs: 10 * MIN }).off, []);
  // Long enough: every phone that is on goes off; one still configuring is left to finish first.
  assert.deepEqual(planPower({ phones, pending: 0, idleMs: 10 * MIN, idleOffMs: 10 * MIN }), { on: [], off: ['a', 'b'], active: 3, want: 0 });
  assert.deepEqual(planPower({ phones, pending: 1, idleMs: 99 * MIN, idleOffMs: 10 * MIN }).off, []);
});
