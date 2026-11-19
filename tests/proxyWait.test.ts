import test from 'node:test';
import assert from 'node:assert/strict';
import { isProxyProblem, proxyRetryDelay, supplyDown, trafficLow } from '../packages/core/proxyWait';

test('proxy problems are recognised; the final give-up and other failures are not', () => {
  for (const m of [
    'PROXY_GATE_REJECTED LIST_CITY_ANY_ISP:10153:UPDATE_FAILED',
    'PROXY_SUPPLY_DOWN LIST_CITY_ANY_ISP:10153:UPDATE_FAILED',
    'PROXY_EXIT_CHANGED 134.16.48.246>97.93.23.47',
    'PROXY_LIST_MISSING',
    'PROXY_LADDER_EXHAUSTED LIST_CITY_ANY_ISP:UPDATE_FAILED',
    'DUOPLUS_PROXY_ADD_FAILED "check failed"',
  ])
    assert.equal(isProxyProblem(m), true, m);
  for (const m of ['PROXY_UNAVAILABLE PROXY_GATE_REJECTED x', 'RPA_TASK_FAILED', 'ADB_CONNECT_FAILED', 'DUOPLUS_UPDATE_FAILED x', 'FLAG_CAPTCHA_DETECTED'])
    assert.equal(isProxyProblem(m), false, m);
});

test('supply down: every port refused or dead (today’s outage)', () => {
  // The failures of Nov 17: the town's ports, then the state list's, all refused by DuoPlus.
  const outage = 'LIST_CITY_ANY_ISP:10153:UPDATE_FAILED,LIST_CITY_ANY_ISP:10159:UPDATE_FAILED,LIST_STATE_ANY_ISP:10113:UPDATE_FAILED'.split(',');
  assert.equal(supplyDown(outage), true);
  assert.equal(supplyDown(['LIST_CITY_ANY_ISP:10068:NO_GEOLOCATION+NO_NETWORK_EVIDENCE', 'LIST_STATE_ANY_ISP:10104:UPDATE_FAILED']), true);
  assert.equal(supplyDown(['LIST_CITY_ANY_ISP:UPDATE_FAILED', 'LIST_STATE_ANY_ISP:NO_EXIT']), true);
  assert.equal(supplyDown(['LIST_CITY_ANY_ISP:-:NO_FREE_PORT', 'LIST_STATE_ANY_ISP:10001:UPDATE_FAILED', 'LIST_STATE_ANY_ISP:10002:UPDATE_FAILED']), true);
});

test('not supply down: some port answered, or too little to tell', () => {
  assert.equal(supplyDown(['LIST_CITY_ANY_ISP:10038:UPDATE_FAILED', 'LIST_CITY_ANY_ISP:10039:IP_HOURLY_CAP']), false);
  assert.equal(supplyDown(['LIST_CITY_ANY_ISP:10038:WRONG_STATE', 'LIST_STATE_ANY_ISP:10001:UPDATE_FAILED']), false);
  assert.equal(supplyDown(['LIST_CITY_ANY_ISP:10038:HOSTING_ASN+NO_NETWORK_EVIDENCE', 'LIST_STATE_ANY_ISP:10001:UPDATE_FAILED']), false);
  assert.equal(supplyDown(['LIST_CITY_ANY_ISP:10038:UPDATE_FAILED']), false);
  assert.equal(supplyDown(['LIST_CITY_ANY_ISP:-:NO_FREE_PORT', 'LIST_STATE_ANY_ISP:-:NO_FREE_PORT']), false);
  assert.equal(supplyDown([]), false);
});

test('retry delay: soon at first, two minutes at most; about two minutes during an outage', () => {
  const none = () => 0;
  assert.equal(proxyRetryDelay(1, false, none), 15000);
  assert.equal(proxyRetryDelay(2, false, none), 30000);
  assert.equal(proxyRetryDelay(50, false, none), 120000);
  assert.equal(proxyRetryDelay(1, true, none), 120000);
  assert.ok(proxyRetryDelay(1, true, () => 0.999) < 150000);
  assert.ok(proxyRetryDelay(3, false, () => 0.999) < 55000);
});

test('traffic low: under the threshold, or less than a day at today’s pace', () => {
  assert.equal(trafficLow(null), false);
  assert.equal(trafficLow({ leftBytes: null, todayBytes: 5e9 }), false);
  assert.equal(trafficLow({ leftBytes: 1.5e9, todayBytes: 0 }, 2), true);
  assert.equal(trafficLow({ leftBytes: 8e9, todayBytes: 9e9 }, 2), true);
  assert.equal(trafficLow({ leftBytes: 8e9, todayBytes: 3e9 }, 2), false);
});

import { trafficByHour, trafficHourKey } from '../packages/core/proxyWait';

test('data used hour by hour, with the data each search cost', () => {
  assert.equal(trafficHourKey(new Date('2026-11-18T23:59:59Z')), '2026-11-18T23');
  const GB = 1e9;
  const hours = trafficByHour(
    {
      '2026-11-18T20': { res: 10 * GB, mob: 5 * GB },
      '2026-11-18T21': { res: 12 * GB, mob: 4.5 * GB },
      '2026-11-18T22': { res: 12 * GB, mob: 4.5 * GB },
      // A new package (used starts again) and a top-up (more left): no guess for that hour.
      '2026-11-18T23': { res: 1 * GB, mob: 9 * GB },
      // The worker rested: the next reading is hours later, so 23:00 gets no figure.
      '2026-11-19T03': { res: 2 * GB, mob: 8 * GB },
    },
    { '2026-11-18T20': 50, '2026-11-18T22': 4 },
  );
  assert.deepEqual(hours, [
    { hour: '2026-11-18T20', residentialBytes: 2 * GB, mobileBytes: 0.5 * GB, points: 50, bytesPerPoint: 50e6 },
    { hour: '2026-11-18T21', residentialBytes: 0, mobileBytes: 0, points: 0, bytesPerPoint: null },
    { hour: '2026-11-18T22', residentialBytes: null, mobileBytes: null, points: 4, bytesPerPoint: null },
  ]);
});
