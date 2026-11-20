import test from 'node:test';
import assert from 'node:assert/strict';
import { dataLine, dataUsed, parseIfaceBytes, parseUidBytes, parseUidPackages, pickIface } from '../packages/core/dataUse';
import { idleExitVerdict, parseExitReply } from '../packages/core/idleProxy';

const NETSTATS = `Active interfaces:
  iface=wlan0 ident=[{type=1, networkId="x"}]
Dev stats:
  Pending bytes: 100
  ident=[{type=1, networkId="x"}] uid=-1 set=ALL tag=0x0
    NetworkStatsHistory: bucketDuration=3600
      st=1700000000 rb=999999 rp=10 tb=999999 tp=10 op=0
UID stats:
  Pending bytes: 100
  ident=[{type=1, networkId="x"}] uid=10123 set=DEFAULT tag=0x0
    NetworkStatsHistory: bucketDuration=7200
      st=1700000000 rb=1000 rp=5 tb=200 tp=4 op=0
      st=1700007200 rb=3000 rp=5 tb=800 tp=4 op=0
  ident=[{type=1, networkId="x"}] uid=10123 set=FOREGROUND tag=0x0
    NetworkStatsHistory: bucketDuration=7200
      st=1700007200 rb=500 rp=5 tb=500 tp=4 op=0
  ident=[{type=1, networkId="x"}] uid=1000 set=DEFAULT tag=0x0
    NetworkStatsHistory: bucketDuration=7200
      st=1700007200 rb=10 rp=1 tb=20 tp=1 op=0
UID tag stats:
  ident=[{type=1, networkId="x"}] uid=10123 set=DEFAULT tag=0xffffff01
    NetworkStatsHistory: bucketDuration=7200
      st=1700007200 rb=7777 rp=5 tb=7777 tp=4 op=0
`;

test('network card counters are read per card, in plus out', () => {
  const a = parseIfaceBytes('lo 10 10\nwlan0 1000 500\ngarbage here now x\n\ntun0 5 5\n');
  assert.deepEqual(a, { lo: 20, wlan0: 1500, tun0: 10 });
});

test('the card used is Wi-Fi, then wired, then the busiest real one (never loopback or a tunnel)', () => {
  assert.equal(pickIface({ lo: 1, wlan0: 1, eth0: 1 }, { lo: 9, wlan0: 2, eth0: 5 }), 'wlan0');
  assert.equal(pickIface({ lo: 1, eth0: 1 }, { lo: 9, eth0: 5 }), 'eth0');
  assert.equal(pickIface({ lo: 1, tun0: 1, rmnet0: 1, ccmni1: 1 }, { lo: 99, tun0: 50, rmnet0: 3, ccmni1: 20 }), 'ccmni1');
  assert.equal(pickIface({ lo: 1 }, { lo: 2 }), null);
});

test('per-app bytes come from the "UID stats" part only, every bucket and state added up', () => {
  assert.deepEqual(parseUidBytes(NETSTATS), { '10123': 6000, '1000': 30 });
  assert.deepEqual(parseUidBytes(''), {});
});

test('tagged rows inside the app part are not counted twice', () => {
  const t = 'UID stats:\n  ident=[x] uid=10001 set=DEFAULT tag=0x0\n      st=1 rb=100 rp=1 tb=0 tp=0\n  ident=[x] uid=10001 set=DEFAULT tag=0x5\n      st=1 rb=100 rp=1 tb=0 tp=0\n';
  assert.deepEqual(parseUidBytes(t), { '10001': 100 });
});

test('app ids are named from the package list (shared ids keep a few names)', () => {
  const n = parseUidPackages('package:com.android.chrome uid:10123\npackage:com.google.android.gms uid:10050\npackage:com.google.android.gsf uid:10050\nnoise\n');
  assert.equal(n['10123'], 'com.android.chrome');
  assert.equal(n['10050'], 'com.google.android.gms+com.google.android.gsf');
});

test('what a point used: total from the card, apps largest first, small ones left off the list', () => {
  const before = { ifaces: { wlan0: 1_000_000 }, uids: { '10123': 1_000_000, '1000': 5000 } };
  const after = { ifaces: { wlan0: 1_000_000 + 31 * 1048576 }, uids: { '10123': 1_000_000 + 20 * 1048576, '1000': 6000, '10050': 9 * 1048576 } };
  const u = dataUsed(before, after, { '10123': 'com.android.chrome', '10050': 'com.google.android.gms' });
  assert.equal(u.totalMb, 31);
  assert.equal(u.iface, 'wlan0');
  assert.deepEqual(u.apps, [{ app: 'com.android.chrome', mb: 20 }, { app: 'com.google.android.gms', mb: 9 }]);
  assert.equal(u.appsMb, 29);
  assert.match(dataLine(u), /^31 MB on wlan0 · com\.android\.chrome 20, com\.google\.android\.gms 9 · all apps 29 MB$/);
});

test('a reading that failed never invents a number', () => {
  const u = dataUsed({ ifaces: {}, uids: {} }, { ifaces: {}, uids: {} });
  assert.deepEqual(u, { totalMb: null, iface: null, apps: [], appsMb: null });
  assert.match(dataLine(u), /total not read · per-app not read/);
  // A counter that went backwards (the phone restarted) is not a negative usage.
  assert.equal(dataUsed({ ifaces: { wlan0: 500 }, uids: {} }, { ifaces: { wlan0: 100 }, uids: {} }).totalMb, null);
});

test('the exit check reads our own tiny reply and compares it with the last paid exit', () => {
  assert.equal(parseExitReply('{"ip":"203.0.113.9","asn":"7922"}'), '203.0.113.9');
  assert.equal(parseExitReply('<html>502</html>'), null);
  assert.equal(parseExitReply(''), null);
  assert.equal(idleExitVerdict('203.0.113.9', '203.0.113.9'), 'paid');
  assert.equal(idleExitVerdict('198.51.100.4', '203.0.113.9'), 'idle');
  assert.equal(idleExitVerdict('198.51.100.4', null), 'idle');
  assert.equal(idleExitVerdict(null, '203.0.113.9'), 'unknown');
});

test("the phone's own history is read per time bucket, with the apps that used the most", async () => {
  const { parseUidBuckets, dataHistory } = await import('../packages/core/dataUse');
  const rows = parseUidBuckets(NETSTATS);
  assert.deepEqual(rows.sort((a, b) => a.st - b.st || a.uid.localeCompare(b.uid)), [
    { uid: '10123', st: 1700000000, bytes: 1200 },
    { uid: '1000', st: 1700007200, bytes: 30 },
    { uid: '10123', st: 1700007200, bytes: 4800 },
  ]);
  const big = [{ uid: '10', st: 7200, bytes: 300 * 1048576 }, { uid: '11', st: 7200, bytes: 5 * 1048576 }, { uid: '10', st: 0, bytes: 9 }];
  assert.deepEqual(dataHistory(big, { '10': 'com.android.vending' }, 3600), [
    { st: 7200, totalMb: 305, apps: [{ app: 'com.android.vending', mb: 300 }, { app: 'uid 11', mb: 5 }] },
  ]);
});
