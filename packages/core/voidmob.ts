import { cityCoords } from './grid';
import { decodoMobileConfigured } from './decodo';

/**
 * VoidMob mobile proxies, Flex mode: one gateway (proxy.voidmob.com:10092) for everything; the
 * place and a sticky session go into the username per connection, e.g.
 *   <base>_c_US_city_Tampa_s_a1b2c3d4e5f6_ttl_30m
 * Docs: https://voidmob.com/docs/proxies (Flex username syntax).
 *
 * Mobile carriers route phones through big-city hubs, so a mobile IP is only ever located in a
 * major city: tested Nov 17, ZIP codes and towns like Lakeland gave nothing while Tampa, Orlando,
 * Miami, Jacksonville, Pittsburgh, Philadelphia and Harrisburg all gave in-state carrier IPs
 * (T-Mobile, Verizon, AT&T). So a mobile point asks for the nearest hub city in its own state.
 */

type Env = Record<string, string | undefined>;

export function voidmobConfigured(env: Env = process.env) {
  return Boolean(env.VOIDMOB_USERNAME?.trim() && env.VOIDMOB_PASSWORD);
}

export function voidmobEndpoint(env: Env = process.env) {
  return {
    host: env.VOIDMOB_HOST?.trim() || 'proxy.voidmob.com',
    port: Number(env.VOIDMOB_PORT ?? 10092),
    protocol: (env.VOIDMOB_PROTOCOL?.trim().toLowerCase() === 'socks5' ? 'socks5' : 'http') as 'http' | 'socks5',
  };
}

/** The provider behind "Mobile data" scans: MOBILE_PROVIDER if set up, else VoidMob, else Decodo mobile. */
export function mobileProvider(env: Env = process.env): 'voidmob' | 'decodo' | null {
  const asked = (env.MOBILE_PROVIDER ?? '').trim().toLowerCase();
  if (asked === 'decodo' && decodoMobileConfigured(env)) return 'decodo';
  if (asked === 'voidmob' && voidmobConfigured(env)) return 'voidmob';
  if (voidmobConfigured(env)) return 'voidmob';
  if (decodoMobileConfigured(env)) return 'decodo';
  return null;
}

/** Each state's main cities, biggest first: where mobile carriers' IPs are located. */
export const MOBILE_HUBS: Record<string, string[]> = {
  AL: ['Birmingham', 'Huntsville', 'Montgomery', 'Mobile'],
  AK: ['Anchorage', 'Fairbanks'],
  AZ: ['Phoenix', 'Tucson', 'Mesa'],
  AR: ['Little Rock', 'Fayetteville', 'Fort Smith'],
  CA: ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento', 'Fresno'],
  CO: ['Denver', 'Colorado Springs', 'Aurora'],
  CT: ['Hartford', 'New Haven', 'Bridgeport', 'Stamford'],
  DE: ['Wilmington', 'Dover'],
  DC: ['Washington'],
  FL: ['Miami', 'Orlando', 'Tampa', 'Jacksonville'],
  GA: ['Atlanta', 'Savannah', 'Augusta', 'Columbus'],
  HI: ['Honolulu'],
  ID: ['Boise'],
  IL: ['Chicago', 'Springfield', 'Peoria', 'Rockford'],
  IN: ['Indianapolis', 'Fort Wayne', 'Evansville'],
  IA: ['Des Moines', 'Cedar Rapids', 'Davenport'],
  KS: ['Wichita', 'Kansas City', 'Overland Park', 'Topeka'],
  KY: ['Louisville', 'Lexington'],
  LA: ['New Orleans', 'Baton Rouge', 'Shreveport'],
  ME: ['Portland', 'Bangor'],
  MD: ['Baltimore', 'Frederick'],
  MA: ['Boston', 'Worcester', 'Springfield'],
  MI: ['Detroit', 'Grand Rapids', 'Lansing'],
  MN: ['Minneapolis', 'Saint Paul', 'Rochester', 'Duluth'],
  MS: ['Jackson', 'Gulfport'],
  MO: ['Kansas City', 'St. Louis', 'Springfield'],
  MT: ['Billings', 'Missoula'],
  NE: ['Omaha', 'Lincoln'],
  NV: ['Las Vegas', 'Reno'],
  NH: ['Manchester', 'Nashua'],
  NJ: ['Newark', 'Jersey City', 'Trenton'],
  NM: ['Albuquerque', 'Santa Fe'],
  NY: ['New York', 'Buffalo', 'Rochester', 'Albany', 'Syracuse'],
  NC: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham'],
  ND: ['Fargo', 'Bismarck'],
  OH: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo'],
  OK: ['Oklahoma City', 'Tulsa'],
  OR: ['Portland', 'Eugene', 'Salem'],
  PA: ['Philadelphia', 'Pittsburgh', 'Harrisburg', 'Allentown'],
  RI: ['Providence'],
  SC: ['Columbia', 'Charleston', 'Greenville'],
  SD: ['Sioux Falls', 'Rapid City'],
  TN: ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga'],
  TX: ['Houston', 'Dallas', 'San Antonio', 'Austin', 'Fort Worth', 'El Paso'],
  UT: ['Salt Lake City', 'Provo'],
  VT: ['Burlington'],
  VA: ['Virginia Beach', 'Richmond', 'Norfolk', 'Arlington'],
  WA: ['Seattle', 'Spokane', 'Tacoma'],
  WV: ['Charleston', 'Huntington'],
  WI: ['Milwaukee', 'Madison', 'Green Bay'],
  WY: ['Cheyenne', 'Casper'],
  PR: ['San Juan'],
};

/** VoidMob's spelling of a city: hyphens for spaces, no dots or accents ("St-Louis", "New-York"). */
export function voidmobCity(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'’]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** The Flex username for one try: US, the hub city, and a sticky session for the whole point. */
export function voidmobUser(base: string, city: string, session: string, minutes = 30) {
  if (!/^[A-Za-z0-9]{6,32}$/.test(session)) throw new Error('PROXY_SESSION_ID_INVALID');
  return base.trim() + '_c_US_city_' + voidmobCity(city) + '_s_' + session + '_ttl_' + Math.min(1440, Math.max(1, Math.round(minutes))) + 'm';
}

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180,
    dLat = (b.lat - a.lat) * rad,
    dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

export type MobileHub = { city: string; state: string; km: number | null; inState: boolean };

/**
 * The hub cities to ask for a mobile point, nearest first: every hub in its own state, then (unless
 * crossState is off) the nearest hubs over the state line, for a state with none in the pool,
 * which is what a real phone there often shows.
 */
export function mobileHubs(
  pin: { lat?: number | null; lng?: number | null; stateCode: string },
  opts: { crossState?: boolean; maxOther?: number; maxKm?: number } = {},
): MobileHub[] {
  const st = pin.stateCode.toUpperCase();
  const at = typeof pin.lat === 'number' && typeof pin.lng === 'number' ? { lat: pin.lat, lng: pin.lng } : null;
  const place = (city: string, state: string): MobileHub => {
    const c = cityCoords(city, state);
    return { city, state, km: at && c ? Math.round(km(at, c)) : null, inState: state === st };
  };
  // Unknown distances keep their list order (biggest first) after the known ones.
  const order = (a: MobileHub, b: MobileHub) => (a.km ?? Infinity) - (b.km ?? Infinity);
  const own = (MOBILE_HUBS[st] ?? []).map((c) => place(c, st)).sort(order);
  if (opts.crossState === false || !at) return own;
  const maxKm = opts.maxKm ?? 400;
  const others = Object.entries(MOBILE_HUBS)
    .filter(([s]) => s !== st)
    .flatMap(([s, cities]) => cities.map((c) => place(c, s)))
    .filter((h) => h.km !== null && h.km <= maxKm)
    .sort(order)
    .slice(0, opts.maxOther ?? 2);
  return [...own, ...others];
}

/** Data left on the VoidMob package (VOIDMOB_API_KEY + VOIDMOB_PROXY_ID), for the admin page. */
export async function voidmobUsage(env: Env = process.env) {
  const key = env.VOIDMOB_API_KEY?.trim(),
    id = env.VOIDMOB_PROXY_ID?.trim();
  if (!key || !id) return null;
  const res = await fetch('https://dashboard.voidmob.com/api/v1/proxies/' + encodeURIComponent(id) + '/usage', {
    headers: { Authorization: 'Bearer ' + key },
    signal: AbortSignal.timeout(15000),
  });
  const u = ((await res.json().catch(() => null)) as { data?: { usage?: Record<string, number> } } | null)?.data?.usage;
  if (!u) return null;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const total = num(u.total_gb_allocated);
  return { leftBytes: num(u.remaining_bytes), todayBytes: num(u.daily_bytes), limitBytes: total === null ? null : total * 1073741824 };
}
