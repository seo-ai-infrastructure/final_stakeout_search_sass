import test from 'node:test';
import assert from 'node:assert/strict';
import { brandWord, change, comparePeriods, latestSnapshot, scannable, topKeywords } from '../packages/core/gbpInsights';

test('daily records add up into the last 30 days and the 30 before, wherever the numbers sit', () => {
  const day = (d: string, o: object) => ({ date: d, ...o });
  const r = comparePeriods([
    day('2026-11-17', { views: 100, platform_stats: { call_clicks: 4, website_clicks: 6, business_direction_requests: 2 } }),
    day('2026-11-01', { views: 50, call_clicks: 1 }),
    day('2026-10-18', { views: 10 }), // day 30 back: the previous period
    day('2026-10-01', { stats: { business_impressions_mobile_search: 30, business_impressions_mobile_maps: 10 }, call_clicks: 10 }),
    day('2026-08-01', { views: 999 }), // too old
    day('2026-11-18', { views: 999 }), // after the end date
    day('bad', { views: 5 }),
    day('2026-11-10', { followers: 3 }), // nothing we read
  ], '2026-11-17');
  assert.deepEqual(r.recent, { views: 150, calls: 5, websiteClicks: 6, directions: 2, conversations: 0, bookings: 0 });
  assert.equal(r.before.views, 50);
  assert.equal(r.before.calls, 10);
  assert.deepEqual(r.known, ['views', 'calls', 'websiteClicks', 'directions']);
  assert.equal(r.daysWithData, 2);
  assert.equal(r.daysBefore, 2);
  assert.equal(change(150, 50), 200);
  assert.equal(change(5, 10), -50);
  assert.equal(change(5, 0), null);
});

test('the newest snapshot is used when there are no daily records', () => {
  assert.equal(latestSnapshot([]), null);
  assert.equal(latestSnapshot([{ recorded_at: '2026-11-17T08:00:00Z', stats: { followerCount: 3 } }]), null);
  const s = latestSnapshot([
    { recorded_at: '2026-11-16T08:00:00Z', stats: { views: 10, call_clicks: 1 } },
    { recorded_at: '2026-11-17T08:00:00Z', stats: { views: 12, call_clicks: 2, website_clicks: 3 } },
  ])!;
  assert.equal(s.totals.views, 12);
  assert.equal(s.totals.calls, 2);
  assert.deepEqual(s.known, ['views', 'calls', 'websiteClicks']);
});

test('searches are merged across months; "fewer than 15" is shown as such and sorts below real counts', () => {
  const t = topKeywords([
    { month: '2026-10', keywords: [{ keyword: 'pressure washer', impressions: 37, impressions_threshold: null }, { keyword: 'Pressure Washing Near Me', impressions: null, impressions_threshold: 15 }] },
    { month: '2026-09', keywords: [{ keyword: 'pressure washer', impressions: 56, impressions_threshold: null }, { keyword: 'pressure washing near me', impressions: null, impressions_threshold: 15 }, { keyword: 'washing', impressions: null, impressions_threshold: 15 }] },
  ]);
  assert.deepEqual(t.months, ['2026-09', '2026-10']);
  assert.deepEqual(t.rows[0], { keyword: 'pressure washer', latest: '37', total: 93, exact: true, months: 2 });
  assert.deepEqual(t.rows[1], { keyword: 'pressure washing near me', latest: '<15', total: 0, exact: false, months: 2 });
  assert.equal(t.rows[2].keyword, 'washing');
});

test('searches for the business by name and job searches are not offered as scan keywords', () => {
  const ranger = ['ranger security services', 'ranger', 'guard', 'security guard company tampa fl', 'security guards tampa', 'security companies near me', 'armed security jobs near me', 'firewatch guards', 'security guard tampa', 'tampa security officer', 'tampa guard', 'security company tampa', 'unarmed security company tampa', 'security guard companies', 'guards tampa bay', 'security jobs near me', 'security guard', 'security guards', 'security companies', 'day zero security tampa fl'];
  // "Tampa" is in half the searches and is the city: the brand is "ranger".
  const brand = brandWord('Ranger Guard of Tampa Bay', ranger, 'Tampa FL');
  assert.equal(brand, 'ranger');
  assert.equal(scannable('security guard company tampa fl', brand), true);
  assert.equal(scannable('ranger security services', brand), false);
  assert.equal(scannable('armed security jobs near me', brand), false);
  // One-word service searches are real keywords.
  assert.equal(scannable('guard', brand), true);

  // The trade is not the brand: "botox" and "denver" are what customers search for.
  const spa = ['botox denver', 'botox near me', 'botox', 'masseter botox', 'lip filler', 'lip filler denver', 'ultherapy', 'kybella', 'ultherapy denver', 'sculptra', 'botox cherry creek', 'denver botox'];
  assert.equal(brandWord('Denver Botox: GATTONI Medical Aesthetics', spa, 'Denver CO'), '');
  assert.equal(scannable('botox denver', ''), true);
  assert.equal(brandWord('Denver Botox: GATTONI Medical Aesthetics', [...spa, 'gattoni medical aesthetics'], 'Denver CO'), 'gattoni');
  // Nothing distinctive in the name: nothing is flagged.
  assert.equal(brandWord('210 Pressure Washing', ['pressure washer', 'pressure washing san antonio'], 'San Antonio TX'), '');
  assert.equal(scannable('pressure washer phone number', ''), false);
});
