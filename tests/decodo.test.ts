import test from 'node:test';
import assert from 'node:assert/strict';
import { decodoLadder, decodoPlace, decodoServes, decodoUser, geohash, proxyProviders } from '../packages/core/decodo';

test('geohash matches Decodo’s own example (New York City is dr5r)', () => {
  assert.equal(geohash(40.7128, -74.006, 4), 'dr5r');
  assert.equal(geohash(40.7128, -74.006, 1), 'd');
});

test('places are spelled the way Decodo expects', () => {
  assert.equal(decodoPlace('New Kensington'), 'new_kensington');
  assert.equal(decodoPlace('St. Louis'), 'st_louis');
  assert.equal(decodoPlace('Coeur d’Alene'), 'coeur_dalene');
  assert.equal(decodoPlace('Pennsylvania'), 'pennsylvania');
  assert.equal(decodoPlace('  '), '');
});

test('ladder: ZIP, then town, then the area around the point, then the state', () => {
  const l = decodoLadder({ zip: '15068', city: 'New Kensington', stateCode: 'pa', lat: 40.5698, lng: -79.7648 });
  assert.deepEqual(
    l.map((x) => x.rung),
    ['DECODO_ZIP', 'DECODO_CITY', 'DECODO_AREA', 'DECODO_STATE'],
  );
  assert.equal(l[0].params, 'country-us-zip-15068');
  assert.equal(l[1].params, 'country-us-city-new_kensington');
  assert.match(l[2].params, /^geohash-[0-9bcdefghjkmnpqrstuvwxyz]{4}$/);
  assert.equal(l[3].params, 'country-us-state-us_pennsylvania');
  // Without a ZIP, town or position, the state is still there; an unknown state gives nothing.
  assert.deepEqual(decodoLadder({ zip: '', city: '', stateCode: 'NY' }).map((x) => x.params), ['country-us-state-us_new_york']);
  assert.deepEqual(decodoLadder({ zip: '10001', city: 'x', stateCode: 'ZZ' }), []);
});

test('username: user- prefix, target, sticky session', () => {
  assert.equal(decodoUser('spabc123', 'country-us-zip-15068', 'a1b2c3d4e5f6', 30), 'user-spabc123-country-us-zip-15068-session-a1b2c3d4e5f6-sessionduration-30');
  assert.equal(decodoUser('user-spabc123', 'geohash-dr5r', 'a1b2c3d4e5f6', 5000), 'user-spabc123-geohash-dr5r-session-a1b2c3d4e5f6-sessionduration-1440');
  assert.throws(() => decodoUser('spabc123', 'country-us', 'bad-session'), /PROXY_SESSION_ID_INVALID/);
});

test('providers: Decodo first once set up, in the order asked, never without its login', () => {
  const on = { DECODO_USERNAME: 'spabc123', DECODO_PASSWORD: 'pw' };
  assert.deepEqual(proxyProviders({}), ['proxyseller']);
  assert.deepEqual(proxyProviders(on), ['decodo', 'proxyseller']);
  assert.deepEqual(proxyProviders({ ...on, PROXY_PROVIDERS: 'proxyseller,decodo' }), ['proxyseller', 'decodo']);
  assert.deepEqual(proxyProviders({ ...on, PROXY_PROVIDERS: 'Decodo' }), ['decodo']);
  assert.deepEqual(proxyProviders({ PROXY_PROVIDERS: 'decodo' }), ['proxyseller']);
  assert.deepEqual(proxyProviders({ ...on, PROXY_PROVIDERS: 'proxy-seller, decodo, decodo' }), ['proxyseller', 'decodo']);
});

test('Decodo serves every point except one that must use a particular ISP', () => {
  const list = (ispMode: string, isp: string) => ({ isp, scan: { ispMode, proxyRegion: 'Pennsylvania' } });
  assert.equal(decodoServes(list('any', '')), true);
  assert.equal(decodoServes(list('mix', 'Comcast Cable')), true);
  assert.equal(decodoServes(list('single', 'Comcast Cable')), false);
  assert.equal(decodoServes({ scan: { ispId: 'ANY', proxyRegion: null } }), true);
  assert.equal(decodoServes({ scan: { ispId: 'COMCAST', proxyRegion: null } }), false);
});
