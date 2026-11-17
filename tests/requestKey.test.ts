import test from 'node:test';
import assert from 'node:assert/strict';
import { requestKeyValid } from '../packages/core/requestKey';

test('launch keys: one scan, several keywords (new and pre-v143 pages), and junk', () => {
  const id = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
  assert.equal(requestKeyValid(id), true);
  // Several keywords: one key per keyword, as the page sends them now…
  for (let i = 0; i < 12; i++) assert.equal(requestKeyValid(id + '-' + i), true);
  // …and as pages loaded before the fix sent them (this was rejected: "Invalid request key").
  assert.equal(requestKeyValid(id + ':4'), true);
  assert.equal(requestKeyValid('short'), false);
  assert.equal(requestKeyValid(id + ' 1'), false);
  assert.equal(requestKeyValid('x'.repeat(81)), false);
  assert.equal(requestKeyValid(id + '/0'), false);
});
