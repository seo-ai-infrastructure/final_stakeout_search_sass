import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskWatcher } from '../packages/core/taskWatcher';

const setup = (rows: () => any[] | Promise<any[]>, byName = async (_n: string) => null as any) => {
  let clock = 1_000_000;
  const asked: string[] = [];
  const w = createTaskWatcher({
    pollMs: 60_000,
    list: async () => rows(),
    byName: async (n) => (asked.push(n), byName(n)),
    now: () => clock,
  });
  return { w, asked, tick: (ms: number) => (clock += ms) };
};

test('one list request updates every waiting search', async () => {
  const { w, asked } = setup(() => [
    { id: 11, name: 'stakeout-a', status: 1, created_at: '2026-11-18 05:00:01' },
    { id: 12, name: 'stakeout-b', status: 3 },
    { id: 13, name: 'someone-else', status: 1 },
  ]);
  const a = w.watch('stakeout-a');
  const b = w.watch('stakeout-b');
  await w.poll();
  assert.deepEqual([a.task?.id, a.task?.status, b.task?.id, b.task?.status], ['11', 1, '12', 3]);
  assert.deepEqual(asked, [], 'nothing asked one by one');
  w.unwatch('stakeout-a');
  w.unwatch('stakeout-b');
  assert.equal(w.running(), false, 'no polling once nothing waits');
});

test('a task the list does not show is asked for by name, a few at a time and not too often', async () => {
  const { w, asked, tick } = setup(() => [], async (n) => ({ id: 'x-' + n, status: 1 }));
  const names = ['t1', 't2', 't3'];
  const watches = names.map((n) => w.watch(n));
  await w.poll();
  assert.deepEqual(asked, [], 'just added: give the list a moment');
  tick(10_000);
  await w.poll();
  assert.deepEqual(asked, ['t1', 't2'], 'two per round');
  tick(5_000);
  await w.poll();
  assert.deepEqual(asked, ['t1', 't2', 't3']);
  tick(5_000);
  await w.poll();
  assert.equal(asked.length, 3, 'each one at most every 20 s');
  assert.equal(watches[2].task?.id, 'x-t3');
  names.forEach((n) => w.unwatch(n));
});

test('a failing list never stops the searches: they are asked for by name', async () => {
  const { w, asked, tick } = setup(() => {
    throw new Error('DuoPlus rejected /api/v1/automation/taskList (code 400)');
  }, async () => ({ id: '9', status: 4 }));
  const t = w.watch('stakeout-z');
  tick(15_000);
  await w.poll();
  assert.deepEqual(asked, ['stakeout-z']);
  assert.equal(t.task?.status, 4);
  w.unwatch('stakeout-z');
});
