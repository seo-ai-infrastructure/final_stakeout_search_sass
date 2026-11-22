import test from 'node:test';
import assert from 'node:assert/strict';
import { isSpanish, otherMarket, placeIn } from '../apps/nextjs/src/lib/searchTerms';

test('a search in Spanish: a Spanish word of the trade, with a joining word or in a short phrase', () => {
  for (const q of ['abogado de lesiones personales', 'abogado de accidentes de auto en long island', 'abogados accidentes', 'abogado de accidentes de camion']) assert.equal(isSpanish(q), true, q);
  for (const q of ['car accident lawyer', 'auto accident lawyer huntington ny', 'are broderick and broderick law offices ny open on columbus day', 'personal injury lawyer']) assert.equal(isSpanish(q), false, q);
});

test('the place a search names, without the trade’s own words', () => {
  assert.equal(placeIn('car accident attorney orange county ny'), 'orange county');
  assert.equal(placeIn('auto accident lawyer huntington ny'), 'huntington');
  assert.equal(placeIn('accident lawyer jamaica ny'), 'jamaica');
  assert.equal(placeIn('personal injury lawyer suffolk county ny'), 'suffolk county');
  assert.equal(placeIn('best plumber in lakeland fl'), 'lakeland');
  assert.equal(placeIn('car accident lawyer ny'), null);
  assert.equal(placeIn('car accident lawyer'), null);
  assert.equal(placeIn('huntington construction accident attorney'), null);
});

test('another market: a place none of the scan’s own, with the page far down for it', () => {
  const far = otherMarket(['Huntington', 'Huntington Station', 'Greenlawn'], ['suffolk']);
  assert.equal(far('car accident attorney orange county ny', 77.5), true);
  assert.equal(far('accident lawyer jamaica ny', 82.3), true);
  assert.equal(far('car accident lawyer suffolk county', 88), false, 'the grid’s own county');
  assert.equal(far('auto accident lawyer huntington ny', 77), false, 'the office’s own town');
  assert.equal(far('car accident attorney orange county ny', 22), false, 'not far down');
  assert.equal(far('car accident lawyer', 90), false, 'no place named');
  // Counties unknown: a county is never called another market; towns still are.
  const unknown = otherMarket(['Huntington'], null);
  assert.equal(unknown('car accident attorney orange county ny', 77.5), false);
  assert.equal(unknown('accident lawyer jamaica ny', 82.3), true);
});
