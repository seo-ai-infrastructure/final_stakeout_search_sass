/**
 * Mobile lanes (see packages/core/lane.ts): the shared state in Redis, changing a port's IP
 * between waves, and making sure the modem is back before the next wave's door opens.
 */
import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import { redis } from '@stakeout/core/redis';
import { emptyLane, laneAsk, laneConfigs, laneLeave, openWave, type LaneConfig, type LaneState } from '@stakeout/core/lane';
import { parseExitReply } from '@stakeout/core/idleProxy';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stateKey = (n: number) => 'stakeout:lane:' + n;
const lockKey = (n: number) => 'stakeout:lane:' + n + ':lock';
const downKey = (n: number) => 'stakeout:lane:' + n + ':down';
const pinKey = (pinId: string) => 'stakeout:lanepin:' + pinId;
const rotatedKey = (n: number) => 'stakeout:lane:' + n + ':rotated';
const doorMs = () => Math.max(5, Number(process.env.MOBILE_LANE_DOOR_SECONDS ?? 40)) * 1000;
/** A point is given up on by the lane a minute after its own hard time limit. */
const holdMs = () => (Math.max(300, Number(process.env.POINT_CAP_SECONDS ?? 720)) + 60) * 1000;
const checkUrl = () => (process.env.EXIT_CHECK_URL ?? 'https://www.stakeoutsearch.com/api/ip').trim();

export const lanesOn = () => laneConfigs().length > 0;
export const laneNote = () =>
  laneConfigs()
    .map((l) => `lane ${l.n} ${l.host}:${l.port} ${l.protocol} · ${l.size} at a time · ${l.rotateUrl ? 'IP changed by link between waves' : 'NO rotate link: the IP only changes when the provider changes it'}`)
    .join(' | ');

/** Reads from a socket until `done` says the bytes so far are a whole answer. */
function readUntil(sock: net.Socket, done: (b: Buffer) => boolean, ms: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const end = (e?: Error) => {
      clearTimeout(t);
      sock.off('data', onData);
      sock.off('error', end);
      sock.off('close', onClose);
      if (e) reject(e);
      else resolve(buf);
    };
    const onData = (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      if (done(buf)) end();
    };
    const onClose = () => end(new Error('closed'));
    const t = setTimeout(() => end(new Error('timeout')), ms);
    sock.on('data', onData);
    sock.once('error', end);
    sock.once('close', onClose);
  });
}

/** The address the lane's port comes out of right now, asked through the port itself (null: no answer). */
export async function laneExit(lane: LaneConfig, ms = 8000): Promise<string | null> {
  const url = new URL(checkUrl());
  const tlsPort = Number(url.port) || 443;
  const sock = net.connect({ host: lane.host, port: lane.port });
  sock.setTimeout(ms, () => sock.destroy(new Error('timeout')));
  try {
    await new Promise<void>((res, rej) => {
      sock.once('connect', () => res());
      sock.once('error', rej);
    });
    if (lane.protocol === 'http') {
      const auth = lane.user ? 'Proxy-Authorization: Basic ' + Buffer.from(lane.user + ':' + lane.password).toString('base64') + '\r\n' : '';
      sock.write(`CONNECT ${url.hostname}:${tlsPort} HTTP/1.1\r\nHost: ${url.hostname}:${tlsPort}\r\n${auth}\r\n`);
      const head = (await readUntil(sock, (b) => b.includes('\r\n\r\n'), ms)).toString('latin1');
      if (!/^HTTP\/1\.[01] 200/.test(head)) return null;
    } else {
      sock.write(Buffer.from(lane.user ? [5, 2, 0, 2] : [5, 1, 0]));
      const m = await readUntil(sock, (b) => b.length >= 2, ms);
      if (m[0] !== 5) return null;
      if (m[1] === 2) {
        const u = Buffer.from(lane.user), p = Buffer.from(lane.password);
        sock.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([p.length]), p]));
        const a = await readUntil(sock, (b) => b.length >= 2, ms);
        if (a[1] !== 0) return null;
      } else if (m[1] !== 0) return null;
      const h = Buffer.from(url.hostname);
      sock.write(Buffer.concat([Buffer.from([5, 1, 0, 3, h.length]), h, Buffer.from([tlsPort >> 8, tlsPort & 255])]));
      const need = (b: Buffer) => b.length >= 5 && b.length >= (b[3] === 1 ? 10 : b[3] === 4 ? 22 : 7 + b[4]);
      const r = await readUntil(sock, need, ms);
      if (r[1] !== 0) return null;
    }
    const secure = tls.connect({ socket: sock, servername: url.hostname });
    await new Promise<void>((res, rej) => {
      secure.once('secureConnect', () => res());
      secure.once('error', rej);
    });
    secure.write(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: close\r\nUser-Agent: stakeout-lane\r\n\r\n`);
    const chunks: Buffer[] = [];
    await new Promise<void>((res) => {
      const t = setTimeout(res, ms);
      secure.on('data', (d) => chunks.push(d));
      secure.once('end', () => (clearTimeout(t), res()));
      secure.once('error', () => (clearTimeout(t), res()));
    });
    secure.destroy();
    return parseExitReply(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  } finally {
    sock.destroy();
  }
}

const read = async (n: number): Promise<LaneState> => {
  try {
    return { ...emptyLane(), ...JSON.parse((await redis().get(stateKey(n))) || '{}') };
  } catch {
    return emptyLane();
  }
};
const write = (n: number, s: LaneState) => redis().set(stateKey(n), JSON.stringify(s), 'EX', 86400);
const unlock = (n: number, token: string) =>
  redis().eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, lockKey(n), token).catch(() => 0);

/**
 * Between waves: change the port's IP (when it has a rotate link), then wait for the modem to
 * come back. The radio drops for some seconds after a change, so the port is asked every two
 * seconds, for up to half a minute, until it answers. Returns the new exit address, or null when
 * the port did not come back (the wave is not opened).
 */
async function freshIp(lane: LaneConfig, before: string | null, change: boolean): Promise<string | null> {
  const rotate = change && Boolean(lane.rotateUrl);
  // 'done': the link said the IP was changed. 'failed': it refused or errored, and the modem may
  // or may not be resetting in the background.
  let outcome: 'none' | 'done' | 'failed' = 'none';
  if (rotate) {
    // Providers refuse a second change too soon after the last one: the gap is kept here.
    const gap = Math.max(0, Number(process.env.MOBILE_LANE_ROTATE_GAP_SECONDS ?? 60)) * 1000;
    const last = Number((await redis().get(rotatedKey(lane.n)).catch(() => null)) ?? 0);
    if (last && Date.now() - last < gap) await sleep(gap - (Date.now() - last));
    // The link answers only once the modem has its new address, which can take minutes on a
    // sticky carrier: it is given three. A plain browser-like request, since some providers'
    // front doors turn away requests with no User-Agent.
    const ms = Math.max(15, Number(process.env.MOBILE_LANE_ROTATE_TIMEOUT_SECONDS ?? 180)) * 1000;
    const t0 = Date.now();
    await redis().set(rotatedKey(lane.n), String(t0), 'EX', 3600).catch(() => {});
    try {
      const r = await fetch(lane.rotateUrl!, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StakeoutWorker/1.0)', Accept: 'application/json, text/plain, */*' },
        signal: AbortSignal.timeout(ms),
      });
      const body = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
      const secs = Math.round((Date.now() - t0) / 1000);
      if (r.ok) {
        outcome = 'done';
        console.log('[lane]', lane.n, 'rotate link answered', r.status, 'after', secs + 's');
      } else {
        outcome = 'failed';
        console.warn('[lane]', lane.n, 'rotate link refused:', r.status, 'after', secs + 's ·', JSON.stringify(body));
      }
    } catch (e) {
      outcome = 'failed';
      console.warn('[lane]', lane.n, 'rotate link gave no answer after', Math.round((Date.now() - t0) / 1000) + 's:', (e as Error).name || 'error');
    }
    // A refused or failed call can still have started a reset: the port is left alone for a
    // while before it is trusted, so a wave is never opened just as the modem drops.
    await sleep(outcome === 'failed' ? 15000 : 1000);
  }
  const until = Date.now() + Math.max(10, Number(process.env.MOBILE_LANE_SETTLE_SECONDS ?? 30)) * 1000 + (outcome === 'failed' ? 15000 : 0);
  const started = Date.now();
  let ip: string | null = null;
  let answers = 0;
  while (Date.now() < until) {
    const got = await laneExit(lane, 6000);
    if (got) {
      ip = got;
      answers++;
      // After a clean change (or none): the first answer will do. After a failed call: two
      // answers five seconds apart, so a reset in mid-flight is not mistaken for a steady port.
      if (outcome !== 'failed' || answers >= 2) break;
      await sleep(5000);
      continue;
    }
    answers = 0;
    ip = null;
    await sleep(2000);
  }
  if (!ip || (outcome === 'failed' && answers < 2)) {
    console.error('[lane]', lane.n, 'did not answer steadily within', Math.round((Date.now() - started) / 1000) + 's: no wave opened, asked again in 30s');
    return null;
  }
  if (rotate && outcome === 'failed') console.warn('[lane]', lane.n, 'the IP change was not confirmed: this wave may share an address with the last one (port answers on', ip + ')');
  return ip;
}

/**
 * A mobile point asks for a place on a lane. Returns the lane's number when it has one (it joined
 * the open wave, or opened a new one on a fresh IP), or null when every lane's wave is under way
 * and the point has to come back in a few seconds.
 */
export async function enterLane(pinId: string): Promise<number | null> {
  for (const lane of laneConfigs()) {
    if (await redis().exists(downKey(lane.n)).catch(() => 0)) continue;
    const token = randomUUID();
    if (!(await redis().set(lockKey(lane.n), token, 'PX', 330000, 'NX').catch(() => null))) continue; // another point is at this lane's door
    try {
      const now = Date.now();
      const asked = laneAsk(await read(lane.n), pinId, now, { size: lane.size, doorMs: doorMs(), holdMs: holdMs() });
      if (asked.verdict === 'wait') {
        await write(lane.n, asked.state);
        continue;
      }
      let state = asked.state;
      if (asked.verdict === 'rotate') {
        // The very first wave of a lane uses the address the port already has (nobody has
        // searched on it): the IP is only changed between waves.
        const ip = await freshIp(lane, state.ip, state.wave > 0);
        if (!ip) {
          await redis().set(downKey(lane.n), '1', 'EX', 30).catch(() => {});
          continue;
        }
        state = openWave(state, pinId, Date.now(), holdMs(), ip);
        console.log('[lane]', lane.n, 'wave', state.wave, 'open on', ip, asked.state.ip ? '(was ' + asked.state.ip + ')' : '(first wave)', '· up to', lane.size, 'points may join for', doorMs() / 1000 + 's');
      } else {
        console.log('[lane]', lane.n, 'wave', state.wave, ': point', pinId, 'joined (' + state.joined + ' of ' + lane.size + ')');
      }
      await write(lane.n, state);
      await redis().set(pinKey(pinId), String(lane.n), 'PX', holdMs());
      return lane.n;
    } catch (e) {
      console.warn('[lane]', lane.n, 'door error:', (e as Error).message);
    } finally {
      await unlock(lane.n, token);
    }
  }
  return null;
}

/** The lane this point holds a place on (null: none). */
export async function laneOf(pinId: string): Promise<LaneConfig | null> {
  const n = Number((await redis().get(pinKey(pinId)).catch(() => null)) ?? NaN);
  return laneConfigs().find((l) => l.n === n) ?? null;
}

/**
 * The point's search is over (done, failed, or stopped at its time limit): it leaves its wave.
 * Safe to call more than once. A point that never gets here is dropped by its own time limit.
 */
export async function leaveLane(pinId: string): Promise<void> {
  const n = Number((await redis().get(pinKey(pinId)).catch(() => null)) ?? NaN);
  if (!Number.isInteger(n)) return;
  const token = randomUUID();
  for (let i = 0; i < 25; i++) {
    if (await redis().set(lockKey(n), token, 'PX', 10000, 'NX').catch(() => null)) {
      try {
        const s = laneLeave(await read(n), pinId, Date.now());
        await write(n, s);
        await redis().del(pinKey(pinId));
        const left = Object.keys(s.members).length;
        console.log('[lane]', n, 'wave', s.wave, ': point', pinId, 'left ·', left ? left + ' still searching' : 'wave over, the next point changes the IP');
      } finally {
        await unlock(n, token);
      }
      return;
    }
    await sleep(200);
  }
  console.warn('[lane]', n, 'point', pinId, 'could not sign out of its wave; its place lapses at its time limit');
}

/** After the gate: does the point come out of the wave's own address? (Said when it does not.) */
export async function laneSaw(lane: LaneConfig, pinId: string, ip: string) {
  const s = await read(lane.n);
  if (s.ip && ip && s.ip !== ip) console.warn('[lane]', lane.n, 'wave', s.wave, ': point', pinId, 'comes out of', ip, 'but the wave opened on', s.ip, '(the provider changed the IP by itself, or the port hands out more than one)');
}
