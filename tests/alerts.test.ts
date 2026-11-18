import test from 'node:test';
import assert from 'node:assert/strict';
import { scanAlert } from '../packages/core/alerts';

const scan = (o: Partial<{ totalPins: number; failedPins: number; status: string }>) => ({ id: 's1', keyword: 'plumber near me', targetBusiness: 'Acme', totalPins: 25, failedPins: 0, status: 'COMPLETED', ...o });

test('a scan that went badly alerts the admins; a few failures or a stopped scan do not', () => {
  // Nothing completed.
  const dead = scanAlert(scan({ failedPins: 25, status: 'FAILED' }), [{ code: 'NO_COMPATIBLE_DEVICE', n: 25 }])!;
  assert.match(dead.subject, /25 of 25 points failed/);
  assert.match(dead.lines[1], /NO_COMPATIBLE_DEVICE \(25\)/);
  assert.equal(dead.path, '/scans/s1');
  // A quarter or more failed.
  assert.ok(scanAlert(scan({ failedPins: 7, status: 'PARTIAL' }), [{ code: 'PROXY_EXIT_CHANGED', n: 4 }, { code: 'RPA_SURFACE_ERROR', n: 3 }]));
  // Three of 25: normal wear, no email.
  assert.equal(scanAlert(scan({ failedPins: 3, status: 'PARTIAL' }), [{ code: 'RPA_SURFACE_ERROR', n: 3 }]), null);
  // Stopped by its owner: every "failure" is a cancellation.
  assert.equal(scanAlert(scan({ failedPins: 20, status: 'PARTIAL' }), [{ code: 'CANCELLED', n: 20 }]), null);
  assert.equal(scanAlert(scan({ failedPins: 25, status: 'FAILED' }), [{ code: 'CANCELLED', n: 25 }]), null);
});
