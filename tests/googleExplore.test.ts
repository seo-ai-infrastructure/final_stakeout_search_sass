import test from 'node:test';
import assert from 'node:assert/strict';
import { exploreRange, gaFilters, gaRequest, gaRows, gaTotals, gscFilters, gscRequest, gscRows } from '../packages/core/googleExplore';

const today = new Date('2026-11-18T15:00:00Z');

test('a range is read against the same number of days before it', () => {
  assert.deepEqual(exploreRange({ days: 7 }, today, 3), { recent: { from: '2026-11-09', to: '2026-11-15' }, before: { from: '2026-11-02', to: '2026-11-08' }, days: 7, compare: 'previous' });
  // Any sensible number of days is taken; anything else is 28 days.
  assert.equal((exploreRange({ days: 60 }, today, 1) as any).days, 60);
  for (const days of [0, -5, 'soon']) assert.equal((exploreRange({ days }, today, 1) as any).days, 28);
  // More than Google keeps is as far back as it goes (16 months).
  assert.equal((exploreRange({ days: 9999 }, today, 1) as any).days, 480);
  assert.deepEqual(exploreRange({ from: '2026-10-01', to: '2026-10-31' }, today, 3), { recent: { from: '2026-10-01', to: '2026-10-31' }, before: { from: '2026-08-31', to: '2026-09-30' }, days: 31, compare: 'previous' });
  assert.match(exploreRange({ from: '2026-10-31', to: '2026-10-01' }, today, 3) as string, /before the start/);
  assert.match(exploreRange({ from: '2026-10-01' }, today, 3) as string, /both dates/);
  assert.match(exploreRange({ from: '2026-11-01', to: '2026-12-01' }, today, 3) as string, /future/);
  assert.match(exploreRange({ from: '2024-01-01', to: '2024-02-01' }, today, 3) as string, /16 months/);
});

test('Search Console filters: a search, a page, a device, an appearance', () => {
  assert.deepEqual(gscFilters({}), []);
  assert.deepEqual(gscFilters({ query: ' Botox Denver ', page: 'https://glow.example/botox', device: 'mobile', appearance: 'AI_OVERVIEW' }), [
    { dimension: 'query', operator: 'contains', expression: 'botox denver' },
    { dimension: 'page', operator: 'includingRegex', expression: '^https?://(www\\.)?glow\\.example/botox/?$' },
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
    { key: 'botox denver', a: 12, b: 400, c: 4.3, d: 3, wasA: 8, wasB: 0 },
    { key: 'lip flip', a: 3, b: 90, c: 9, d: 3.3, wasA: null, wasB: null },
  ]);
});

test('Analytics filters and requests', () => {
  assert.deepEqual(gaFilters({}), []);
  assert.deepEqual(gaFilters({ page: 'https://glow.example/botox?x=1', device: 'Mobile', source: 'ai' }).map((f: any) => [f.filter.fieldName, f.filter.stringFilter.matchType]), [
    ['landingPagePlusQueryString', 'CONTAINS'], ['deviceCategory', 'EXACT'], ['sessionSource', 'PARTIAL_REGEXP'],
  ]);
  assert.equal((gaFilters({ page: 'https://glow.example/botox?x=1' })[0] as any).filter.stringFilter.value, '/botox?x=1');
  const listing = (gaFilters({ source: 'listing', website: 'https://glow.example/botox?utm_source=google&utm_medium=organic&utm_campaign=Denver-GMB-Listing' })[0] as any).orGroup.expressions.map((e: any) => [e.filter.fieldName, e.filter.stringFilter.value]);
  // The link's own campaign counts; its everyday source and medium do not.
  assert.deepEqual(listing, [
    ['sessionCampaignName', '^(gbp_listing|gmb|gbp|google_my_business|google-business-profile|denver-gmb-listing)$'],
    ['sessionSource', '^(gbp_listing|gmb|gbp|google_my_business|google-business-profile)$'],
    ['sessionMedium', '^(gbp_listing|gmb|gbp|google_my_business|google-business-profile)$'],
  ]);
  assert.deepEqual((gaFilters({ scope: 'page', website: 'https://glow.example/botox/?utm_source=gbp' })[0] as any).filter, { fieldName: 'landingPage', stringFilter: { matchType: 'FULL_REGEXP', value: '^/botox/?$', caseSensitive: false } });
  assert.equal((gaFilters({ scope: 'page', website: 'https://glow.example' })[0] as any).filter.stringFilter.value, '^/?$');
  assert.deepEqual(gaFilters({ scope: 'site', website: 'https://glow.example/botox' }), []);
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
    { name: 'form_submit', count: 12, keyEvents: 12, wasCount: null, call: false, noise: false, leads: 12 },
    { name: 'click_to_call', count: 30, keyEvents: 0, wasCount: 21, call: true, noise: false, leads: 30 },
  ]);
  assert.deepEqual([r.leads, r.leadsBefore], [42, 25]);
  assert.deepEqual(r.audit, { noisy: [], callsNotKey: ['click_to_call'] });
  assert.deepEqual([r.calls, r.callsBefore], [30, 25]);
  const req = gaEventsRequest({ from: '2026-10-01', to: '2026-10-31' }, { source: 'listing' }) as any;
  assert.deepEqual(req.dimensions, [{ name: 'eventName' }]);
  assert.match(req.dimensionFilter.orGroup.expressions[0].filter.stringFilter.value, /gbp_listing/);
});

test('exploreRange: against the same days a year earlier (52 weeks back)', () => {
  const r = exploreRange({ days: 7, compare: 'year' }, new Date('2026-11-19T12:00:00Z'), 2, 18);
  assert.ok(typeof r !== 'string');
  if (typeof r === 'string') return;
  assert.deepEqual(r.recent, { from: '2026-11-11', to: '2026-11-17' });
  assert.deepEqual(r.before, { from: '2025-11-12', to: '2025-11-18' });
  assert.equal(r.compare, 'year');
  const p = exploreRange({ days: 7 }, new Date('2026-11-19T12:00:00Z'), 2, 18);
  assert.ok(typeof p !== 'string' && p.compare === 'previous' && p.before.to === '2026-11-10');
});

import { competingPages, pageKey, pageRegex, readInspection, risingSearches, samePage, spots, topSearches } from '../packages/core/googleExplore';

test('a page is matched however Google filed it', () => {
  assert.equal(pageKey('https://www.Glow.example/botox/?utm_source=gbp#top'), 'glow.example/botox');
  assert.ok(samePage('http://glow.example/botox', 'https://www.glow.example/botox/'));
  assert.ok(!samePage('https://glow.example/botox', 'https://glow.example/botox-denver'));
  const re = new RegExp(pageRegex('https://www.glow.example/botox/?utm_source=gbp'));
  for (const u of ['https://glow.example/botox', 'http://www.glow.example/botox/', 'https://www.glow.example/botox']) assert.ok(re.test(u), u);
  for (const u of ['https://glow.example/botox-denver', 'https://glow.example/botox/prices', 'https://glowXexample/botox']) assert.ok(!re.test(u), u);
  // The home page.
  assert.ok(new RegExp(pageRegex('https://glow.example/')).test('http://www.glow.example') && new RegExp(pageRegex('https://glow.example')).test('https://glow.example/'));
  assert.equal(pageRegex('not a url'), '');
});

test('top searches: clicks, then times shown, then position; rising falls back to times shown', () => {
  const row = (key: string, a: number, b: number, c: number, wasA: number | null = 0, wasB: number | null = 0) => ({ key, a, b, c, wasA, wasB });
  const rows = [row('aaa', 0, 5, 9), row('zzz big', 0, 400, 12), row('mid', 0, 400, 4), row('one click', 1, 3, 20)];
  assert.deepEqual(topSearches(rows).map((r) => r.key), ['one click', 'mid', 'zzz big', 'aaa']);
  // Nothing gained two clicks: by how many more times each was shown.
  const r = risingSearches([row('up a lot', 0, 300, 5, 0, 100), row('up a bit', 1, 50, 5, 0, 40), row('down', 0, 10, 5, 0, 90), row('new', 0, 70, 5, null, null)]);
  assert.equal(r.by, 'shown');
  assert.deepEqual(r.rows.map((x) => [x.key, x.gain]), [['up a lot', 200], ['new', 70], ['up a bit', 10]]);
  assert.equal(risingSearches([row('clicked', 9, 100, 3, 2, 500), row('up a lot', 0, 300, 5, 0, 100)]).by, 'clicks');
  assert.equal(spots(3.1, 8.2), 5.1);
  assert.equal(spots(12.9, 8), -4.9);
  assert.equal(spots(3, null), null);
});

test('competing pages: another page takes a fifth or more of a search', () => {
  const own = 'https://glow.example/botox/';
  const c = competingPages([
    { query: 'botox denver', page: 'https://glow.example/botox', impressions: 600 },
    { query: 'botox denver', page: 'https://glow.example/blog/botox-cost', impressions: 300 },
    { query: 'botox denver', page: 'https://glow.example/', impressions: 100 },
    { query: 'lip filler', page: 'http://www.glow.example/botox/', impressions: 90 },
    { query: 'lip filler', page: 'https://glow.example/fillers', impressions: 10 },
  ], own);
  assert.deepEqual(c, { 'botox denver': { page: 'https://glow.example/blog/botox-cost', share: 30, shown: 300 } });
});

test('URL inspection, in one line', () => {
  const i = readInspection({ inspectionResult: { inspectionResultLink: 'https://search.google.com/x', indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed', lastCrawlTime: '2026-11-12T08:00:00Z', crawledAs: 'MOBILE', googleCanonical: 'https://www.glow.example/botox', userCanonical: 'https://glow.example/botox/' }, richResultsResult: { detectedItems: [{ richResultType: 'FAQ' }, { richResultType: 'Local business' }, { richResultType: 'FAQ' }] } } }, 'https://glow.example/botox/');
  assert.deepEqual(i, { indexed: true, state: 'Submitted and indexed', canonical: 'match', googleCanonical: 'https://www.glow.example/botox', lastCrawl: '2026-11-12T08:00:00Z', crawledAs: 'phone', rich: ['FAQ', 'Local business'], link: 'https://search.google.com/x' });
  assert.equal(readInspection({ inspectionResult: { indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'Crawled - currently not indexed', googleCanonical: 'https://glow.example/' } } }, 'https://glow.example/botox')?.canonical, 'differs');
  assert.equal(readInspection({}, 'https://glow.example/'), null);
});

import { isLeadEvent, leadCount, leadsBy } from '../packages/core/googleExplore';

test('real leads: automatic events never count, calls and named lead events always do', () => {
  const row = (dims: string[], count: number, key: number) => ({ dimensionValues: dims.map((value) => ({ value })), metricValues: [{ value: String(count) }, { value: String(key) }] });
  for (const n of ['generate_lead', 'form_submit', 'contact_form_sent', 'book_appointment', 'chat_started', 'request-a-quote']) assert.ok(isLeadEvent(n), n);
  for (const n of ['page_view', 'click', 'scroll', 'view_item', 'bookmark']) assert.ok(!isLeadEvent(n), n);
  assert.equal(leadCount({ name: 'page_view', count: 900, keyEvents: 900 }), 0);
  assert.equal(leadCount({ name: 'newsletter_signup', count: 9, keyEvents: 4 }), 4, 'a custom key event counts as the property counts it');
  // A property that marks page_view as key: 364 "conversions" per 100 visits become what really happened.
  const r = gaEventRows([row(['page_view'], 3640, 3640), row(['session_start'], 1000, 1000), row(['phone_call'], 12, 0), row(['generate_lead'], 5, 5)], []);
  assert.equal(r.leads, 17);
  assert.deepEqual(r.audit, { noisy: ['page_view', 'session_start'], callsNotKey: ['phone_call'] });
  const by = leadsBy([row(['20261101', 'page_view'], 50, 50), row(['20261101', 'phone_call'], 2, 0), row(['20261102', 'form_submit'], 1, 1)]);
  assert.deepEqual([...by], [['2026-11-01', { leads: 2, calls: 2 }], ['2026-11-02', { leads: 1, calls: 0 }]]);
  assert.deepEqual([...leadsBy([row(['Lakeland', 'Florida', 'click_to_call'], 3, 0)])], [['Lakeland / Florida', { leads: 3, calls: 3 }]]);
});
