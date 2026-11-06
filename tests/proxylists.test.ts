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
  assert.equal(listRotation({}), 0);
  assert.equal(listRotation({ PROXY_LIST_ROTATION: '-1' }), -1);
  assert.equal(listRotation({ PROXY_LIST_ROTATION: '9999' }), 0);
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
  assert.equal(locationVerified('30301, Georgia - From your device', 'TN', '37121'), false); // wrong state
  assert.equal(locationVerified(null, 'TN', '37121'), false);
});
