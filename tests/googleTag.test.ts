import { test } from 'node:test';
import assert from 'node:assert/strict';

// Each test file runs in its own process: the tag's settings are read when the module loads.
process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = 'AW-123456789';
process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL = 'AbC-dEf';
const scripts: { src?: string; async?: boolean }[] = [];
const g = globalThis as unknown as { window: unknown; document: unknown; dataLayer?: IArguments[] };
g.window = globalThis;
g.document = { createElement: () => { const el: { src?: string; async?: boolean } = {}; scripts.push(el); return el; }, head: { appendChild: () => undefined } };

test('a confirmed payment is one Google Ads purchase conversion, with its amount and checkout as the ID', async () => {
  const { trackPurchase } = await import('../apps/nextjs/src/lib/googleTag');
  trackPurchase({ id: 'cs_test_1', cents: 1900 });
  const calls = (g.dataLayer ?? []).map((a) => Array.from(a));
  assert.equal(calls[0][0], 'js');
  assert.deepEqual(calls[1], ['config', 'AW-123456789', { send_page_view: false, allow_ad_personalization_signals: false }], 'no page view in the app; no ad personalization');
  assert.deepEqual(calls[2], ['event', 'conversion', { send_to: 'AW-123456789/AbC-dEf', value: 19, currency: 'USD', transaction_id: 'cs_test_1' }]);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=AW-123456789');
  trackPurchase({ id: 'cs_test_2', cents: 0 });
  trackPurchase({ id: '', cents: 900 });
  assert.equal(g.dataLayer?.length, 3, 'a free checkout, or one with no ID, sends nothing');
  trackPurchase({ id: 'cs_test_3', cents: 3900 });
  assert.equal(scripts.length, 1, 'the tag loads once');
});

test('the tag loads on the pages an ad can land on, never on share, password or app pages', async () => {
  const { isAdLanding } = await import('../apps/nextjs/src/lib/googleTag');
  for (const p of ['/', '/vs-scraper-credits', '/pricing', '/truth', '/demo/demographics', '/privacy', '/terms']) assert.ok(isAdLanding(p), p);
  for (const p of ['/share/abc', '/set-password', '/login', '/scans', '/new-scan', '/profiles', '/oauth/authorize', '/pricingx', '/admin']) assert.ok(!isAdLanding(p), p);
});
