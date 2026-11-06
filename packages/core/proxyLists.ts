/**
 * Proxy-Seller residential LISTS: one login per (market, ISP), created before a
 * grid runs and reused by every later scan in that market.
 *
 *   scan created → resolveMarket(city, state) → ensureList() per chosen ISP
 *   worker       → pin's ISP → its list → phone's DuoPlus proxy record
 *
 * Proxy-Seller puts the API key in the URL path, so URLs are never logged here.
 */
import { db } from '@stakeout/db';
import { InputError } from './grid';
import {
  extractGeoRows,
  listRotation,
  matchMarket,
  normPlace,
  parseProxyLines,
  type GeoRow,
  type Market,
} from './proxyGeo';
export * from './proxyGeo';

type Settings = Record<string, string | undefined>;
const BASE = 'https://proxy-seller.com/personal/api/v2/';

export const listsEnabled = (env: Settings = process.env) => Boolean(env.PROXY_SELLER_API_KEY?.trim());

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function psCall(path: string, body?: unknown, expectText = false): Promise<any> {
  const key = process.env.PROXY_SELLER_API_KEY?.trim();
  if (!key) throw new Error('PROXY_SELLER_API_KEY_MISSING');
  const endpoint = path.split('?')[0];
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(BASE + key + '/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new Error('PROXY_SELLER_UNREACHABLE ' + endpoint);
    }
    const raw = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      if (expectText && res.ok) return raw;
    }
    const errors: { message?: string }[] = data?.errors ?? [];
    // Business errors come back as HTTP 200 with errors[] filled in.
    if (errors.some((e) => /request limit/i.test(e.message ?? '')) && attempt < 3) {
      await pause(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok || errors.length || data?.status === 'error')
      throw new Error('PROXY_SELLER_ERROR ' + endpoint + ' ' + errors.map((e) => e.message).join('; ').slice(0, 200));
    return data;
  }
}

let geoCache: { at: number; rows: GeoRow[] } | null = null;
async function geoRows() {
  if (geoCache && Date.now() - geoCache.at < 86400000) return geoCache.rows;
  const rows = extractGeoRows(await psCall('resident/geo'));
  if (!rows.length) throw new Error('PROXY_SELLER_GEO_UNREADABLE');
  geoCache = { at: Date.now(), rows };
  return rows;
}

/** Market for a city, cached in the database for 7 days so most scans skip the GEO download. */
export async function resolveMarket(city: string, stateCode: string): Promise<Market> {
  const key = stateCode.toUpperCase() + '|' + normPlace(city);
  const cached = await db.proxyMarket.findUnique({ where: { key } });
  if (cached && Date.now() - +cached.refreshedAt < 7 * 86400000)
    return { country: 'US', region: cached.region, city: cached.city, level: cached.level as Market['level'], isps: cached.isps as string[] };
  const m = matchMarket(await geoRows(), city, stateCode);
  if (!m) throw new InputError('Residential proxies are not available in ' + stateCode + ' yet.', 422);
  await db.proxyMarket.upsert({
    where: { key },
    create: { key, region: m.region, city: m.city, level: m.level, isps: m.isps },
    update: { region: m.region, city: m.city, level: m.level, isps: m.isps, refreshedAt: new Date() },
  });
  return m;
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/**
 * Returns the stored list for (market, ISP, rotation), creating it at Proxy-Seller
 * the first time. isp = '' means any ISP in the market.
 */
export async function ensureList(m: Pick<Market, 'region' | 'city'>, isp: string, rotation = listRotation()) {
  const where = { region_city_isp_rotation: { region: m.region, city: m.city, isp, rotation } };
  const existing = await db.proxyList.findUnique({ where });
  if (existing) return existing;
  const created = await psCall('resident/list/add', {
    title: ['stakeout', 'US', m.region, m.city || '*', isp || '*', 'r' + rotation].join('|').slice(0, 120),
    whitelist: '',
    geo: { country: 'US', region: m.region, city: m.city, isp },
    export: { ports: Number(process.env.PROXY_LIST_PORTS ?? 50), ext: 'txt' },
    rotation,
  });
  const id = Number(created?.data?.id);
  if (!id) throw new Error('PROXY_SELLER_LIST_NOT_CREATED');
  const fmt = encodeURIComponent('%ip%:%port%:%login%:%password%');
  const endpoints = parseProxyLines(String(await psCall(`proxy/download/resident?ext=${fmt}&listId=${id}`, undefined, true)));
  if (!endpoints.length) throw new Error('PROXY_SELLER_LIST_EMPTY');
  return db.proxyList.upsert({
    where,
    create: {
      psListId: id,
      region: m.region,
      city: m.city,
      isp,
      rotation,
      host: endpoints[0].host,
      login: endpoints[0].login,
      password: endpoints[0].password,
      ports: endpoints.map((e) => e.port),
    },
    update: {},
  });
}

/**
 * Prepares every list a scan needs BEFORE its grid runs: one per chosen ISP, plus
 * an any-ISP list for the city as the fallback when an ISP has no IPs available.
 */
export async function prepareScanProxies(city: string, stateCode: string, isps: string[]) {
  const m = await resolveMarket(city, stateCode);
  const unknown = isps.filter((i) => !m.isps.includes(i));
  if (unknown.length)
    throw new InputError('Not available in this market: ' + unknown.join(', ') + '. Choose from the ISP list.', 422);
  for (const isp of isps) await ensureList(m, isp);
  await ensureList(m, '');
  return m;
}

/** Lists to try for a pin, most specific first. */
export async function listsForPin(scan: { proxyRegion: string | null; proxyCity: string | null }, isp: string) {
  if (!scan.proxyRegion) return [];
  const rotation = listRotation();
  const tries = [
    { region: scan.proxyRegion, city: scan.proxyCity ?? '', isp },
    { region: scan.proxyRegion, city: scan.proxyCity ?? '', isp: '' },
  ].filter((t, i, a) => a.findIndex((x) => x.city === t.city && x.isp === t.isp) === i);
  const lists = [];
  for (const t of tries) {
    const found = await db.proxyList.findUnique({ where: { region_city_isp_rotation: { ...t, rotation } } });
    if (found) lists.push(found);
  }
  return lists;
}
