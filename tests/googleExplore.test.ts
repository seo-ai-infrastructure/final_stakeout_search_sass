import test from 'node:test';
import assert from 'node:assert/strict';
import { exploreRange, gaFilters, gaRequest, gaRows, gaTotals, gscFilters, gscRequest, gscRows } from '../packages/core/googleExplore';

const today = new Date('2026-11-18T15:00:00Z');

test('a range is read against the same number of days before it', () => {
  assert.deepEqual(exploreRange({ days: 7 }, today, 3), { recent: { from: '2026-11-09', to: '2026-11-15' }, before: { from: '2026-11-02', to: '2026-11-08' }, days: 7 });
  // Any sensible number of days is taken; anything else is 28 days.
  assert.equal((exploreRange({ days: 60 }, today, 1) as any).days, 60);
  for (const days of [0, -5, 9999, 'soon']) assert.equal((exploreRange({ days }, today, 1) as any).days, 28);
  assert.deepEqual(exploreRange({ from: '2026-10-01', to: '2026-10-31' }, today, 3), { recent: { from: '2026-10-01', to: '2026-10-31' }, before: { from: '2026-08-31', to: '2026-09-30' }, days: 31 });
  assert.match(exploreRange({ from: '2026-10-31', to: '2026-10-01' }, today, 3) as string, /before the start/);
  assert.match(exploreRange({ from: '2026-10-01' }, today, 3) as string, /both dates/);
  assert.match(exploreRange({ from: '2026-11-01', to: '2026-12-01' }, today, 3) as string, /future/);
  assert.match(exploreRange({ from: '2024-01-01', to: '2024-02-01' }, today, 3) as string, /16 months/);
});

test('Search Console filters: a search, a page, a device, an appearance', () => {
  assert.deepEqual(gscFilters({}), []);
  assert.deepEqual(gscFilters({ query: ' Botox Denver ', page: 'https://glow.example/botox', device: 'mobile', appearance: 'AI_OVERVIEW' }), [
    { dimension: 'query', operator: 'contains', expression: 'botox denver' },
    { dimension: 'page', operator: 'equals', expression: 'https://glow.example/botox' },
    { dimension: 'device', operator: 'equals', expression: 'MOBILE' },
    { dimension: 'searchAppearance', operator: 'equals', expression: 'AI_OVERVIEW' },
  ]);
  assert.equal(gscFilters({ query: 'botox', queryMode: 'exact' })[0].operator, 'equals');
  assert.equal(gscFilters({ query: 'glow', queryMode: 'without' })[0].operator, 'notContains');
  // Part of an address matches every page that contains it; junk is dropped.
  assert.deepEqual(gscFilters({ page: '/blog/', device: 'fridge', appearance: 'drop table' }), [{ dimension: 'page', operator: 'contains', expression: '/blog/' }]);
});

test('a Search Console request breaks down by one thing and never filters on it too', () => {
  const range = { from: '2026-10-19', to: '2026-11-15' };
  assert.deepEqual(gscRequest(range, {}, null), { startDate: '2026-10-19', endDate: '2026-11-15', type: 'web' });
  const r = gscRequest(range, { device: 'MOBILE', query: 'botox', type: 'image' }, 'device', 50);
  assert.deepEqual(r, { startDate: '2026-10-19', endDate: '2026-11-15', type: 'image', dimensions: ['device'], rowLimit: 50, dimensionFilterGroups: [{ groupType: 'and', filters: [{ dimension: 'query', operator: 'contains', expression: 'botox' }] }] });
  assert.equal(gscRequest(range, { type: 'hologram' }, null).type, 'web');
});

test('rows carry the range before, when the row was there', () => {
  assert.deepEqual(gscRows([{ keys: ['botox denver'], clicks: 12, impressions: 400, ctr: 0.03, position: 4.26 }, { keys: ['lip flip'], clicks: 3, impressions: 90, ctr: 0.0333, position: 9 }, {}], [{ keys: ['botox denver'], clicks: 8 }]), [
    { key: 'botox denver', a: 12, b: 400, c: 4.3, d: 3, wasA: 8 },
    { key: 'lip flip', a: 3, b: 90, c: 9, d: 3.3, wasA: null },
  ]);
});

test('Analytics filters and requests', () => {
  assert.deepEqual(gaFilters({}), []);
  assert.deepEqual(gaFilters({ page: 'https://glow.example/botox?x=1', device: 'Mobile', source: 'ai' }).map((f: any) => [f.filter.fieldName, f.filter.stringFilter.matchType]), [
    ['landingPagePlusQueryString', 'CONTAINS'], ['deviceCategory', 'EXACT'], ['sessionSource', 'PARTIAL_REGEXP'],
  ]);
  assert.equal((gaFilters({ page: 'https://glow.example/botox?x=1' })[0] as any).filter.stringFilter.value, '/botox?x=1');
  assert.equal((gaFilters({ source: 'listing' })[0] as any).filter.stringFilter.value, 'gbp_listing');
  const range = { from: '2026-10-21', to: '2026-11-17' };
  const totals = gaRequest(range, { source: 'google' }, null) as any;
  assert.equal(totals.dimensions, undefined);
  assert.equal(totals.dimensionFilter.filter.stringFilter.value, 'google / organic');
  const rows = gaRequest(range, { source: 'ai', device: 'mobile' }, 'landingPagePlusQueryString', 100) as any;
  assert.deepEqual(rows.dimensions, [{ name: 'landingPagePlusQueryString' }]);
  assert.equal(rows.dimensionFilter.andGroup.expressions.length, 2);
  assert.deepEqual(rows.orderBys, [{ metric: { metricName: 'sessions' }, desc: true }]);
  assert.deepEqual((gaRequest(range, {}, 'date') as any).orderBys, [{ dimension: { dimensionName: 'date' } }]);
});

test('Analytics rows and totals are read as numbers', () => {
  const row = (k: string, ...m: string[]) => ({ dimensionValues: [{ value: k }], metricValues: m.map((value) => ({ value })) });
  assert.deepEqual(gaTotals([{ metricValues: [{ value: '120' }, { value: '80' }, { value: '9' }] }]), { a: 120, b: 80, c: 9 });
  assert.deepEqual(gaTotals(undefined), { a: 0, b: 0, c: 0 });
  assert.deepEqual(gaRows([row('/botox', '40', '30', '4'), row('', '5', '1', '0')], [row('/botox', '25', '0', '0')], 'landingPagePlusQueryString'), [
    { key: '/botox', a: 40, b: 30, c: 4, wasA: 25 },
    { key: '(not set)', a: 5, b: 1, c: 0, wasA: null },
  ]);
  assert.equal(gaRows([row('20261117', '7', '5', '1')], [], 'date')[0].key, '2026-11-17');
});

import { gaEventRows, gaEventsRequest, isCallEvent, pageOf, risingRows } from '../packages/core/googleExplore';

test('the page Search Console knows: no tracking tags', () => {
  assert.equal(pageOf('https://glow.example/botox/?utm_source=google&utm_campaign=gbp_listing#top'), 'https://glow.example/botox/');
  assert.equal(pageOf('https://glow.example'), 'https://glow.example/');
  assert.equal(pageOf('not a link'), '');
  assert.equal(pageOf('sms:+1720'), '');
});

test('rising rows gained the most; one extra click is not rising', () => {
  const rows = [
    { key: 'botox denver', a: 120, b: 0, c: null, wasA: 96 },
    { key: 'lip flip', a: 44, b: 0, c: null, wasA: 51 },
    { key: 'semaglutide denver', a: 31, b: 0, c: null, wasA: null },
    { key: 'med spa', a: 6, b: 0, c: null, wasA: 5 },
  ];
  assert.deepEqual(risingRows(rows).map((r) => [r.key, r.gain, r.fresh]), [['semaglutide denver', 31, true], ['botox denver', 24, false]]);
});

test('call events are found by name, however the site named them', () => {
  for (const n of ['click_to_call', 'phone_call', 'call', 'Phone Click', 'tel_click', 'header_call_click', 'calls_from_ads', 'click-to-call']) assert.equal(isCallEvent(n), true, n);
  for (const n of ['page_view', 'scroll', 'callback_form', 'recall_notice', 'telemetry', 'form_submit', 'hotel_view']) assert.equal(isCallEvent(n), false, n);
});

test('events: key events and calls are kept, with the calls counted', () => {
  const row = (k: string, count: string, key: string) => ({ dimensionValues: [{ value: k }], metricValues: [{ value: count }, { value: key }] });
  const r = gaEventRows([row('form_submit', '12', '12'), row('click_to_call', '30', '0'), row('page_view', '900', '0'), row('', '5', '5')], [row('click_to_call', '21', '0'), row('phone_call', '4', '0')]);
  assert.deepEqual(r.rows, [
    { name: 'form_submit', count: 12, keyEvents: 12, wasCount: null, call: false },
    { name: 'click_to_call', count: 30, keyEvents: 0, wasCount: 21, call: true },
  ]);
  assert.deepEqual([r.calls, r.callsBefore], [30, 25]);
  const req = gaEventsRequest({ from: '2026-10-01', to: '2026-10-31' }, { source: 'listing' }) as any;
  assert.deepEqual(req.dimensions, [{ name: 'eventName' }]);
  assert.equal(req.dimensionFilter.filter.stringFilter.value, 'gbp_listing');
});
