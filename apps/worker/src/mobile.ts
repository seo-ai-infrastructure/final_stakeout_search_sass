import { rpaTemplate } from './rpa';
import { buildPinInsights, isGoogleSource, type PinInsights } from '@stakeout/core/pinInsights';
import { searchLocationLine, isLocalFinder, readLocalFinder, readResultsPage, rankWithoutFinder, otherSearch, aiNamesFirst } from '@stakeout/core/serpEvidence';
import { randomBytes, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { sampleEntries, summarizeAioSources } from '@stakeout/core/aioSources';
import { watchAioSources, type AioWatchResult } from './aioWatch';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { db, type GridPin, type GridScan } from '@stakeout/db';
import { listsForPin, normPlace, locationVerified, topLineVerified, proxyPlace, proxyState } from '@stakeout/core/proxyLists';
import { dataLine, dataUsed, parseIfaceBytes, parseUidBytes, parseUidPackages, type DataUse } from '@stakeout/core/dataUse';
import { paidExitKey } from '@stakeout/core/idleProxy';
import { laneOf, laneSaw, laneWave } from './lane';
import type { LaneConfig } from '@stakeout/core/lane';
import { judgeExit, parseIpinfo, parseIpapi, parseGoogleProbe, portOrder, ispMatches, type GatePolicy } from '@stakeout/core/proxyGate';
import { redis } from '@stakeout/core/redis';
import { isProxyProblem, pinOutageKey, supplyDown } from '@stakeout/core/proxyWait';
import { pinNetwork } from '@stakeout/core/network';
import { decodoEndpoint, decodoLadder, decodoMobileLadder, decodoServes, decodoUser, proxyProviders } from '@stakeout/core/decodo';
import { mobileHubs, mobileProvider, voidmobEndpoint, voidmobUser } from '@stakeout/core/voidmob';
import { voidmobLogin } from './voidmobLogin';
import { clearProxyOutage } from './proxyOutage';
import { OBSERVE_SH } from '@stakeout/core/observer';
import type { RpaSurface } from '@stakeout/core/rpaRules';
import { runRpaSearch, runWarmup } from './rpa';
import { warmKey } from './power';
import { put, uploadURL, uploaded } from '@stakeout/core/r2';
import { captureEnded, captureStarted, duoplusPost, updatePhone, phonePowerStatus, type LeasedDevice } from './duoplus';
import { pull, push, shell, transportFor } from './deviceShell';
import { readBundle, readBundleFile } from './bundle';
import { stateTimezone } from '@stakeout/core/fleetHealth';
import { HUNT_FOOTER, SKIP_FOOTER_HUNT, locationKey, locationPathOf, nextLocationRuns, skipFooterHunt, withEvidence, type Evidence, type LocationRun, type Marks } from '@stakeout/core/runLog';
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
/** The proxy record each phone was last bound to by a point (its own, or a lane's shared one). */
const boundRecord = new Map<string, string>();

async function applyNetworkAndGps(d: LeasedDevice, p: Pin, record: string = d.proxyId) {
  boundRecord.set(d.imageId, record);
  const item = {
    image_id: d.imageId,
    proxy: { id: record, dns: 1 },
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
async function preflightExit(d: LeasedDevice, p: Pin, isp: string, stateCode = proxyState(p), lane = false, record?: string) {
  await applyNetworkAndGps(d, p, record);
  await sleep(6000);
  const token = process.env.IPINFO_TOKEN ? '?token=' + encodeURIComponent(process.env.IPINFO_TOKEN) : '';
  const ipinfo = parseIpinfo(await deviceGet(d, (process.env.IP_CHECK_URL || 'https://ipinfo.io/json') + token));
  const ipapi =
    process.env.PROXY_GATE_IPAPI === 'false'
      ? null
      : parseIpapi(await deviceGet(d, 'http://ip-api.com/json/?fields=status,countryCode,region,regionName,city,isp,org,as,hosting,proxy,query'));
  // A scripted request to Google seconds before the search looks like a bot: off unless PROXY_GATE_GOOGLE=true.
  const google = process.env.PROXY_GATE_GOOGLE !== 'true' ? null : parseGoogleProbe(await googleProbe(d));
  // A lane's port sits wherever its modem is, and databases file some carriers' 5G blocks under
  // consumer internet: so no state rule and no carrier list there. Hosting and data-centre
  // networks, and anything outside the US, are still refused.
  const verdict = judgeExit({ ipinfo, ipapi, google }, { stateCode, isp, policy: lane && gatePolicy() !== 'off' ? 'deny' : gatePolicy(), extraAsns: extraAsns(), anyState: lane });
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
type ProxyRecord = { host: string; port: number; user: string; password: string; protocol?: 'socks5' | 'http' };

async function replaceProxyRecord(device: LeasedDevice, rec: ProxyRecord, listId: string | null) {
  const res = await duoplusPost('/api/v1/proxy/add', {
    proxy_list: [{ protocol: rec.protocol ?? 'socks5', host: rec.host, port: rec.port, user: rec.user, password: rec.password, name: 'stakeout-' + device.imageId }],
    ip_scan_channel: 'ip2location',
  });
  const id = res?.data?.success?.[0]?.id;
  if (!id) throw new Error('DUOPLUS_PROXY_ADD_FAILED ' + JSON.stringify(res?.data?.fail ?? res?.message ?? '').slice(0, 160));
  const replaced = device.proxyId;
  device.proxyId = String(id);
  device.proxyListId = listId;
  await db.devicePool.update({ where: { imageId: device.imageId }, data: { proxyId: String(id), proxyListId: listId } });
  console.log('[duoplus] phone', device.imageId, 'now uses proxy record', String(id), replaced ? '(replacing ' + replaced + ')' : '');
  return replaced && replaced !== String(id) ? replaced : null;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 240);

/**
 * The one DuoPlus proxy record of a mobile lane, made once and then bound to every phone that
 * searches through the lane. If DuoPlus already has the lane's address on some phone's own record
 * (it answers with that record), the record becomes the lane's and that phone is given a new one
 * of its own the next time it needs it.
 */
async function laneRecord(lane: LaneConfig, device: LeasedDevice): Promise<string> {
  const print = createHash('sha1').update([lane.host, lane.port, lane.user, lane.password, lane.protocol].join('|')).digest('hex').slice(0, 16);
  const key = 'stakeout:lane:' + lane.n + ':record';
  const had = await redis().get(key).catch(() => null);
  if (had?.endsWith('|' + print)) return had.split('|')[0];
  let id: unknown = null;
  try {
    const res = await duoplusPost('/api/v1/proxy/add', {
      proxy_list: [{ protocol: lane.protocol, host: lane.host, port: lane.port, user: lane.user, password: lane.password, name: 'stakeout-lane-' + lane.n }],
      ip_scan_channel: 'ip2location',
    });
    id = res?.data?.success?.[0]?.id ?? null;
  } catch (e) {
    console.warn('[lane]', lane.n, 'DuoPlus did not add the lane record -', errText(e), '- looking for one it already has');
  }
  if (!id) {
    // Already there under another name: found by its address.
    for (let page = 1; page <= 30 && !id; page++) {
      const res = await duoplusPost('/api/v1/proxy/list', { page, pagesize: 100 });
      const list: any[] = res?.data?.list ?? [];
      id = list.find((r) => String(r?.host ?? r?.ip ?? '') === lane.host && Number(r?.port) === lane.port)?.id ?? null;
      if (list.length < 100) break;
    }
  }
  if (!id) throw new Error('DUOPLUS_PROXY_ADD_FAILED no record for mobile lane ' + lane.n);
  const rec = String(id);
  const owner = await db.devicePool.findFirst({ where: { proxyId: rec }, select: { imageId: true } });
  if (owner) {
    const none = 'none-' + owner.imageId;
    await db.devicePool.update({ where: { imageId: owner.imageId }, data: { proxyId: none, proxyListId: null } });
    if (owner.imageId === device.imageId) {
      device.proxyId = none;
      device.proxyListId = null;
    }
    console.log('[lane]', lane.n, 'record', rec, "was phone " + owner.imageId + "'s own: it is the lane's now, and that phone gets a new record with its next home-internet point");
  }
  await redis().set(key, rec + '|' + print, 'EX', 30 * 86400).catch(() => {});
  console.log('[lane]', lane.n, 'uses DuoPlus proxy record', rec, 'for every phone');
  return rec;
}

/**
 * Two limits on searches per exit IP per hour. Per phone (SEARCHES_PER_IP_PER_HOUR): several
 * phones behind one home connection is normal, so each phone has its own count and a town with
 * few real IPs keeps its searches local. Across all phones (SEARCHES_PER_IP_ALL_PHONES_PER_HOUR,
 * three times the per-phone limit unless set): one IP never carries the whole fleet. Counts this
 * search and returns null when it may go ahead on this IP; otherwise says which limit it hit.
 */
async function ipCapReached(ip: string, imageId: string): Promise<'IP_HOURLY_CAP' | 'IP_HOURLY_CAP_THIS_PHONE' | null> {
  const cap = Number(process.env.SEARCHES_PER_IP_PER_HOUR ?? 8);
  const ceiling = Number(process.env.SEARCHES_PER_IP_ALL_PHONES_PER_HOUR ?? cap * 3);
  if (!(cap > 0) || !ip) return null;
  const count = async (k: string) => {
    const n = await redis().incr(k);
    if (n === 1) await redis().expire(k, 3600);
    return n;
  };
  const mine = await count('stakeout:ipcount:' + ip + ':' + imageId);
  const all = await count('stakeout:ipcount:' + ip);
  if (mine <= cap && !(ceiling > 0 && all > ceiling)) return null;
  // The search does not happen on this IP, so it is not counted against it.
  await redis().decr('stakeout:ipcount:' + ip).catch(() => {});
  await redis().decr('stakeout:ipcount:' + ip + ':' + imageId).catch(() => {});
  return ceiling > 0 && all > ceiling ? 'IP_HOURLY_CAP' : 'IP_HOURLY_CAP_THIS_PHONE';
}

/** One place to ask a username-targeted gateway (Decodo, VoidMob) for an exit, and how to log in for it. */
type GatewayTarget = {
  /** Shown on the receipt and in the tries: e.g. DECODO_ZIP, MOBILE_HUB. */
  rung: string;
  /** The username for one try; the session keeps one IP for the whole point. */
  user: (session: string) => string;
  /** The state the exit must be in (the point's own state unless said otherwise). */
  state?: string;
  /** For the receipt: the place asked for, e.g. "Tampa, FL". */
  place?: string;
  /** A shared mobile lane: judged without the state rule. */
  lane?: boolean;
};

/**
 * A gateway whose username says where the exit is (Decodo, VoidMob; ADB phones): one sticky IP
 * per point, put through the same pre-flight gatekeeper as Proxy-Seller's ports. Each target is
 * tried a few times (a new session is a new IP), in order.
 */
async function provisionGateway(
  device: LeasedDevice,
  p: Pin,
  g0: {
    source: string;
    network: 'residential' | 'mobile';
    host: string;
    port: number;
    protocol: 'http' | 'socks5';
    password: string;
    tries: number;
    minutes: number;
    isp: string;
    targets: GatewayTarget[];
    /**
     * A proxy record shared by several phones (a mobile lane): DuoPlus keeps one record per proxy
     * address and refuses a second, so the phones are all bound to that one record instead of
     * each phone's own record being rewritten.
     */
    sharedRecord?: () => Promise<string>;
    /** Wait this long between tries of the same target (a lane whose modem is changing its IP). */
    retryPauseMs?: number;
  },
) {
  const tried: string[] = [];
  for (const target of g0.targets) {
    for (let t = 0; t < g0.tries; t++) {
      await device.assertOwned();
      const session = randomBytes(6).toString('hex');
      const rec: ProxyRecord = { host: g0.host, port: g0.port, user: target.user(session), password: g0.password, protocol: g0.protocol };
      let superseded: string | null = null;
      let shared: string | undefined;
      if (g0.sharedRecord) {
        try {
          shared = await g0.sharedRecord();
        } catch (e) {
          console.warn('[duoplus] no shared proxy record for', g0.source, '-', errText(e));
          tried.push(target.rung + ':' + session + ':UPDATE_FAILED');
          continue;
        }
      } else
      try {
        await duoplusPost('/api/v1/proxy/update', { id: device.proxyId, ...rec, ip_scan_channel: 'ip2location' });
        if (device.proxyListId) {
          await db.devicePool.update({ where: { imageId: device.imageId }, data: { proxyListId: null } });
          device.proxyListId = null;
        }
      } catch (err) {
        // DuoPlus checks the proxy before saving it: a place with no IP online right now is
        // refused here, and the next target is tried.
        console.warn('[duoplus] proxy/update refused for', device.imageId, 'record', device.proxyId, '(' + g0.source + ' ' + target.rung + ') -', errText(err));
        try {
          superseded = await replaceProxyRecord(device, rec, null);
        } catch (e2) {
          console.warn('[duoplus] could not give', device.imageId, 'a fresh proxy record (' + g0.source + ') -', errText(e2));
          tried.push(target.rung + ':' + session + ':UPDATE_FAILED');
          continue;
        }
      }
      // The phone no longer points at a Proxy-Seller port: a later list point must bind it again.
      await redis().del(`stakeout:devport:${device.imageId}`).catch(() => {});
      // "Mix of ISPs": the ISP is a preference, so a residential IP in the right state will do.
      // Mobile data: any carrier the gatekeeper knows as a real mobile network.
      const g = await preflightExit(device, p, p.scan.ispMode === 'mix' ? '' : g0.isp, target.state ?? proxyState(p), Boolean(target.lane), shared);
      if (superseded) await duoplusPost('/api/v1/proxy/delete', { ids: [superseded] }).catch((e) => console.warn('[duoplus] old proxy record', superseded, 'not deleted -', errText(e)));
      if (!g.verdict.ok) {
        tried.push(target.rung + ':' + session + ':' + g.verdict.reasons.join('+'));
        // A shared mobile port can be dark for a minute while its modem takes a new address:
        // the point waits here and asks again, staying in its wave, instead of giving up.
        if (g0.retryPauseMs && t < g0.tries - 1) await sleep(g0.retryPauseMs);
        continue;
      }
      const v = g.verdict;
      const capped = v.ip ? await ipCapReached(v.ip, device.imageId) : null;
      if (capped) {
        tried.push(target.rung + ':' + session + ':' + capped);
        continue;
      }
      await clearProxyOutage(pinOutageKey(p));
      const city = g.ipinfo?.city || g.ipapi?.city || '';
      return {
        ip: v.ip ?? '',
        org: g.ipinfo?.org || g.ipapi?.as || '',
        city,
        region: g.ipinfo?.region || g.ipapi?.regionName || '',
        country: g.ipinfo?.country || g.ipapi?.countryCode || '',
        timezone: '',
        proxySource: g0.source,
        network: g0.network,
        listId: null,
        rungUsed: target.rung,
        placeAsked: target.place ?? null,
        rotation: 'sticky ' + g0.minutes + 'm',
        ispRequested: g0.isp || 'ANY',
        ispRuleApplied: false,
        ispObserved: v.network || null,
        ispMatched: g0.isp ? ispMatches(g0.isp, v.network) : null,
        stateMatched: (target.state ?? proxyState(p)).toUpperCase() === proxyState(p).toUpperCase(),
        cityMatched: cityMatches(city, p.city),
        port: g0.port,
        portReused: false,
        rungsTried: tried,
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
  throw new Error((supplyDown(tried) ? 'PROXY_SUPPLY_DOWN ' : 'PROXY_GATE_REJECTED ') + tried.join(',').slice(0, 300));
}

/**
 * Decodo: home internet asks for the point's ZIP code, then its town, the area around it, then
 * anywhere in its state. Mobile data (Decodo mobile) asks for any carrier in the point's state.
 */
function provisionDecodo(device: LeasedDevice, p: Pin, network: 'residential' | 'mobile' = 'residential') {
  const mobile = network === 'mobile';
  const { host, port, protocol } = decodoEndpoint();
  const username = (mobile ? process.env.DECODO_MOBILE_USERNAME! : process.env.DECODO_USERNAME!).trim();
  const minutes = Number(process.env.DECODO_SESSION_MINUTES ?? 30);
  return provisionGateway(device, p, {
    source: mobile ? 'decodo-mobile' : 'decodo',
    network,
    host,
    port,
    protocol,
    password: mobile ? process.env.DECODO_MOBILE_PASSWORD! : process.env.DECODO_PASSWORD!,
    tries: Math.max(1, Number((mobile ? process.env.DECODO_MOBILE_TRIES : process.env.DECODO_TRIES_PER_TARGET) ?? (mobile ? 6 : 2))),
    minutes,
    isp: mobile ? '' : (p.isp ?? ''),
    targets: (mobile ? decodoMobileLadder(proxyPlace(p)) : decodoLadder(proxyPlace(p))).map((t) => ({ rung: t.rung, user: (session: string) => decodoUser(username, t.params, session, minutes) })),
  });
}

/**
 * VoidMob (mobile data): the nearest big city in the point's state, then the state's other hub
 * cities, then (MOBILE_CROSS_STATE, on unless "false") the nearest hubs over the state line.
 * Mobile IPs are only located in hub cities, which is also what a real phone on 5G shows.
 */
async function provisionVoidmob(device: LeasedDevice, p: Pin) {
  const { protocol } = voidmobEndpoint();
  // The package's own Flex login (read from VoidMob with VOIDMOB_API_KEY + VOIDMOB_PROXY_ID), or the fixed one.
  const { host, port, username: base, password } = await voidmobLogin();
  const minutes = Number(process.env.VOIDMOB_SESSION_MINUTES ?? 30);
  const hubs = mobileHubs(proxyPlace(p), { crossState: process.env.MOBILE_CROSS_STATE !== 'false' });
  return provisionGateway(device, p, {
    source: 'voidmob',
    network: 'mobile',
    host,
    port,
    protocol,
    password,
    tries: Math.max(1, Number(process.env.VOIDMOB_TRIES_PER_CITY ?? 2)),
    minutes,
    isp: '',
    targets: hubs.map((h) => ({
      rung: h.inState ? 'MOBILE_HUB' : 'MOBILE_HUB_NEARBY_STATE',
      user: (session: string) => voidmobUser(base, h.city, session, minutes),
      state: h.state,
      place: h.city + ', ' + h.state,
    })),
  });
}

async function provisionFromLists(device: LeasedDevice, p: Pin) {
  const isp = p.isp ?? '';
  const lists = await listsForPin(p.scan, proxyPlace(p));
  if (!lists.length) throw new Error('PROXY_LIST_MISSING');
  const requireState = process.env.PROXY_REQUIRE_STATE_MATCH !== 'false';
  const tried: string[] = [];
  // ADB phones: one sticky port per point, put through the pre-flight gatekeeper.
  if (transportFor(device) === 'adb') {
    const tries = Math.max(1, Number(process.env.PROXY_PORT_TRIES ?? 4));
    for (const [i, list] of lists.entries()) {
      const ports = list.ports as number[];
      const label = list.isp ? 'LIST_' + (list.city ? 'CITY' : 'STATE') + '_ISP' : 'LIST_' + (list.city ? 'CITY' : 'STATE') + '_ANY_ISP';
      // A list created moments ago is not usable yet: Proxy-Seller needs about a minute before its
      // ports answer, and until then DuoPlus refuses every one ("The proxy must detect
      // availability"). Lists are deleted while idle, so a scan's first point always meets a new
      // list: wait for it instead of spending ports and attempts on it.
      const warmup = Math.max(0, Number(process.env.PROXY_LIST_WARMUP_SECONDS ?? 75)) * 1000;
      const age = Date.now() - new Date(list.createdAt).getTime();
      if (age >= 0 && age < warmup) {
        console.info('[proxy] list', list.psListId, 'is', Math.round(age / 1000) + 's old: waiting', Math.round((warmup - age) / 1000) + 's for it to become usable');
        await sleep(warmup - age);
        await device.assertOwned();
      }
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
        if (!lease) {
          // Nothing usable left on this list (every port resting or in use): say so, and the next list is tried.
          if (!used.size) tried.push(label + ':-:NO_FREE_PORT');
          break;
        }
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
            superseded = await replaceProxyRecord(device, { host: list.host, port: lease.port, user: list.login, password: list.password }, list.id);
          } catch (e2) {
            console.warn('[duoplus] could not give', device.imageId, 'a fresh proxy record -', errText(e2));
            tried.push(label + ':' + lease.port + ':UPDATE_FAILED');
            continue;
          }
        }
        await redis().set(devKey, list.psListId + ':' + lease.port, 'EX', 24 * 3600).catch(() => {});
        // "Mix of ISPs" (ispMode 'mix'): the ISP is a preference, so an IP from the any-ISP list
        // only has to be residential and in the right state. A single chosen ISP (ispMode 'single')
        // and every ISP-specific list still require the ISP.
        const g = await preflightExit(device, p, !list.isp && p.scan.ispMode === 'mix' ? '' : isp);
        // The phone is now bound to its current record, so a replaced one can go.
        if (superseded) await duoplusPost('/api/v1/proxy/delete', { ids: [superseded] }).catch((e) => console.warn('[duoplus] old proxy record', superseded, 'not deleted -', errText(e)));
        if (!g.verdict.ok) {
          await benchPort(list.psListId, lease.port);
          tried.push(label + ':' + lease.port + ':' + g.verdict.reasons.join('+'));
          continue;
        }
        await db.proxyList.update({ where: { id: list.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
        const v = g.verdict;
        const capped = v.ip ? await ipCapReached(v.ip, device.imageId) : null;
        if (capped) {
          // Past the limit for every phone, the port rests for an hour for everyone.
          if (capped === 'IP_HOURLY_CAP') await redis().set(`stakeout:portbad:${list.psListId}:${lease.port}`, '1', 'PX', 3600000);
          await redis().del(stickyKey);
          tried.push(label + ':' + lease.port + ':' + capped);
          continue;
        }
        await redis().set(stickyKey, String(lease.port), 'EX', 6 * 3600).catch(() => {});
        await clearProxyOutage(pinOutageKey(p));
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
    // Every port refused or dead: the proxies are down, not just these ports (the worker then holds
    // the state's points until they answer again). Otherwise the point simply tries again.
    throw new Error((supplyDown(tried) ? 'PROXY_SUPPLY_DOWN ' : 'PROXY_GATE_REJECTED ') + tried.join(',').slice(0, 300));
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
    const stateMatched = regionMatchesState(c.region, proxyState(p));
    if (!isUS(c) || (requireState && !stateMatched)) {
      tried.push(label + ':WRONG_LOCATION');
      continue;
    }
    await db.proxyList.update({ where: { id: list.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    await clearProxyOutage(pinOutageKey(p));
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
  throw new Error((supplyDown(tried) ? 'PROXY_SUPPLY_DOWN ' : 'PROXY_LADDER_EXHAUSTED ') + tried.join(','));
}

/**
 * A working proxy for this point, from each provider in turn (PROXY_PROVIDERS: Decodo first by
 * default once it is set up, then Proxy-Seller). A point that must use one particular ISP goes to
 * Proxy-Seller, whose lists target a town and an ISP together. Only when every provider fails is
 * it a proxy problem (and the point waits; see the worker), and only when all of them are down is
 * it an outage.
 */
async function provision(device: LeasedDevice, p: Pin) {
  await device.assertOwned();
  // Mobile points (a mobile scan, or the mobile half of a mix) run only on mobile carrier IPs, never on home internet.
  if (pinNetwork(p.scan.network, p.rowIdx, p.colIdx) === 'mobile') {
    // A place on a mobile lane was taken before the phone was (index.ts): the search goes out of it.
    const lane = await laneOf(p.id);
    if (lane) {
      if (transportFor(device) !== 'adb') throw new Error('PROXY_MOBILE_NEEDS_ADB_PHONE');
      const got = await provisionGateway(device, p, {
        source: 'lane-' + lane.n,
        network: 'mobile',
        host: lane.host,
        port: lane.port,
        protocol: lane.protocol,
        password: lane.password,
        // Up to about two and a half minutes of asking: longer than a modem takes to come back.
        tries: 6,
        retryPauseMs: 8000,
        minutes: 0,
        isp: '',
        targets: [{ rung: 'MOBILE_LANE', user: () => lane.user, lane: true, place: 'mobile lane ' + lane.n }],
        sharedRecord: () => laneRecord(lane, device),
      });
      await laneSaw(lane, p.id, got.ip).catch(() => {});
      // Which wave of which lane this search went out in, kept with the point.
      const w = await laneWave(p.id).catch(() => null);
      if (w) Object.assign(got, w);
      return got;
    }
    const provider = mobileProvider();
    if (!provider) throw new Error('MOBILE_DATA_NOT_CONFIGURED set VOIDMOB_API_KEY and VOIDMOB_PROXY_ID (or VOIDMOB_USERNAME and VOIDMOB_PASSWORD, or the Decodo mobile login) on the worker');
    if (transportFor(device) !== 'adb') throw new Error('PROXY_MOBILE_NEEDS_ADB_PHONE');
    return provider === 'voidmob' ? provisionVoidmob(device, p) : provisionDecodo(device, p, 'mobile');
  }
  const failures: string[] = [];
  let usedProxySeller = false;
  for (const provider of proxyProviders()) {
    if (provider === 'decodo' && (!decodoServes(p) || transportFor(device) !== 'adb')) continue;
    usedProxySeller ||= provider === 'proxyseller';
    try {
      return provider === 'decodo' ? await provisionDecodo(device, p) : await provisionProxySeller(device, p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isProxyProblem(msg)) throw e;
      failures.push(provider + ': ' + msg);
      console.warn('[proxy]', provider, 'had no working proxy for point', p.id, '-', msg.slice(0, 160));
    }
  }
  // Decodo could not serve this point and Proxy-Seller was left out of PROXY_PROVIDERS: use it anyway.
  if (!usedProxySeller && !failures.length) return provisionProxySeller(device, p);
  const allDown = failures.every((f) => f.slice(f.indexOf(': ') + 2).startsWith('PROXY_SUPPLY_DOWN'));
  throw new Error((allDown ? 'PROXY_SUPPLY_DOWN ' : 'PROXY_GATE_REJECTED ') + failures.join(' | ').slice(0, 400));
}

async function provisionProxySeller(device: LeasedDevice, p: Pin) {
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
      if (c && isUS(c) && (!requireState || regionMatchesState(c.region, proxyState(p))))
        return {
          ...c,
          rungUsed: 'STATIC_DEVICE_PROXY' as TargetRung,
          ispRequested,
          ispRuleApplied: false,
          stateMatched: regionMatchesState(c.region, proxyState(p)),
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
  const ladder = targetingLadder(proxyPlace(p), ispRequested);
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
    const stateMatched = regionMatchesState(c.region, proxyState(p));
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

export { readBundleFile } from './bundle';

/** What execute() hands a point: where to note its moments, and how to give the phone back early. */
/** The phone's counters right now: bytes per network card and per app id. */
async function readData(d: LeasedDevice) {
  const ifaces = parseIfaceBytes(
    await shell(d, 'for i in /sys/class/net/*; do echo "${i##*/} $(cat $i/statistics/rx_bytes 2>/dev/null) $(cat $i/statistics/tx_bytes 2>/dev/null)"; done', 10000),
  );
  // Android writes its per-app numbers down every so often: ask it to do so now, then read them.
  const raw = await shell(
    d,
    "(cmd netstats poll || dumpsys netstats poll || dumpsys netstats --poll) >/dev/null 2>&1; dumpsys netstats --full --uid detail full 2>/dev/null | grep -E 'stats:|uid=|rb='",
    25000,
  ).catch(() => '');
  return { at: Date.now(), ifaces, uids: parseUidBytes(raw), sample: raw.slice(0, 300) };
}
/** Which app each app id is (asked once per phone every six hours). */
const names = new Map<string, { at: number; map: Record<string, string> }>();
const uidHelpSaid = new Set<string>();
async function packageNames(d: LeasedDevice) {
  const had = names.get(d.imageId);
  if (had && Date.now() - had.at < 6 * 3600000) return had.map;
  const map = parseUidPackages(await shell(d, 'pm list packages -U 2>/dev/null', 20000).catch(() => ''));
  if (Object.keys(map).length) names.set(d.imageId, { at: Date.now(), map });
  return map;
}

type RunContext = {
  marks: Marks;
  /**
   * The phone is no longer needed (its evidence is ready on it and the exit was checked): its rest
   * starts and its lease is released, while the evidence is pulled, checked and saved here.
   */
  phoneDone: () => Promise<void>;
  /** When the point must let go of the phone (the hard limit per point), epoch ms. */
  capAt?: number;
};

/** How each phone's Chrome lets the template refresh Google's location (see skipFooterHunt). */
async function locationRuns(imageId: string): Promise<LocationRun[]> {
  const raw = await redis().get(locationKey(imageId)).catch(() => null);
  try {
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v?.runs) ? v.runs : [];
  } catch {
    return [];
  }
}
async function noteLocationRun(imageId: string, run: LocationRun) {
  const runs = nextLocationRuns(await locationRuns(imageId), run);
  await redis().set(locationKey(imageId), JSON.stringify({ runs, at: new Date().toISOString() }), 'EX', 14 * 86400).catch(() => {});
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Whether a point reads the AI Overview's sources from Chrome: Chrome searches over ADB with AI
 * Overview tracking on. AIO_SOURCES: "admin" (default) for scans by admin accounts only, "all" for
 * every scan, "off" for none.
 */
async function readsAioSources(scan: GridScan, surface: string, d: LeasedDevice): Promise<boolean> {
  const mode = (process.env.AIO_SOURCES ?? 'admin').trim().toLowerCase();
  if (mode === 'off' || surface !== 'chrome' || !scan.trackAiOverviews || transportFor(d) !== 'adb') return false;
  if (mode === 'all') return true;
  const owner = await db.user.findUnique({ where: { id: scan.userId }, select: { role: true } }).catch(() => null);
  return owner?.role === 'ADMIN';
}

/** Keeps what the watch read: the full read in R2 next to the video, a summary on the point. */
async function keepAioSources(found: AioWatchResult, prefix: string, targetDomain: string | null, proof: object, tag: string) {
  const base = { status: found.status, probes: found.probes, reads: found.reads, loads: found.loads };
  if (found.dossier) {
    const key = prefix + '/aio-sources.json.gz';
    await put(key, gzipSync(JSON.stringify(found.dossier)), 'application/gzip');
    const summary = summarizeAioSources(found.dossier, targetDomain);
    const m = found.dossier.meta;
    Object.assign(proof, {
      aioSources: { ...base, key, ...summary, sample: sampleEntries(found.dossier), readMs: m.readMs, htmlLength: m.htmlLength, aioOnPage: m.aioOnPage, anatomy: m.anatomy, diagnostics: m.diagnostics },
    });
    console.log(
      `[aio-sources] ${tag}: ${found.status} · ${summary.sentences} sentence(s), ${summary.entries} source entries, ${summary.urls} address(es), ${summary.sites} site(s)` +
        ` · markers ${JSON.stringify(summary.markers)} · target ${summary.target ? `cited in ${summary.target.cited.length}, listed in ${summary.target.listed.length}` : 'none'}` +
        ` · ${found.probes} look(s), ${found.reads} read(s), ${found.loads} load(s)`,
    );
  } else {
    Object.assign(proof, { aioSources: { ...base, seen: found.seen, sockets: found.sockets, failures: found.failures, note: found.note } });
    console.log(
      `[aio-sources] ${tag}: ${found.status} · ${found.probes} look(s), ${found.failures ?? 0} unanswered · pages ${found.seen.join(' | ').slice(0, 300) || 'none'}` +
        (found.sockets ? ' · sockets ' + found.sockets : '') +
        (found.note ? ' · ' + found.note : ''),
    );
  }
}

export async function measureMobile(p: Pin, d: LeasedDevice, run: RunContext) {
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
  // Where this attempt's evidence went: carried on any error, so a rejected search can be watched.
  const ev: Evidence = { video: null, bundle: null, locationPath: null, template: null };

  // Counted while the phone is being set up (GPS waves share one DuoPlus update; see updatePhone).
  captureStarted();
  let settingUp = true;
  const setupDone = () => {
    if (settingUp) {
      settingUp = false;
      captureEnded();
    }
  };
  // How much data this attempt uses, and which apps use it: read before anything is bound and
  // again when the phone's part is over (or the attempt fails). Never able to fail a point.
  const dataBefore = process.env.DATA_MEASURE === 'false' ? null : await readData(d).catch(() => null);
  let dataSaid = false;
  const dataEnd = async (outcome: string): Promise<DataUse | null> => {
    if (dataSaid || !dataBefore) return null;
    dataSaid = true;
    try {
      const after = await readData(d);
      const used = dataUsed(dataBefore, after, await packageNames(d));
      const secs = Math.round((Date.now() - dataBefore.at) / 1000);
      console.log('[data]', d.imageId, 'point', p.id, pinNetwork(scan.network, p.rowIdx, p.colIdx), scan.targetType, outcome, secs + 's:', dataLine(used));
      if (used.appsMb == null && !uidHelpSaid.has(d.imageId)) {
        uidHelpSaid.add(d.imageId);
        console.warn('[data]', d.imageId, 'gave no per-app numbers. Start of its answer:', JSON.stringify(after.sample));
      }
      return used;
    } catch (e) {
      console.warn('[data]', d.imageId, 'not measured:', errMsg(e).slice(0, 120));
      return null;
    }
  };
  try {
    return await capture();
  } catch (e) {
    bootstrappedInMemory.delete(d.imageId);
    // Failed attempts use data too (often the most): said while this point still holds the phone.
    if (!/^(DEVICE_LEASE|CANCELLED|ADB_)/.test(errMsg(e))) await dataEnd('failed ' + errMsg(e).split(/[ :]/)[0]);
    throw withEvidence(e, ev);
  } finally {
    setupDone();
  }

  async function capture() {
  await ensureRunnerInstalled(d);
  const proof = await provision(d, p);
  run.marks.proxy = Date.now();
  // The address this search goes out of: the idle check later makes sure the phone has left it.
  const exitIp = (proof as { ip?: string })?.ip;
  if (exitIp) await redis().set(paidExitKey(d.imageId), exitIp, 'EX', 7 * 86400).catch(() => {});
  setupDone();
  await d.assertOwned();
  // A phone just switched on (power saving): once its proxy is set, run the warm-up template one
  // time before its first search. A failed warm-up is logged; the point still runs.
  if (searchMode() === 'rpa' && process.env.DUOPLUS_RPA_TEMPLATE_WARMUP?.trim() && !(await redis().get(warmKey(d.imageId)).catch(() => '1'))) {
    const t0 = Date.now();
    await runWarmup(d.imageId).then(
      () => console.log('[power] warm-up finished on', d.imageId, 'in', Math.round((Date.now() - t0) / 1000) + 's'),
      (e) => console.warn('[power] warm-up did not finish on', d.imageId, '-', e instanceof Error ? e.message : e),
    );
    await redis().set(warmKey(d.imageId), '1', 'EX', 7 * 86400).catch(() => {});
    run.marks.warmup = Date.now();
    await d.assertOwned();
  }
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
  const surface = app[scan.targetType] as RpaSurface;
  const tpl = rpaMode ? await rpaTemplate(surface).catch(() => null) : null;
  const tplVersion = tpl?.vars.find((v) => v.key === 'template_version')?.value;
  ev.template = tplVersion == null || tplVersion === '' ? null : String(tplVersion);
  // Template v3.42+: phones whose Chrome never shows the results' footer skip the warm-up's hunt for it.
  const knowsSkip = Boolean(tpl?.vars.some((v) => v.key === 'location_skip_class'));
  const hunt = knowsSkip ? skipFooterHunt(await locationRuns(d.imageId)) : { skip: false, probe: false };
  if (knowsSkip) Object.assign(proof, { locationSkip: hunt.skip, ...(hunt.probe ? { locationProbe: true } : {}) });
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
    const waitRec = tpl?.vars.some((v) => v.key === 'record_start') ? 120 : 0;
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
  const dir = await mkdtemp(join(tmpdir(), 'stakeout-pin-'));
  const folder = `${RT_DIR}/${tag}`;

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
      await sleep(2000);
    }
    throw new Error('DEVICE_BUNDLE_TIMEOUT');
  }

  /**
   * After a failed template run: the recorder keeps the screen as it is now (no scrolling) and
   * packs up within seconds; the bundle and video are stored so an admin can see where it stopped.
   * Gives up after 30 s rather than hold the phone.
   */
  async function salvageEvidence() {
    const until = Date.now() + 30000;
    for (;;) {
      const status = (await shell(d, 'cat ' + shellQuote(folder + '/status') + ' 2>/dev/null').catch(() => '')).trim();
      if (status === 'done') break;
      if (Date.now() > until || (await scriptExitedWithoutResult())) return;
      await sleep(2000);
    }
    const local = join(dir, 'salvage.tgz');
    await pull(d, folder + '.tar.gz', local, 90000);
    await put(tarKey, await readFile(local), 'application/gzip');
    ev.bundle = tarKey;
    try {
      const sb = await readBundleFile(local, tag, dir);
      ev.locationPath = locationPathOf(sb.meta);
      if (sb.video.length) {
        await put(prefix + '/video.mp4', sb.video, 'video/mp4');
        ev.video = prefix + '/video.mp4';
      }
    } catch {
      /* a bundle without its video still shows the screen */
    }
    await shell(d, `rm -rf ${shellQuote(folder)} ${shellQuote(folder + '.tar.gz')} ${shellQuote(pidFile)}`).catch(() => {});
  }

  try {
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
    let rpaError: unknown = null;
    let capped = false;
    // The AI Overview's sources, read from Chrome's results page while the template runs.
    let templateOver = false;
    const sourcesWatch = (await readsAioSources(scan, surface, d))
      ? watchAioSources({ phone: d, keyword: scan.keyword, done: () => templateOver, until: Date.now() + rpaSecs * 1000 }).catch(
          (e): AioWatchResult => ({ status: 'error', probes: 0, reads: 0, loads: 0, seen: [], note: errMsg(e).slice(0, 120) }),
        )
      : null;
    try {
      let stopLooked = Date.now();
      const r = await runRpaSearch({
        imageId: d.imageId,
        surface,
        keyword: scan.keyword,
        pinId: tag,
        businessName: scan.targetBusiness,
        vars: knowsSkip ? { location_skip_class: hunt.skip ? SKIP_FOOTER_HUNT : HUNT_FOOTER } : undefined,
        name: 'stakeout-' + p.id + '-' + tagBase,
        timeoutMs: rpaSecs * 1000,
        onAdded: () => void (run.marks.added = Date.now()),
        onStarted: () => void (run.marks.started = Date.now()),
        doneCheck: async () => (await shell(d, `[ -f /sdcard/stakeout/${tag}.done ] && echo y; true`).catch(() => '')).trim() === 'y',
        // A stopped scan settles its points at once; looked up at most every 12 s while the phone works.
        stopCheck: async () => {
          // Past the hard limit: the phone's task is cancelled like a stopped scan's.
          if (run.capAt && Date.now() > run.capAt - 15000) return (capped = true);
          if (Date.now() - stopLooked < 12000) return false;
          stopLooked = Date.now();
          return (await db.gridPin.findUnique({ where: { id: p.id }, select: { status: true } }))?.status !== 'PENDING';
        },
      });
      run.marks.templateDone = Date.now();
      const problem = await templateProblem();
      if (problem) throw new Error('RPA_SURFACE_ERROR ' + problem.slice(0, 160));
      // Every result can be traced to the exact template (and DuoPlus task) that produced it.
      Object.assign(proof, { rpaTemplate: { id: r.templateId, name: r.templateName, version: r.templateVersion, taskId: r.taskId } });
      // How long the point took from the phone's lease to the end of the search (capacity figures).
      if (p.startedAt) Object.assign(proof, { ranSeconds: Math.round((Date.now() - p.startedAt.getTime()) / 1000) });
    } catch (e) {
      run.marks.templateDone ??= Date.now();
      const problem = capped || (e instanceof Error && e.message.startsWith('RPA_SURFACE_ERROR')) ? '' : await templateProblem();
      rpaError = capped ? new Error('POINT_TIME_CAP the search was stopped at the time limit') : problem ? new Error('RPA_SURFACE_ERROR ' + problem.slice(0, 160)) : e;
    } finally {
      templateOver = true;
      // Template finished: the recorder now reads the results list and stops. Template failed:
      // the recorder keeps only the screen as it is now (abort), so the run can be looked at.
      const failed = rpaError !== null && !/^CANCELLED/.test(errMsg(rpaError));
      await shell(d, (failed ? `touch ${shellQuote(folder + '/abort')}; ` : '') + `touch ${shellQuote(folder + '/stop')}`).catch(() => {});
    }
    if (sourcesWatch) {
      const late: AioWatchResult = { status: 'error', probes: 0, reads: 0, loads: 0, seen: [], note: 'the watch did not stop in time' };
      const found = await Promise.race([sourcesWatch, sleep(10000).then(() => late)]);
      await keepAioSources(found, prefix, scan.targetDomain, proof, tag).catch((e) => console.warn('[aio-sources]', tag, 'not kept:', errMsg(e).slice(0, 140)));
    }
    if (rpaError) {
      if (!/^CANCELLED/.test(errMsg(rpaError)))
        await salvageEvidence().catch((e) => console.warn('[evidence]', tag, 'not kept after a failed template:', errMsg(e).slice(0, 140)));
      throw rpaError;
    }
  } else await sleep(30000);

  let b: Awaited<ReturnType<typeof readBundleFile>>;
  if (pullEvidence) {
    await waitForBundleOnPhone();
    run.marks.bundle = Date.now();
    // One proxy for the whole search: the exit after recording must be the one the
    // gatekeeper approved before it. A changed exit throws this search away and the point goes
    // back in the queue for a fresh port (a proxy problem never fails a point).
    const approved = proof as { ip?: string; gate?: unknown; exitHeld?: boolean | null; exitAfter?: string | null };
    if (approved?.gate && approved.ip) {
      const token = process.env.IPINFO_TOKEN ? '?token=' + encodeURIComponent(process.env.IPINFO_TOKEN) : '';
      const after = parseIpinfo(await deviceGet(d, (process.env.IP_CHECK_URL || 'https://ipinfo.io/json') + token));
      approved.exitAfter = after?.ip ?? null;
      approved.exitHeld = after ? after.ip === approved.ip : null;
      if (after && after.ip !== approved.ip) throw new Error('PROXY_EXIT_CHANGED ' + approved.ip + '>' + after.ip);
    }
    const used = await dataEnd('ok');
    if (used) Object.assign(proof, { data: used });
    // The phone's part is over: its rest starts now and the next point can have it, while the
    // evidence is pulled, checked and saved here.
    await run.phoneDone();
    const local = join(dir, 'raw.tgz');
    await pull(d, folder + '.tar.gz', local);
    b = await readBundleFile(local, tag, dir);
    // Stored exactly as received, so the fingerprint can be re-checked later.
    await put(tarKey, b.raw, 'application/gzip');
    ev.bundle = tarKey;
    run.marks.stored = Date.now();
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
    run.marks.bundle = Date.now();
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
      await updatePhone({ image_id: d.imageId, proxy: { id: boundRecord.get(d.imageId) ?? d.proxyId, dns: 1 } });
      await d.assertOwned();
    }
    b = await readBundle(tarKey, tag, dir);
    ev.bundle = tarKey;
    run.marks.stored = Date.now();
  } else {
    await waitForUpload();
    run.marks.bundle = Date.now();
    b = await readBundle(tarKey, tag, dir);
    ev.bundle = tarKey;
    run.marks.stored = Date.now();
  }
  // How the template refreshed Google's location on this run (v3.42+), remembered per phone. A
  // skip counts only when the template confirms it skipped the hunt.
  ev.locationPath = locationPathOf(b.meta);
  if (ev.locationPath) Object.assign(proof, { locationPath: ev.locationPath });
  if (knowsSkip) {
    const skipped = hunt.skip && /^hunt_skipped=1/m.test(b.meta);
    Object.assign(proof, { locationSkip: skipped });
    if (/^evidence=template$/m.test(b.meta)) await noteLocationRun(d.imageId, { footer: /(^|,)footer(,|$)/.test(ev.locationPath ?? ''), skipped });
  }

  // A refused search keeps its video (for the admin page's list of rejected searches).
  const keepVideo = async () => {
    if (ev.video || !b?.video?.length) return;
    await put(prefix + '/video.mp4', b.video, 'video/mp4').then(
      () => void (ev.video = prefix + '/video.mp4'),
      () => {},
    );
  };
  // A refused point keeps its evidence (the bundle is already uploaded): link it and upload
  // its video, so the report shows what the phone saw. A later successful retry replaces it.
  const keepRefusedEvidence = async () => {
    await keepVideo();
    if (ev.video) await db.gridPin.update({ where: { id: p.id }, data: { dumpsTarUrl: tarKey, videoUrl: ev.video } }).catch(() => {});
  };
  try {
    if (
      /unusual traffic|not a robot|verify you are human/i.test(
        b.scroll.join(' '),
      )
    )
      throw new Error('FLAG_CAPTCHA_DETECTED');
    if (b.flags.trim()) throw new Error('FLAG_MAP_DRIFT_OR_CHALLENGE');
    if (!b.video.length) throw new Error('EMPTY_VIDEO');
    // The results must be for this point's keyword. Chrome titles Google's results page "<words> -
    // Google Search": a run that never searched the keyword (its typing failed, so the page is still
    // a warm-up search) or that ended on another search (a related-search link) is retried, never
    // recorded. 15 Nov: "emergency plumber near me" was saved with the Local Finder of the warm-up
    // search "things to do today" (Hollis Garden, Polk Theatre ...) as its competitors.
    if (surface === 'chrome' || surface === 'google') {
      const wrong = [b.serp, b.final].map((x) => otherSearch(x, scan.keyword)).find(Boolean);
      if (wrong) {
        await keepRefusedEvidence();
        throw new Error('WRONG_QUERY the page was a search for "' + wrong.slice(0, 80) + '", not the keyword');
      }
    }

    // The results page dump (serp.xml) holds the AI Overview too on web surfaces.
    const aiDumps = scan.trackAiOverviews ? [...b.ai, ...(b.serp && surface !== 'maps' ? [b.serp] : [])] : [];
    const result =
      (surface === 'chrome' || surface === 'google') && b.final
        ? parseWebResults(b.final, b.scroll, aiDumps, scan.targetBusiness)
        : { ...parsePinXmlBundle(b.final ? [...b.scroll, b.final] : b.scroll, aiDumps, scan.targetBusiness), locationSource: null, locationFromIp: false };
    // Google said it located this search by IP, so the pin's GPS was not used:
    // the result is not a measurement at this coordinate. Fail (and refund) it.
    // The Local Finder snapshot can lack Google's location line; the results page of the same search has it.
    if ((surface === 'chrome' || surface === 'google') && !result.locationSource) {
      // Then any other snapshot of the run: Google only adds the footer that holds the line once
      // the page is scrolled to its end, so it can be in a later snapshot than these two.
      const line = [b.serp, ...[...b.scroll].reverse()].map((x) => searchLocationLine(null, x)).find(Boolean);
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
      // No footer line was captured at all (the page was never scrolled to its end, e.g. the Local
      // Finder opened late). Google's line at the top of the results names the place too: it counts
      // when it names this point's exact ZIP code (our label or the Census ZIP area) and the
      // template refreshed the location on this run. A footer line that disagrees is never overruled.
      const zips = [p.zip, (p.census as { zcta?: { id?: string } } | null)?.zcta?.id];
      const top = [b.serp, b.final, ...b.scroll].map((x) => (x ? readResultsPage(x).location : null)).find((x) => topLineVerified(x, p.stateCode, zips));
      if (!result.locationSource && top && /location_refreshed=1/.test(b.meta)) {
        Object.assign(result, { locationSource: top + ' (top of the results)' });
        Object.assign(proof, { locationCheckedBy: 'top_line' });
      } else {
        await keepRefusedEvidence();
        // What Google actually printed is said in the log (the refusal itself keeps its plain code).
        const tops = [b.serp, b.final, ...b.scroll].map((x) => (x ? readResultsPage(x).location : null)).filter(Boolean);
        console.warn('[location] point', p.id, 'on', d.imageId, 'expected', [p.city, p.stateCode, p.zip].join(' / '), '· footer line:', JSON.stringify(result.locationSource ?? null), '· top line(s):', JSON.stringify([...new Set(tops)].slice(0, 3)), '· refreshed:', /location_refreshed=1/.test(b.meta), '· snapshots:', b.scroll.length);
        throw new Error('LOCATION_UNVERIFIED');
      }
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
      const t = tpl ?? (await rpaTemplate(surface).catch(() => null));
      if (t?.vars.some((v) => v.key === 'update_location_text') && !/location_refreshed=1/.test(b.meta)) {
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
    let aiRankOnly = false;
    if ((surface === 'chrome' || surface === 'google') && b.final && !isLocalFinder(b.final)) {
      // The page's own map pack first (three listings, or four in Google's newer layout with
      // "See more on Google"), then an AI Overview's business list.
      const r = rankWithoutFinder([b.serp, b.final], [...[...b.ai].reverse(), b.serp, b.final], scan.targetBusiness, b.aiCopy);
      // Nothing read at all, and every snapshot is byte-for-byte the same page: the template never
      // scrolled, so the map pack was never looked for. That is a failed run to retry, not a
      // "not found" result.
      const shots = Object.entries(b.fingerprints ?? {}).filter(([name]) => /^(serp|final|dump_\d+)\.xml$/.test(name)).map(([, hash]) => hash);
      // (Identical snapshots alone prove nothing: a page without a map pack is saved once and copied.
      // The stuck runs are the ones that also left an AI Overview on the page uncopied.)
      const aiLeft = !('aio_copy.txt' in (b.fingerprints ?? {})) && /"AI Overview"/.test(b.serp ?? b.final ?? '');
      if (r.from === 'none' && aiLeft && shots.length >= 3 && new Set(shots).size === 1)
        throw new Error('RPA_SURFACE_ERROR no_scroll: the template finished without scrolling the results page');
      // The map pack offered its full list ("More businesses") but the run never got into it (the
      // Local Finder opened late, or the tap missed). Missing from the pack's three is not "not
      // found": retry the point rather than record a rank the full list might contradict.
      if (r.from === 'map_pack' && r.rank === null && [b.serp, b.final, ...b.scroll].some((x) => Boolean(x && readResultsPage(x).packMore))) {
        await keepRefusedEvidence();
        throw new Error('RPA_SURFACE_ERROR finder_not_opened: the full list of businesses never opened');
      }
      // Google's AI answer names the business, yet no list of businesses was read from the page
      // (its list stayed folded, or was not captured): searched once more rather than saved as
      // "no rank". Once only: an answer that really is plain text is kept the second time.
      if (r.from === 'none' && result.hasAiOverview && result.targetCitedInAi) {
        const row = await db.gridPin.findUnique({ where: { id: p.id }, select: { proxyMeta: true } }).catch(() => null);
        const earlier = (row?.proxyMeta as { attempts?: { reason?: string }[] } | null)?.attempts ?? [];
        // (Not when the point has already failed twice for other reasons: its tries are nearly used up.)
        if (earlier.length < 2 && !earlier.some((a) => /ai_list_not_read/.test(a?.reason ?? ''))) {
          await keepRefusedEvidence();
          throw new Error("RPA_SURFACE_ERROR ai_list_not_read: Google's AI answer cites the business but its list of businesses was not read");
        }
        Object.assign(proof, { aiListRetried: true });
      }
      aiList = { rank: r.rank, list: r.list };
      aiRankOnly = r.from === 'ai_overview_list';
      Object.assign(proof, { finderShown: false, rankFrom: r.from, ...(aiRankOnly ? { aiPosition: r.rank } : {}) });
    }
    const videoUrl = prefix + '/video.mp4',
      metaJsonUrl = prefix + '/meta.json';
    await put(videoUrl, b.video, 'video/mp4');
    ev.video = videoUrl;
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
        mapsScreens: surface === 'maps' ? [...b.scroll, b.final] : undefined,
        target: scan.targetBusiness,
      });
    } catch (e) {
      console.error('[insights]', (e as Error).message);
    }
    // Kept with the point, for looking back without the logs: what Google printed as the place,
    // where the rank was read from, whether the page had a local pack and its "More businesses",
    // and the attempts that failed before this one (written to the point as they happened).
    if (surface === 'chrome' || surface === 'google') {
      const pages = [b.serp, b.final, ...b.scroll].filter((x): x is string => Boolean(x)).map((x) => readResultsPage(x));
      const from = (proof as { rankFrom?: string }).rankFrom;
      Object.assign(proof, {
        locationText: result.locationSource ?? null,
        locationTop: pages.map((x) => x.location).find(Boolean) ?? null,
        rankSource: !aiList ? 'local_pack_full' : from === 'map_pack' ? 'local_pack_top3' : from === 'ai_overview_list' ? 'ai_answer_list' : 'none',
        localPack: { onPage: pages.some((x) => x.pack.length > 0), moreButton: pages.some((x) => Boolean(x.packMore)), opened: !aiList },
      });
      // "Position zero": named in the answer's opening sentences, ahead of any list.
      if (b.aiCopy) Object.assign(proof, { aiLead: aiNamesFirst(b.aiCopy, scan.targetBusiness) });
    } else Object.assign(proof, { rankSource: 'maps_list' });
    const before = await db.gridPin.findUnique({ where: { id: p.id }, select: { proxyMeta: true } }).catch(() => null);
    const attempts = (before?.proxyMeta as { attempts?: unknown } | null)?.attempts;
    if (Array.isArray(attempts) && attempts.length) Object.assign(proof, { attempts });
    run.marks.saved = Date.now();
    return {
      assignedDeviceId: d.imageId,
      // A page with no map pack has no local rank: the place in the AI Overview's list is kept
      // apart (proxyCheck.aiPosition) and counts only as AI visibility.
      rankFound: aiList ? (aiRankOnly ? null : aiList.rank) : result.targetRank,
      matchedDumpIdx: result.matchedDumpIndex,
      topCompetitors: aiList ? aiList.list : result.orderedBusinesses,
      insights: pinInsights ?? undefined,
      aiCitations: result.aiCitations.filter((c) => !isGoogleSource(c)),
      hasAiOverview: result.hasAiOverview,
      aiOverviewText: result.aiOverviewText,
      targetCitedInAi: result.targetCitedInAi,
      proxyMeta: proof,
      videoUrl,
      dumpsTarUrl: tarKey,
      metaJsonUrl,
      evidenceSha256: b.fingerprints['raw.tar.gz'],
    };
  } catch (e) {
    await keepVideo();
    throw e;
  }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  }
}
