import test from 'node:test';
import assert from 'node:assert/strict';
import {
  failureRate,
  isDeviceAttributable,
  nextOutcomes,
  pauseReason,
  percentile,
  stateTimezone,
} from '../packages/core/fleetHealth';
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
