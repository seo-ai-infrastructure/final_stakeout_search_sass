/** Pure Proxy-Seller helpers (no database), shared by the web app, the worker and tests. */
import { US_STATE_NAMES } from './proxySeller';

type Settings = Record<string, string | undefined>;

/** Rotation for new lists: 0 = new IP every request (default), -1 sticky, 1–3600 seconds. */
export function listRotation(env: Settings = process.env) {
  // Sticky by default (-1): one exit IP per port, so the pre-flight gatekeeper checks
  // the exact IP the search will use. 0 = new IP per request; N = rotate every N seconds.
  const n = Number(env.PROXY_LIST_ROTATION ?? -1);
  return Number.isInteger(n) && n >= -1 && n <= 3600 ? n : -1;
}

// ---------------------------------------------------------------------------
// GEO database → market rows
// ---------------------------------------------------------------------------

export type GeoRow = { country: string; region: string; city: string; isp: string };

const nameOf = (o: any): string | null => {
  for (const k of ['name', 'title', 'value', 'label']) if (typeof o?.[k] === 'string') return o[k];
  return null;
};
const pick = (o: Record<string, unknown>, re: RegExp) => {
  const k = Object.keys(o).find((key) => re.test(key));
  return k === undefined ? undefined : o[k];
};

/**
 * Normalises Proxy-Seller's GEO response into flat rows. Handles both layouts the
 * API could use: flat rows with country/region/city/isp fields, or nested
 * country → regions → cities → isps. Confirm against the real response from
 * proxyseller_check.py explore; this is the one function to adjust if it differs.
 */
export function extractGeoRows(geo: unknown): GeoRow[] {
  const rows: GeoRow[] = [];
  const seen = new Set<string>();
  const add = (r: GeoRow) => {
    const k = [r.country, r.region, r.city, r.isp].join('|');
    if (!seen.has(k)) (seen.add(k), rows.push(r));
  };
  const visit = (node: any, ctx: Partial<GeoRow>, level: keyof GeoRow | null) => {
    if (Array.isArray(node)) return node.forEach((n) => visit(n, ctx, level));
    if (typeof node === 'string') {
      if (level === 'isp') add({ country: '', region: '', city: '', ...ctx, isp: node } as GeoRow);
      else if (level === 'city') add({ country: '', region: '', isp: '', ...ctx, city: node } as GeoRow);
      return;
    }
    if (!node || typeof node !== 'object') return;
    // Flat row: { country, region, city, isp }
    const flat = ['country', 'region', 'city', 'isp'].map((f) => pick(node, new RegExp('^' + f + '(_?name)?$', 'i')));
    if (flat.every((v) => typeof v === 'string')) {
      const [country, region, city, isp] = flat as string[];
      return add({ country, region, city, isp });
    }
    const here = level ? { ...ctx, [level]: nameOf(node) ?? ctx[level] } : ctx;
    let descended = false;
    for (const [k, v] of Object.entries(node)) {
      const next: keyof GeoRow | null = /isp/i.test(k) ? 'isp' : /cit/i.test(k) ? 'city' : /region|state/i.test(k) ? 'region' : /countr/i.test(k) ? 'country' : null;
      if (next && (Array.isArray(v) || (v && typeof v === 'object'))) {
        descended = true;
        visit(v, here, next);
      }
    }
    if (level === 'city' && !descended) add({ country: '', region: '', isp: '', ...here } as GeoRow);
  };
  visit(geo && typeof geo === 'object' && 'data' in (geo as object) ? (geo as any).data : geo, {}, null);
  const found = rows.filter((r) => r.region && r.city !== undefined);
  return found.length ? found : keyedRows(geo);
}

export const normPlace = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bmount\b/g, 'mt')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bfort\b/g, 'ft')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Where a place's proxies come from. 'city': Proxy-Seller covers the place itself. 'nearby': it
 * does not, so `city` is the nearest covered city in the state (km away). 'region': no city could
 * be placed on the map, so any address in the state (city is '').
 */
export type Market = { country: string; region: string; city: string; level: 'city' | 'nearby' | 'region'; isps: string[]; km?: number };
/** A city's position, or null when it cannot be placed. Injected, so the matching stays testable. */
export type CityCoords = (city: string, stateCode: string) => { lat: number; lng: number } | null;

const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180,
    h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/** Matches our city/state to Proxy-Seller's exact (case-sensitive) names and lists its ISPs. */
export function matchMarket(rows: GeoRow[], city: string, stateCode: string, coords?: CityCoords): Market | null {
  const stateName = US_STATE_NAMES[stateCode.toUpperCase()] ?? stateCode;
  const inState = rows.filter(
    (r) => /^(us|usa|united states)$/i.test(r.country || 'US') && [normPlace(stateName), normPlace(stateCode)].includes(normPlace(r.region)),
  );
  if (!inState.length) return null;
  const want = normPlace(city);
  const inCity = inState.filter((r) => normPlace(r.city) === want);
  const ispsOf = (rs: GeoRow[]) => [...new Set(rs.map((r) => r.isp).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // Not covered itself: the nearest covered city in the state, measured from this place's own centre.
  // Any address in the state is the last resort, for a place or state that cannot be put on the map.
  if (!inCity.length && coords) {
    const from = coords(city, stateCode);
    let best: { city: string; km: number } | null = null;
    if (from)
      for (const name of new Set(inState.map((r) => r.city).filter(Boolean))) {
        const at = coords(name, stateCode);
        if (!at) continue;
        const km = kmBetween(from, at);
        if (!best || km < best.km) best = { city: name, km };
      }
    if (best) {
      const near = best.city;
      return { country: 'US', region: inState[0].region, city: near, level: 'nearby', km: Math.round(best.km), isps: ispsOf(inState.filter((r) => r.city === near)) };
    }
  }
  const pickRows = inCity.length ? inCity : inState;
  const isps = ispsOf(pickRows);
  return {
    country: 'US',
    region: inState[0].region,
    city: inCity.length ? inCity[0].city : '',
    level: inCity.length ? 'city' : 'region',
    isps,
  };
}


/** Layout keyed by names: { "US": { "Tennessee": { "Mount Juliet": ["ISP", …] } } }. */
function keyedRows(node: unknown, path: string[] = [], out: GeoRow[] = []) {
  if (Array.isArray(node)) {
    if (path.length >= 3)
      for (const v of node) {
        const isp = typeof v === 'string' ? v : nameOf(v);
        if (isp) out.push({ country: path[0], region: path[1], city: path[2], isp });
      }
    return out;
  }
  if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node as object)) {
      if (/^(data|status|errors)$/.test(k) && path.length === 0) keyedRows(v, path, out);
      else keyedRows(v, [...path, k], out);
    }
  return out;
}

export type ProxyEndpoint = { host: string; port: number; login: string; password: string };

/** Parses Proxy-Seller download lines in either IP:PORT:login:password or login:password@host:port. */
export function parseProxyLines(text: string): ProxyEndpoint[] {
  const out: ProxyEndpoint[] = [];
  for (let line of text.split(/\r?\n|;/)) {
    line = line.trim();
    if (!line) continue;
    let host: string, port: string, login: string, password: string;
    if (line.includes('@')) {
      const at = line.lastIndexOf('@');
      [login, password] = [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1, at)];
      [host, port] = [line.slice(at + 1, line.lastIndexOf(':')), line.slice(line.lastIndexOf(':') + 1)];
    } else {
      const parts = line.split(':');
      if (parts.length < 4) continue;
      [host, port, login] = parts;
      password = parts.slice(3).join(':');
    }
    if (host && /^\d+$/.test(port) && login && password) out.push({ host, port: Number(port), login, password });
  }
  return out;
}

/** DuoPlus's import format. */
export const toDuoPlusLine = (e: ProxyEndpoint) => `${e.host}:${e.port}:${e.login}:${e.password}`;

/**
 * The ISP a grid point always uses. Mixed grids spread the chosen ISPs across the
 * points; the same point keeps the same ISP on every run, so runs compare like for like.
 */
export function ispForPin(mode: string, isps: string[], rowIdx: number, colIdx: number, gridSize: number) {
  if (mode === 'any' || !isps.length) return '';
  if (mode === 'single') return isps[0];
  return isps[(rowIdx * gridSize + colIdx) % isps.length];
}



// ---------------------------------------------------------------------------
// Per-city lists: which saved lists a grid point tries, in order
// ---------------------------------------------------------------------------

/** The cache key for a place: "TN|mount juliet". */
export function marketKey(city: string, stateCode: string) {
  return stateCode.toUpperCase() + '|' + normPlace(city);
}

type ListPlace = { region: string; city: string };

/**
 * The lists a grid point tries, best first. The chosen ISP is kept before the
 * city: a receipt that names an ISP must have used it. So with an ISP chosen:
 * point's own city + ISP, centre city + ISP, point's city any ISP, centre any ISP.
 * Without one: point's city, then centre city.
 */
export function listTries(center: ListPlace, local: ListPlace | null, isp: string) {
  const places = local && !(local.region === center.region && local.city === center.city) ? [local, center] : [center];
  const tries: { region: string; city: string; isp: string }[] = [];
  if (isp) for (const p of places) tries.push({ ...p, isp });
  for (const p of places) tries.push({ ...p, isp: '' });
  return tries;
}


/**
 * Google's own location line on a results page, e.g. "37122, Tennessee - From your device".
 * A web point only counts when Google says it used the device's location AND names the
 * point's state or ZIP. A foreign-language page, an IP-based location, or the wrong state
 * all fail, so a phone whose proxy silently dropped can never record another country's results.
 */
export function locationVerified(line: string | null | undefined, stateCode: string, zip: string, city?: string | null) {
  const text = (line ?? '').trim();
  if (!/from your device/i.test(text)) return false;
  if (zip && text.includes(zip)) return true;
  const code = stateCode.toUpperCase();
  const name = US_STATE_NAMES[code] ?? '';
  const squash = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '');
  if (name && squash(text).includes(squash(name))) return true;
  // Inside larger cities Google abbreviates: "Hermitage, Nashville, TN - From your device".
  if (code.length === 2 && new RegExp(`(^|[\\s,(])${code}([\\s,)\\-–—]|$)`).test(text)) return true;
  // Or names only the place: "Donelson, Nashville - From your device".
  return Boolean(city && squash(city).length >= 4 && squash(text).includes(squash(city)));
}
