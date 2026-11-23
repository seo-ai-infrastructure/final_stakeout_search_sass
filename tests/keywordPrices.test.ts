import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanKeywords, empty, placeOf, readPrices } from '../apps/nextjs/src/lib/keywordPrices';

test('a place: a location code, or a name with the country added when it is left off', () => {
  assert.deepEqual(placeOf(1023022), { location_code: 1023022 });
  assert.deepEqual(placeOf(' 200501 '), { location_code: 200501 });
  assert.deepEqual(placeOf('Suffolk County, New York'), { location_name: 'Suffolk County,New York,United States' });
  assert.deepEqual(placeOf('Suffolk County,New York,United States'), { location_name: 'Suffolk County,New York,United States' });
  assert.deepEqual(placeOf('United States'), { location_name: 'United States' });
  assert.deepEqual(placeOf('London, England, United Kingdom'), { location_name: 'London,England,United Kingdom' });
  assert.equal(placeOf(''), null);
  assert.equal(placeOf(null), null);
  assert.equal(placeOf(-4), null);
});

test('searches as Google Ads takes them: lowercase, no symbols, short enough, no repeats', () => {
  const { keywords, skipped } = cleanKeywords(['Car Accident Lawyer', 'car accident lawyer ', 'abogado de lesiones personales', 'best lawyer 🚗 near me', 'a b c d e f g h i j k', 42, '']);
  assert.deepEqual(keywords, ['car accident lawyer', 'abogado de lesiones personales', 'best lawyer near me', '42']);
  assert.deepEqual(skipped, ['a b c d e f g h i j k']);
  assert.equal(cleanKeywords(['x'.repeat(81)]).skipped.length, 1);
  assert.deepEqual(cleanKeywords(['one', 'two', 'three'], 2), { keywords: ['one', 'two'], skipped: ['three'] });
});

test('prices read from the answer, with money in cents and Google’s blanks kept blank', () => {
  const [a, b] = readPrices([
    { keyword: 'car accident lawyer near me', spell: null, search_volume: 2400, cpc: 139.1149, low_top_of_page_bid: 90, high_top_of_page_bid: 220.004, competition: 'LOW', competition_index: 22, monthly_searches: [{ year: 2026, month: 10, search_volume: 2900 }, { year: 2026, month: 9, search_volume: null }] },
    { keyword: 'personal injury lawyer', spell: null, search_volume: null, cpc: null, low_top_of_page_bid: null, high_top_of_page_bid: null, competition: null, competition_index: null, monthly_searches: null },
    { spell: 'nameless' },
  ]);
  assert.deepEqual(a, { keyword: 'car accident lawyer near me', spell: null, searches: 2400, cpc: 139.11, lowBid: 90, highBid: 220, competition: 'LOW', competitionIndex: 22, months: [{ year: 2026, month: 10, searches: 2900 }, { year: 2026, month: 9, searches: null }], alone: false });
  assert.equal(empty(a), false);
  assert.equal(empty(b), true);
  assert.equal(readPrices(null).length, 0);
  assert.equal(readPrices([{ keyword: 'x', search_volume: 10 }], true)[0].alone, true);
});
