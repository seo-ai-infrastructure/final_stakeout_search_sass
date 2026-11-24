import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packageEnds, pickNetwork } from '../packages/core/networkChoice';

const GB = 1e9;
const on = { mobileForCustomers: true, mobileFirst: false };
const health = (homeGb: number | null, mobileGb: number | null, extra: Record<string, unknown> = {}) => ({
  traffic: { leftBytes: homeGb === null ? null : homeGb * GB, expires: '22.12.2026 23:59:59' },
  mobileData: true,
  mobileLanes: null as string | null,
  mobileProvider: 'voidmob' as string | null,
  mobileTraffic: { leftBytes: mobileGb === null ? null : mobileGb * GB },
  mobileTrafficLow: false,
  ...extra,
});
const now = Date.UTC(2026, 10, 24, 17);

test('scans use up Proxy-Seller first, then switch to mobile data for good', () => {
  assert.deepEqual(pickNetwork(health(6.4, 5.9), on, 25, 'mobile_chrome', {}, now), { network: 'residential', switchNow: false }, 'plenty of home internet left');
  assert.deepEqual(pickNetwork(health(1.2, 5.9), on, 25, 'mobile_chrome', {}, now), { network: 'residential', switchNow: false }, 'a 5×5 still fits (0.75 GB + 0.3 GB kept back)');
  assert.deepEqual(pickNetwork(health(0.9, 5.9), on, 25, 'mobile_chrome', {}, now), { network: 'mobile', switchNow: true }, "the scan home internet can't fit switches");
  assert.deepEqual(pickNetwork(health(40, 5.9), { ...on, mobileFirst: true }, 25, 'mobile_chrome', {}, now), { network: 'mobile', switchNow: false }, 'a later Proxy-Seller top-up does not switch back');
  assert.deepEqual(pickNetwork(health(6.4, 5.9), on, 25, 'mobile_chrome', {}, Date.UTC(2026, 11, 23)), { network: 'mobile', switchNow: true }, 'an expired package counts as empty');
});

test('home internet stays the fallback whenever mobile data cannot take the scan', () => {
  assert.equal(pickNetwork(health(0.5, 1.2), on, 25, 'mobile_chrome', {}, now).network, 'residential', 'VoidMob short of room (0.75 GB + 1 GB kept back)');
  assert.equal(pickNetwork(health(0.5, 5.9, { mobileTrafficLow: true }), on, 25, 'mobile_chrome', {}, now).network, 'residential', 'VoidMob flagged low');
  assert.equal(pickNetwork(health(0.5, 5.9, { mobileProvider: null }), on, 25, 'mobile_chrome', {}, now).network, 'residential', 'mobile data not set up');
  assert.equal(pickNetwork(health(0.5, 5.9), { ...on, mobileForCustomers: false }, 25, 'mobile_chrome', {}, now).network, 'residential', 'mobile data switched off for customers');
  assert.equal(pickNetwork(health(0.5, 1.2), { ...on, mobileFirst: true }, 25, 'mobile_chrome', {}, now).network, 'residential', 'after the switch too');
  assert.equal(pickNetwork(health(0.5, 5.9), on, 25, 'desktop_aimode', {}, now).network, 'residential', 'desktop scans are not phone scans');
  assert.equal(pickNetwork(null, on, 25, 'mobile_chrome', {}, now).network, 'residential', 'no health report: nothing changes');
  assert.equal(pickNetwork(health(null, 5.9), on, 25, 'mobile_chrome', {}, now).network, 'residential', 'Proxy-Seller unread: nothing changes');
});

test("Proxy-Seller's package end reads as a time", () => {
  assert.equal(packageEnds('22.12.2026 23:59:59'), Date.UTC(2026, 11, 22, 23, 59, 59));
  assert.equal(packageEnds('nonsense'), null);
  assert.equal(packageEnds(null), null);
});

const LINE = 'lane 1 example:7000 socks5 · 4 at a time';

test('an unlimited mobile line makes mobile the default: the line first, home internet when it cannot', () => {
  assert.deepEqual(pickNetwork(health(6.4, 5.9, { mobileLanes: LINE }), on, 25, 'mobile_chrome', {}, now), { network: 'mobile', switchNow: false }, 'Proxy-Seller still has data: the line goes first anyway');
  assert.equal(pickNetwork(health(6.4, 0.2, { mobileLanes: LINE, mobileTrafficLow: true }), on, 25, 'mobile_chrome', {}, now).network, 'mobile', 'VoidMob empty: the line alone (points wait for it)');
  assert.equal(pickNetwork(health(6.4, 5.9, { mobileLanes: LINE }), { ...on, mobileForCustomers: false }, 25, 'mobile_chrome', {}, now).network, 'residential', 'mobile switched off for customers');
});

test('internal (admin) runs never use metered mobile data: the line or home internet', () => {
  assert.equal(pickNetwork(health(0.5, 5.9), { ...on, mobileFirst: true }, 25, 'mobile_chrome', { internal: true }, now).network, 'residential', 'no line: home internet, not VoidMob');
  assert.equal(pickNetwork(health(6.4, 0, { mobileLanes: LINE }), on, 25, 'mobile_chrome', { internal: true }, now).network, 'mobile', 'the line');
  assert.equal(pickNetwork(health(0.5, 5.9), on, 25, 'mobile_chrome', { internal: true }, now).switchNow, false, 'an admin run never flips the switch on VoidMob');
});

test("Proxy-Seller's prepaid data takes overflow points while it has room and hasn't ended", async () => {
  const { homeHasRoom } = await import('../packages/core/networkChoice');
  const at = Date.UTC(2026, 10, 24, 18);
  assert.equal(homeHasRoom({ leftBytes: 6.4e9, expires: '22.12.2026 23:59:59' }, at), true);
  assert.equal(homeHasRoom({ leftBytes: 0.4e9, expires: '22.12.2026 23:59:59' }, at), false, 'under half a GB');
  assert.equal(homeHasRoom({ leftBytes: 6.4e9, expires: '22.12.2026 23:59:59' }, Date.UTC(2026, 11, 23)), false, 'ended');
  assert.equal(homeHasRoom(null, at), true, 'not read yet');
});
