import { randomUUID, createHash } from 'node:crypto';
import { db } from '@stakeout/db';
import { redis, duoplusPost } from '@stakeout/core/redis';
import { deviceMatchesProfile, leasableDeviceWhere } from '@stakeout/core/hardware';
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
export async function syncDuoPlusDevicePool() {
  if (!process.env.DUOPLUS_API_KEY) return;
  try {
    const online: any[] = [];
    let complete = false;
    for (let page = 1; page <= 20; page++) {
      const res = await duoplusPost('/api/v1/cloudPhone/list', {
        page,
        pagesize: PAGE_SIZE,
        link_status: ['1'],
        adb_status: ['1'],
      });
      const list: any[] = res?.data?.list ?? [];
      online.push(...list.filter((i) => i?.id && Number(i.status) === 1 && i.adb));
      if (list.length < PAGE_SIZE) {
        complete = true;
        break;
      }
    }
    const now = new Date();
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
      const proxyId = item.proxy_id ? String(item.proxy_id) : '';
      if (!proxyId || usedProxies.has(proxyId)) {
        console.warn('[duoplus] skipped new phone without a unique proxy binding', imageId);
        continue;
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

async function flushUpdates() {
  flushTimer = null;
  const batch = pendingUpdates.splice(0, 50);
  if (pendingUpdates.length) flushTimer = setTimeout(flushUpdates, 0);
  if (!batch.length) return;
  try {
    await duoplusPost('/api/v1/cloudPhone/update', { images: batch.map((b) => b.item) });
    batch.forEach((b) => b.resolve());
  } catch (e) {
    if (batch.length === 1) return batch[0].reject(e);
    for (const b of batch) {
      try {
        await duoplusPost('/api/v1/cloudPhone/update', { images: [b.item] });
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
  return devices.filter((d) => deviceMatchesProfile(d, phoneModel));
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
