import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ITEMS, ONBOARDING, PACKS, PLANS, PREPAID, PROMO, itemsFor, perCredit, promoLive, scans5x5, usd } from '../apps/nextjs/src/lib/pricing';

test('pricing: the agreed prices, and every item identifiable by its credit count', () => {
  assert.deepEqual([ONBOARDING.cents, ONBOARDING.credits, ONBOARDING.name], [99700, 1000, 'Onboarding']);
  assert.deepEqual(PACKS.map((p) => [p.name, p.cents, p.credits]), [['Sample', 2500, 25], ['Starter Pack', 4900, 100], ['Pro Pack', 12900, 300]]);
  assert.deepEqual(PLANS.map((p) => [p.name, p.cents, p.credits]), [['Starter', 19700, 700], ['Growth', 39700, 1600], ['Agency', 69700, 3500]]);
  assert.equal(new Set(ALL_ITEMS.map((i) => i.credits)).size, ALL_ITEMS.length, 'checkout tells items apart by credits');
  assert.deepEqual(PACKS.map((p) => perCredit(p).toFixed(2)), ['1.00', '0.49', '0.43'], 'a bigger pack costs less per credit');
  assert.deepEqual(PLANS.map((p) => perCredit(p).toFixed(2)), ['0.28', '0.25', '0.20'], 'the rate falls as the plan grows');
  assert.ok(Math.min(...PACKS.map(perCredit)) > Math.max(...PLANS.map(perCredit)), 'any pack costs more per credit than any plan');
  // Three months paid once: three times the plan's credits, for less than three months of it.
  for (const o of PREPAID) {
    const plan = PLANS.find((p) => p.key === o.plan)!;
    assert.equal(o.credits, plan.credits * 3, o.key);
    assert.equal(o.saves, plan.cents * 3 - o.cents, o.key);
    assert.ok(o.saves > 0 && perCredit(o) < perCredit(plan), o.key);
  }
});

test('pricing: nobody has to buy onboarding; the dated offer is on sale only until it ends', () => {
  const during = Date.parse(PROMO.ends) - 1000, after = Date.parse(PROMO.ends) + 1000;
  const keys = (s: Parameters<typeof itemsFor>[0]) => itemsFor(s).map((i) => i.key);
  assert.deepEqual(keys({ onboarded: false, now: during }), ['pack-25', 'pack-100', 'pack-300', 'starter', 'growth', 'agency', 'starter-3', 'growth-3', 'agency-3', 'onboarding']);
  assert.deepEqual(keys({ onboarded: true, now: during }), ['pack-25', 'pack-100', 'pack-300', 'starter', 'growth', 'agency', 'starter-3', 'growth-3', 'agency-3']);
  assert.deepEqual(keys({ onboarded: false, now: after }), ['pack-25', 'pack-100', 'pack-300', 'starter', 'growth', 'agency', 'onboarding']);
  assert.equal(promoLive(during), true);
  assert.equal(promoLive(after), false);
  assert.deepEqual([usd(ONBOARDING.cents), usd(7000), usd(35), usd(19700)], ['$997', '$70', '$0.35', '$197']);
  assert.equal(scans5x5(700), 28);
});

test('Stripe: form fields, refusals explained, and only signed webhooks believed', async () => {
  const { stripeForm, stripeProblem, stripeSignatureValid } = await import('../apps/nextjs/src/lib/stripe');
  const { createHmac } = await import('node:crypto');
  assert.equal(stripeForm({ mode: 'payment', metadata: { credits: 100 }, line_items: [{ quantity: 1, price_data: { unit_amount: 4900 } }], skip: undefined }),
    'mode=payment&metadata%5Bcredits%5D=100&line_items%5B0%5D%5Bquantity%5D=1&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=4900');
  assert.match(stripeProblem('card_declined', 'card_error'), /declined \(card_declined\)/);
  assert.match(stripeProblem('', 'authentication_error'), /STRIPE_SECRET_KEY/);
  assert.equal(stripeProblem('resource_missing', 'invalid_request_error'), 'Stripe could not complete this (resource_missing).');
  // A webhook is believed only with a fresh, correct signature over the exact body.
  const secret = 'whsec_test', body = '{"type":"checkout.session.completed"}', now = 1_800_000_000_000, t = String(now / 1000);
  const sig = (b: string, k = secret, at = t) => `t=${at},v1=${createHmac('sha256', k).update(at + '.' + b).digest('hex')}`;
  assert.equal(stripeSignatureValid(body, sig(body), secret, now), true);
  assert.equal(stripeSignatureValid(body, 't=' + t + ',v1=deadbeef,' + sig(body).split(',')[1], secret, now), true, 'any matching v1 will do');
  assert.equal(stripeSignatureValid(body + ' ', sig(body), secret, now), false, 'a changed body');
  assert.equal(stripeSignatureValid(body, sig(body, 'whsec_other'), secret, now), false, 'another secret');
  assert.equal(stripeSignatureValid(body, sig(body), secret, now + 6 * 60000), false, 'an old message replayed');
  assert.equal(stripeSignatureValid(body, null, secret, now), false);
  assert.equal(stripeSignatureValid(body, 'garbage', secret, now), false);
  assert.equal(stripeSignatureValid(body, sig(body), '', now), false);
});

test('the $1 payment test is for admins only; the payment alert says who paid and what to do', async () => {
  const { ADMIN_TEST, paymentNotice } = await import('../apps/nextjs/src/lib/pricing');
  assert.deepEqual([ADMIN_TEST.cents, ADMIN_TEST.credits], [100, 5]);
  assert.ok(!itemsFor({ onboarded: true }).some((i) => i.key === 'admin-test'), 'customers never see it');
  assert.ok(!itemsFor({ onboarded: false }).some((i) => i.key === 'admin-test'));
  assert.equal(itemsFor({ onboarded: true, admin: true }).at(-1)?.key, 'admin-test');
  const base = { buyer: 'a@b.com', balance: 1000, orderId: 'O1', captureId: 'C1' };
  const on = paymentNotice({ ...base, credits: 1000, cents: 99700, sandbox: false });
  assert.equal(on.subject, 'Payment: Onboarding, $997, a@b.com');
  assert.match(on.lines[0], /a@b\.com paid \$997 for Onboarding \(1,000 credits\)\. Their balance is now 1,000\./);
  assert.ok(on.lines.some((l) => /book their onboarding call/.test(l)));
  assert.ok(!on.lines.some((l) => /TEST payment/.test(l)));
  const sb = paymentNotice({ ...base, credits: 700, cents: 19700, sandbox: true });
  assert.equal(sb.subject, '[Test] Payment: Starter, $197, a@b.com');
  assert.ok(sb.lines.some((l) => /no real money moved/.test(l)) && !sb.lines.some((l) => /onboarding call/.test(l)));
});

test('onboarding status: optional for everyone; offered until bought or waived', async () => {
  const { onboardingStatus } = await import('../apps/nextjs/src/lib/pricing');
  const a = { paid: false, waived: false, admin: false, beforePricing: false };
  assert.equal(onboardingStatus(a), 'no');
  assert.equal(onboardingStatus({ ...a, waived: true }), 'waived');
  assert.equal(onboardingStatus({ ...a, paid: true, waived: true }), 'paid');
  assert.equal(onboardingStatus({ ...a, admin: true }), 'exempt');
  assert.equal(onboardingStatus({ ...a, beforePricing: true }), 'exempt');
  // Everyone can buy packs and plans; onboarding is offered only while it has not been bought or waived.
  for (const st of ['no', 'waived', 'paid', 'exempt'] as const) {
    const keys = itemsFor({ onboarded: st !== 'no' }).map((i) => i.key);
    assert.equal(keys[0], 'pack-25', st);
    assert.ok(keys.includes('starter'), st);
    assert.equal(keys.includes('onboarding'), st === 'no', st);
  }
});

test('AI Overview tracking is part of every Chrome scan, whatever is sent; Maps scans have none', async () => {
  const { parseSpec } = await import('../packages/core/grid');
  const base = { targetBusiness: 'Acme Plumbing', keyword: 'plumber', centerLat: 28.04, centerLng: -81.95, gridSize: 3, spacingKm: 1.60934, scheduleType: 'once' };
  for (const sent of [true, false, undefined])
    assert.equal(parseSpec({ ...base, targetType: 'mobile_chrome', ...(sent === undefined ? {} : { trackAiOverviews: sent }) }).trackAiOverviews, true, 'chrome, sent ' + sent);
  for (const sent of [true, false])
    assert.equal(parseSpec({ ...base, targetType: 'mobile_maps', trackAiOverviews: sent }).trackAiOverviews, false, 'maps, sent ' + sent);
});

test('grid sizes on offer: 3×3, 5×5, 7×7 and 9×9 for now; the default is one of them', async () => {
  const { OFFERED_GRID_SIZES, parseSpec } = await import('../packages/core/grid');
  assert.deepEqual([...OFFERED_GRID_SIZES], [3, 5, 7, 9]);
  const base = { targetBusiness: 'Acme Plumbing', keyword: 'plumber', centerLat: 28.04, centerLng: -81.95 };
  assert.ok(OFFERED_GRID_SIZES.includes(parseSpec(base).gridSize), 'a scan with no size given gets an offered one');
  // Older scans of any size still parse (they re-run and repeat on schedule); the create route limits new ones.
  assert.equal(parseSpec({ ...base, gridSize: 7 }).gridSize, 7);
});

test('skipped points: only real grid points count, and the centre is never skipped', async () => {
  const { skippedPoints } = await import('../packages/core/gridSizes');
  assert.deepEqual([...skippedPoints(['0_0', '4_4', '2_2', '5_0', 'x', 7, '0_0'], 5)].sort(), ['0_0', '4_4']);
  assert.equal(skippedPoints('0_0', 5).size, 0);
  assert.equal(skippedPoints(undefined, 3).size, 0);
});

test('grid shapes are the square grid with points left out', async () => {
  const { shapeSkips } = await import('../packages/core/gridSizes');
  assert.deepEqual(shapeSkips('square', 7), []);
  // A 7-wide grid kept to its middle 3 rows: 7 x 3 = 21 points stay, 28 go.
  assert.equal(shapeSkips('custom', 7, 3, 7).length, 28);
  assert.equal(shapeSkips('custom', 7, 3, 7).includes('3_0'), false);
  // Even or oversized numbers are brought back to an odd size inside the grid.
  assert.equal(shapeSkips('custom', 5, 4, 99).length, 10);
  // Round: a 7x7 keeps 37 points, a 5x5 keeps 21; the centre always stays.
  assert.equal(49 - shapeSkips('round', 7).length, 37);
  assert.equal(25 - shapeSkips('round', 5).length, 21);
  assert.equal(shapeSkips('round', 9).includes('4_4'), false);
});

test('clients: names differing by capitals or spaces are one client, and merges chain without looping', async () => {
  const { clientKey, clientName, addMerge } = await import('../packages/core/clientNames');
  assert.equal(clientKey('  Payne  Air '), clientKey('payne air'));
  let m = addMerge({}, 'Payne Air', 'Payne Air Conditioning & Heating')!;
  assert.equal(clientName('PAYNE AIR', m), 'Payne Air Conditioning & Heating');
  assert.equal(clientName('McIntyre Painting', m), 'McIntyre Painting');
  // Merging the long name onward carries the short one with it.
  m = addMerge(m, 'Payne Air Conditioning & Heating', 'Payne HVAC')!;
  assert.equal(clientName('payne air', m), 'Payne HVAC');
  // Same client, or a merge back onto itself, is refused.
  assert.equal(addMerge(m, 'Payne HVAC', 'payne hvac'), null);
  assert.equal(addMerge(m, 'Payne HVAC', 'Payne Air'), null);
});

test('a customer receipt carries only receipt fields, never how the run was done', async () => {
  const { customerReceipt } = await import('../apps/nextjs/src/lib/receipt');
  const full = {
    timestamp: '2026-11-15T21:47:19.000Z', observedModel: 'Pixel 5', locationSource: 'Lakeland, FL - From your device',
    proxyCheck: { ip: '47.194.10.35', port: 10136, listId: 22246786, proxySource: 'proxy-seller-list', ispObserved: 'AS5650 Verizon Business · Frontier Communications Corporation', rpaTemplate: { id: 'txM9y', name: 'Stakeout_chrome_final_v3_34' } },
    rawKey: 'scans/x/pin_3_0/y/raw.tar.gz', evidenceTransfer: 'adb_pull', fingerprints: { 'video.mp4': 'abc', 'serp.xml': 'def' },
  };
  const pin = { rowIdx: 3, colIdx: 0, lat: 27.9, lng: -82, zip: '33811', city: 'Lakeland', stateCode: 'FL', rankFound: null, topCompetitors: ['AP Drain Service LLC Plumbing And Septic'], hasAiOverview: true, targetCitedInAi: false, evidenceSha256: 'a00e1b611e59', scan: { keyword: 'emergency plumber near me', targetBusiness: "Stuart's Plumbing" } };
  const out = JSON.stringify(customerReceipt(full, pin));
  for (const secret of ['proxy', 'rpa', 'txM9y', 'adb', '47.194', '10136', '22246786', 'raw.tar', 'serp.xml', 'Stakeout_chrome'])
    assert.ok(!out.toLowerCase().includes(secret.toLowerCase()), 'receipt must not contain ' + secret);
  const r = customerReceipt(full, pin);
  assert.equal(r.phone, 'Pixel 5');
  assert.equal(r.internetProvider, 'Frontier Communications');
  assert.equal(r.evidence.fingerprint, 'a00e1b611e59');
  assert.deepEqual(r.point, { row: 4, column: 1, latitude: 27.9, longitude: -82, city: 'Lakeland', state: 'FL', zip: '33811' });
});
