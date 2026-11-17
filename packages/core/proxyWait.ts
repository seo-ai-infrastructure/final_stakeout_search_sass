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

/** The traffic left is low: under PROXY_TRAFFIC_WARN_GB, or less than a day at today's pace. */
export function trafficLow(t: { leftBytes: number | null; todayBytes: number | null } | null, warnGb = Number(process.env.PROXY_TRAFFIC_WARN_GB ?? 2)) {
  if (!t || t.leftBytes === null) return false;
  return t.leftBytes < warnGb * 1e9 || (t.todayBytes !== null && t.todayBytes > 0 && t.leftBytes < t.todayBytes);
}
