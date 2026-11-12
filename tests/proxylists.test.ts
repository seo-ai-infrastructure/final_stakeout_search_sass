import test from 'node:test';
import assert from 'node:assert/strict';
import { extractGeoRows, matchMarket, parseProxyLines, toDuoPlusLine, ispForPin, listRotation, marketKey, listTries, locationVerified } from '../packages/core/proxyGeo';
import { parseSpec } from '../packages/core/grid';

const flat = { status: 'success', data: [
  { country: 'US', region: 'Tennessee', city: 'Mount Juliet', isp: 'Charter Communications' },
  { country: 'US', region: 'Tennessee', city: 'Mount Juliet', isp: 'AT&T Services' },
  { country: 'US', region: 'Tennessee', city: 'Nashville', isp: 'Comcast Cable' },
] };
const nested = { data: [{ name: 'United States', regions: [{ name: 'Tennessee', cities: [
  { name: 'Mount Juliet', isps: ['Charter Communications', 'AT&T Services'] },
  { name: 'Nashville', isps: [{ name: 'Comcast Cable' }] } ] }] }] };
const keyed = { data: { US: { Tennessee: { 'Mount Juliet': ['Charter Communications', 'AT&T Services'], Nashville: ['Comcast Cable'] } } } };

test('reads the GEO data in flat, nested and name-keyed layouts', () => {
  for (const geo of [flat, nested, keyed]) {
    const m = matchMarket(extractGeoRows(geo), 'Mt. Juliet', 'TN');
    assert.deepEqual(m, { country: 'US', region: 'Tennessee', city: 'Mount Juliet', level: 'city', isps: ['AT&T Services', 'Charter Communications'] });
  }
});

test('a city Proxy-Seller does not list falls back to the whole state', () => {
  const m = matchMarket(extractGeoRows(flat), 'Smallville', 'TN')!;
  assert.equal(m.level, 'region');
  assert.equal(m.city, '');
  assert.equal(m.isps.length, 3);
  assert.equal(matchMarket(extractGeoRows(flat), 'Austin', 'TX'), null);
});

test('proxy lines parse in both formats and print in DuoPlus format', () => {
  const e = parseProxyLines('res.example.com:10000:user1:pa:ss\nuser2:pw@res.example.com:10001;');
  assert.deepEqual(e.map(toDuoPlusLine), ['res.example.com:10000:user1:pa:ss', 'res.example.com:10001:user2:pw']);
});

test('each grid point keeps one ISP; a mix spreads them evenly', () => {
  const grid = Array.from({ length: 9 }, (_, i) => ispForPin('mix', ['A', 'B', 'C'], Math.floor(i / 3), i % 3, 3));
  assert.equal(grid.join(''), 'ABCABCABC');
  assert.equal(ispForPin('single', ['A'], 2, 2, 3), 'A');
  assert.equal(ispForPin('any', [], 0, 0, 3), '');
  assert.equal(listRotation({}), -1); // sticky by default: one exit IP per port, checked before each point
  assert.equal(listRotation({ PROXY_LIST_ROTATION: '-1' }), -1);
  assert.equal(listRotation({ PROXY_LIST_ROTATION: '9999' }), -1); // invalid values fall back to sticky
  assert.equal(listRotation({ PROXY_LIST_ROTATION: '0' }), 0);
});

test('scan settings accept any, one or a 2–6 ISP mix only', () => {
  const base = { keyword: 'plumber near me', targetBusiness: 'Polk Plumbing', centerLat: 36.2, centerLng: -86.5 };
  assert.equal(parseSpec(base).ispMode, 'any');
  assert.deepEqual(parseSpec({ ...base, ispMode: 'single', isps: ['AT&T Services'] }).isps, ['AT&T Services']);
  assert.equal(parseSpec({ ...base, ispMode: 'mix', isps: ['A', 'B'] }).ispId, 'MIX');
  assert.throws(() => parseSpec({ ...base, ispMode: 'mix', isps: ['A'] }), /2–6/);
  assert.throws(() => parseSpec({ ...base, ispMode: 'single', isps: ['A', 'B'] }), /ISP/);
  assert.throws(() => parseSpec({ ...base, ispMode: 'any', isps: ['A'] }), /ISP/);
});


test('marketKey: one key per place, however it is spelled', () => {
  assert.equal(marketKey('Mount Juliet', 'tn'), marketKey('MOUNT  JULIET', 'TN'));
  assert.notEqual(marketKey('Hermitage', 'TN'), marketKey('Mount Juliet', 'TN'));
});

test('listTries: the chosen ISP is kept before the city', () => {
  const center = { region: 'Tennessee', city: 'Mount Juliet' };
  const local = { region: 'Tennessee', city: 'Hermitage' };
  assert.deepEqual(listTries(center, local, 'TDS Telecom'), [
    { region: 'Tennessee', city: 'Hermitage', isp: 'TDS Telecom' },
    { region: 'Tennessee', city: 'Mount Juliet', isp: 'TDS Telecom' },
    { region: 'Tennessee', city: 'Hermitage', isp: '' },
    { region: 'Tennessee', city: 'Mount Juliet', isp: '' },
  ]);
});

test('listTries: any ISP uses the point\'s own city first, then the centre', () => {
  const center = { region: 'Tennessee', city: 'Mount Juliet' };
  assert.deepEqual(listTries(center, { region: 'Tennessee', city: 'Old Hickory' }, ''), [
    { region: 'Tennessee', city: 'Old Hickory', isp: '' },
    { region: 'Tennessee', city: 'Mount Juliet', isp: '' },
  ]);
  // A point in the centre city (or with no city list) just uses the centre.
  assert.deepEqual(listTries(center, center, ''), [{ region: 'Tennessee', city: 'Mount Juliet', isp: '' }]);
  assert.deepEqual(listTries(center, null, 'Comcast Cable'), [
    { region: 'Tennessee', city: 'Mount Juliet', isp: 'Comcast Cable' },
    { region: 'Tennessee', city: 'Mount Juliet', isp: '' },
  ]);
});


test('locationVerified: only a device location in the right state or ZIP counts', () => {
  assert.equal(locationVerified('37122, Tennessee - From your device', 'TN', '37121'), true); // real capture: state named
  assert.equal(locationVerified('37121, Tennessee \u2013 From your device', 'TN', '37121'), true);
  assert.equal(locationVerified('Wilson County, TN - Based on your IP address', 'TN', '37121'), false); // IP guess
  assert.equal(locationVerified('O\u02bbzbekiston', 'TN', '37121'), false); // the 19:05 acceptance run
  // Inside Nashville, Google abbreviates the state or names only the place (Hermitage, Donelson; 10 Nov):
  assert.equal(locationVerified('Hermitage, Nashville, TN - From your device', 'TN', '37076'), true);
  assert.equal(locationVerified('Donelson, Nashville, TN 37214 · From your device', 'TN', '37217'), true);
  assert.equal(locationVerified('Donelson, Nashville - From your device', 'TN', '37217', 'Nashville'), true);
  assert.equal(locationVerified('Hermitage - From your device', 'TN', '37076', 'Hermitage'), true);
  // still strict: an IP guess, another state, or a bare device line with nothing matching all fail
  assert.equal(locationVerified('Hermitage, Nashville, TN - Based on your IP address', 'TN', '37076', 'Hermitage'), false);
  assert.equal(locationVerified('Louisville, KY - From your device', 'TN', '37076', 'Hermitage'), false);
  assert.equal(locationVerified('Something, Tenneco - From your device', 'TN', '37076'), false);
  assert.equal(locationVerified('From your device', 'TN', '37076', 'Old'), false);
  assert.equal(locationVerified('30301, Georgia - From your device', 'TN', '37121'), false); // wrong state
  assert.equal(locationVerified(null, 'TN', '37121'), false);
});

test('location wording never pauses a phone; real phone faults still count', async () => {
  const { isDeviceAttributable } = await import('../packages/core/fleetHealth');
  assert.equal(isDeviceAttributable('LOCATION_UNVERIFIED'), false);
  assert.equal(isDeviceAttributable('LOCATION_FROM_IP'), false);
  assert.equal(isDeviceAttributable('RPA_TASK_FAILED'), true);
  assert.equal(isDeviceAttributable('RPA_SURFACE_ERROR'), true);
});

test("location line: when the Local Finder snapshot lacks it, the same search's results page provides it (R1-C3, 9 Nov)", async () => {
  const { readFileSync } = await import('node:fs');
  const { searchLocationLine, readResultsPage } = await import('../packages/core/serpEvidence');
  const serp = readFileSync('tests/fixtures/real-r1c3-serp-2026-11-09.xml', 'utf8');
  const finder = readFileSync('tests/fixtures/real-r1c3-finder-2026-11-09.xml', 'utf8');
  assert.equal(readResultsPage(finder).googleLocation, null, 'the final snapshot had no location line');
  const line = searchLocationLine(null, serp);
  assert.equal(line, 'Mt. Juliet, Tennessee - From your device');
  assert.equal(locationVerified(line, 'TN', '37121', 'Mount Juliet'), true);
  assert.equal(searchLocationLine('Hermitage, TN - From your device', serp), 'Hermitage, TN - From your device', 'the final snapshot wins when it has one');
});

test('a town with no coverage borrows the NEAREST covered city, not the whole state', async () => {
  const { matchMarket } = await import('../packages/core/proxyGeo');
  const rows = [
    { country: 'US', region: 'Georgia', city: 'Atlanta', isp: 'Comcast Cable' },
    { country: 'US', region: 'Georgia', city: 'Atlanta', isp: 'AT&T' },
    { country: 'US', region: 'Georgia', city: 'Savannah', isp: 'Comcast Cable' },
    { country: 'US', region: 'Georgia', city: 'Augusta', isp: 'WOW' },
    { country: 'US', region: 'Georgia', city: 'Nowhere Listed', isp: 'Mystery Net' },
  ];
  const at: Record<string, { lat: number; lng: number }> = {
    atlanta: { lat: 33.75, lng: -84.39 }, savannah: { lat: 32.08, lng: -81.09 }, augusta: { lat: 33.47, lng: -81.97 },
    pooler: { lat: 32.12, lng: -81.25 }, thomson: { lat: 33.47, lng: -82.5 }, marietta: { lat: 33.95, lng: -84.55 },
  };
  const coords = (c: string) => at[c.toLowerCase()] ?? null;
  // Pooler is beside Savannah; Thomson is nearest Augusta; Marietta is nearest Atlanta.
  const pooler = matchMarket(rows, 'Pooler', 'GA', coords)!;
  assert.deepEqual([pooler.level, pooler.city, pooler.isps], ['nearby', 'Savannah', ['Comcast Cable']]);
  assert.ok(pooler.km! < 25, 'about ' + pooler.km + ' km');
  assert.equal(matchMarket(rows, 'Thomson', 'GA', coords)!.city, 'Augusta');
  const marietta = matchMarket(rows, 'Marietta', 'GA', coords)!;
  assert.deepEqual([marietta.city, marietta.isps], ['Atlanta', ['AT&T', 'Comcast Cable']], 'only that city\'s ISPs are offered');
  // A covered city is unchanged; a city that cannot be placed is never chosen.
  assert.deepEqual([matchMarket(rows, 'Atlanta', 'GA', coords)!.level, matchMarket(rows, 'Atlanta', 'GA', coords)!.city], ['city', 'Atlanta']);
  // Last resort: the town itself cannot be placed, or no coordinates are available at all.
  const lost = matchMarket(rows, 'Unmapped Town', 'GA', coords)!;
  assert.deepEqual([lost.level, lost.city], ['region', '']);
  assert.equal(matchMarket(rows, 'Pooler', 'GA')!.level, 'region');
  assert.equal(matchMarket(rows, 'Pooler', 'GA', () => null)!.level, 'region');
});

test('city coordinates come from the bundled ZIP database, with names matched loosely', async () => {
  const { cityCoords } = await import('../packages/core/grid');
  const atl = cityCoords('Atlanta', 'GA')!;
  assert.ok(Math.abs(atl.lat - 33.8) < 0.3 && Math.abs(atl.lng + 84.4) < 0.3, JSON.stringify(atl));
  assert.deepEqual(cityCoords('St. Petersburg', 'FL'), cityCoords('Saint Petersburg', 'fl'), 'St. and Saint are the same place');
  assert.ok(cityCoords('St. Petersburg', 'FL'));
  assert.ok(cityCoords('Mt. Juliet', 'TN') && cityCoords('Mount Juliet', 'TN'));
  assert.equal(cityCoords('Not A Real Place', 'GA'), null);
  assert.equal(cityCoords('Atlanta', 'ZZ'), null);
});
