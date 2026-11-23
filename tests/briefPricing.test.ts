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

test('brief pricing: the broader search a missing price falls back to keeps the trade and "near me"', async () => {
  const { headsOf } = await import('../apps/nextjs/src/lib/brief');
  assert.deepEqual(headsOf('exterior house painters near me'), ['house painters near me', 'house painter near me']);
  assert.deepEqual(headsOf('best painters near me'), ['painters near me', 'painter near me']);
  assert.deepEqual(headsOf('emergency painting companies near me now'), ['painting companies near me', 'painting company near me']);
  assert.deepEqual(headsOf('car accident lawyer'), [], 'nothing to drop: no broader search');
  assert.deepEqual(headsOf('house painters near me'), []);
});

test('brief pricing: singular and plural, -y and -ies too', async () => {
  const { headsOf } = await import('../apps/nextjs/src/lib/brief');
  // headsOf's second form is the plural or singular of the first.
  assert.deepEqual(headsOf('best roofing company near me'), ['roofing company near me', 'roofing companies near me']);
  assert.deepEqual(headsOf('top attorneys near me'), ['attorneys near me', 'attorney near me']);
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

test('brief pricing: a quotable price, and when a county is too thin to price locally', async () => {
  const { quotable, thinCounty } = await import('../apps/nextjs/src/lib/brief');
  const p = (cpc: number | null, lowBid: number | null, highBid: number | null, searches: number | null = 10) => ({ keyword: 'k', spell: null, searches, cpc, lowBid, highBid, competition: null, competitionIndex: null, months: [], alone: false });
  assert.equal(quotable(p(2.11, null, null)), null, 'under $5 with no top-of-page bids: remnant clicks, no price');
  assert.equal(quotable(p(6.5, null, null))?.cpc, 6.5);
  assert.equal(quotable(p(4, 12.67, 79.28))?.cpc, 45.98, 'average dragged under the low bid: the middle of the bid range');
  assert.equal(quotable(p(4, 12.67, 79.28))?.avgCpc, 4);
  assert.equal(quotable(p(56.53, 17.76, 204.6))?.cpc, 56.53, 'a normal average stands');
  assert.equal(quotable(p(null, 10, 30))?.cpc, 20);
  assert.equal(thinCounty([p(18, 7, 42, 10), p(13, 7, 46, 10), p(16, 7, 30, 10)]), true, 'Wilson County: 30 searches a month');
  assert.equal(thinCounty([p(157, 87, 225, 2900), p(150, 80, 210, 300)]), false, 'Suffolk County: plenty of searches and bids');
  assert.equal(thinCounty([p(157, 87, 225, 2900), p(150, null, null, 300)]), true, 'only one with a bid range');
  assert.equal(thinCounty([p(157, 87, 225, 200), p(157, 87, 225, 200)]), true, 'one group repeated counts once');
});

test('brief pricing: no trade-alone root from a specialty', async () => {
  const { rootsOf } = await import('../apps/nextjs/src/lib/brief');
  assert.ok(!rootsOf('best car accident lawyer near me').includes('lawyer near me'));
  assert.deepEqual(rootsOf('car accident lawyer near me'), []);
});
