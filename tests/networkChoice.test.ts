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

test('every phone scan runs on mobile data: home internet is no longer a scan network', () => {
  for (const h of [health(6.4, 5.9), health(0.5, 1.2), health(0.5, 5.9, { mobileTrafficLow: true }), health(0.5, 5.9, { mobileProvider: null }), health(null, 5.9), null])
    for (const s of [on, { ...on, mobileFirst: true }, { ...on, mobileForCustomers: false }])
      for (const opts of [{}, { internal: true }])
        assert.deepEqual(pickNetwork(h, s, 25, 'mobile_chrome', opts, now), { network: 'mobile', switchNow: false });
  assert.equal(pickNetwork(health(6.4, 5.9), on, 25, 'mobile_maps', {}, now).network, 'mobile');
  assert.equal(pickNetwork(health(6.4, 5.9), on, 25, 'desktop_aimode', {}, now).network, 'residential', 'a desktop scan is not a phone scan');
});

test("Proxy-Seller's package end reads as a time", () => {
  assert.equal(packageEnds('22.12.2026 23:59:59'), Date.UTC(2026, 11, 22, 23, 59, 59));
  assert.equal(packageEnds('nonsense'), null);
  assert.equal(packageEnds(null), null);
});

const LINE = 'lane 1 example:7000 socks5 · 4 at a time';

test("Proxy-Seller's prepaid data takes overflow points while it has room and hasn't ended", async () => {
  const { homeHasRoom } = await import('../packages/core/networkChoice');
  const at = Date.UTC(2026, 10, 24, 18);
  assert.equal(homeHasRoom({ leftBytes: 6.4e9, expires: '22.12.2026 23:59:59' }, at), true);
  assert.equal(homeHasRoom({ leftBytes: 0.4e9, expires: '22.12.2026 23:59:59' }, at), false, 'under half a GB');
  assert.equal(homeHasRoom({ leftBytes: 6.4e9, expires: '22.12.2026 23:59:59' }, Date.UTC(2026, 11, 23)), false, 'ended');
  assert.equal(homeHasRoom(null, at), true, 'not read yet');
});
