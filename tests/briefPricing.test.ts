import test from 'node:test';
import assert from 'node:assert/strict';
import { PricingUnavailable, pricingShort } from '../apps/nextjs/src/lib/brief';

test('brief pricing: a failed lookup blocks a paid brief only when the scanned searches are not kept', () => {
  const kept = new Map<string, unknown>([['car accident lawyer', { cpc: 139 }], ['broderick law', null]]);
  // Kept, even as "Google gave no figures": the brief can go out, the credit is spent.
  assert.equal(pricingShort(['car accident lawyer', 'broderick law'], kept), false);
  // A scanned search never answered: no brief, no credit spent.
  assert.equal(pricingShort(['car accident lawyer', 'personal injury lawyer near me'], kept), true);
  const e = new PricingUnavailable();
  assert.equal(e.status, 503);
  assert.match(e.message, /your brief credit was not used/);
});

test('brief pricing: singular and plural ride as variants, -y and -ies too', async () => {
  const { fallbacksOf } = await import('../apps/nextjs/src/lib/brief');
  assert.ok(fallbacksOf('roofing company near me').includes('roofing companies near me'));
  assert.ok(fallbacksOf('painting companies near me').includes('painting company near me'), 'not "companie"');
  assert.ok(fallbacksOf('car accident lawyer').includes('car accident attorney'));
});

test('brief: what the brief calls the business', async () => {
  const { shortName } = await import('../apps/nextjs/src/lib/brief');
  const cases: [string, string][] = [
    ['McIntyre Painting', 'McIntyre Painting'],
    ["Stuart's Plumbing", 'Stuart’s Plumbing'],
    ['Brandon J. Broderick, Personal Injury Attorney at Law', 'Broderick'],
    ['Gisela N Sanchez, REALTOR', 'Sanchez'],
    ['Mark Ayzenberg, MD - Iron Mountain Orthopaedic Institute', 'Ayzenberg'],
    ["Charlotte's Best Roofing And Gutters", 'Charlotte’s'],
    ['Top Dollar Home Offer', 'Top Dollar'],
    ['Payne Air Conditioning & Heating', 'Payne'],
    ['Lakeland Accident & Injury Attorney at Law', 'Lakeland'],
  ];
  for (const [name, want] of cases) assert.equal(shortName(name), want, name);
});

test('brief pricing: category roots ride in the same request', async () => {
  const { rootsOf } = await import('../apps/nextjs/src/lib/brief');
  assert.deepEqual(rootsOf('exterior house painters near me'), ['house painters', 'house painters near me', 'painters', 'painters near me']);
  assert.deepEqual(rootsOf('exterior painting contractors near me'), ['painting contractors', 'painting contractors near me', 'exterior painting', 'exterior painting near me']);
  assert.deepEqual(rootsOf('best painters near me'), ['painters', 'painters near me']);
  assert.ok(rootsOf('emergency painting companies near me now').includes('painting companies near me'));
  assert.deepEqual(rootsOf('house painters'), [], 'already a root');
});

const price = (keyword: string, cpc: number | null, lowBid: number | null, highBid: number | null, searches: number | null = 10) => ({ keyword, spell: null, searches, cpc, lowBid, highBid, competition: null, competitionIndex: null, months: [], alone: false });

test('brief pricing: when a county is too thin to price locally', async () => {
  const { thinCounty } = await import('../apps/nextjs/src/lib/brief');
  assert.equal(thinCounty([price('a', 18, 7, 42, 10), price('b', 13, 7, 46, 10), price('c', 16, 7, 30, 10)]), true, 'Wilson County: 30 searches a month');
  assert.equal(thinCounty([price('a', 157, 87, 225, 2900), price('b', 150, 80, 210, 300)]), false, 'Suffolk County: plenty of searches and bids');
  assert.equal(thinCounty([price('a', 157, 87, 225, 2900), price('b', 150, null, null, 300)]), true, 'only one with a bid range');
  assert.equal(thinCounty([price('a', 157, 87, 225, 200), price('b', 157, 87, 225, 200)]), true, 'one group repeated counts once');
});

test('brief pricing: a thin county is priced at the U.S. high top-of-page bid, never called an average', async () => {
  const { topBid } = await import('../apps/nextjs/src/lib/brief');
  const us = new Map([
    ['exterior house painters near me', price('exterior house painters near me', 18.13, 7.68, 42.41, 70)],
    ['painting companies near me', price('painting companies near me', 12.22, 7.74, 39.33, 900)],
    ['best painters near me', price('best painters near me', 16.86, null, null, 50)],
    ['painters near me', price('painters near me', 15, 7, 30.22, 4000)],
  ]);
  const own = topBid(us, 'exterior house painters near me');
  assert.deepEqual([own?.cpc, own?.avgCpc, own?.area, own?.via], [42.41, 18.13, 'U.S.', undefined], 'the high bid, the average kept beside it');
  const root = topBid(us, 'emergency painting companies near me now');
  assert.deepEqual([root?.cpc, root?.via], [39.33, 'painting companies near me'], 'a category root when the search has no bid');
  const noBid = topBid(us, 'best painters near me');
  assert.deepEqual([noBid?.cpc, noBid?.via], [30.22, 'painters near me'], 'no bid range on the search itself: its root’s');
  assert.equal(topBid(new Map([['x', price('x', 20, null, null)]]), 'x'), null, 'an average alone is never quoted as a bid');
});

test('brief pricing: no trade-alone root from a specialty', async () => {
  const { rootsOf } = await import('../apps/nextjs/src/lib/brief');
  assert.ok(!rootsOf('best car accident lawyer near me').includes('lawyer near me'));
  assert.deepEqual(rootsOf('car accident lawyer near me'), []);
});
