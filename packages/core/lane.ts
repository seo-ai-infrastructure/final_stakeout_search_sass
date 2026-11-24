/**
 * Mobile lanes: one unlimited 4G/5G port shared by a few phones at a time, in waves.
 *
 * A wave opens on a fresh IP. Points that arrive while its door is open join it (up to the lane's
 * size); later points wait in the queue. When the wave's last search is over the worker changes
 * the port's IP and opens the next wave. So an IP carries at most `size` searches, all started
 * close together, and the IP never changes under a running search.
 *
 * Configured on the worker as MOBILE_LANE_1_HOST / _PORT / _USER / _PASSWORD, optionally
 * _PROTOCOL (socks5, the default, or http), _ROTATE_URL (a link that changes the IP) and _SIZE.
 * More lanes: MOBILE_LANE_2_*, MOBILE_LANE_3_* ... No code change needed.
 */
type Env = Record<string, string | undefined>;

export type LaneConfig = {
  n: number;
  host: string;
  port: number;
  user: string;
  password: string;
  protocol: 'socks5' | 'http';
  rotateUrl: string | null;
  size: number;
};

export function laneConfigs(env: Env = process.env): LaneConfig[] {
  if ((env.MOBILE_LANES ?? '').trim().toLowerCase() === 'off') return [];
  const out: LaneConfig[] = [];
  const dflt = Number(env.MOBILE_LANE_SIZE ?? 4);
  for (let n = 1; n <= 20; n++) {
    const v = (k: string) => (env['MOBILE_LANE_' + n + '_' + k] ?? '').trim();
    const port = Number(v('PORT'));
    if (!v('HOST') || !Number.isInteger(port) || port <= 0 || port > 65535) continue;
    const size = Number(v('SIZE') || dflt);
    out.push({
      n,
      host: v('HOST'),
      port,
      user: v('USER'),
      password: v('PASSWORD'),
      protocol: v('PROTOCOL').toLowerCase() === 'http' ? 'http' : 'socks5',
      rotateUrl: /^https?:\/\//i.test(v('ROTATE_URL')) ? v('ROTATE_URL') : null,
      size: Number.isInteger(size) && size >= 1 && size <= 12 ? size : 4,
    });
  }
  return out;
}

export type LaneState = {
  /** Counts up with every wave. */
  wave: number;
  /** When the current wave's door opened (0: no wave yet). */
  openedAt: number;
  /** How many points have joined the current wave. */
  joined: number;
  /** Points whose search is running: point id → when it is given up on (its hard time limit). */
  members: Record<string, number>;
  /** The exit address of the current wave, once known. */
  ip: string | null;
};

export const emptyLane = (): LaneState => ({ wave: 0, openedAt: 0, joined: 0, members: {}, ip: null });

/** Members past their own time limit are dropped: one stuck phone never holds a wave open. */
export function pruneLane(s: LaneState, now: number): LaneState {
  const members = Object.fromEntries(Object.entries(s.members ?? {}).filter(([, until]) => until > now));
  return { ...s, members };
}

/**
 * What a point asking for the lane gets:
 *  'join'   – the wave's door is open and there is room (the state returned has it in).
 *  'rotate' – the last wave is over (or there never was one): change the IP, then open a new
 *             wave with this point in it (openWave).
 *  'wait'   – the door is shut and searches are still running: come back in a few seconds.
 */
export function laneAsk(
  s0: LaneState,
  pinId: string,
  now: number,
  o: { size: number; doorMs: number; holdMs: number },
): { verdict: 'join' | 'rotate' | 'wait'; state: LaneState } {
  const s = pruneLane(s0, now);
  if (s.members[pinId]) return { verdict: 'join', state: s };
  const active = Object.keys(s.members).length;
  const doorOpen = s.openedAt > 0 && now - s.openedAt <= o.doorMs && s.joined < o.size;
  if (doorOpen) return { verdict: 'join', state: { ...s, joined: s.joined + 1, members: { ...s.members, [pinId]: now + o.holdMs } } };
  if (active === 0) return { verdict: 'rotate', state: s };
  return { verdict: 'wait', state: s };
}

/** A new wave on a new IP, with its first point in it. */
export function openWave(s: LaneState, pinId: string, now: number, holdMs: number, ip: string | null): LaneState {
  return { wave: (s.wave ?? 0) + 1, openedAt: now, joined: 1, members: { [pinId]: now + holdMs }, ip };
}

export function laneLeave(s: LaneState, pinId: string, now: number): LaneState {
  const p = pruneLane(s, now);
  if (!(pinId in p.members)) return p;
  const { [pinId]: _gone, ...members } = p.members;
  return { ...p, members };
}

/**
 * Where a mobile point goes when every lane's wave is full or under way: home internet at once
 * while Proxy-Seller's prepaid data lasts; otherwise it waits for the next round on a line, and a
 * customer's point that has waited `waitMs` goes out on metered mobile data instead, so VoidMob
 * takes real overload only. An internal (admin) point never goes on metered data.
 */
export function spillTo(o: { homeReady: boolean; internal: boolean; meteredReady: boolean; waitedMs: number; waitMs: number }): 'home' | 'metered' | 'wait' {
  if (o.homeReady) return 'home';
  if (!o.internal && o.meteredReady && o.waitedMs >= o.waitMs) return 'metered';
  return 'wait';
}
