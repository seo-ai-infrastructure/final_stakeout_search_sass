import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appleCards, parseAppleMaps } from '../apps/worker/src/xmlParser';
import { appleStartUrl, surfaceLabel } from '../packages/core/appleMaps';
import { pickTemplate, buildTaskConfig, extractTemplateVars } from '../packages/core/rpaRules';
import { parseSpec } from '../packages/core/grid';
import { businessKey } from '../packages/core/locations';

// A snapshot shaped like maps.apple.com's results list as read on 24 Nov 2026 (each result: a link
// named after the business, then its lines). Made here, not taken from a phone: the first real
// snapshot from Firefox Focus replaces it.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const n = (o: { text?: string; desc?: string; cls?: string; click?: boolean }, kids = '') =>
  `<node index="0" text="${esc(o.text ?? '')}" resource-id="" class="${o.cls ?? 'android.view.View'}" package="org.mozilla.focus" content-desc="${esc(o.desc ?? '')}" clickable="${o.click ? 'true' : 'false'}" bounds="[0,0][0,0]">${kids}</node>`;
type Card = { name: string; lines: string[] };
const card = (c: Card) => n({ desc: c.name, click: true }) + n({ text: c.name }) + c.lines.map((l) => n({ text: l })).join('');
const page = (cards: Card[], extra = '') =>
  `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">` +
  n({}, n({ desc: 'Search', click: true }) + n({ text: 'Search' }) + n({ desc: 'Apple Maps', cls: 'android.view.View' }) + n({ text: 'Open Now', click: true }) + n({ text: 'Sort by Best Match', click: true }) + extra + cards.map(card).join('')) +
  `</hierarchy>`;
const A: Card = { name: 'Radiant Plumbing & Air Conditioning - Austin', lines: ['HVAC Contractor', 'Open 24 hrs', '2.6 (863) on Yelp', '901 Reinli St, Austin'] };
const B: Card = { name: 'UA Local 286', lines: ['Plumbing Contractor', '100%', '814 Airport Blvd, Austin'] };
const C: Card = { name: 'Wilson Plumbing', lines: ['Plumbing Contractor', 'Closed till 7:00 AM', '4.1 (61) on Yelp', '906 E 47th St, Austin'] };
const D: Card = { name: 'Joe’s Plumbing LLC', lines: ['Plumber'] }; // a service-area business: no address
const E: Card = { name: 'Lantz Home Services', lines: ['Backflow Service', 'Open 24 hrs', '92% (120)', '1114 W 5th St, Ste 2, Austin'] };

test('each grid point opens Apple Maps centred on itself', () => {
  assert.equal(appleStartUrl(30.2672, -97.7431), 'https://maps.apple.com/search?center=30.267200%2C-97.743100&span=0.050000%2C0.082000');
  assert.throws(() => appleStartUrl(Number.NaN, 0));
  assert.throws(() => appleStartUrl(91, 0));
  assert.equal(surfaceLabel('mobile_apple'), 'Apple Maps');
  assert.equal(surfaceLabel('something_new'), 'something new');
});

test('result cards are read in Apple’s order; the page’s own buttons and headings are not businesses', () => {
  const cards = appleCards(page([A, B, C, D]));
  assert.deepEqual(cards.map((c) => c.name), [A.name, B.name, C.name, D.name]);
  assert.deepEqual(cards[0], { name: A.name, category: 'HVAC Contractor', rating: '2.6 (863) on Yelp', hours: 'Open 24 hrs', address: '901 Reinli St, Austin', ad: false });
  assert.equal(cards[1].rating, '100%');
  assert.deepEqual([cards[3].category, cards[3].address], ['Plumber', null], 'a card with only a category still counts');
});

test('snapshots taken while scrolling merge into one list; the rank is the place in it', () => {
  const r = parseAppleMaps([page([A, B, C]), page([B, C, D]), page([C, D, E])], 'Wilson Plumbing');
  assert.deepEqual(r.orderedBusinesses, [A.name, B.name, C.name, D.name, E.name]);
  assert.equal(r.targetRank, 3);
  assert.equal(r.matchedDumpIndex, 0);
  assert.equal(r.hasAiOverview, false);
  assert.equal(parseAppleMaps([page([A, B])], 'Wilson Plumbing').targetRank, null, 'not in the list: no rank');
});

test('Apple’s spelling of a name may differ a little from Google’s', () => {
  const same = (x: string, y: string) => businessKey(x) === businessKey(y);
  assert.equal(parseAppleMaps([page([A, D])], "Joe's Plumbing", same).targetRank, 2);
  assert.equal(parseAppleMaps([page([A, D])], 'Radiant Plumbing and Air Conditioning - Austin', same).targetRank, 1);
  assert.equal(parseAppleMaps([page([A, D])], 'Joe’s Plumbing Supply', same).targetRank, null, 'a different business is not matched');
});

test('an unreadable page is retried, never recorded; "No Results" on Apple Maps is a real answer', () => {
  assert.throws(() => parseAppleMaps([page([])], 'X'), /UNRECOGNIZED_RESULT_LAYOUT/);
  assert.throws(() => parseAppleMaps([], 'X'), /NO_RESULT_DUMPS/);
  const none = parseAppleMaps([page([], n({ text: 'No Results' }))], 'X');
  assert.deepEqual([none.orderedBusinesses, none.targetRank], [[], null]);
  assert.equal(parseAppleMaps([page(Array.from({ length: 30 }, (_, i) => ({ name: 'Plumber ' + i, lines: ['Plumbing Contractor'] })))], 'Plumber 29').orderedBusinesses.length, 25, 'Apple lists 25');
});

test('the Apple Maps template is picked for Apple scans only, and gets the point’s address', () => {
  const list = [{ id: 'a', name: 'Stakeout_apple_maps_v1.0' }, { id: 'm', name: 'Stakeout Google Maps app' }, { id: 'c', name: 'Stakeout_chrome_final_v3.45' }];
  assert.equal(pickTemplate(list, 'apple')?.id, 'a');
  assert.equal(pickTemplate(list, 'maps')?.id, 'm', 'the Google Maps app never gets the Apple template');
  assert.equal(pickTemplate([list[0], list[2]], 'maps'), null);
  assert.equal(pickTemplate(list, 'chrome')?.id, 'c');
  const tpl = JSON.parse(readFileSync(new URL('../docs/rpa/Stakeout_apple_maps_v1.0.json', import.meta.url), 'utf8'));
  const vars = extractTemplateVars({ config: tpl.config });
  assert.deepEqual(vars.map((v) => v.key), ['keyword', 'pin_id', 'start_url', 'record_start', 'template_version']);
  const cfg = buildTaskConfig(vars, 'keyword', 'plumber near me', 'abc_1_2', '', { start_url: appleStartUrl(30.2672, -97.7431), location_skip_class: 'ignored' });
  assert.equal(cfg.keyword.value, 'plumber near me');
  assert.equal(cfg.pin_id.value, 'abc_1_2');
  assert.match(String(cfg.start_url.value), /center=30\.267200%2C-97\.743100/);
  assert.equal('location_skip_class' in cfg, false);
  const text = JSON.stringify(tpl);
  assert.ok(text.includes('org.mozilla.focus') && text.includes('${start_url}') && text.includes('${pin_id}_list_') && text.includes('${pin_id}.done') && text.includes('${pin_id}.rec'));
});

test('an Apple Maps scan is a valid scan and tracks no AI Overview', () => {
  const base = { keyword: 'plumber', targetBusiness: 'Joe', centerLat: 30.2672, centerLng: -97.7431, gridSize: 3, spacingKm: 1.60934, trackAiOverviews: true, scheduleType: 'once' };
  const s = parseSpec({ ...base, targetType: 'mobile_apple' });
  assert.equal(s.targetType, 'mobile_apple');
  assert.equal(s.trackAiOverviews, false);
  assert.throws(() => parseSpec({ ...base, targetType: 'mobile_bing' }));
});
