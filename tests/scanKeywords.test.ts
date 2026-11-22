import test from 'node:test';
import assert from 'node:assert/strict';
import { scanKeywords } from '../apps/nextjs/src/lib/scanKeywords';

test('a pasted batch contributes distinct queries alongside the selected keywords', () => {
  assert.deepEqual(
    scanKeywords(['emergency plumber', 'drain cleaning'], ' Emergency   Plumber, water heater repair\n\nDRAIN CLEANING; plumber near me'),
    ['emergency plumber', 'drain cleaning', 'water heater repair', 'plumber near me'],
  );
});

test('blank lines and separators never become billable keyword jobs', () => {
  assert.deepEqual(scanKeywords([], ' ,\n;  '), []);
  assert.deepEqual(scanKeywords(['Drain cleaning', 'drain cleaning']), ['Drain cleaning']);
});

test('pasting a batch has the same launch queries before and after committing its chips', () => {
  const selected = ['plumber near me'];
  const input = 'drain cleaning, water heater repair\nPLUMBER NEAR ME';
  const preview = scanKeywords(selected, input);
  const committed = scanKeywords(preview);
  assert.deepEqual(preview, committed);
  assert.equal(preview.length * 25 * 2, committed.length * 25 * 2);
});
