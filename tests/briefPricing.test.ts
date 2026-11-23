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
