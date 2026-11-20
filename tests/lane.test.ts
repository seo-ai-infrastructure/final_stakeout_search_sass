import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLane, laneAsk, laneConfigs, laneLeave, openWave, pruneLane } from '../packages/core/lane';
import { judgeExit } from '../packages/core/proxyGate';

const O = { size: 4, doorMs: 40000, holdMs: 780000 };

test('lanes are read from numbered variables; more lanes need no code change', () => {
  assert.deepEqual(laneConfigs({}), []);
  const env = {
    MOBILE_LANE_1_HOST: 'a.example', MOBILE_LANE_1_PORT: '5001', MOBILE_LANE_1_USER: 'u', MOBILE_LANE_1_PASSWORD: 'p', MOBILE_LANE_1_ROTATE_URL: 'https://a.example/rotate?k=1',
    MOBILE_LANE_3_HOST: 'c.example', MOBILE_LANE_3_PORT: '8080', MOBILE_LANE_3_PROTOCOL: 'HTTP', MOBILE_LANE_3_SIZE: '2',
    MOBILE_LANE_2_HOST: 'b.example', MOBILE_LANE_2_PORT: 'nope',
  };
  const lanes = laneConfigs(env);
  assert.deepEqual(lanes.map((l) => l.n), [1, 3]);
  assert.deepEqual(lanes[0], { n: 1, host: 'a.example', port: 5001, user: 'u', password: 'p', protocol: 'socks5', rotateUrl: 'https://a.example/rotate?k=1', size: 4 });
  assert.equal(lanes[1].protocol, 'http');
  assert.equal(lanes[1].size, 2);
  assert.equal(lanes[1].rotateUrl, null);
  assert.deepEqual(laneConfigs({ ...env, MOBILE_LANES: 'off' }), []);
});

test('a wave: the first point changes the IP and opens it, up to four join while the door is open', () => {
  let s = emptyLane();
  const first = laneAsk(s, 'p1', 1000, O);
  assert.equal(first.verdict, 'rotate');
  s = openWave(first.state, 'p1', 1000, O.holdMs, '1.1.1.1');
  assert.equal(s.wave, 1);
  for (const id of ['p2', 'p3', 'p4']) {
    const a = laneAsk(s, id, 5000, O);
    assert.equal(a.verdict, 'join');
    s = a.state;
  }
  assert.equal(Object.keys(s.members).length, 4);
  // Full: a fifth point waits, even with the door still open.
  assert.equal(laneAsk(s, 'p5', 6000, O).verdict, 'wait');
  // Asking again for a point already in changes nothing.
  assert.equal(laneAsk(s, 'p2', 6000, O).verdict, 'join');
  assert.equal(laneAsk(s, 'p2', 6000, O).state.joined, 4);
});

test('after the door shuts nobody joins, and the IP only changes when the last search is over', () => {
  let s = openWave(emptyLane(), 'p1', 1, O.holdMs, null);
  s = laneAsk(s, 'p2', 10000, O).state;
  assert.equal(Object.keys(s.members).length, 2);
  assert.equal(laneAsk(s, 'late', 41000, O).verdict, 'wait');
  s = laneLeave(s, 'p1', 300000);
  assert.equal(laneAsk(s, 'late', 300001, O).verdict, 'wait'); // p2 is still searching
  s = laneLeave(s, 'p2', 360000);
  assert.equal(laneAsk(s, 'late', 360001, O).verdict, 'rotate');
});

test('a place that was left inside the open door is not handed out again: an IP carries at most four searches', () => {
  let s = openWave(emptyLane(), 'p1', 1, O.holdMs, null);
  for (const id of ['p2', 'p3', 'p4']) s = laneAsk(s, id, 1000, O).state;
  assert.equal(s.joined, 4);
  s = laneLeave(s, 'p4', 20000); // failed early
  assert.equal(laneAsk(s, 'p5', 21000, O).verdict, 'wait');
});

test('a stuck point is dropped at its own time limit, so it never freezes the lane', () => {
  let s = openWave(emptyLane(), 'stuck', 1, O.holdMs, null);
  assert.equal(laneAsk(s, 'next', O.holdMs - 1, O).verdict, 'wait');
  assert.equal(laneAsk(s, 'next', O.holdMs + 2, O).verdict, 'rotate');
  assert.deepEqual(pruneLane(s, O.holdMs + 2).members, {});
});

test('a lane exit is judged without the state rule, and only hosting or data-centre networks are refused', () => {
  const lookups = (as: string, isp: string, hosting = false) => ({
    ipinfo: { ip: '9.9.9.9', country: 'US', region: 'Georgia', city: 'Atlanta', org: as + ' ' + isp },
    ipapi: { ip: '9.9.9.9', countryCode: 'US', region: 'GA', regionName: 'Georgia', city: 'Atlanta', isp, org: isp, as: as + ' ' + isp, hosting, proxy: false },
    google: null,
  });
  // A Florida point on an Atlanta carrier exit: refused by the normal rule, fine on a lane.
  assert.equal(judgeExit(lookups('AS21928', 'T-Mobile USA, Inc.') as any, { stateCode: 'FL' }).ok, false);
  assert.equal(judgeExit(lookups('AS21928', 'T-Mobile USA, Inc.') as any, { stateCode: 'FL', anyState: true, policy: 'deny' }).ok, true);
  // A 5G block a database files under an unfamiliar consumer name still passes on a lane...
  assert.equal(judgeExit(lookups('AS64999', 'Some Regional Wireless Co') as any, { stateCode: 'FL', anyState: true, policy: 'deny' }).ok, true);
  // ...but hosting never does, and neither does another country.
  assert.equal(judgeExit(lookups('AS16509', 'Amazon.com, Inc.') as any, { stateCode: 'FL', anyState: true, policy: 'deny' }).ok, false);
  assert.equal(judgeExit(lookups('AS21928', 'T-Mobile USA, Inc.', true) as any, { stateCode: 'FL', anyState: true, policy: 'deny' }).ok, false);
});
