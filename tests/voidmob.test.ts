import test from 'node:test';
import assert from 'node:assert/strict';
import { MOBILE_HUBS, mobileHubs, mobileProvider, voidmobCity, voidmobUser } from '../packages/core/voidmob';
import { US_STATE_NAMES } from '../packages/core/proxySeller';

test('every state has hub cities', () => {
  for (const code of Object.keys(US_STATE_NAMES)) assert.ok(MOBILE_HUBS[code]?.length, code);
});

test('VoidMob spellings and the Flex username', () => {
  assert.equal(voidmobCity('New York'), 'New-York');
  assert.equal(voidmobCity('St. Louis'), 'St-Louis');
  assert.equal(voidmobCity('Salt Lake City'), 'Salt-Lake-City');
  assert.equal(voidmobUser('vm_abc', 'Tampa', 'a1b2c3d4e5f6', 30), 'vm_abc_c_US_city_Tampa_s_a1b2c3d4e5f6_ttl_30m');
  assert.equal(voidmobUser(' vm_abc ', 'Fort Worth', 'a1b2c3d4e5f6', 5000), 'vm_abc_c_US_city_Fort-Worth_s_a1b2c3d4e5f6_ttl_1440m');
  assert.throws(() => voidmobUser('vm_abc', 'Tampa', 'bad id!'), /PROXY_SESSION_ID_INVALID/);
});

test('hubs: the nearest big city in the point’s own state first (Lakeland → Tampa, New Kensington → Pittsburgh)', () => {
  const fl = mobileHubs({ lat: 28.0395, lng: -81.9498, stateCode: 'FL' });
  assert.deepEqual(fl.filter((h) => h.inState).map((h) => h.city), ['Tampa', 'Orlando', 'Jacksonville', 'Miami']);
  const pa = mobileHubs({ lat: 40.5698, lng: -79.7648, stateCode: 'pa' });
  assert.equal(pa[0].city, 'Pittsburgh');
  assert.ok(pa[0].km !== null && pa[0].km < 40);
  // Then at most two hubs over the state line, nearest first, within 400 km; none when switched off.
  const over = pa.filter((h) => !h.inState);
  assert.ok(over.length <= 2 && over.every((h) => h.state !== 'PA' && h.km !== null && h.km <= 400));
  assert.equal(mobileHubs({ lat: 40.5698, lng: -79.7648, stateCode: 'PA' }, { crossState: false }).some((h) => !h.inState), false);
  // Without a position, the state's hubs in their usual order.
  assert.deepEqual(mobileHubs({ stateCode: 'FL' }).map((h) => h.city), MOBILE_HUBS.FL);
});

test('mobile provider: VoidMob when set up, Decodo mobile as the alternative, nothing without a login', () => {
  const vm = { VOIDMOB_USERNAME: 'u', VOIDMOB_PASSWORD: 'p' };
  const dm = { DECODO_MOBILE_USERNAME: 'u', DECODO_MOBILE_PASSWORD: 'p' };
  assert.equal(mobileProvider({}), null);
  assert.equal(mobileProvider(vm), 'voidmob');
  assert.equal(mobileProvider(dm), 'decodo');
  assert.equal(mobileProvider({ ...vm, ...dm }), 'voidmob');
  assert.equal(mobileProvider({ ...vm, ...dm, MOBILE_PROVIDER: 'decodo' }), 'decodo');
  assert.equal(mobileProvider({ ...vm, MOBILE_PROVIDER: 'decodo' }), 'voidmob');
});
