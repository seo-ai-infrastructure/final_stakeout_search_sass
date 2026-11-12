import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ITEMS, EXTRA, ONBOARDING, PLANS, itemsFor, perCredit, scans5x5, usd } from '../apps/nextjs/src/lib/pricing';

test('pricing: the agreed prices, and every item identifiable by its credit count', () => {
  assert.deepEqual([ONBOARDING.cents, ONBOARDING.credits, ONBOARDING.regularCents], [49700, 1000, 99700]);
  assert.deepEqual(PLANS.map((p) => [p.name, p.cents, p.credits]), [['Starter', 19700, 700], ['Growth', 39700, 1600], ['Agency', 69700, 3500]]);
  assert.equal(new Set(ALL_ITEMS.map((i) => i.credits)).size, ALL_ITEMS.length, 'checkout tells items apart by credits');
  assert.deepEqual(PLANS.map((p) => perCredit(p).toFixed(2)), ['0.28', '0.25', '0.20'], 'the rate falls as the plan grows');
  assert.ok(perCredit(EXTRA) > Math.max(...PLANS.map(perCredit)), 'extra credits cost more than any plan');
});

test('pricing: onboarding first and once, then plans and extra credits', () => {
  assert.deepEqual(itemsFor({ onboarded: false }).map((i) => i.key), ['onboarding']);
  assert.deepEqual(itemsFor({ onboarded: true }).map((i) => i.key), ['starter', 'growth', 'agency', 'extra']);
  assert.deepEqual([usd(49700), usd(7000), usd(35), usd(99700)], ['$497', '$70', '$0.35', '$997']);
  assert.deepEqual(scans5x5(700), { plain: 28, withAi: 14 });
});

test('PayPal address: the two real addresses and their obvious variations, nothing else', async () => {
  const { paypalBase } = await import('../apps/nextjs/src/lib/paypalBase');
  const S = 'https://api-m.sandbox.paypal.com', L = 'https://api-m.paypal.com';
  for (const v of [undefined, '', ' ', S, S + '/', ' ' + S + ' ', 'api-m.sandbox.paypal.com', 'HTTPS://API-M.SANDBOX.PAYPAL.COM', 'https://api.sandbox.paypal.com', 'sandbox']) assert.equal(paypalBase(v), S, String(v));
  for (const v of [L, L + '/', 'api-m.paypal.com', 'https://api.paypal.com', 'live', 'production']) assert.equal(paypalBase(v), L, v);
  for (const v of ['https://evil.example.com', 'https://api-m.paypal.com.evil.com', 'https://api-m.sandbox.paypal.com/v2', 'paypal']) assert.throws(() => paypalBase(v), /PAYPAL_API_BASE must be/, v);
});
