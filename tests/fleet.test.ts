import test from 'node:test';
import assert from 'node:assert/strict';
import { failureRate, isDeviceAttributable, nextOutcomes, pauseReason, percentile, stateTimezone, expiresWithin, phoneUsable, phoneInScope, adbWhitelist } from '../packages/core/fleetHealth';
import { transportFor } from '../apps/worker/src/deviceShell';

test('the outcome window keeps the newest 20 pins', () => {
  let o = '';
  for (let i = 0; i < 25; i++) o = nextOutcomes(o, i % 5 !== 0);
  assert.equal(o.length, 20);
  assert.equal(failureRate(o), 4 / 20);
});

test('a phone is paused only with enough pins and a high failure rate', () => {
  assert.equal(pauseReason('FFF', 0.2, 10), null, 'too few pins to judge');
  assert.equal(pauseReason('SSSSSSSSSF', 0.2, 10), null, '10% is below threshold');
  assert.equal(pauseReason('SSSSSSSSFF', 0.2, 10), '2 of the last 10 pins failed');
});

test('proxy, location and capacity failures never count against a phone', () => {
  for (const code of ['PROXY_LADDER_EXHAUSTED', 'LOCATION_FROM_IP', 'NO_COMPATIBLE_DEVICE', 'DEVICE_LEASE_LOST'])
    assert.equal(isDeviceAttributable(code), false, code);
  for (const code of ['DEVICE_SCRIPT_FAILED', 'R2_UPLOAD_TIMEOUT', 'FLAG_CAPTCHA_DETECTED', 'EMPTY_VIDEO'])
    assert.equal(isDeviceAttributable(code), true, code);
});

test('queue-wait percentile and state time zones', () => {
  assert.equal(percentile([], 90), null);
  assert.equal(percentile([5, 1, 9, 3, 7, 2, 8, 4, 6, 10], 90), 9);
  assert.equal(stateTimezone('tn'), 'America/Chicago');
  assert.equal(stateTimezone('FL'), 'America/New_York');
});

test('shell commands use ADB whenever the phone has an ADB address', () => {
  const prev = process.env.DEVICE_TRANSPORT;
  delete process.env.DEVICE_TRANSPORT;
  assert.equal(transportFor({ imageId: 'a', adbAddr: '1.2.3.4:5555' }), 'adb');
  assert.equal(transportFor({ imageId: 'a', adbAddr: null }), 'api');
  process.env.DEVICE_TRANSPORT = 'api';
  assert.equal(transportFor({ imageId: 'a', adbAddr: '1.2.3.4:5555' }), 'api');
  if (prev === undefined) delete process.env.DEVICE_TRANSPORT; else process.env.DEVICE_TRANSPORT = prev;
});


test('phoneUsable: only powered-on, ADB-ready phones that are not about to expire', () => {
  const now = Date.parse('2026-11-06T22:00:00Z'); // 2026-11-07 06:00 in China time
  const later = '2026-12-06 06:00:00'; // GMT+8, a month away
  assert.equal(phoneUsable({ status: 1, adb: '1.2.3.4:5555', expired_at: later }, now).ok, true);
  assert.equal(phoneUsable({ status: 2, adb: 'x', expired_at: later }, now).why, 'powered off');
  assert.equal(phoneUsable({ status: 3, adb: 'x', expired_at: later }, now).why, 'expired');
  assert.equal(phoneUsable({ status: 4, adb: 'x', expired_at: later }, now).why, 'renewal overdue');
  assert.equal(phoneUsable({ status: 10, adb: 'x', expired_at: later }, now).why, 'powering on');
  assert.equal(phoneUsable({ status: 1, adb: '', expired_at: later }, now).why, 'no ADB address');
  // On, but expiring in 20 minutes (06:20 China time): not used.
  assert.equal(phoneUsable({ status: 1, adb: 'x', expired_at: '2026-11-07 06:20:00' }, now).why, 'expires within 30 minutes');
  // Already past its expiry time.
  assert.equal(expiresWithin('2026-11-07 05:00:00', 30, now), true);
  // No or unreadable expiry never excludes a phone.
  assert.equal(expiresWithin(undefined, 30, now), false);
  assert.equal(expiresWithin('soon', 30, now), false);
});


test('phoneUsable: a phone that is on but has ADB off or is disconnected says why', () => {
  const now = Date.parse('2026-11-06T22:00:00Z');
  assert.equal(phoneUsable({ status: 1, adb_status: 0, adb: '', expired_at: '2026-12-06 06:00:00' }, now).why, 'ADB switched off');
  assert.equal(phoneUsable({ status: 1, link_status: '0', adb_status: '1', adb: 'x' }, now).why, 'not connected');
  assert.equal(phoneUsable({ status: 1, link_status: 1, adb_status: '1', adb: '1.2.3.4:5555' }, now).ok, true);
});


test('phoneInScope: every phone, unless DUOPLUS_PHONE_IDS names the ones to use', () => {
  assert.equal(phoneInScope('x0Puo', {}), true);
  assert.equal(phoneInScope('x0Puo', { DUOPLUS_PHONE_IDS: 'x0Puo, UXsp5' }), true);
  assert.equal(phoneInScope('Other', { DUOPLUS_PHONE_IDS: 'x0Puo, UXsp5' }), false);
});


test('adbWhitelist: own IP first, extras kept, duplicates and junk dropped, at most 10', () => {
  assert.deepEqual(adbWhitelist('34.1.2.3'), ['34.1.2.3']);
  assert.deepEqual(adbWhitelist('34.1.2.3', ' 98.7.6.5, 34.1.2.3, not-an-ip ,'), ['34.1.2.3', '98.7.6.5']);
  const many = Array.from({ length: 15 }, (_, i) => '10.0.0.' + (i + 1)).join(',');
  assert.equal(adbWhitelist('34.1.2.3', many).length, 10);
  assert.deepEqual(adbWhitelist('', '98.7.6.5'), ['98.7.6.5']);
});
