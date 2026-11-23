import test from 'node:test';
import assert from 'node:assert/strict';
import { failureRate, isDeviceAttributable, nextOutcomes, pauseReason, percentile, stateTimezone, expiresWithin, phoneUsable, phoneInScope, adbWhitelist, failureCode } from '../packages/core/fleetHealth';
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
  // Storage errors (R2_*, NoSuchBucket…) come from our settings, not the phone.
  for (const code of ['PROXY_LADDER_EXHAUSTED', 'LOCATION_FROM_IP', 'NO_COMPATIBLE_DEVICE', 'DEVICE_LEASE_LOST', 'R2_UPLOAD_TIMEOUT', 'NoSuchBucket'])
    assert.equal(isDeviceAttributable(code), false, code);
  for (const code of ['DEVICE_SCRIPT_FAILED', 'FLAG_CAPTCHA_DETECTED', 'EMPTY_VIDEO'])
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

test('storage and DuoPlus errors never count against a phone; real phone failures still do', () => {
  const s3 = Object.assign(new Error('The specified bucket does not exist.'), { name: 'NoSuchBucket' });
  assert.equal(failureCode(s3), 'NoSuchBucket');
  assert.equal(isDeviceAttributable(failureCode(s3)), false);
  assert.equal(isDeviceAttributable(failureCode(new Error('R2_UPLOAD_TIMEOUT'))), false);
  assert.equal(isDeviceAttributable(failureCode(new Error('DuoPlus rejected /api/v1/cloudPhone/update: x'))), false);
  assert.equal(isDeviceAttributable(failureCode(new Error('DEVICE_SCRIPT_FAILED boom'))), true);
  assert.equal(isDeviceAttributable(failureCode(new Error('FLAG_CAPTCHA_DETECTED'))), true);
});

test('freely placed points: the business is included, they are numbered north to south, west to east', async () => {
  const { placedPins } = await import('../packages/core/grid');
  const c = { lat: 28.0395, lng: -81.9498 };
  const pts = [{ lat: 28.06, lng: -81.93 }, { lat: 28.02, lng: -81.97 }, { lat: 28.06, lng: -81.99 }, { lat: 'x', lng: 1 }, { lat: 40, lng: -81.9 }, { lat: 28.06, lng: -81.93 }];
  const out = placedPins(c, pts, [3, 5, 7, 9])!;
  // Three usable points plus the business: a 3-wide layout, 4 pins.
  assert.equal(out.gridSize, 3);
  assert.equal(out.pins.length, 4);
  assert.deepEqual(out.pins.map((p) => [p.rowIdx, p.colIdx]), [[0, 0], [0, 1], [0, 2], [1, 0]]);
  assert.equal(out.pins[0].lng, -81.99);
  assert.equal(placedPins(c, [{ lat: 28.06, lng: -81.93 }], [3, 5]), null);
  assert.equal(placedPins(c, undefined, [3, 5]), null);
  // 24 areas plus the business fit a 5-wide layout exactly.
  const many = Array.from({ length: 24 }, (_, i) => ({ lat: 28.0 + i * 0.003, lng: -81.95 + (i % 5) * 0.01 }));
  assert.equal(placedPins(c, many, [3, 5, 7, 9])!.gridSize, 5);
});

test('a phone resumed automatically is paused again after two failures in its first ten pins', async () => {
  const { probationReason } = await import('../packages/core/fleetHealth');
  assert.equal(probationReason('SF'), null);
  assert.equal(probationReason('SFF'), '2 of its first 3 pins after an automatic resume failed');
  assert.equal(probationReason('SSSSSSSSSSSFF'), null, 'probation ends after ten pins');
});

test('a failure three other phones also had is not held against a phone', async () => {
  const { fleetWideFailure } = await import('../packages/core/fleetHealth');
  assert.equal(fleetWideFailure(2, 3), false);
  assert.equal(fleetWideFailure(3, 3), true);
  assert.equal(fleetWideFailure(10, 0), false, '0 turns the rule off');
});

test('auto-paused phones resume after their rest, at most twice a day', async () => {
  const { autoResumeDecision } = await import('../packages/core/fleetHealth');
  const pausedAt = new Date('2026-11-17T20:00:00Z');
  const at = (min: number) => pausedAt.getTime() + min * 60000;
  assert.equal(autoResumeDecision({ pausedAt, now: at(10), minutes: 30, resumesToday: 0, max: 2 }), 'wait');
  assert.equal(autoResumeDecision({ pausedAt, now: at(30), minutes: 30, resumesToday: 1, max: 2 }), 'resume');
  assert.equal(autoResumeDecision({ pausedAt, now: at(90), minutes: 30, resumesToday: 2, max: 2 }), 'hold');
  assert.equal(autoResumeDecision({ pausedAt, now: at(90), minutes: 0, resumesToday: 0, max: 2 }), 'hold');
});

test('one phone-status request answers for many phones', async () => {
  const { readPhoneStatus } = await import('../packages/core/fleetHealth');
  const res = { code: 200, data: { list: [{ id: 'UXsp5', name: 'a', status: 1 }, { id: 'x0Puo', name: 'b', status: 11 }] } };
  assert.deepEqual(readPhoneStatus(res, 'UXsp5', 2), { on: true, status: 'powered on' });
  assert.deepEqual(readPhoneStatus(res, 'x0Puo', 2), { on: false, status: 'configuring' });
  assert.equal(readPhoneStatus(res, 'iYdxS', 2), null, 'not in the answer');
  // A single-phone answer without an id is still read; a many-phone one never is.
  assert.deepEqual(readPhoneStatus({ data: { list: [{ status: 2 }] } }, 'UXsp5', 1), { on: false, status: 'powered off' });
  assert.equal(readPhoneStatus({ data: { list: [{ status: 2 }] } }, 'UXsp5', 2), null);
  assert.equal(readPhoneStatus(null, 'UXsp5'), null);
});

test('a phone whose ADB refuses the worker is recognised for a restart; other failures are not', async () => {
  const { adbUnreachable } = await import('../packages/core/fleetHealth');
  assert.ok(adbUnreachable('ADB_COMMAND_FAILED shell mkdir: ADB_CONNECT_FAILED failed to connect to 98.98.125.9:20565'));
  assert.ok(adbUnreachable('ADB_COMMAND_FAILED shell mkdir: error: device offline'));
  assert.ok(adbUnreachable("error: device '98.98.125.9:20565' not found"));
  assert.ok(!adbUnreachable('PROXY_EXIT_CHANGED exit IP moved'));
  assert.ok(!adbUnreachable('FLAG_CAPTCHA_DETECTED'));
  assert.ok(!adbUnreachable('ADB_COMMAND_FAILED shell am start: Error type 3'), 'a command that ran and failed is not a dead connection');
});

test('at start-up, only phones whose last point failed on ADB within the hour, with no success since, are restarted', async () => {
  const { stuckOnAdb, ADB_RESTART } = await import('../packages/core/fleetHealth');
  const now = Date.parse('2026-11-23T21:40:00Z');
  const at = (iso: string) => new Date(iso);
  const phone = (imageId: string, x: Partial<{ isEnabled: boolean; lastFailureCode: string | null; lastFailureAt: Date | null; lastSuccessAt: Date | null }>) => ({ imageId, isEnabled: true, lastFailureCode: 'ADB_COMMAND_FAILED', lastFailureAt: at('2026-11-23T21:26:00Z'), lastSuccessAt: at('2026-11-22T20:42:00Z'), ...x });
  const ids = stuckOnAdb([
    phone('stuck', {}),
    phone('never-ok', { lastSuccessAt: null }),
    phone('ok-since', { lastSuccessAt: at('2026-11-23T21:30:00Z') }),
    phone('old', { lastFailureAt: at('2026-11-23T19:00:00Z') }),
    phone('proxy', { lastFailureCode: 'PROXY_EXIT_CHANGED' }),
    phone('disabled', { isEnabled: false }),
  ], now);
  assert.deepEqual(ids, ['stuck', 'never-ok']);
  assert.deepEqual([ADB_RESTART.strikes, ADB_RESTART.strikeWindowSec, ADB_RESTART.gapSec, ADB_RESTART.perDay], [2, 600, 1200, 6], 'twice in 10 minutes; once per 20 minutes; 6 a day');
});
