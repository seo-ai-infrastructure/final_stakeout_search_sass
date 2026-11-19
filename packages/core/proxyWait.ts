import { pinNetwork } from './network';

/**
 * A point never fails because of a proxy. When no proxy works for it, it goes back in the queue
 * and tries again until one does (see the worker's execute). These rules say which failures
 * those are, when every proxy is down rather than just the ones tried, and how long to wait.
 */

/** Failures that are about the proxy, never the phone, the search or the business. */
export function isProxyProblem(message: string) {
  return /^(PROXY_|DUOPLUS_PROXY_)/.test(message) && !message.startsWith('PROXY_UNAVAILABLE');
}

/**
 * Whether the ports tried for a point show that proxies are down altogether (the provider is out
 * of traffic, or not answering), rather than that these ports were unsuitable. Every port tried
 * either was refused by DuoPlus's availability check (UPDATE_FAILED), gave no exit (NO_EXIT), or
 * could not reach anything through it (NO_GEOLOCATION). A port that answered from the wrong place,
 * a busy IP or an exhausted list says the proxies are working.
 */
export function supplyDown(tried: string[]) {
  const ports = tried.filter((t) => !t.endsWith(':NO_FREE_PORT'));
  return ports.length >= 2 && ports.every((t) => /:(UPDATE_FAILED|NO_EXIT)$/.test(t) || /:NO_GEOLOCATION(\+|$)/.test(t));
}

/**
 * Milliseconds before a point tries for a proxy again. While proxies are down, every two minutes
 * or so; otherwise soon (another port or phone usually works), backing off to two minutes.
 */
export function proxyRetryDelay(waits: number, outage: boolean, random: () => number = Math.random) {
  const base = outage ? 120000 : Math.min(120000, 15000 * Math.max(1, waits));
  return base + Math.floor(random() * (outage ? 30000 : 10000));
}

/**
 * What an outage is tracked by: a scan's state for home internet (as before), and the state plus
 * "mobile data" for mobile scans, so one network being down never holds up the other.
 */
export function outageKey(scan: { proxyRegion?: string | null; stateCode?: string | null; network?: string | null }) {
  if (scan.network === 'mobile') return (scan.proxyRegion || scan.stateCode || 'US') + ' (mobile data)';
  return scan.proxyRegion || null;
}

/** The outage a point's proxy problems count towards (in a mix, each point by its own network). */
export function pinOutageKey(p: { rowIdx: number; colIdx: number; scan: { proxyRegion?: string | null; stateCode?: string | null; network?: string | null } }) {
  return outageKey({ ...p.scan, network: pinNetwork(p.scan.network, p.rowIdx, p.colIdx) });
}

/** The traffic left is low: under PROXY_TRAFFIC_WARN_GB, or less than a day at today's pace. */
export function trafficLow(t: { leftBytes: number | null; todayBytes: number | null } | null, warnGb = Number(process.env.PROXY_TRAFFIC_WARN_GB ?? 2)) {
  if (!t || t.leftBytes === null) return false;
  return t.leftBytes < warnGb * 1e9 || (t.todayBytes !== null && t.todayBytes > 0 && t.leftBytes < t.todayBytes);
}

/** One reading an hour: the home-internet package's bytes used so far, the mobile package's bytes left. */
export type TrafficReading = { res: number | null; mob: number | null };
export type TrafficHour = { hour: string; residentialBytes: number | null; mobileBytes: number | null; points: number; bytesPerPoint: number | null };

/** The hour a moment falls in, as its key ("2026-11-18T23", UTC). */
export const trafficHourKey = (at: Date) => at.toISOString().slice(0, 13);

/**
 * Data used hour by hour, from the first reading of each hour: an hour's use is the change to the
 * next hour's first reading (so the hour still running has no figure yet). Home internet counts
 * up (bytes used), mobile counts down (bytes left); a figure that went the wrong way (a new
 * package, a top-up) is left blank rather than guessed. `points` is the searches finished in each hour.
 */
export function trafficByHour(readings: Record<string, TrafficReading>, points: Record<string, number> = {}): TrafficHour[] {
  const hours = Object.keys(readings).sort();
  const out: TrafficHour[] = [];
  for (let i = 0; i + 1 < hours.length; i++) {
    const a = readings[hours[i]], b = readings[hours[i + 1]];
    // Only neighbouring hours: a gap (the worker was resting) would spread its use over one hour.
    const next = trafficHourKey(new Date(Date.parse(hours[i] + ':00:00Z') + 3600000));
    if (hours[i + 1] !== next) continue;
    const up = a.res !== null && b.res !== null && b.res >= a.res ? b.res - a.res : null;
    const down = a.mob !== null && b.mob !== null && a.mob >= b.mob ? a.mob - b.mob : null;
    const n = points[hours[i]] ?? 0;
    const total = (up ?? 0) + (down ?? 0);
    out.push({ hour: hours[i], residentialBytes: up, mobileBytes: down, points: n, bytesPerPoint: n > 0 && (up !== null || down !== null) ? Math.round(total / n) : null });
  }
  return out;
}
