import { rpaTemplate } from './rpa';
import { buildPinInsights, type PinInsights } from '@stakeout/core/pinInsights';
import { searchLocationLine, isLocalFinder, readAiOverview, readLocalFinder, sameBusiness } from '@stakeout/core/serpEvidence';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { db, type GridPin, type GridScan } from '@stakeout/db';
import { listsForPin, normPlace, locationVerified } from '@stakeout/core/proxyLists';
import { judgeExit, parseIpinfo, parseIpapi, parseGoogleProbe, portOrder, ispMatches, type GatePolicy } from '@stakeout/core/proxyGate';
import { redis } from '@stakeout/core/redis';
import { OBSERVE_SH } from '@stakeout/core/observer';
import type { RpaSurface } from '@stakeout/core/rpaRules';
import { runRpaSearch } from './rpa';
import { put, uploadURL, uploaded } from '@stakeout/core/r2';
import { captureEnded, captureStarted, duoplusPost, updatePhone, phonePowerStatus, type LeasedDevice } from './duoplus';
import { pull, push, shell, transportFor } from './deviceShell';
import { readBundle, readBundleFile } from './bundle';
import { stateTimezone } from '@stakeout/core/fleetHealth';
import { parsePinXmlBundle, parseWebResults } from './xmlParser';
import { shellQuote, RUN_PIN_SH_V2 } from '@stakeout/core/runner';
import {
  cityMatches,
  proxyCredentials,
  proxyPort,
  proxyTargetingEnabled,
  regionMatchesState,
  targetableIspCodes,
  targetedLogin,
  targetingLadder,
  type TargetRung,
} from '@stakeout/core/proxySeller';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Pin = GridPin & { scan: GridScan };

const bootstrappedInMemory = new Set<string>();
const RT_DIR = '/data/local/tmp/rt';
const RUNNER_SHA = createHash('sha256').update(RUN_PIN_SH_V2).digest('hex');

/**
 * Installs the capture script once per phone per worker process. The cache is
 * dropped whenever a pin fails on the phone, so a re-imaged phone gets the script
 * again on its next pin instead of failing until the worker restarts.
 */
async function ensureRunnerInstalled(d: LeasedDevice) {
  if (bootstrappedInMemory.has(d.imageId)) return;
  const sha = (await shell(d, `mkdir -p ${RT_DIR}; cat ${RT_DIR}/run_pin.sha 2>/dev/null`).catch(() => '')).trim();
  if (sha !== RUNNER_SHA) {
    await push(d, `${RT_DIR}/run_pin.sh`, RUN_PIN_SH_V2);
    await shell(d, `echo ${RUNNER_SHA} > ${RT_DIR}/run_pin.sha`);
  }
  bootstrappedInMemory.add(d.imageId);
}

// SEARCH_MODE=rpa: the account's DuoPlus RPA template does the search; the phone only records.
const searchMode = () => ((process.env.SEARCH_MODE ?? 'script').toLowerCase() === 'rpa' ? 'rpa' : 'script');
const OBSERVER_SHA = createHash('sha256').update(OBSERVE_SH).digest('hex');
const observerInMemory = new Set<string>();
async function ensureObserverInstalled(d: LeasedDevice) {
  if (observerInMemory.has(d.imageId)) return;
  const sha = (await shell(d, `mkdir -p ${RT_DIR}; cat ${RT_DIR}/observe.sha 2>/dev/null`).catch(() => '')).trim();
  if (sha !== OBSERVER_SHA) {
    await push(d, `${RT_DIR}/observe.sh`, OBSERVE_SH);
    await shell(d, `echo ${OBSERVER_SHA} > ${RT_DIR}/observe.sha`);
  }
  observerInMemory.add(d.imageId);
}

type ProxyCheck = {
  ip: string;
  org?: string;
  city: string;
  region: string;
  country: string;
  timezone: string;
};

/**
 * Waits while DuoPlus is still applying a change to the phone ("configuring" / "powering on"),
 * so nothing is checked or searched on half-applied settings. Fails only if the phone is off,
 * expired or its configuration failed.
 */
async function waitUntilConfigured(d: LeasedDevice, maxMs = 90000) {
  const until = Date.now() + maxMs;
  for (;;) {
    const st = await phonePowerStatus(d.imageId);
    if (!st || st.on) return;
    if (st.status !== 'configuring' && st.status !== 'powering on') throw new Error('PHONE_NOT_READY ' + st.status);
    if (Date.now() > until) throw new Error('PHONE_STILL_CONFIGURING');
    await sleep(4000);
  }
}

const stillConfiguring = (e: unknown) => /being configured|cannot be operated|configuring/i.test(e instanceof Error ? e.message : String(e));

/** Binds the phone's proxy record and moves its GPS and time zone to the pin (one batched request). */
async function applyNetworkAndGps(d: LeasedDevice, p: Pin) {
  const item = {
    image_id: d.imageId,
    proxy: { id: d.proxyId, dns: 1 },
    gps: { type: 2, latitude: String(p.lat), longitude: String(p.lng) },
    locale: { type: 2, timezone: stateTimezone(p.stateCode), language: 'en-US' },
  };
  // DuoPlus refuses changes while it is still applying the previous one: wait and retry.
  for (let attempt = 0; ; attempt++) {
    try {
      await updatePhone(item);
      break;
    } catch (e) {
      if (attempt >= 12 || !stillConfiguring(e)) throw e;
      await waitUntilConfigured(d, 60000).catch(() => {});
      await sleep(3000);
    }
  }
  // Then let it finish applying these settings before anything is checked or searched.
  await waitUntilConfigured(d);
}

/**
 * Where the phone's traffic actually exits. Over ADB this is asked from the phone
 * itself, through its proxy, at no API cost. Over the API it uses DuoPlus's
 * proxy check, one request.
 */
async function checkExit(d: LeasedDevice, p: Pin): Promise<ProxyCheck | null> {
  if (transportFor(d) === 'api') return checkProxyApi(d);
  await applyNetworkAndGps(d, p);
  await sleep(6000);
  const token = process.env.IPINFO_TOKEN ? '?token=' + encodeURIComponent(process.env.IPINFO_TOKEN) : '';
  const url = (process.env.IP_CHECK_URL || 'https://ipinfo.io/json') + token;
  // Asked from the phone itself, so it reflects the network actually in use. Not every
  // Android image ships curl, so try wget next, then DuoPlus's server-side proxy check.
  let raw = await shell(d, `curl -s --max-time 12 ${shellQuote(url)}`, 20000).catch(() => '');
  if (!raw.trim().startsWith('{')) raw = await shell(d, `wget -qO- -T 12 ${shellQuote(url)}`, 20000).catch(() => '');
  if (!raw.trim().startsWith('{')) return checkProxyApi(d);
  try {
    const j = JSON.parse(raw);
    if (!j?.ip) return checkProxyApi(d);
    return {
      ip: String(j.ip),
      org: String(j.org ?? ''),
      city: String(j.city ?? ''),
      region: String(j.region ?? ''),
      country: String(j.country ?? ''),
      timezone: String(j.timezone ?? ''),
    };
  } catch {
    return null;
  }
}

async function checkProxyApi(device: LeasedDevice): Promise<ProxyCheck | null> {
  const res = await duoplusPost('/api/v1/proxy/check', {
    id: device.proxyId,
    proxy_id: device.proxyId,
    ip_scan_channel: 'ip2location',
  }).catch(() => null);
  const data = res?.data;
  if (!data?.success || !data.ip) {
    // DuoPlus says why (e.g. "Connection test failed!"): keep it in the log for diagnosis.
    console.warn('[duoplus] proxy check failed for', device.imageId, String(data?.tips ?? res?.message ?? 'no response').slice(0, 160));
    return null;
  }
  return {
    ip: String(data.ip),
    city: String(data.city ?? ''),
    region: String(data.region ?? ''),
    country: String(data.country ?? ''),
    timezone: String(data.timezone ?? ''),
  };
}

const isUS = (c: ProxyCheck) => /^(us|usa|united states)$/i.test(c.country.trim());

/**
 * Points the phone's saved DuoPlus proxy record at a Proxy-Seller login that
 * targets this pin (ZIP → city → state, with the requested ISP first), and
 * accepts the first exit that DuoPlus's proxy check places in the pin's state.
 * Every field on the receipt reflects what was actually requested and observed.
 */
/**
 * Proxy-Seller list mode: the pin's ISP list (prepared when the scan was created),
 * then the market's any-ISP list. The phone's DuoPlus proxy record is only
 * rewritten when the phone has to change lists.
 */
// ---------------------------------------------------------------------------
// Pre-flight gatekeeper: one sticky proxy port per point, checked from the phone
// ---------------------------------------------------------------------------

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-S918U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const PORT_REST_MS = Number(process.env.PROXY_PORT_REST_MINUTES ?? 30) * 60000;
const PORT_BAD_MS = Number(process.env.PROXY_PORT_BAD_HOURS ?? 6) * 3600000;
// A point holds its port exclusively for at least this long (covers proxy setup + capture).
const PORT_BUSY_MS = 15 * 60000;

const gatePolicy = (): GatePolicy => {
  const v = (process.env.PROXY_GATE ?? 'strict').toLowerCase();
  return v === 'off' || v === 'deny' ? v : 'strict';
};
const extraAsns = () =>
  (process.env.PROXY_ASN_ALLOW ?? '')
    .split(',')
    .map((v) => Number(v.trim().replace(/^AS/i, '')))
    .filter((n) => Number.isInteger(n) && n > 0);

/** GET a URL from the phone itself, through whatever network it is really using. */
async function deviceGet(d: LeasedDevice, url: string): Promise<string> {
  const q = shellQuote(url);
  return (await shell(d, `curl -s --max-time 12 ${q} 2>/dev/null || wget -qO- -T 12 ${q} 2>/dev/null`, 25000).catch(() => '')).trim();
}

/** Google's homepage as this phone would get it: final URL, <html lang>, and "United States" count. */
async function googleProbe(d: LeasedDevice): Promise<string> {
  const f = `${RT_DIR}/gprobe.html`;
  const ua = shellQuote(ANDROID_UA);
  const lang = shellQuote('Accept-Language: en-US,en;q=0.9');
  return shell(
    d,
    `rm -f ${f}; U=$(curl -s -L --max-time 15 -A ${ua} -H ${lang} -o ${f} -w '%{url_effective}' https://www.google.com/ 2>/dev/null) || ` +
      `{ wget -q -T 15 -U ${ua} --header=${lang} -O ${f} https://www.google.com/ 2>/dev/null; U=''; }; ` +
      `echo "$U"; grep -o '<html[^>]*lang="[^"]*"' ${f} 2>/dev/null | head -1; grep -c 'United States' ${f} 2>/dev/null; rm -f ${f}`,
    30000,
  ).catch(() => '');
}

/** Binds the proxy and GPS, then checks the exit through it: two geolocation services and Google itself. */
async function preflightExit(d: LeasedDevice, p: Pin, isp: string) {
  await applyNetworkAndGps(d, p);
  await sleep(6000);
  const token = process.env.IPINFO_TOKEN ? '?token=' + encodeURIComponent(process.env.IPINFO_TOKEN) : '';
  const ipinfo = parseIpinfo(await deviceGet(d, (process.env.IP_CHECK_URL || 'https://ipinfo.io/json') + token));
  const ipapi =
    process.env.PROXY_GATE_IPAPI === 'false'
      ? null
      : parseIpapi(await deviceGet(d, 'http://ip-api.com/json/?fields=status,countryCode,region,regionName,city,isp,org,as,hosting,proxy,query'));
  // A scripted request to Google seconds before the search looks like a bot: off unless PROXY_GATE_GOOGLE=true.
  const google = process.env.PROXY_GATE_GOOGLE !== 'true' ? null : parseGoogleProbe(await googleProbe(d));
  const verdict = judgeExit({ ipinfo, ipapi, google }, { stateCode: p.stateCode, isp, policy: gatePolicy(), extraAsns: extraAsns() });
  return { verdict, ipinfo, ipapi, google };
}

/**
 * One proxy, one point: lease a port no other point is using and that hasn't been used in
 * the last PROXY_PORT_REST_MINUTES. Ports that failed the gatekeeper are benched for hours.
 * Falls back to a resting (but never benched) port rather than failing the point.
 */
async function leasePort(listId: number, ports: number[], seed: string, skip: Set<number>) {
  const r = redis();
  const order = portOrder(ports, seed).filter((port) => !skip.has(port));
  const busy = (port: number) => `stakeout:portbusy:${listId}:${port}`;
  const usable: number[] = [];
  for (const port of order) {
    if (await r.exists(`stakeout:portbad:${listId}:${port}`)) continue;
    usable.push(port);
    if (await r.set(`stakeout:port:${listId}:${port}`, seed, 'PX', PORT_REST_MS, 'NX')) {
      await r.set(busy(port), seed, 'PX', PORT_BUSY_MS);
      return { port, reused: false };
    }
  }
  // Every port was used recently: reuse one, but never a port another point is using right now.
  for (const port of usable) {
    if (await r.set(busy(port), seed, 'PX', PORT_BUSY_MS, 'NX')) return { port, reused: true };
  }
  return null;
}
const benchPort = (listId: number, port: number) => redis().set(`stakeout:portbad:${listId}:${port}`, '1', 'PX', PORT_BAD_MS).catch(() => null);

/**
 * Gives the phone a fresh DuoPlus proxy record for this port, for when DuoPlus refuses to edit
 * the one it has (record gone, or not editable while bound). The new record is bound by the next
 * applyNetworkAndGps; the replaced record is deleted once the phone has moved off it.
 */
async function replaceProxyRecord(device: LeasedDevice, list: { id: string; host: string; login: string; password: string }, port: number) {
  const res = await duoplusPost('/api/v1/proxy/add', {
    proxy_list: [{ protocol: 'socks5', host: list.host, port, user: list.login, password: list.password, name: 'stakeout-' + device.imageId }],
    ip_scan_channel: 'ip2location',
  });
  const id = res?.data?.success?.[0]?.id;
  if (!id) throw new Error('DUOPLUS_PROXY_ADD_FAILED ' + JSON.stringify(res?.data?.fail ?? res?.message ?? '').slice(0, 160));
  const replaced = device.proxyId;
  device.proxyId = String(id);
  device.proxyListId = list.id;
  await db.devicePool.update({ where: { imageId: device.imageId }, data: { proxyId: String(id), proxyListId: list.id } });
  console.log('[duoplus] phone', device.imageId, 'now uses proxy record', String(id), replaced ? '(replacing ' + replaced + ')' : '');
  return replaced && replaced !== String(id) ? replaced : null;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 240);

async function provisionFromLists(device: LeasedDevice, p: Pin) {
  const isp = p.isp ?? '';
  const lists = await listsForPin(p.scan, p);
  if (!lists.length) throw new Error('PROXY_LIST_MISSING');
  const requireState = process.env.PROXY_REQUIRE_STATE_MATCH !== 'false';
  const tried: string[] = [];
  // ADB phones: one sticky port per point, put through the pre-flight gatekeeper.
  if (transportFor(device) === 'adb') {
    const tries = Math.max(1, Number(process.env.PROXY_PORT_TRIES ?? 4));
    for (const [i, list] of lists.entries()) {
      const ports = list.ports as number[];
      const label = list.isp ? 'LIST_' + (list.city ? 'CITY' : 'STATE') + '_ISP' : 'LIST_' + (list.city ? 'CITY' : 'STATE') + '_ANY_ISP';
      const used = new Set<number>();
      for (let t = 0; t < tries; t++) {
        await device.assertOwned();
        // A new IP for every point by default (PROXY_IP_PER=pin): each point leases a fresh port.
        // PROXY_IP_PER=scan keeps one sticky IP per phone for the whole scan (reuses its earlier port).
        const ipPerScan = (process.env.PROXY_IP_PER ?? 'pin').trim() === 'scan';
        const stickyKey = `stakeout:scanport:${p.scanId}:${device.imageId}:${list.psListId}`;
        const prior = ipPerScan && t === 0 ? Number((await redis().get(stickyKey).catch(() => null)) ?? NaN) : NaN;
        const reuse =
          Number.isInteger(prior) && ports.includes(prior) && !(await redis().exists(`stakeout:portbad:${list.psListId}:${prior}`));
        const lease = reuse ? { port: prior, reused: true } : await leasePort(list.psListId, ports, p.id + ':' + list.psListId + ':' + t, used);
        if (!lease) break;
        if (reuse) await redis().set(`stakeout:portbusy:${list.psListId}:${lease.port}`, p.id, 'PX', 15 * 60000).catch(() => {});
        used.add(lease.port);
        const devKey = `stakeout:devport:${device.imageId}`;
        const samePort = (await redis().get(devKey).catch(() => null)) === list.psListId + ':' + lease.port;
        let superseded: string | null = null;
        try {
          // Fewer changes: the phone's record already points at this port, so DuoPlus is left alone.
          if (!samePort)
          await duoplusPost('/api/v1/proxy/update', {
            id: device.proxyId,
            host: list.host,
            port: lease.port,
            user: list.login,
            password: list.password,
            protocol: 'socks5',
            ip_scan_channel: 'ip2location',
          });
          if (device.proxyListId !== list.id) {
            await db.devicePool.update({ where: { imageId: device.imageId }, data: { proxyListId: list.id } });
            device.proxyListId = list.id;
          }
        } catch (err) {
          console.warn('[duoplus] proxy/update refused for', device.imageId, 'record', device.proxyId, '-', errText(err));
          try {
            superseded = await replaceProxyRecord(device, list, lease.port);
          } catch (e2) {
            console.warn('[duoplus] could not give', device.imageId, 'a fresh proxy record -', errText(e2));
            tried.push(label + ':' + lease.port + ':UPDATE_FAILED');
            continue;
          }
        }
        await redis().set(devKey, list.psListId + ':' + lease.port, 'EX', 24 * 3600).catch(() => {});
        const g = await preflightExit(device, p, isp);
        // The phone is now bound to its current record, so a replaced one can go.
        if (superseded) await duoplusPost('/api/v1/proxy/delete', { ids: [superseded] }).catch((e) => console.warn('[duoplus] old proxy record', superseded, 'not deleted -', errText(e)));
        if (!g.verdict.ok) {
          await benchPort(list.psListId, lease.port);
          tried.push(label + ':' + lease.port + ':' + g.verdict.reasons.join('+'));
          continue;
        }
        await db.proxyList.update({ where: { id: list.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
        const v = g.verdict;
        // A cap on searches per exit IP per hour; past it, this port rests and another is used.
        const cap = Number(process.env.SEARCHES_PER_IP_PER_HOUR ?? 8);
        if (cap > 0 && v.ip) {
          const k = 'stakeout:ipcount:' + v.ip;
          const n = await redis().incr(k);
          if (n === 1) await redis().expire(k, 3600);
          if (n > cap) {
            await redis().set(`stakeout:portbad:${list.psListId}:${lease.port}`, '1', 'PX', 3600000);
            await redis().del(stickyKey);
            tried.push(label + ':' + lease.port + ':IP_HOURLY_CAP');
            continue;
          }
        }
        await redis().set(stickyKey, String(lease.port), 'EX', 6 * 3600).catch(() => {});
        return {
          ip: v.ip ?? '',
          org: g.ipinfo?.org || g.ipapi?.as || '',
          city: g.ipinfo?.city || g.ipapi?.city || '',
          region: g.ipinfo?.region || g.ipapi?.regionName || '',
          country: g.ipinfo?.country || g.ipapi?.countryCode || '',
          timezone: '',
          proxySource: 'proxy-seller-list',
          listId: list.psListId,
          rungUsed: label,
          rotation: list.rotation === 0 ? 'per_request' : list.rotation === -1 ? 'sticky' : list.rotation + 's',
          ispRequested: isp || 'ANY',
          ispRuleApplied: Boolean(isp) && i === 0,
          ispObserved: v.network || null,
          ispMatched: isp ? ispMatches(isp, v.network) : null,
          stateMatched: true,
          cityMatched: cityMatches(g.ipinfo?.city || g.ipapi?.city || '', p.city),
          port: lease.port,
          portReused: lease.reused,
          rungsTried: tried,
          // The gatekeeper's evidence, kept on the receipt.
          gate: {
            passed: true,
            policy: gatePolicy(),
            asn: v.asn,
            network: v.network,
            hosting: v.hosting,
            sourcesAgree: v.sourcesAgree,
            googleLang: v.googleLang,
            googleHost: g.google?.host ?? null,
            ipinfoIp: g.ipinfo?.ip ?? null,
            ipapiIp: g.ipapi?.ip ?? null,
          },
        };
      }
    }
    throw new Error('PROXY_GATE_REJECTED ' + tried.join(',').slice(0, 300));
  }
  for (const [i, list] of lists.entries()) {
    await device.assertOwned();
    const ports = list.ports as number[];
    const port = ports[device.slotIndex % ports.length];
    const label = list.isp ? 'LIST_' + (list.city ? 'CITY' : 'STATE') + '_ISP' : 'LIST_' + (list.city ? 'CITY' : 'STATE') + '_ANY_ISP';
    if (device.proxyListId !== list.id) {
      try {
        await duoplusPost('/api/v1/proxy/update', {
          id: device.proxyId,
          host: list.host,
          port,
          user: list.login,
          password: list.password,
          protocol: 'socks5',
          ip_scan_channel: 'ip2location',
        });
        await db.devicePool.update({ where: { imageId: device.imageId }, data: { proxyListId: list.id } });
        device.proxyListId = list.id;
      } catch {
        tried.push(label + ':UPDATE_FAILED');
        continue;
      }
    }
    const c = await checkExit(device, p);
    if (!c) {
      tried.push(label + ':NO_EXIT');
      continue;
    }
    const stateMatched = regionMatchesState(c.region, p.stateCode);
    if (!isUS(c) || (requireState && !stateMatched)) {
      tried.push(label + ':WRONG_LOCATION');
      continue;
    }
    await db.proxyList.update({ where: { id: list.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    const ispWord = normPlace(isp).split(' ')[0] ?? '';
    return {
      ...c,
      proxySource: 'proxy-seller-list',
      listId: list.psListId,
      rungUsed: label,
      rotation: list.rotation === 0 ? 'per_request' : list.rotation === -1 ? 'sticky' : list.rotation + 's',
      ispRequested: isp || 'ANY',
      ispRuleApplied: Boolean(isp) && i === 0,
      // The exit's own network name, as a check that the ISP filter held.
      ispObserved: c.org ?? null,
      ispMatched: isp && c.org ? normPlace(c.org).includes(ispWord) : null,
      stateMatched,
      cityMatched: cityMatches(c.city, p.city),
      port,
      rungsTried: tried,
    };
  }
  throw new Error('PROXY_LADDER_EXHAUSTED ' + tried.join(','));
}

export async function provision(device: LeasedDevice, p: Pin) {
  await device.assertOwned();
  if (p.scan.proxyRegion) return provisionFromLists(device, p);
  const requireState = process.env.PROXY_REQUIRE_STATE_MATCH !== 'false';
  const ispRequested = p.scan.ispId;
  const ispTargetable = targetableIspCodes().includes(ispRequested);

  if (!proxyTargetingEnabled()) {
    // No Proxy-Seller credentials: use the phone's saved proxy as-is and say so.
    if (ispRequested !== 'ANY') throw new Error('ISP_TARGETING_NOT_CONFIGURED');
    for (let attempt = 0; attempt < 3; attempt++) {
      await device.assertOwned();
      const c = await checkExit(device, p);
      if (c && isUS(c) && (!requireState || regionMatchesState(c.region, p.stateCode)))
        return {
          ...c,
          rungUsed: 'STATIC_DEVICE_PROXY' as TargetRung,
          ispRequested,
          ispRuleApplied: false,
          stateMatched: regionMatchesState(c.region, p.stateCode),
          cityMatched: cityMatches(c.city, p.city),
          port: null,
        };
      await sleep(2000);
    }
    throw new Error('PROXY_LADDER_EXHAUSTED');
  }

  const { login, password } = proxyCredentials();
  const port = proxyPort(device.slotIndex);
  const host = process.env.PROXY_SELLER_HOST?.trim() || 'us.res.proxy-seller.com';
  const ladder = targetingLadder(p, ispRequested);
  if (!ladder.length) throw new Error('PROXY_NO_TARGET_FOR_PIN');
  const tried: string[] = [];

  for (const rung of ladder) {
    await device.assertOwned();
    // Fresh session per rung so a failed narrow target never leaks into the next.
    const session = randomBytes(8).toString('hex');
    try {
      await duoplusPost('/api/v1/proxy/update', {
        id: device.proxyId,
        host,
        port,
        user: targetedLogin(login, rung.suffix, session),
        password,
        protocol: 'socks5',
        ip_scan_channel: 'ip2location',
      });
    } catch {
      tried.push(rung.rung + ':UPDATE_FAILED');
      continue;
    }
    const c = await checkExit(device, p);
    if (!c) {
      tried.push(rung.rung + ':NO_EXIT');
      continue;
    }
    const stateMatched = regionMatchesState(c.region, p.stateCode);
    if (!isUS(c) || (requireState && !stateMatched)) {
      tried.push(rung.rung + ':WRONG_LOCATION');
      continue;
    }
    return {
      ...c,
      rungUsed: rung.rung,
      ispRequested,
      ispRuleApplied: rung.ispApplied,
      ispTargetable,
      stateMatched,
      cityMatched: cityMatches(c.city, p.city),
      port,
      rungsTried: tried,
    };
  }
  throw new Error('PROXY_LADDER_EXHAUSTED ' + tried.join(','));
}

export { readBundle, readBundleFile } from './bundle';

export async function measureMobile(p: Pin, d: LeasedDevice) {
  const scan = p.scan,
    tagBase = randomBytes(6).toString('hex'),
    point = p.rowIdx + '_' + p.colIdx,
    tag = tagBase + '_' + point;
  const prefix = 'scans/' + p.scanId + '/pin_' + point + '/' + tagBase,
    tarKey = prefix + '/raw.tar.gz';
  const app: Record<string, string> = {
    mobile_maps: 'maps',
    mobile_google: 'google',
    mobile_chrome: 'chrome',
  };
  if (!app[scan.targetType]) throw new Error('UNSUPPORTED_SURFACE');

  captureStarted();
  try {
    return await capture();
  } catch (e) {
    bootstrappedInMemory.delete(d.imageId);
    throw e;
  } finally {
    captureEnded();
  }

  async function capture() {
  await ensureRunnerInstalled(d);
  const proof = await provision(d, p);
  await d.assertOwned();
  // Over ADB the exit check already bound the proxy and set GPS; over the API it
  // checked the proxy record only, so bind and move the phone now.
  if (transportFor(d) === 'api') {
    await applyNetworkAndGps(d, p);
    await sleep(7000);
  }
  await d.assertOwned();

  const args = [
    app[scan.targetType],
    String(p.lat),
    String(p.lng),
    scan.keyword,
    encodeURIComponent(scan.keyword),
    tagBase,
    point,
    scan.trackAiOverviews ? '1' : '0',
  ].map(shellQuote);

  // Evidence transfer. Default over ADB: the phone keeps its bundle, the worker pulls
  // it and uploads to R2 itself, so nothing crosses the residential proxy and the
  // phone needs no curl. Phones without ADB upload to a one-time R2 link instead.
  const pullEvidence = transportFor(d) === 'adb' && process.env.EVIDENCE_TRANSFER !== 'phone_upload';
  const detachedUpload = !pullEvidence && process.env.UNBIND_PROXY_BEFORE_UPLOAD === 'true';
  const putUrl = pullEvidence ? '' : await uploadURL(tarKey);

  const pidFile = `${RT_DIR}/${tag}.pid`;
  const rpaMode = searchMode() === 'rpa' && pullEvidence;
  const rpaSecs = Math.max(120, Number(process.env.RPA_TIMEOUT_SECONDS ?? 420));
  if (rpaMode) {
    // The recorder only records while the template runs, then reads the results list.
    await ensureObserverInstalled(d);
    // Housekeeping: run files older than 30 minutes (failed attempts, manual tests) are deleted.
    // A phone runs one point at a time and a point takes minutes, so none of them is this run's.
    await shell(
      d,
      `find ${RT_DIR} -mindepth 1 -maxdepth 1 ! -name "observe.*" -mmin +30 -exec rm -rf {} + 2>/dev/null; find /sdcard/stakeout -maxdepth 1 -type f -mmin +30 -delete 2>/dev/null; true`,
    ).catch(() => {});
    // Templates that mark the moment they type (record_start, v3.9+) are recorded from there.
    const waitRec = (await rpaTemplate(app[scan.targetType] as RpaSurface).catch(() => null))?.vars.some((v) => v.key === 'record_start') ? 120 : 0;
    await shell(
      d,
      `nohup sh ${RT_DIR}/observe.sh ${shellQuote(tagBase)} ${shellQuote(point)} ${rpaSecs + 60} ${shellQuote(tag)} ${waitRec} >${RT_DIR}/last_run.log 2>&1 & echo $! > ${pidFile}`,
    );
  } else {
    // One command starts the capture in the background and records its PID.
    await shell(
      d,
      `export UPLOAD_URL=${shellQuote(detachedUpload || pullEvidence ? '' : putUrl)}; ` +
        `nohup sh ${RT_DIR}/run_pin.sh ${args.join(' ')} >${RT_DIR}/last_run.log 2>&1 & echo $! > ${pidFile}`,
    );
  }

  const deadline = Date.now() + (rpaMode ? (rpaSecs + 180) * 1000 : 240000);
  if (rpaMode) {
    await sleep(2000);
    // The capture-only template marks a wrong page / blocked run on the phone itself.
    const templateProblem = async () =>
      (
        await shell(
          d,
          `cd /sdcard/stakeout 2>/dev/null && for f in blocked surface_error; do [ -e ${tag}.$f ] && echo "$f: $(head -c 120 ${tag}.$f)"; done; true`,
        ).catch(() => '')
      ).replace(/\s+/g, ' ').trim();
    try {
      const run = await runRpaSearch({
        imageId: d.imageId,
        surface: app[scan.targetType] as RpaSurface,
        keyword: scan.keyword,
        pinId: tag,
        businessName: scan.targetBusiness,
        name: 'stakeout-' + p.id + '-' + tagBase,
        timeoutMs: rpaSecs * 1000,
        doneCheck: async () => (await shell(d, `test -f /sdcard/stakeout/${tag}.done && echo y`).catch(() => '')).trim() === 'y',
      });
      const problem = await templateProblem();
      if (problem) throw new Error('RPA_SURFACE_ERROR ' + problem.slice(0, 160));
      // Every result can be traced to the exact template (and DuoPlus task) that produced it.
      Object.assign(proof, { rpaTemplate: { id: run.templateId, name: run.templateName, taskId: run.taskId } });
    } catch (e) {
      const problem = e instanceof Error && e.message.startsWith('RPA_SURFACE_ERROR') ? '' : await templateProblem();
      throw problem ? new Error('RPA_SURFACE_ERROR ' + problem.slice(0, 160)) : e;
    } finally {
      // Template finished (or failed): the recorder now reads the results list and stops.
      await shell(d, `touch ${shellQuote(RT_DIR + '/' + tag + '/stop')}`).catch(() => {});
    }
  } else await sleep(30000);

  // Over ADB the worker can see the script exit, so a failed capture is reported
  // in seconds instead of after the full upload timeout. Checking costs no API call.
  async function scriptExitedWithoutResult() {
    if (transportFor(d) !== 'adb') return false;
    const out = await shell(d, `kill -0 $(cat ${pidFile} 2>/dev/null) 2>/dev/null && echo running || echo exited`).catch(() => 'running');
    return out.trim() === 'exited';
  }

  async function waitForUpload() {
    let exitedAt = 0;
    while (!(await uploaded(tarKey))) {
      if (Date.now() >= deadline) throw new Error('R2_UPLOAD_TIMEOUT');
      if (!detachedUpload && (await scriptExitedWithoutResult())) {
        exitedAt ||= Date.now();
        // A short grace period covers an upload that finished just after exit.
        if (Date.now() - exitedAt > 12000) {
          const log = await shell(d, `tail -n 5 ${RT_DIR}/last_run.log 2>/dev/null`).catch(() => '');
          throw new Error('DEVICE_SCRIPT_FAILED ' + log.replace(/\s+/g, ' ').slice(0, 160));
        }
      }
      await sleep(3500);
      await d.assertOwned();
    }
  }

  const dir = await mkdtemp(join(tmpdir(), 'stakeout-pin-'));
  const folder = `${RT_DIR}/${tag}`;
  async function waitForBundleOnPhone() {
    while (Date.now() < deadline) {
      await d.assertOwned();
      const status = (await shell(d, 'cat ' + shellQuote(folder + '/status') + ' 2>/dev/null').catch(() => '')).trim();
      if (status === 'done') return;
      if (await scriptExitedWithoutResult()) {
        const again = (await shell(d, 'cat ' + shellQuote(folder + '/status') + ' 2>/dev/null').catch(() => '')).trim();
        if (again === 'done') return;
        const log = await shell(d, `tail -n 5 ${RT_DIR}/last_run.log 2>/dev/null`).catch(() => '');
        throw new Error('DEVICE_SCRIPT_FAILED ' + log.replace(/\s+/g, ' ').slice(0, 160));
      }
      await sleep(3000);
    }
    throw new Error('DEVICE_BUNDLE_TIMEOUT');
  }
  try {
  let b: Awaited<ReturnType<typeof readBundleFile>>;
  if (pullEvidence) {
    await waitForBundleOnPhone();
    // One proxy for the whole search: the exit after recording must be the one the
    // gatekeeper approved before it. A changed exit fails the point (it is retried).
    const approved = proof as { ip?: string; gate?: unknown; exitHeld?: boolean | null; exitAfter?: string | null };
    if (approved?.gate && approved.ip) {
      const token = process.env.IPINFO_TOKEN ? '?token=' + encodeURIComponent(process.env.IPINFO_TOKEN) : '';
      const after = parseIpinfo(await deviceGet(d, (process.env.IP_CHECK_URL || 'https://ipinfo.io/json') + token));
      approved.exitAfter = after?.ip ?? null;
      approved.exitHeld = after ? after.ip === approved.ip : null;
      if (after && after.ip !== approved.ip) throw new Error('PROXY_EXIT_CHANGED ' + approved.ip + '>' + after.ip);
    }
    const local = join(dir, 'raw.tgz');
    await pull(d, folder + '.tar.gz', local);
    b = await readBundleFile(local, tag, dir);
    // Stored exactly as received, so the fingerprint can be re-checked later.
    await put(tarKey, b.raw, 'application/gzip');
    await shell(d, `rm -rf ${shellQuote(folder)} ${shellQuote(folder + '.tar.gz')} ${shellQuote(pidFile)}`).catch(() => {});
  } else if (detachedUpload) {
    let ready = false;
    while (Date.now() < deadline) {
      await d.assertOwned();
      const status = await shell(d, 'cat ' + shellQuote(folder + '/status')).catch(() => '');
      if (status.trim() === 'done') {
        ready = true;
        break;
      }
      await sleep(5000);
    }
    if (!ready) throw new Error('DEVICE_BUNDLE_TIMEOUT');
    try {
      await updatePhone({ image_id: d.imageId, proxy: { id: '', dns: 2 } });
      await sleep(2000);
      const file = shellQuote(folder + '.tar.gz');
      const sendScript = [
        '#!/system/bin/sh',
        `curl --max-time 90 -fsS -H 'Content-Type: application/gzip' -T ${file} ${shellQuote(putUrl)} && rm -f ${file} && rm -rf ${shellQuote(folder)}`,
        'exit 0',
      ].join('\n');
      await push(d, `${RT_DIR}/send.sh`, sendScript);
      await shell(d, `nohup sh ${RT_DIR}/send.sh >/dev/null 2>&1 &`);
      await waitForUpload();
    } finally {
      // Re-bind first: a lost lease must never leave the phone without its proxy.
      await updatePhone({ image_id: d.imageId, proxy: { id: d.proxyId, dns: 1 } });
      await d.assertOwned();
    }
    b = await readBundle(tarKey, tag, dir);
  } else {
    await waitForUpload();
    b = await readBundle(tarKey, tag, dir);
  }
    if (
      /unusual traffic|not a robot|verify you are human/i.test(
        b.scroll.join(' '),
      )
    )
      throw new Error('FLAG_CAPTCHA_DETECTED');
    if (b.flags.trim()) throw new Error('FLAG_MAP_DRIFT_OR_CHALLENGE');
    if (!b.video.length) throw new Error('EMPTY_VIDEO');

    const surface = app[scan.targetType];
    // The results page dump (serp.xml) holds the AI Overview too on web surfaces.
    const aiDumps = scan.trackAiOverviews ? [...b.ai, ...(b.serp && surface !== 'maps' ? [b.serp] : [])] : [];
    const result =
      (surface === 'chrome' || surface === 'google') && b.final
        ? parseWebResults(b.final, b.scroll, aiDumps, scan.targetBusiness)
        : { ...parsePinXmlBundle(b.final ? [...b.scroll, b.final] : b.scroll, aiDumps, scan.targetBusiness), locationSource: null, locationFromIp: false };
    // Google said it located this search by IP, so the pin's GPS was not used:
    // the result is not a measurement at this coordinate. Fail (and refund) it.
    // A refused point keeps its evidence (the bundle is already uploaded): link it and upload
    // its video, so the report shows what the phone saw. A later successful retry replaces it.
    const keepRefusedEvidence = async () => {
      if (!tarKey || !b?.video) return;
      const refusedVideo = prefix + '/video.mp4';
      await put(refusedVideo, b.video, 'video/mp4').catch(() => {});
      await db.gridPin.update({ where: { id: p.id }, data: { dumpsTarUrl: tarKey, videoUrl: refusedVideo } }).catch(() => {});
    };
    // The Local Finder snapshot can lack Google's location line; the results page of the same search has it.
    if ((surface === 'chrome' || surface === 'google') && !result.locationSource) {
      const line = searchLocationLine(null, b.serp);
      if (line) Object.assign(result, { locationSource: line, locationFromIp: /IP address/i.test(line) });
    }
    if (result.locationFromIp) {
      await keepRefusedEvidence();
      throw new Error('LOCATION_FROM_IP');
    }
    // On web surfaces Google states where it placed the search. It must say it used the
    // device and name this point's state or ZIP; anything else (another country, another
    // language, an IP guess) fails and is refunded instead of being recorded.
    if ((surface === 'chrome' || surface === 'google') && !locationVerified(result.locationSource, p.stateCode, p.zip, p.city)) {
      await keepRefusedEvidence();
      throw new Error('LOCATION_UNVERIFIED');
    }
    // The template's own verdict, recorded by the recorder before cleanup: a failure marker
    // or a ".done" that says "failed" means this point has no trustworthy result.
    const verdict = /^(?:surface_error|blocked)=(.*)$/m.exec(b.meta)?.[1]?.trim() || (/^done_status=failed/m.test(b.meta) ? 'template reported failure' : '');
    if (verdict) {
      await keepRefusedEvidence();
      throw new Error('RPA_SURFACE_ERROR ' + verdict.slice(0, 160));
    }
    // A template that refreshes Google's location (it declares update_location_text, v3.7+)
    // must prove it did; otherwise Google may have reused an earlier point's location.
    // The Google app shows the same results page as Chrome, so the same rules apply.
    if (surface === 'chrome' || surface === 'google') {
      const tpl = await rpaTemplate(surface).catch(() => null);
      if (tpl?.vars.some((v) => v.key === 'update_location_text') && !/location_refreshed=1/.test(b.meta)) {
        await keepRefusedEvidence();
        throw new Error("RPA_SURFACE_ERROR location_not_refreshed: the template finished without refreshing Google's location");
      }
      // Measurement: does the Local Finder's first view already hold the whole list?
      if (b.finderTop && b.final)
        console.info('[finder]', tag, 'organic listings at first view:', readLocalFinder(b.finderTop).filter((x) => !x.ad).length,
          '· after scrolling:', readLocalFinder(b.final).filter((x) => !x.ad).length);
    }
    // No Local Finder on this page: Google's AI Overview listed the businesses instead of a
    // map pack, so there was no "More businesses". Rank in that list (and record that), rather
    // than recording "0 listings, no rank".
    let aiList: { rank: number | null; list: string[] } | null = null;
    if ((surface === 'chrome' || surface === 'google') && b.final && !isLocalFinder(b.final)) {
      const list =
        [...[...b.ai].reverse(), b.serp, b.final]
          .filter((x): x is string => !!x)
          .map((x) => readAiOverview(x)?.businesses.filter((y) => !y.ad).map((y) => y.name) ?? [])
          .find((l) => l.length) ?? [];
      const i = list.findIndex((n) => sameBusiness(n, scan.targetBusiness));
      aiList = { rank: i >= 0 ? i + 1 : null, list };
      Object.assign(proof, { finderShown: false, rankFrom: list.length ? 'ai_overview_list' : 'none' });
    }
    const videoUrl = prefix + '/video.mp4',
      metaJsonUrl = prefix + '/meta.json';
    await put(videoUrl, b.video, 'video/mp4');
    await put(
      metaJsonUrl,
      JSON.stringify({
        timestamp: new Date(),
        pinId: p.id,
        keyword: scan.keyword,
        targetBusiness: scan.targetBusiness,
        lat: p.lat,
        lng: p.lng,
        zip: p.zip,
        city: p.city,
        requestedHardware: scan.phoneModel,
        observedModel: d.hardwareModel,
        proxyCheck: proof,
        videoKey: videoUrl,
        rawKey: tarKey,
        evidenceTransfer: pullEvidence ? 'adb_pull' : 'phone_upload',
        fingerprints: b.fingerprints,
        ...result,
      }),
      'application/json',
    );
    // What the phone saw, compactly (Local Finder with distances, advertisers, AI sources), for reports.
    let pinInsights: PinInsights | null = null;
    try {
      pinInsights = buildPinInsights({
        serp: b.serp,
        finder: b.final,
        aiExpanded: b.ai.reduce<string | null>((a, x) => (x.length > (a?.length ?? 0) ? x : a), null),
        aiCopy: b.aiCopy,
        target: scan.targetBusiness,
      });
    } catch (e) {
      console.error('[insights]', (e as Error).message);
    }
    return {
      assignedDeviceId: d.imageId,
      rankFound: aiList ? aiList.rank : result.targetRank,
      matchedDumpIdx: result.matchedDumpIndex,
      topCompetitors: aiList ? aiList.list : result.orderedBusinesses,
      insights: pinInsights ?? undefined,
      aiCitations: result.aiCitations,
      hasAiOverview: result.hasAiOverview,
      aiOverviewText: result.aiOverviewText,
      targetCitedInAi: result.targetCitedInAi,
      proxyMeta: proof,
      videoUrl,
      dumpsTarUrl: tarKey,
      metaJsonUrl,
      evidenceSha256: b.fingerprints['raw.tar.gz'],
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  }
}
