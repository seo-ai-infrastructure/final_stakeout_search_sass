import test from 'node:test';
import assert from 'node:assert/strict';
import { isSpanish, placeIn } from '../apps/nextjs/src/lib/searchTerms';

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
