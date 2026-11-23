import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ITEMS, BONUS_POINTS, PROMO, PROSPECT_PACKS, TOPUP, WELCOME, WHITE_LABEL, currentPlan, itemKeyOf, itemsFor, perCredit, promoLive, scans5x5, usd } from '../apps/nextjs/src/lib/pricing';
import { LINES, lineCents } from '../packages/core/gbpPlans';

test('pricing: the agreed one-time prices, and every item identifiable by its key', () => {
  assert.deepEqual([WELCOME.key, WELCOME.cents, WELCOME.credits], ['welcome', 500, 25], 'one Scan Now 5×5 for $5');
  assert.deepEqual(PROSPECT_PACKS.map((p) => [p.key, p.audits, p.cents, p.credits, p.saves, p.validityDays]), [['prospect-1', 1, 1500, 25, 0, 90], ['prospect-5', 5, 4900, 125, 2600, 90], ['prospect-12', 12, 9900, 300, 8100, 90]]);
  for (const p of PROSPECT_PACKS) assert.equal(p.saves, p.audits * PROSPECT_PACKS[0].cents - p.cents, 'the saving the page shows: ' + p.key);
  assert.deepEqual([TOPUP.key, TOPUP.cents, TOPUP.credits], ['topup-100', 2500, 100]);
  assert.deepEqual([WHITE_LABEL.cents, WHITE_LABEL.freeFrom], [9700, 10]);
  assert.equal(BONUS_POINTS, 250, '250 bonus phone sessions: ten 5×5 audits');
  assert.equal(new Set(ALL_ITEMS.map((i) => i.key)).size, ALL_ITEMS.length, 'checkout tells items apart by key');
  // A top-up costs more a point than any seat at its first price, so a bigger seat is always the better deal.
  for (const line of ['SCOUT', 'COMMAND', 'DOMINATOR'] as const) assert.ok(perCredit(TOPUP) > LINES[line].tiers[0].cents / 100 / LINES[line].points, line);
  // The pricing page's worked example: twelve clients on Command.
  assert.equal(lineCents('COMMAND', 12), 9 * 5900 + 3 * 4900);
  assert.equal(usd(lineCents('COMMAND', 12)), '$678');
});

test('pricing: the first audit on a first purchase only, a top-up only with a seat, white-label until 10 seats', () => {
  const keys = (s: Parameters<typeof itemsFor>[0]) => itemsFor(s).map((i) => i.key);
  assert.deepEqual(keys({ firstPurchase: true }), ['welcome', 'prospect-1', 'prospect-5', 'prospect-12', 'white-label']);
  assert.deepEqual(keys({}), ['prospect-1', 'prospect-5', 'prospect-12', 'white-label']);
  assert.deepEqual(keys({ seats: 3 }), ['prospect-1', 'prospect-5', 'prospect-12', 'topup-100', 'white-label']);
  assert.deepEqual(keys({ seats: 10 }), ['prospect-1', 'prospect-5', 'prospect-12', 'topup-100'], 'white-label is free from 10 seats');
  assert.deepEqual(keys({ seats: 3, whiteLabel: true }), ['prospect-1', 'prospect-5', 'prospect-12', 'topup-100']);
  const everything = keys({ firstPurchase: true, seats: 50, admin: true });
  for (const old of ['onboarding', 'pack-25', 'pack-100', 'starter', 'growth-3', 'topup-agency']) assert.ok(!everything.includes(old), old + ' is no longer sold');
});

test('pricing: the Black Friday bonus runs until the end of December 1; prices print as dollars', () => {
  const during = Date.parse(PROMO.ends) - 1000, after = Date.parse(PROMO.ends) + 1000;
  assert.equal(promoLive(during), true);
  assert.equal(promoLive(after), false);
  assert.equal(PROMO.ends, '2026-12-02T05:00:00Z', 'midnight in New York');
  assert.deepEqual([usd(500), usd(4900), usd(7000), usd(35), usd(98)], ['$5', '$49', '$70', '$0.35', '$0.98']);
  assert.equal(scans5x5(550), 22);
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
  assert.ok(!itemsFor({ firstPurchase: true, seats: 5 }).some((i) => i.key === 'admin-test'), 'customers never see it');
  assert.equal(itemsFor({ admin: true }).at(-1)?.key, 'admin-test');
  const base = { buyer: 'a@b.com', balance: 300, orderId: 'O1', captureId: 'C1' };
  const five = paymentNotice({ ...base, credits: 250, cents: 4900, sandbox: false, item: 'prospect-5' });
  assert.equal(five.subject, 'Payment: 5 prospect audits, $49, a@b.com');
  assert.match(five.lines[0], /a@b\.com paid \$49 for 5 prospect audits \(250 phone sessions\)\. Their balance is now 300\./);
  assert.ok(!five.lines.some((l) => /TEST payment/.test(l)));
  const wl = paymentNotice({ ...base, credits: 0, cents: 9700, sandbox: true, item: 'white-label' });
  assert.equal(wl.subject, '[Test] Payment: White-label setup, $97, a@b.com');
  assert.ok(wl.lines.some((l) => /set up their logo and domain/.test(l)) && wl.lines.some((l) => /no real money moved/.test(l)));
  assert.match(paymentNotice({ ...base, credits: 50, cents: 500, sandbox: false, item: 'welcome', refunded: true }).subject, /^Refunded: second first audit/);
  // Purchases from before the seats keep their names.
  assert.equal(paymentNotice({ ...base, credits: 1000, cents: 99700, sandbox: false }).subject, 'Payment: Onboarding, $997, a@b.com');
});

test('onboarding status (sold until November 2026): paid beats waived beats exempt', async () => {
  const { onboardingStatus } = await import('../apps/nextjs/src/lib/pricing');
  const a = { paid: false, waived: false, admin: false, beforePricing: false };
  assert.equal(onboardingStatus(a), 'no');
  assert.equal(onboardingStatus({ ...a, waived: true }), 'waived');
  assert.equal(onboardingStatus({ ...a, paid: true, waived: true }), 'paid');
  assert.equal(onboardingStatus({ ...a, admin: true }), 'exempt');
  assert.equal(onboardingStatus({ ...a, beforePricing: true }), 'exempt');
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

test('pricing: the old credit plan an account was on comes from what it paid for, and lapses', () => {
  const now = Date.parse('2026-11-19T00:00:00Z'), ago = (d: number) => new Date(now - d * 86400000);
  assert.equal(currentPlan([], now), null);
  assert.equal(currentPlan([{ item: 'pack-100', credits: 100, createdAt: ago(1) }], now), null, 'a pack is not a plan');
  assert.equal(currentPlan([{ item: 'starter', credits: 700, createdAt: ago(10) }], now), 'starter');
  assert.equal(currentPlan([{ item: 'starter', credits: 700, createdAt: ago(36) }], now), null, 'a month and a few days on, it has lapsed');
  assert.equal(currentPlan([{ item: 'agency-3', credits: 10500, createdAt: ago(80) }], now), 'agency', 'three months paid at once');
  assert.equal(currentPlan([{ item: 'starter', credits: 700, createdAt: ago(20) }, { item: 'growth', credits: 1600, createdAt: ago(2) }], now), 'growth', 'the latest counts');
  // Purchases recorded before keys were kept are told apart by their credits.
  assert.equal(currentPlan([{ item: null, credits: 1600, createdAt: ago(5) }], now), 'growth');
  assert.equal(itemKeyOf({ item: null, credits: 1000 }), 'onboarding');
  assert.equal(itemKeyOf({ item: 'welcome', credits: 25 }), 'welcome');
});
