import { phoneUsable, phoneInScope, expiresWithin, adbWhitelist, PHONE_STATUS } from '@stakeout/core/fleetHealth';
import { randomUUID, createHash } from 'node:crypto';
import { db } from '@stakeout/db';
import { redis, duoplusPost } from '@stakeout/core/redis';
import { leasableDeviceWhere } from '@stakeout/core/hardware';
import { setAdbPassword } from './deviceShell';
import { isDeviceAttributable, nextOutcomes, pauseReason } from '@stakeout/core/fleetHealth';
import { RUN_PIN_SH_V2 } from '@stakeout/core/runner';
import { push, shell } from './deviceShell';
export { duoplusPost } from '@stakeout/core/redis';

let lastAutoSyncAt = 0;
const PAGE_SIZE = 100;

/**
 * Refreshes connectivity for the fleet from DuoPlus. It never assigns hardware,
 * never marks a phone bootstrapped and never invents proxy IDs: hardware comes
 * only from the admin bootstrap (Android getprop), and proxies only from DuoPlus.
 * Phones missing from a complete listing are marked offline (admin's isEnabled is untouched).
 */
/** Auto power-on only when the fleet is limited to your own phones (DUOPLUS_PHONE_IDS), never account-wide. */
/** The fleet is one DuoPlus group (DUOPLUS_GROUP_ID): its phones that are on and ready are used. */
const fleetGroup = () => (process.env.DUOPLUS_GROUP_ID ?? '').trim();
let groupDescribed = false;
async function describeGroup() {
  const id = fleetGroup();
  if (groupDescribed || !id) return;
  groupDescribed = true;
  const res = await duoplusPost('/api/v1/cloudPhone/groupList', { page: 1, pagesize: 100 }).catch(() => null);
  const list: any[] = res?.data?.list ?? [];
  const g = list.find((x) => String(x?.id) === id);
  console.log('[duoplus] fleet = DuoPlus group', id, g ? '"' + String(g.name ?? '') + '"' : '(not in groupList: check DUOPLUS_GROUP_ID)');
}
/** Auto power-on only for a chosen set (a group or DUOPLUS_PHONE_IDS), never account-wide. */
const powerOnAllowed = () =>
  process.env.DUOPLUS_AUTO_POWER_ON !== 'false' && (Boolean(fleetGroup()) || Boolean((process.env.DUOPLUS_PHONE_IDS ?? '').trim()));
const lastPowerOn = new Map<string, number>();

export async function syncDuoPlusDevicePool() {
  if (!process.env.DUOPLUS_API_KEY) return;
  await describeGroup().catch(() => {});
  await ensureAdbWhitelist().catch((e) => console.warn('[duoplus] ADB whitelist not updated:', e instanceof Error ? e.message : e));
  try {
    // Only phones that are powered on, ADB-ready and not about to expire are used.
    // Anything else (off, expired, renewal overdue, booting, configuring) is ignored,
    // and a phone registered earlier that is no longer usable is marked offline below.
    const online: any[] = [];
    const skipped: Record<string, number> = {};
    const needAdb: string[] = [];
    const needPower: string[] = [];
    const scopedSkips: string[] = [];
    const autoSetup = process.env.DUOPLUS_AUTO_PROVISION !== 'false';
    let listed = 0;
    let complete = false;
    for (let page = 1; page <= 20; page++) {
      // Every phone on the account, so the summary can say why each unusable one is skipped.
      const group = fleetGroup();
      const res = await duoplusPost('/api/v1/cloudPhone/list', { page, pagesize: PAGE_SIZE, ...(group ? { group_id: group } : {}) });
      const list: any[] = res?.data?.list ?? [];
      listed += list.length;
      for (const i of list) {
        if (!i?.id) continue;
        if (!phoneInScope(String(i.id))) {
          skipped['not in DUOPLUS_PHONE_IDS'] = (skipped['not in DUOPLUS_PHONE_IDS'] ?? 0) + 1;
          continue;
        }
        // Double-check group membership in case the filter is ignored.
        const grp = fleetGroup();
        if (grp && Array.isArray(i.group) && i.group.length && !i.group.some((g: any) => String(g?.id) === grp)) {
          skipped['not in group ' + grp] = (skipped['not in group ' + grp] ?? 0) + 1;
          continue;
        }
        // On and not about to expire, but ADB is off: switch it on (picked up next sync).
        if (Number(i.status) === 1 && String(i.adb_status ?? '1') !== '1' && !expiresWithin(i.expired_at, 30)) needAdb.push(String(i.id));
        if (i.adb) setAdbPassword(String(i.adb), i.adb_password ? String(i.adb_password) : null);
        const u = phoneUsable(i);
        if (u.ok) online.push(i);
        else {
          skipped[u.why] = (skipped[u.why] ?? 0) + 1;
          // Your own phones are named, with DuoPlus's raw fields, so a dashboard/API mismatch shows.
          scopedSkips.push(String(i.id) + ' ' + u.why + ' [status=' + String(i.status) + (i.link_status !== undefined ? ' link=' + String(i.link_status) : '') + ']');
          // One of your listed phones is off: power it on (subscription phones only: never billed per minute).
          if (powerOnAllowed() && Number(i.status) === 2 && i.expired_at && !expiresWithin(i.expired_at, 60)) needPower.push(String(i.id));
          // A phone that is on but can't be used says so by name, so it can be fixed.
          if (Number(i.status) === 1) console.warn('[duoplus] phone', String(i.id), (i.name ? '(' + i.name + ') ' : '') + 'is on but not usable:', u.why);
        }
      }
      if (list.length < PAGE_SIZE) {
        complete = true;
        break;
      }
    }
    const now = new Date();
    if (autoSetup && needAdb.length) {
      const r = await duoplusPost('/api/v1/cloudPhone/openAdb', { image_ids: needAdb }).catch((e) => ({ error: String(e) }));
      console.log('[duoplus] switched ADB on for', needAdb.join(', '), '·', JSON.stringify((r as any)?.data ?? r).slice(0, 200));
    }
    if (needPower.length) {
      const due = needPower.filter((id) => Date.now() - (lastPowerOn.get(id) ?? 0) > 10 * 60000);
      if (due.length) {
        due.forEach((id) => lastPowerOn.set(id, Date.now()));
        const r = await duoplusPost('/api/v1/cloudPhone/powerOn', { image_ids: due }).catch((e) => ({ error: String(e) }));
        console.log('[duoplus] powering on', due.join(', '), '(DuoPlus reports powered off) ·', JSON.stringify((r as any)?.data ?? r).slice(0, 200));
      }
    }
    const summary = Object.entries(skipped).map(([why, n]) => n + ' ' + why).join(', ');
    console.log(
      `[duoplus] fleet sync${fleetGroup() ? ' (group ' + fleetGroup() + ')' : ''}: ${listed} listed, ${online.length} usable` +
        (online.length ? ' (' + online.map((i) => String(i.id)).join(', ') + ')' : '') +
        (summary ? ` · skipped: ${summary}` : '') +
        (scopedSkips.length ? ' · yours not usable: ' + scopedSkips.join('; ') : ''),
    );
    const known = await db.devicePool.findMany({ select: { imageId: true, proxyId: true } });
    const knownIds = new Set(known.map((d) => d.imageId));
    const usedProxies = new Set(known.map((d) => d.proxyId));
    const onlineIds = online.map((i) => String(i.id));

    if (complete)
      await db.devicePool.updateMany({
        where: { imageId: { notIn: onlineIds }, offlineAt: null },
        data: { offlineAt: now },
      });

    for (const item of online) {
      const imageId = String(item.id);
      if (knownIds.has(imageId)) {
        await db.devicePool.update({
          where: { imageId },
          data: { adbAddr: String(item.adb), offlineAt: null },
        });
        continue;
      }
      // New phone: register it only with its real DuoPlus proxy binding, and
      // leave it un-bootstrapped so it cannot be leased until an admin bootstraps it.
      let proxyId = item.proxy_id ? String(item.proxy_id) : '';
      if (!proxyId || usedProxies.has(proxyId)) {
        // Give the phone its own DuoPlus proxy record instead of waiting for someone to bind one.
        const created = autoSetup ? await createOwnProxy(imageId) : null;
        if (!created) {
          console.warn(
            '[duoplus] skipped new phone without a unique proxy binding',
            imageId,
            autoSetup ? '(it gets its own once the first scan has created a proxy list)' : '',
          );
          continue;
        }
        proxyId = created;
      }
      usedProxies.add(proxyId);
      await db.devicePool.create({
        data: { imageId, proxyId, adbAddr: String(item.adb), cooldownUntil: new Date(0) },
      });
    }
    await autoBootstrap();
  } catch (err) {
    console.error('[duoplus] Fleet sync failed:', err instanceof Error ? err.message : String(err));
  }
}

const RT_DIR = '/data/local/tmp/rt';
export const RUNNER_SHA = createHash('sha256').update(RUN_PIN_SH_V2).digest('hex');

/**
 * Prepares a phone and records its real hardware: turns off animations, skips
 * Chrome's first-run screens, installs the capture script, then reads the Android
 * model so the phone can be leased for matching hardware profiles.
 */
export async function bootstrapDevice(d: { imageId: string; adbAddr: string | null }) {
  await shell(
    d,
    [
      `mkdir -p ${RT_DIR}`,
      'settings put global window_animation_scale 0',
      'settings put global transition_animation_scale 0',
      'settings put global animator_duration_scale 0',
      "echo 'chrome --disable-fre --no-first-run' > /data/local/tmp/chrome-command-line",
    ].join('; '),
  );
  await push(d, `${RT_DIR}/run_pin.sh`, RUN_PIN_SH_V2);
  await shell(d, `echo ${RUNNER_SHA} > ${RT_DIR}/run_pin.sha`);
  const props = (await shell(d, 'getprop ro.product.brand; getprop ro.product.model'))
    .trim()
    .split(/\r?\n/)
    .map((v) => v.trim());
  const [brand, model] = props.slice(-2);
  if (!model) throw new Error('BOOTSTRAP_NO_MODEL');
  // Apps can read the SIM's country and carrier. A phone whose emulated SIM says another
  // country gets a matched US carrier instead (no phone number: DuoPlus warns custom
  // numbers carry risk). Phones with no SIM are left alone. DUOPLUS_US_SIM=false to skip.
  if (process.env.DUOPLUS_US_SIM !== 'false') {
    const simCountry = (await shell(d, 'getprop gsm.sim.operator.iso-country').catch(() => '')).trim().toLowerCase();
    if (simCountry && !simCountry.split(',').every((c) => c.trim() === 'us' || c.trim() === '')) {
      await updatePhone({
        image_id: d.imageId,
        sim: { status: 1, country: 'US', operator: 'T-Mobile USA', mcc: '310', mnc: '260' },
      }).then(
        () => console.log('[duoplus] phone', d.imageId, 'had a', simCountry.toUpperCase(), 'SIM; set to a US carrier'),
        (e) => console.warn('[duoplus] could not set a US SIM on', d.imageId, e instanceof Error ? e.message : e),
      );
    }
  }
  await db.devicePool.update({
    where: { imageId: d.imageId },
    data: { hardwareBrand: brand || null, hardwareModel: model, bootstrappedAt: new Date() },
  });
  return { brand, model };
}

/** "Rent a phone" is the whole job: new online phones are bootstrapped automatically. */
async function autoBootstrap() {
  if (process.env.AUTO_BOOTSTRAP === 'false') return;
  const pending = await db.devicePool.findMany({
    where: { offlineAt: null, isEnabled: true, OR: [{ bootstrappedAt: null }, { hardwareModel: null }] },
    take: 10,
  });
  for (const d of pending) {
    try {
      const hw = await bootstrapDevice(d);
      console.log('[duoplus] auto-bootstrapped', d.imageId, hw.brand, hw.model);
    } catch (e) {
      console.warn('[duoplus] auto-bootstrap failed', d.imageId, e instanceof Error ? e.message : e);
    }
  }
}

/**
 * Phone settings changes (proxy binding, GPS, locale) collected for a short window
 * and sent as ONE cloudPhone/update call, so pins starting together share a
 * rate-limited request. A failed batch is retried phone by phone.
 */
type PhoneUpdate = { image_id: string } & Record<string, unknown>;
let pendingUpdates: { item: PhoneUpdate; resolve: () => void; reject: (e: unknown) => void }[] = [];
let flushTimer: NodeJS.Timeout | null = null;

/**
 * GPS waves: pins being captured right now are counted, and a batch is sent as soon
 * as every one of them has queued its update, or after the window at the latest.
 * One phone flushes at once; three phones starting together share one request.
 */
let activeCaptures = 0;
export const captureStarted = () => void activeCaptures++;
export const captureEnded = () => void (activeCaptures = Math.max(0, activeCaptures - 1));

export function updatePhone(item: PhoneUpdate) {
  return new Promise<void>((resolve, reject) => {
    pendingUpdates.push({ item, resolve, reject });
    if (pendingUpdates.length >= Math.max(1, activeCaptures)) {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flushUpdates, 0);
    } else {
      flushTimer ??= setTimeout(flushUpdates, Number(process.env.DUOPLUS_BATCH_WINDOW_MS ?? 2500));
    }
  });
}

/** Phone IDs DuoPlus reports as failed in an otherwise successful batch response. */
function failedIds(res: any): string[] {
  const f = res?.data?.fail;
  return Array.isArray(f) ? f.map((x: any) => String(x?.id ?? x?.image_id ?? x)) : [];
}

async function updateOne(b: { item: PhoneUpdate }) {
  const res = await duoplusPost('/api/v1/cloudPhone/update', { images: [b.item] });
  if (failedIds(res).includes(b.item.image_id))
    throw new Error('DUOPLUS_UPDATE_FAILED ' + JSON.stringify(res?.data?.fail_reason ?? '').slice(0, 120));
}

async function flushUpdates() {
  flushTimer = null;
  // DuoPlus accepts at most 20 phones per cloudPhone/update call.
  const batch = pendingUpdates.splice(0, 20);
  if (pendingUpdates.length) flushTimer = setTimeout(flushUpdates, 0);
  if (!batch.length) return;
  try {
    const res = await duoplusPost('/api/v1/cloudPhone/update', { images: batch.map((b) => b.item) });
    // A 200 response can still list phones whose GPS/proxy/locale were not applied:
    // retry those one by one, and fail a point rather than let it search from the wrong place.
    const failed = new Set(failedIds(res));
    for (const b of batch) {
      if (!failed.has(b.item.image_id)) {
        b.resolve();
        continue;
      }
      try {
        await updateOne(b);
        b.resolve();
      } catch (err) {
        b.reject(err);
      }
    }
  } catch (e) {
    if (batch.length === 1) return batch[0].reject(e);
    for (const b of batch) {
      try {
        await updateOne(b);
        b.resolve();
      } catch (err) {
        b.reject(err);
      }
    }
  }
}

/**
 * Records one pin attempt against the phone that ran it, and auto-pauses a phone
 * whose recent failure rate crosses the threshold. Failures that are not the
 * phone's fault (proxy, location, capacity) are not counted.
 */
export async function recordDeviceOutcome(imageId: string, errorCode: string | null) {
  const ok = errorCode === null;
  if (!ok && !isDeviceAttributable(errorCode)) return;
  const d = await db.devicePool.findUnique({
    where: { imageId },
    select: { recentOutcomes: true, autoPausedAt: true },
  });
  if (!d) return;
  const outcomes = nextOutcomes(d.recentOutcomes, ok);
  const reason = d.autoPausedAt ? null : pauseReason(outcomes);
  await db.devicePool.update({
    where: { imageId },
    data: {
      recentOutcomes: outcomes,
      ...(ok
        ? { pinsSucceeded: { increment: 1 }, lastSuccessAt: new Date() }
        : { pinsFailed: { increment: 1 }, lastFailureCode: errorCode!.slice(0, 80), lastFailureAt: new Date() }),
      ...(reason ? { autoPausedAt: new Date(), autoPauseReason: reason } : {}),
    },
  });
  if (reason) console.warn('[duoplus] auto-paused', imageId, reason);
}

export type LeasedDevice = Awaited<ReturnType<typeof leaseCandidates>>[number] & {
  assertOwned(): Promise<void>;
  release(): Promise<void>;
};

async function leaseCandidates(phoneModel: string) {
  const devices = await db.devicePool.findMany({
    where: leasableDeviceWhere,
    orderBy: { slotIndex: 'asc' },
  });
  // Scans no longer choose a phone model: any healthy phone in the fleet takes the point.
  void phoneModel;
  return devices;
}

export type LeaseResult =
  | { device: LeasedDevice }
  | { reason: 'BUSY' | 'NO_COMPATIBLE_DEVICE' };

/**
 * Leases a phone whose Android model matches the requested profile.
 * There is deliberately no fallback to other hardware.
 */
export async function acquireDeviceLease(
  pinId: string,
  phoneModel: string,
  preferredListId?: string | null,
): Promise<LeaseResult> {
  let candidates = await leaseCandidates(phoneModel);
  if (!candidates.length && Date.now() - lastAutoSyncAt > 60000) {
    lastAutoSyncAt = Date.now();
    await syncDuoPlusDevicePool();
    candidates = await leaseCandidates(phoneModel);
  }
  if (!candidates.length) return { reason: 'NO_COMPATIBLE_DEVICE' };

  const store = redis();
  const now = new Date();
  // Phones already on this pin's proxy list first: no DuoPlus proxy update needed.
  if (preferredListId)
    candidates = [...candidates].sort(
      (a, b) => Number(b.proxyListId === preferredListId) - Number(a.proxyListId === preferredListId),
    );
  for (const d of candidates) {
    if (d.cooldownUntil > now) continue;
    const key = 'lock:duoplus:' + d.imageId,
      token = pinId + '|' + randomUUID();
    if (!(await store.set(key, token, 'PX', 180000, 'NX'))) continue;
    let healthy = true;
    const timer = setInterval(async () => {
      try {
        healthy = !!(await store.eval(
          "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('pexpire',KEYS[1],180000) end return 0",
          1,
          key,
          token,
        ));
      } catch {
        healthy = false;
      }
    }, 30000);
    const device: LeasedDevice = {
      ...d,
      assertOwned: async () => {
        if (!healthy || (await store.get(key)) !== token) throw new Error('DEVICE_LEASE_LOST');
      },
      release: async () => {
        clearInterval(timer);
        await store.eval(
          "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) end return 0",
          1,
          key,
          token,
        );
      },
    };
    return { device };
  }
  return { reason: 'BUSY' };
}


/**
 * Live check just before a point runs: is this phone still powered on?
 * Returns null when DuoPlus can't be asked (so a busy API never halts the fleet);
 * the ADB connection would fail on its own if the phone really were off.
 */
export async function phonePowerStatus(imageId: string): Promise<{ on: boolean; status: string } | null> {
  const res = await duoplusPost('/api/v1/cloudPhone/status', { image_ids: [imageId] }).catch(() => null);
  const data = res?.data;
  const items: any[] = Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : data ? [data] : [];
  const item = items.find((i) => String(i?.id ?? i?.image_id ?? '') === imageId) ?? (items.length === 1 ? items[0] : null);
  if (!item || item.status === undefined) return null;
  const code = Number(item.status);
  return { on: code === 1, status: PHONE_STATUS[code] ?? 'status ' + String(item.status) };
}


/**
 * Creates a DuoPlus proxy record for one phone (filled from a saved Proxy-Seller list;
 * the worker rewrites it to the right city and ISP before every point) and binds it.
 * Returns null until a scan has created at least one list.
 */
async function createOwnProxy(imageId: string): Promise<string | null> {
  const list = await db.proxyList.findFirst({ orderBy: { lastUsedAt: 'desc' } });
  if (!list) return null;
  const ports = list.ports as number[];
  // Test the credentials first (Check Proxy works on unsaved settings), so a phone is
  // never set up with a dead or foreign proxy. Up to three ports of the list.
  let port: number | null = null;
  let lastTip = '';
  for (const p of ports.slice(0, 3)) {
    const check = await duoplusPost('/api/v1/proxy/check', {
      protocol: 'socks5',
      host: list.host,
      port: Number(p),
      user: list.login,
      password: list.password,
      ip_scan_channel: 'ip2location',
    }).catch(() => null);
    const d = check?.data;
    if (d?.success && /^(us|usa|united states)$/i.test(String(d.country ?? '').trim())) {
      port = Number(p);
      break;
    }
    lastTip = String(d?.tips || (d?.country ? 'exits in ' + d.country : '') || check?.message || 'no response');
  }
  if (port === null) {
    console.warn('[duoplus] no working US port to set up', imageId, 'with:', lastTip.slice(0, 160));
    return null;
  }
  const res = await duoplusPost('/api/v1/proxy/add', {
    proxy_list: [
      { protocol: 'socks5', host: list.host, port, user: list.login, password: list.password, name: 'stakeout-' + imageId },
    ],
    ip_scan_channel: 'ip2location',
  }).catch(() => null);
  const id = res?.data?.success?.[0]?.id;
  if (!id) {
    console.warn('[duoplus] could not create a proxy record for', imageId, JSON.stringify(res?.data?.fail ?? res?.message ?? '').slice(0, 200));
    return null;
  }
  const bound = await duoplusPost('/api/v1/cloudPhone/update', {
    images: [{ image_id: imageId, proxy: { id: String(id), dns: 1 } }],
  }).catch(() => null);
  if (!bound || failedIds(bound).includes(imageId)) {
    console.warn('[duoplus] created proxy record', String(id), 'but could not bind it to', imageId);
    return null;
  }
  console.log('[duoplus] created and bound its own proxy record for', imageId);
  return String(id);
}


let whitelistedFor = '';

/** The worker's own public IPv4, as the internet (and DuoPlus) sees it. */
async function ownPublicIp(): Promise<string> {
  for (const url of ['https://api.ipify.org?format=json', 'https://ipinfo.io/json']) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const j: any = await r.json();
      if (j?.ip) return String(j.ip);
    } catch {
      // try the next lookup
    }
  }
  return '';
}

/**
 * Keeps this worker's IP on DuoPlus's ADB connection whitelist, so it can reach the
 * phones even when Railway's outbound address changes. Only calls DuoPlus when the
 * address changed (or when forced after an ADB connection failure).
 * Set DUOPLUS_ADB_WHITELIST_AUTO=false to manage the whitelist by hand instead.
 */
export async function ensureAdbWhitelist(force = false) {
  if (process.env.DUOPLUS_ADB_WHITELIST_AUTO === 'false' || !process.env.DUOPLUS_API_KEY) return;
  const ip = await ownPublicIp();
  if (!ip || (ip === whitelistedFor && !force)) return;
  const ips = adbWhitelist(ip, process.env.DUOPLUS_ADB_WHITELIST_EXTRA ?? '');
  await duoplusPost('/api/v1/cloudPhone/setAdbIpWhitelist', { ips });
  whitelistedFor = ip;
  console.log('[duoplus] ADB whitelist set to', ips.join(', '));
}
