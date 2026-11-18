import { US_STATE_NAMES } from './proxySeller';

/**
 * Decodo residential proxies. One gateway (gate.decodo.com:7000) for everything: where the exit
 * is, and how long it stays the same IP, are written into the username, e.g.
 *   user-<name>-country-us-zip-15068-session-a1b2c3d4e5f6-sessionduration-30
 * No lists to create, warm up or delete. Decodo targets a US ZIP code, a city, a geohash area or
 * a state. Its ISP targeting (asn-…) cannot be combined with any place, so a point that must use
 * one particular ISP keeps using Proxy-Seller's town-and-ISP lists.
 * Docs: https://help.decodo.com/docs/residential-proxy-user-pass-requests
 */

type Env = Record<string, string | undefined>;

type DecodoRung = 'DECODO_ZIP' | 'DECODO_CITY' | 'DECODO_AREA' | 'DECODO_STATE' | 'MOBILE_STATE';

/**
 * Decodo mobile proxies power "Mobile data" scans: a real carrier IP (Verizon, AT&T, T-Mobile or a
 * regional carrier, whichever has one) in the point's state. Its own proxy user, set in Railway as
 * DECODO_MOBILE_USERNAME and DECODO_MOBILE_PASSWORD; same gateway and username format.
 */
export function decodoMobileConfigured(env: Env = process.env) {
  return Boolean(env.DECODO_MOBILE_USERNAME?.trim() && env.DECODO_MOBILE_PASSWORD);
}

/** Mobile data targets the state: carrier IPs are located only roughly, and the state is what counts. */
export function decodoMobileLadder(pin: { stateCode: string }) {
  const state = US_STATE_NAMES[pin.stateCode.toUpperCase()];
  return state ? [{ rung: 'MOBILE_STATE' as DecodoRung, params: 'country-us-state-us_' + decodoPlace(state) }] : [];
}
type ProxyProvider = 'decodo' | 'proxyseller';

/** Decodo is used once its proxy user is set in Railway (DECODO_USERNAME, DECODO_PASSWORD). */
function decodoConfigured(env: Env = process.env) {
  return Boolean(env.DECODO_USERNAME?.trim() && env.DECODO_PASSWORD);
}

export function decodoEndpoint(env: Env = process.env) {
  return {
    host: env.DECODO_HOST?.trim() || 'gate.decodo.com',
    port: Number(env.DECODO_PORT ?? 7000),
    // DuoPlus binds the phone to it as an HTTP proxy unless DECODO_PROTOCOL=socks5.
    protocol: (env.DECODO_PROTOCOL?.trim().toLowerCase() === 'socks5' ? 'socks5' : 'http') as 'http' | 'socks5',
  };
}

/** Decodo's spelling of a place: lower case, words joined by underscores ("new_kensington"). */
export function decodoPlace(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Standard geohash of a position (Decodo accepts lengths 1–4; 4 is about 39 × 20 km). */
export function geohash(lat: number, lng: number, length = 4) {
  const chars = '0123456789bcdefghjkmnpqrstuvwxyz';
  const la = [-90, 90],
    lo = [-180, 180];
  let out = '',
    bits = 0,
    value = 0,
    even = true;
  while (out.length < length) {
    const r = even ? lo : la,
      v = even ? lng : lat,
      mid = (r[0] + r[1]) / 2;
    if (v >= mid) {
      value = value * 2 + 1;
      r[0] = mid;
    } else {
      value = value * 2;
      r[1] = mid;
    }
    even = !even;
    if (++bits === 5) {
      out += chars[value];
      bits = 0;
      value = 0;
    }
  }
  return out;
}

/**
 * Where to ask Decodo for an exit for one point, closest first: the point's own ZIP code, its
 * town, the area around it (a geohash cell of about 39 × 20 km), then anywhere in its state.
 */
export function decodoLadder(pin: { zip?: string | null; city?: string | null; stateCode: string; lat?: number | null; lng?: number | null }) {
  const state = US_STATE_NAMES[pin.stateCode.toUpperCase()];
  if (!state) return [];
  const out: { rung: DecodoRung; params: string }[] = [];
  if (pin.zip && /^\d{5}$/.test(pin.zip)) out.push({ rung: 'DECODO_ZIP', params: 'country-us-zip-' + pin.zip });
  const city = decodoPlace(pin.city ?? '');
  if (city) out.push({ rung: 'DECODO_CITY', params: 'country-us-city-' + city });
  if (typeof pin.lat === 'number' && typeof pin.lng === 'number') out.push({ rung: 'DECODO_AREA', params: 'geohash-' + geohash(pin.lat, pin.lng, 4) });
  out.push({ rung: 'DECODO_STATE', params: 'country-us-state-us_' + decodoPlace(state) });
  return out;
}

/** The proxy username for one try. The session keeps the same IP for the whole point. */
export function decodoUser(username: string, params: string, session: string, minutes = 30) {
  if (!/^[A-Za-z0-9]{6,32}$/.test(session)) throw new Error('PROXY_SESSION_ID_INVALID');
  return 'user-' + username.trim().replace(/^user-/, '') + '-' + params + '-session-' + session + '-sessionduration-' + Math.min(1440, Math.max(1, Math.round(minutes)));
}

/**
 * The proxy providers to use, in order (PROXY_PROVIDERS, e.g. "decodo,proxyseller"). Decodo comes
 * first by default once it is set up; a provider that is not set up is skipped.
 */
export function proxyProviders(env: Env = process.env): ProxyProvider[] {
  const asked = (env.PROXY_PROVIDERS ?? (decodoConfigured(env) ? 'decodo,proxyseller' : 'proxyseller'))
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/[^a-z]/g, ''));
  const out: ProxyProvider[] = [];
  for (const a of asked) {
    const p: ProxyProvider | null = a === 'decodo' ? 'decodo' : a === 'proxyseller' ? 'proxyseller' : null;
    if (!p || out.includes(p) || (p === 'decodo' && !decodoConfigured(env))) continue;
    out.push(p);
  }
  return out.length ? out : ['proxyseller'];
}

/** Whether Decodo may serve a point: not when the point must use one particular ISP. */
export function decodoServes(p: { isp?: string | null; scan: { ispMode?: string | null; ispId?: string | null; proxyRegion?: string | null } }) {
  if (p.scan.proxyRegion) return !(p.scan.ispMode === 'single' && p.isp);
  return !p.scan.ispId || p.scan.ispId === 'ANY';
}
