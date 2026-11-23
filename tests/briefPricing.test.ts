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
