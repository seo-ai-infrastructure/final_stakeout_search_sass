import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ITEMS, EXTRA, ONBOARDING, PLANS, itemsFor, perCredit, scans5x5, usd } from '../apps/nextjs/src/lib/pricing';

test('pricing: the agreed prices, and every item identifiable by its credit count', () => {
  assert.deepEqual([ONBOARDING.cents, ONBOARDING.credits, ONBOARDING.name], [99700, 1000, 'Onboarding']);
  assert.deepEqual(PLANS.map((p) => [p.name, p.cents, p.credits]), [['Starter', 19700, 700], ['Growth', 39700, 1600], ['Agency', 69700, 3500]]);
  assert.equal(new Set(ALL_ITEMS.map((i) => i.credits)).size, ALL_ITEMS.length, 'checkout tells items apart by credits');
  assert.deepEqual(PLANS.map((p) => perCredit(p).toFixed(2)), ['0.28', '0.25', '0.20'], 'the rate falls as the plan grows');
  assert.ok(perCredit(EXTRA) > Math.max(...PLANS.map(perCredit)), 'extra credits cost more than any plan');
});

test('pricing: onboarding first and once, then plans and extra credits', () => {
  assert.deepEqual(itemsFor({ onboarded: false }).map((i) => i.key), ['onboarding']);
  assert.deepEqual(itemsFor({ onboarded: true }).map((i) => i.key), ['starter', 'growth', 'agency', 'extra']);
  assert.deepEqual([usd(ONBOARDING.cents), usd(7000), usd(35), usd(19700)], ['$997', '$70', '$0.35', '$197']);
  assert.equal(scans5x5(700), 28);
});

test('PayPal address: the two real addresses and their obvious variations, nothing else', async () => {
  const { paypalBase } = await import('../apps/nextjs/src/lib/paypalBase');
  const S = 'https://api-m.sandbox.paypal.com', L = 'https://api-m.paypal.com';
  for (const v of [undefined, '', ' ', S, S + '/', ' ' + S + ' ', 'api-m.sandbox.paypal.com', 'HTTPS://API-M.SANDBOX.PAYPAL.COM', 'https://api.sandbox.paypal.com', 'sandbox']) assert.equal(paypalBase(v), S, String(v));
  for (const v of [L, L + '/', 'api-m.paypal.com', 'https://api.paypal.com', 'live', 'production']) assert.equal(paypalBase(v), L, v);
  for (const v of ['https://evil.example.com', 'https://api-m.paypal.com.evil.com', 'https://api-m.sandbox.paypal.com/v2', 'paypal']) assert.throws(() => paypalBase(v), /PAYPAL_API_BASE must be/, v);
});

test('PayPal refusals are explained, with PayPal\'s own code kept', async () => {
  const { paypalProblem } = await import('../apps/nextjs/src/lib/paypalBase');
  assert.match(paypalProblem('PAYEE_ACCOUNT_INVALID'), /merchant ID \(PAYEE_ACCOUNT_INVALID\).*PAYPAL_MERCHANT_ID/);
  assert.match(paypalProblem('INVALID_PARAMETER_VALUE', '/purchase_units/0/payee/merchant_id'), /PAYPAL_MERCHANT_ID/);
  assert.match(paypalProblem('PERMISSION_DENIED'), /not allowed/);
  assert.match(paypalProblem('INSTRUMENT_DECLINED'), /declined that payment method/);
  assert.equal(paypalProblem('UNPROCESSABLE_ENTITY'), 'PayPal could not complete this operation (UNPROCESSABLE_ENTITY).');
});

test('the $1 payment test is for admins only; the payment alert says who paid and what to do', async () => {
  const { ADMIN_TEST, paymentNotice } = await import('../apps/nextjs/src/lib/pricing');
  assert.deepEqual([ADMIN_TEST.cents, ADMIN_TEST.credits], [100, 5]);
  assert.ok(!itemsFor({ onboarded: true }).some((i) => i.key === 'admin-test'), 'customers never see it');
  assert.ok(!itemsFor({ onboarded: false }).some((i) => i.key === 'admin-test'));
  assert.deepEqual(itemsFor({ onboarded: true, admin: true }).map((i) => i.key), ['starter', 'growth', 'agency', 'extra', 'admin-test']);
  const base = { buyer: 'a@b.com', balance: 1000, orderId: 'O1', captureId: 'C1' };
  const on = paymentNotice({ ...base, credits: 1000, cents: 99700, sandbox: false });
  assert.equal(on.subject, 'Payment: Onboarding, $997, a@b.com');
  assert.match(on.lines[0], /a@b\.com paid \$997 for Onboarding \(1,000 credits\)\. Their balance is now 1,000\./);
  assert.ok(on.lines.some((l) => /book their onboarding call/.test(l)));
  assert.ok(!on.lines.some((l) => /SANDBOX/.test(l)));
  const sb = paymentNotice({ ...base, credits: 700, cents: 19700, sandbox: true });
  assert.equal(sb.subject, '[Sandbox] Payment: Starter, $197, a@b.com');
  assert.ok(sb.lines.some((l) => /no real money moved/.test(l)) && !sb.lines.some((l) => /onboarding call/.test(l)));
});

test('onboarding status: only "no" keeps the plans out of reach; an admin can waive it', async () => {
  const { onboardingStatus } = await import('../apps/nextjs/src/lib/pricing');
  const a = { paid: false, waived: false, admin: false, beforePricing: false };
  assert.equal(onboardingStatus(a), 'no');
  assert.equal(onboardingStatus({ ...a, waived: true }), 'waived');
  assert.equal(onboardingStatus({ ...a, paid: true, waived: true }), 'paid');
  assert.equal(onboardingStatus({ ...a, admin: true }), 'exempt');
  assert.equal(onboardingStatus({ ...a, beforePricing: true }), 'exempt');
  // What each can buy: onboarding only for 'no', the plans for everyone else.
  for (const [st, first] of [['no', 'onboarding'], ['waived', 'starter'], ['paid', 'starter'], ['exempt', 'starter']] as const)
    assert.equal(itemsFor({ onboarded: st !== 'no' })[0].key, first, st);
});

test('AI Overview tracking is part of every Chrome scan, whatever is sent; Maps scans have none', async () => {
  const { parseSpec } = await import('../packages/core/grid');
  const base = { targetBusiness: 'Acme Plumbing', keyword: 'plumber', centerLat: 28.04, centerLng: -81.95, gridSize: 3, spacingKm: 1.60934, scheduleType: 'once' };
  for (const sent of [true, false, undefined])
    assert.equal(parseSpec({ ...base, targetType: 'mobile_chrome', ...(sent === undefined ? {} : { trackAiOverviews: sent }) }).trackAiOverviews, true, 'chrome, sent ' + sent);
  for (const sent of [true, false])
    assert.equal(parseSpec({ ...base, targetType: 'mobile_maps', trackAiOverviews: sent }).trackAiOverviews, false, 'maps, sent ' + sent);
});

test('grid sizes on offer: 3×3, 5×5 and 9×9 for now; the default is one of them', async () => {
  const { OFFERED_GRID_SIZES, parseSpec } = await import('../packages/core/grid');
  assert.deepEqual([...OFFERED_GRID_SIZES], [3, 5, 9]);
  const base = { targetBusiness: 'Acme Plumbing', keyword: 'plumber', centerLat: 28.04, centerLng: -81.95 };
  assert.ok(OFFERED_GRID_SIZES.includes(parseSpec(base).gridSize), 'a scan with no size given gets an offered one');
  // Older scans of any size still parse (they re-run and repeat on schedule); the create route limits new ones.
  assert.equal(parseSpec({ ...base, gridSize: 7 }).gridSize, 7);
});
