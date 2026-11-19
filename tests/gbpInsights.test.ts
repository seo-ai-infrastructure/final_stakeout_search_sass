import test from 'node:test';
import assert from 'node:assert/strict';
import { brandWord, change, comparePeriods, latestSnapshot, scannable, topKeywords , intentOf } from '../packages/core/gbpInsights';

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

import { byWeek, dailySeries, keywordTrends, monthsOf, risingKeywords } from '../packages/core/gbpInsights';

test('daily numbers fill every day of the range and add up the range before', () => {
  const rec = (date: string, o: object) => ({ date, platform_stats: o });
  const s = dailySeries([
    rec('2026-11-01', { call_clicks: 2, website_clicks: 10, business_direction_requests: 1, business_impressions_mobile_search: 100, business_impressions_desktop_maps: 20 }),
    rec('2026-11-03', { call_clicks: 1, website_clicks: 4 }),
    rec('2026-10-30', { call_clicks: 5, website_clicks: 7 }),
    rec('2026-10-01', { call_clicks: 99 }),
    rec('nonsense', { call_clicks: 99 }),
  ], '2026-11-01', '2026-11-03');
  assert.equal(s.length, 3);
  assert.deepEqual(s.days.map((d) => [d.date, d.calls, d.websiteClicks, d.views]), [['2026-11-01', 2, 10, 120], ['2026-11-02', 0, 0, 0], ['2026-11-03', 1, 4, 0]]);
  assert.deepEqual([s.totals.calls, s.totals.websiteClicks, s.totals.directions, s.totals.views, s.totals.mobileSearch], [3, 14, 1, 120, 100]);
  // The three days before the range, and nothing older.
  assert.deepEqual([s.before.calls, s.before.websiteClicks], [5, 7]);
  assert.deepEqual([s.daysWithData, s.daysBefore], [2, 1]);
  assert.ok(s.known.includes('calls') && s.known.includes('views') && !s.known.includes('bookings'));
});

test('long ranges are read by the week', () => {
  const days = Array.from({ length: 16 }, (_, i) => ({ date: '2026-11-' + String(i + 1).padStart(2, '0'), calls: 1, views: 10 }));
  const w = byWeek(days, ['calls', 'views']);
  assert.deepEqual(w.map((x) => [x.date, x.calls, x.views]), [['2026-11-01', 7, 70], ['2026-11-08', 7, 70], ['2026-11-15', 2, 20]]);
  assert.equal(days[0].calls, 1);
});

test('keywords month by month, and the ones that are rising', () => {
  const kw = (keyword: string, impressions: number | null, t: number | null = null) => ({ keyword, impressions, impressions_threshold: t });
  const { rows, months } = keywordTrends([
    { month: '2026-10', keywords: [kw('botox denver', 300), kw('lip flip', 40), kw('med spa', null, 15), kw('semaglutide', 90)] },
    { month: '2026-09', keywords: [kw('botox denver', 250), kw('lip flip', 60)] },
    { month: '2026-08', keywords: [kw('Botox Denver', 200)] },
  ]);
  assert.deepEqual(months, ['2026-08', '2026-09', '2026-10']);
  const by = Object.fromEntries(rows.map((r) => [r.keyword, r]));
  assert.deepEqual([by['botox denver'].total, by['botox denver'].latest, by['botox denver'].previous, by['botox denver'].gain], [750, 300, 250, 50]);
  assert.deepEqual(by['botox denver'].byMonth, [200, 250, 300]);
  assert.deepEqual([by['lip flip'].gain, by['semaglutide'].gain, by['semaglutide'].previous], [-20, 90, null]);
  // "Fewer than 15" is kept as text and is never a count.
  assert.deepEqual([by['med spa'].latest, by['med spa'].latestText, by['med spa'].gain, by['med spa'].exact], [null, '<15', null, false]);
  assert.deepEqual(risingKeywords(rows).map((r) => r.keyword), ['semaglutide', 'botox denver']);
  assert.equal(rows[rows.length - 1].keyword, 'med spa');
});

test('the months a range touches, at most the latest twelve', () => {
  assert.deepEqual(monthsOf('2026-08-20', '2026-11-16'), { from: '2026-08', to: '2026-11' });
  assert.deepEqual(monthsOf('2025-06-01', '2026-11-16'), { from: '2025-12', to: '2026-11' });
});

test('the month still running is left out, and "fewer than" figures show in both columns', () => {
  const t = keywordTrends([
    { month: '2026-09', keywords: [{ keyword: 'dwi attorney near me', impressions: 40, impressions_threshold: null }] },
    { month: '2026-10', keywords: [{ keyword: 'dwi attorney near me', impressions: null, impressions_threshold: 15 }, { keyword: 'broderick', impressions: 22, impressions_threshold: null }] },
    { month: '2026-11', keywords: [] },
  ]);
  assert.deepEqual(t.months, ['2026-09', '2026-10']);
  const dwi = t.rows.find((r) => r.keyword === 'dwi attorney near me')!;
  assert.equal(dwi.latestText, '<15');
  assert.equal(dwi.previous, 40);
  assert.equal(t.rows.find((r) => r.keyword === 'broderick')!.latest, 22);
  assert.deepEqual(keywordTrends([{ month: '2026-11', keywords: [] }]), { rows: [], months: [] });
});

import { brandSplit, byWeekday, listingTotals, rateByWeek, dailySeries } from '../packages/core/gbpInsights';

test('searches split into found-by-service and found-by-name', () => {
  const row = (keyword: string, total: number, exact = true) => ({ keyword, total, exact, latest: total, latestText: String(total), previous: null, previousText: '', gain: null, months: 1, byMonth: [total] });
  const s = brandSplit([row('plumber near me', 300), row('drain cleaning', 100), row('stuart plumbing', 150), row('stuart plumbing jobs', 20), row('plumber jobs', 10)], 'stuart');
  assert.deepEqual(s.discovery, { terms: 2, shown: 400 });
  assert.deepEqual(s.branded, { terms: 2, shown: 170 });
  assert.deepEqual(s.other, { terms: 1, shown: 10 });
  assert.equal(s.by, 'shown');
  // A small listing: Google gives no counts, so the searches themselves are counted.
  const small = brandSplit([row('dwi attorney near me', 0, false), row('broderick', 0, false), row('brandon j broderick', 0, false)], 'broderick');
  assert.equal(small.by, 'terms');
  assert.equal(small.branded.terms, 2);
  assert.equal(brandSplit([], '').known, false);
});

test('a measure by day of the week is an average, so a part week does not skew it', () => {
  const rec = (date: string, calls: number) => ({ date, platform_stats: { call_clicks: calls } });
  const d = dailySeries([rec('2026-11-01', 2), rec('2026-11-02', 6), rec('2026-11-08', 4), rec('2026-11-09', 10)], '2026-11-01', '2026-11-09').days;
  const w = byWeekday(d, 'calls');
  assert.equal(w[0], 3); // two Sundays: 2 and 4
  assert.equal(w[1], 8); // two Mondays: 6 and 10
  assert.equal(w[2], 0);
});

test('actions per 100 views, week by week', () => {
  const rec = (date: string, views: number, calls: number) => ({ date, views, platform_stats: { call_clicks: calls } });
  const days = dailySeries([rec('2026-11-01', 100, 5), rec('2026-11-03', 100, 5), rec('2026-11-08', 0, 0)], '2026-11-01', '2026-11-14').days;
  assert.deepEqual(rateByWeek(days), [{ date: '2026-11-01', value: 5 }, { date: '2026-11-08', value: null }]);
});

test('every listing from its newest totals, busiest first', () => {
  const t = listingTotals([
    { placement_id: 'accounts/1/locations/2', recorded_at: '2026-11-18T03:00:00Z', stats: { views: 1000, call_clicks: 20, website_clicks: 30, business_direction_requests: 10 } },
    { placement_id: 'accounts/1/locations/3', recorded_at: '2026-11-18T03:00:00Z', stats: { business_impressions_mobile_search: 400, business_impressions_mobile_maps: 100, call_clicks: 80, business_conversations: 5 } },
    { placement_id: 'accounts/1/locations/4', stats: {} },
    { stats: { views: 5 } }, 'junk',
  ]);
  assert.deepEqual(t.map((r) => r.location), ['accounts/1/locations/3', 'accounts/1/locations/2', 'accounts/1/locations/4']);
  assert.equal(t[0].views, 500);
  assert.equal(t[0].actions, 85);
  assert.equal(t[0].rate, 17);
  assert.equal(t[1].rate, 6);
  assert.equal(t[2].rate, null);
  assert.deepEqual(listingTotals(null), []);
});

test('keywordTrends: a search under Google’s line last month is not new this month', () => {
  const k = (keyword: string, impressions: number | null) => ({ keyword, impressions, impressions_threshold: impressions === null ? 15 : null });
  const { rows } = keywordTrends([
    { month: '2026-08', keywords: [k('roof repair', 40), k('gone and back', 22), k('fading', 30)] },
    { month: '2026-09', keywords: [k('roof repair', 30), k('was low', null), k('fading', 20)] },
    { month: '2026-10', keywords: [k('roof repair', 45), k('was low', 45), k('gone and back', 18), k('brand new', 12), k('fading', null)] },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.keyword, r]));
  assert.deepEqual(by['roof repair'].move, { kind: 'change', pct: 50 });
  // Fewer than 15 means 14 at most: 45 is up by 31 or more.
  assert.deepEqual(by['was low'].move, { kind: 'atLeast', by: 31 });
  assert.equal(by['was low'].gain, 31);
  assert.deepEqual(by['gone and back'].move, { kind: 'back' });
  assert.deepEqual(by['brand new'].move, { kind: 'new' });
  assert.deepEqual(by['fading'].move, { kind: 'below', under: 15 });
  assert.equal(by['fading'].gain, null);
});

test('intentOf: by name, job hunting, or a customer search', () => {
  assert.equal(intentOf('gattoni botox', 'gattoni'), 'branded');
  assert.equal(intentOf('security guard jobs', 'ranger'), 'noise');
  assert.equal(intentOf('security guard salary', ''), 'noise');
  assert.equal(intentOf('botox near me', 'gattoni'), 'money');
});

test('dailySeries: held against the same days a year earlier', () => {
  const recs = [{ date: '2026-11-10', call_clicks: 5 }, { date: '2026-11-03', call_clicks: 9 }, { date: '2025-11-11', call_clicks: 2 }];
  const s = dailySeries(recs, '2026-11-10', '2026-11-16', '2025-11-11');
  assert.equal(s.totals.calls, 5);
  assert.equal(s.before.calls, 2);
  assert.equal(s.daysBefore, 1);
  // Without it, the seven days before.
  assert.equal(dailySeries(recs, '2026-11-10', '2026-11-16').before.calls, 9);
});
