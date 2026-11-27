import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharePreview } from '../apps/nextjs/src/lib/sharePreview';

const scan = { targetBusiness: "Stuart's Plumbing", keyword: 'emergency plumber near me', city: 'Lakeland', stateCode: 'FL', totalPins: 25, network: 'mobile' };

test('share preview: a 5G scan names the business, market, keyword and points', () => {
  const m = sharePreview(scan, null) as any;
  assert.equal(m.title.absolute, "Stuart's Plumbing · Lakeland, FL — Real-Device 5G Visibility Report");
  assert.equal(m.openGraph.title, "Stuart's Plumbing (emergency plumber near me) — Verified 5G Search Report");
  assert.equal(m.openGraph.description, 'Real Android phone captures across 25 neighborhood pins—including Map Pack ranks, 1-Box panels, AI Overviews, and video receipts.');
  assert.equal(m.openGraph.siteName, 'Stakeout Search');
});

test('share preview: a scan on home internet is not called 5G, and a white label shows its own name', () => {
  const m = sharePreview({ ...scan, network: 'residential', totalPins: 49 }, 'Apex Local') as any;
  assert.equal(m.title.absolute, "Stuart's Plumbing · Lakeland, FL — Real-Device Visibility Report");
  assert.equal(m.openGraph.title, "Stuart's Plumbing (emergency plumber near me) — Verified Search Report");
  assert.equal(m.openGraph.siteName, 'Apex Local');
  assert.ok(!JSON.stringify(m).includes('Stakeout'));
});
