/**
 * Proxy-Seller residential LISTS: one login per (market, ISP), created before a
 * grid runs and reused by every later scan in that market.
 *
 *   scan created → resolveMarket(city, state) → ensureList() per chosen ISP
 *   worker       → pin's ISP → its list → phone's DuoPlus proxy record
 *
 * Proxy-Seller puts the API key in the URL path, so URLs are never logged here.
 */
import { cityCoords } from './grid';
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
  marketKey,
  listTries,
} from './proxyGeo';
export * from './proxyGeo';

type Settings = Record<string, string | undefined>;
const BASE = 'https://proxy-seller.com/personal/api/v2/';

export const listsEnabled = (env: Settings = process.env) => Boolean(env.PROXY_SELLER_API_KEY?.trim());

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function psCall(path: string, body?: unknown, expectText = false, method?: 'DELETE'): Promise<any> {
  const key = process.env.PROXY_SELLER_API_KEY?.trim();
  if (!key) throw new Error('PROXY_SELLER_API_KEY_MISSING');
  const endpoint = path.split('?')[0];
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(BASE + key + '/' + path, {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
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
/** The residential package's traffic, in bytes: what was bought, used and left (Proxy-Seller resident/package). */
export async function residentPackage() {
  const d = await psCall('resident/package');
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
  return { limitBytes: n(d?.traffic_limit), usedBytes: n(d?.traffic_usage), leftBytes: n(d?.traffic_left), expires: typeof d?.expired_at === 'string' ? d.expired_at : null, active: d?.is_active !== false };
}

export async function resolveMarket(city: string, stateCode: string): Promise<Market> {
  const key = marketKey(city, stateCode);
  const cached = await db.proxyMarket.findUnique({ where: { key } });
  // A place saved as state-wide is looked at again: it may now resolve to its nearest covered city.
  if (cached && cached.level !== 'region' && Date.now() - +cached.refreshedAt < 7 * 86400000)
    return { country: 'US', region: cached.region, city: cached.city, level: cached.level as Market['level'], isps: cached.isps as string[] };
  const m = matchMarket(await geoRows(), city, stateCode, cityCoords);
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
  // Marked as just used, so the idle clean-up never deletes a list a scan is being prepared with.
  if (existing) return db.proxyList.update({ where: { id: existing.id }, data: { lastUsedAt: new Date() } });
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
  // Borrowing a nearby city's addresses: keep any address in the state ready as the last resort.
  if (m.level === 'nearby') await ensureList({ region: m.region, city: '' }, '');
  return m;
}

/** Lists to try for a pin, most specific first. */
/**
 * Before a grid is queued: lists for the centre city (validating the chosen
 * ISPs there), then for every other city the grid's points fall in, so each
 * point can search from its own city. A place Proxy-Seller only covers at
 * state level, or doesn't cover, simply keeps using the centre city's lists.
 */
export async function prepareGridProxies(
  center: { city: string; stateCode: string },
  places: { city: string; stateCode: string }[],
  isps: string[],
) {
  const market = await prepareScanProxies(center.city, center.stateCode, isps);
  const seen = new Set([marketKey(center.city, center.stateCode)]);
  const cities = [market.city || market.region];
  for (const p of places) {
    const key = marketKey(p.city, p.stateCode);
    if (seen.has(key) || seen.size > 25) continue; // a very wide grid caps the extra lists
    seen.add(key);
    try {
      const m = await resolveMarket(p.city, p.stateCode);
      if (m.level !== 'city' || (m.region === market.region && m.city === market.city)) continue;
      for (const isp of isps) if (m.isps.includes(isp)) await ensureList(m, isp);
      await ensureList(m, '');
      cities.push(m.city);
    } catch {
      // That place keeps using the centre city's lists.
    }
  }
  return { market, cities };
}

/** The saved lists a grid point uses, best first (see listTries for the order). */
export async function listsForPin(
  scan: { proxyRegion: string | null; proxyCity: string | null },
  pin: { isp?: string | null; city?: string | null; stateCode?: string | null },
) {
  if (!scan.proxyRegion) return [];
  const rotation = listRotation();
  const center = { region: scan.proxyRegion, city: scan.proxyCity ?? '' };
  let local: { region: string; city: string } | null = null;
  if (pin.city && pin.stateCode) {
    const m = await db.proxyMarket.findUnique({ where: { key: marketKey(pin.city, pin.stateCode) } });
    if (m && m.level === 'city') local = { region: m.region, city: m.city };
  }
  const lists = [];
  for (const t of listTries(center, local, pin.isp ?? '')) {
    const found = await db.proxyList.findUnique({ where: { region_city_isp_rotation: { ...t, rotation } } });
    if (found) lists.push(found);
  }
  // Last resort, when it was prepared (the scan's city is not covered, so it borrows the nearest
  // one): any address in the state, tried only after every city list has failed.
  if (center.city) {
    const wide = await db.proxyList.findUnique({ where: { region_city_isp_rotation: { region: center.region, city: '', isp: '', rotation } } });
    if (wide && !lists.some((l) => l.id === wide.id)) lists.push(wide);
  }
  if (!lists.length) {
    // Lists are deleted while no scan runs (see releaseIdleProxyLists); a scan that started around
    // that moment recreates the centre city's lists it needs: the chosen ISP, then any ISP.
    for (const isp of pin.isp ? [pin.isp, ''] : ['']) {
      try {
        lists.push(await ensureList(center, isp, rotation));
      } catch (e) {
        console.warn('[proxy] could not recreate list', center.region, center.city, isp || '*', (e as Error).message);
      }
    }
  }
  return lists;
}

/**
 * Proxy-Seller bills bandwidth whenever a phone still points at a list, even while idle. So when
 * no scan is queued or running, every list not used in the last two minutes is deleted, in
 * Proxy-Seller and here; the next scan creates fresh lists (ensureList, or listsForPin above).
 * Returns how many were deleted.
 */
export async function releaseIdleProxyLists(minIdleMs = 2 * 60000) {
  const open = () => db.gridScan.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } });
  if (await open()) return 0;
  const lists = await db.proxyList.findMany({
    where: { lastUsedAt: { lt: new Date(Date.now() - minIdleMs) } },
    select: { id: true, psListId: true },
  });
  let deleted = 0;
  for (const l of lists) {
    if (await open()) break; // a scan just started: keep the rest
    try {
      await psCall('resident/list/delete', { id: l.psListId }, false, 'DELETE');
    } catch (e) {
      if (!/not-found/i.test((e as Error).message)) {
        console.warn('[proxy] could not delete list', l.psListId, (e as Error).message);
        continue;
      }
    }
    await db.proxyList.delete({ where: { id: l.id } }).catch(() => {});
    deleted++;
  }
  if (deleted) console.log(`[proxy] no scans running: deleted ${deleted} proxy list(s), so idle phones use no paid bandwidth`);
  return deleted;
}
