import test from 'node:test';
import assert from 'node:assert/strict';
import { exploreRange, gaFilters, gaRequest, gaRows, gaTotals, gscFilters, gscRequest, gscRows } from '../packages/core/googleExplore';

const today = new Date('2026-11-18T15:00:00Z');

test('a range is read against the same number of days before it', () => {
  assert.deepEqual(exploreRange({ days: 7 }, today, 3), { recent: { from: '2026-11-09', to: '2026-11-15' }, before: { from: '2026-11-02', to: '2026-11-08' }, days: 7 });
  // Anything that is not one of the offered lengths is 28 days.
  assert.equal((exploreRange({ days: 13 }, today, 1) as any).days, 28);
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
