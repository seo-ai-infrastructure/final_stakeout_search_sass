import test from 'node:test';
import assert from 'node:assert/strict';
import { adbUnreachable } from '../apps/worker/src/deviceShell';

// What execFile rejects with: the exit status in `code`, adb's (or the phone's) stderr in `stderr`.
const exited = (code: number, stderr = '') => Object.assign(new Error('Command failed'), { code, stderr, killed: false, signal: null });

test('a phone command that ends with an error status does not drop the phone', () => {
  // `[ -f x ] && echo y` and `cat x 2>/dev/null` end with status 1 when x is missing: the phone is fine.
  assert.equal(adbUnreachable(exited(1), ['shell', 'test -f /sdcard/stakeout/t.done && echo y']), false);
  assert.equal(adbUnreachable(exited(1, 'cat: /sdcard/stakeout/t.status: No such file or directory\n'), ['shell', 'cat x']), false);
  assert.equal(adbUnreachable(exited(127, 'sh: nosuch: not found\n'), ['shell', 'nosuch']), false);
});

test('a phone that cannot be reached is reconnected', () => {
  assert.equal(adbUnreachable(exited(1, 'error: device offline\n'), ['shell', 'echo y']), true);
  assert.equal(adbUnreachable(exited(1, "error: device '1.2.3.4:5555' not found\n"), ['shell', 'echo y']), true);
  assert.equal(adbUnreachable(exited(1, 'adb: error: failed to get feature set: device offline\n'), ['shell', 'echo y']), true);
  assert.equal(adbUnreachable(exited(1, 'error: closed\n'), ['shell', 'echo y']), true);
  assert.equal(adbUnreachable(exited(255), ['shell', 'echo y']), true, "adb's own failure status");
  assert.equal(adbUnreachable(Object.assign(new Error('timed out'), { code: null, killed: true, signal: 'SIGTERM' }), ['shell', 'sleep 99']), true);
  assert.equal(adbUnreachable(Object.assign(new Error('spawn adb ENOENT'), { code: 'ENOENT' }), ['shell', 'echo y']), true);
  // Anything but a shell command keeps the old rule: any failure reconnects.
  assert.equal(adbUnreachable(exited(1), ['forward', 'tcp:0', 'localabstract:chrome_devtools_remote']), true);
  assert.equal(adbUnreachable(exited(1), ['push', 'a', 'b']), true);
});
