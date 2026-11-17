import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { campaignId, parseSpec } from '../packages/core/grid';
import { decodoMobileConfigured, decodoMobileLadder } from '../packages/core/decodo';
import { outageKey } from '../packages/core/proxyWait';

const base = { keyword: 'emergency plumber', targetBusiness: "Stuart's Plumbing", centerLat: 28.0395, centerLng: -81.9498, gridSize: 5, spacingKm: 3.21868, targetType: 'mobile_chrome' };

test('scan spec: home internet unless mobile data is asked for; mobile data has no ISP choice', () => {
  assert.equal(parseSpec(base).network, 'residential');
  assert.equal(parseSpec({ ...base, network: 'satellite' }).network, 'residential');
  assert.equal(parseSpec({ ...base, network: 'mobile' }).network, 'mobile');
  assert.throws(() => parseSpec({ ...base, network: 'mobile', ispMode: 'single', isps: ['Spectrum'] }), /any carrier/);
});

test('campaign ids: home-internet scans keep their ids; mobile runs are a campaign of their own', () => {
  const home = parseSpec(base);
  // The id exactly as it was computed before mobile data existed (v139): scheduled scans keep it.
  const s = home;
  const before = createHash('sha256')
    .update(JSON.stringify(['u1', s.keyword.toLowerCase(), s.targetBusiness.toLowerCase(), s.centerLat, s.centerLng, s.gridSize, s.spacingKm, s.targetType, s.phoneBrand, s.phoneModel, s.ispMode, [...s.isps].sort(), s.trackAiOverviews]))
    .digest('hex');
  assert.equal(campaignId('u1', home), before);
  assert.notEqual(campaignId('u1', parseSpec({ ...base, network: 'mobile' })), before);
});

test('mobile data asks Decodo for the point’s state, with its own login', () => {
  assert.deepEqual(decodoMobileLadder({ stateCode: 'fl' }), [{ rung: 'MOBILE_STATE', params: 'country-us-state-us_florida' }]);
  assert.deepEqual(decodoMobileLadder({ stateCode: 'NY' })[0].params, 'country-us-state-us_new_york');
  assert.deepEqual(decodoMobileLadder({ stateCode: 'ZZ' }), []);
  assert.equal(decodoMobileConfigured({}), false);
  assert.equal(decodoMobileConfigured({ DECODO_USERNAME: 'a', DECODO_PASSWORD: 'b' }), false);
  assert.equal(decodoMobileConfigured({ DECODO_MOBILE_USERNAME: 'a', DECODO_MOBILE_PASSWORD: 'b' }), true);
});

test('outages are tracked per network, so mobile data being down never holds up home internet', () => {
  assert.equal(outageKey({ proxyRegion: 'Florida', stateCode: 'FL', network: 'residential' }), 'Florida');
  assert.equal(outageKey({ proxyRegion: 'Florida', stateCode: 'FL' }), 'Florida');
  assert.equal(outageKey({ proxyRegion: null, stateCode: 'FL', network: 'residential' }), null);
  assert.equal(outageKey({ proxyRegion: 'Florida', stateCode: 'FL', network: 'mobile' }), 'Florida (mobile data)');
  assert.equal(outageKey({ proxyRegion: null, stateCode: 'FL', network: 'mobile' }), 'FL (mobile data)');
});
