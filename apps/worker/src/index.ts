import { failureCode } from '@stakeout/core/fleetHealth';
import { backfillInsights } from './insightsBackfill';
import 'dotenv/config';
import { Queue, Worker, DelayedError, UnrecoverableError, type Job } from 'bullmq';
import { db } from '@stakeout/db';
import { registerStakeoutSchedule } from '@stakeout/core/scheduleHelper';
import {
  redis,
  createRedisClient,
  redactRedisUrl,
} from '@stakeout/core/redis';
import { cloneScheduledRun, settlePin, stopScan, RERUN_MARKER } from '@stakeout/core/scans';
import { listsForPin, releaseIdleProxyLists } from '@stakeout/core/proxyLists';
import { describeRpaTemplates, rpaTemplate } from './rpa';
import { acquireDeviceLease, recordDeviceOutcome, syncDuoPlusDevicePool, phonePowerStatus, ensureAdbWhitelist } from './duoplus';
import { measureDesktop } from './desktop';
import { measureMobile } from './mobile';

function formatErr(e: unknown) {
  if (e instanceof Error) {
    const err = e as NodeJS.ErrnoException;
    return {
      name: err.name,
      message: err.message,
      code: err.code,
    };
  }
  return { message: String(e) };
}

const queueConnection = redis(),
  deviceWorkerConnection = createRedisClient('worker:stakeout-pins'),
  cronWorkerConnection = createRedisClient('worker:stakeout-recurring-schedules'),
  pins = new Queue('stakeout-pins', { connection: queueConnection }),
  schedules = new Queue('stakeout-recurring-schedules', {
    connection: queueConnection,
  });

/** Template failures (with no point completed) that stop a scan automatically. */
const AUTO_PAUSE_TEMPLATE_FAILS = Number(process.env.AUTO_PAUSE_TEMPLATE_FAILS ?? 3);
const NO_DEVICE_GRACE_MS = Number(process.env.NO_DEVICE_GRACE_MINUTES ?? 30) * 60000;

async function execute(job: Job, token?: string) {
  const pin = await db.gridPin.findUnique({
    where: { id: job.data.pinId },
    include: { scan: true },
  });
  if (!pin || pin.status !== 'PENDING') return;
  try {
    if (pin.scan.targetType === 'desktop_aimode') {
      await settlePin(pin.id, { data: await measureDesktop(pin) });
      return;
    }
    const preferred = pin.scan.proxyRegion ? (await listsForPin(pin.scan, pin))[0]?.id : null;
    const lease = await acquireDeviceLease(pin.id, pin.scan.phoneModel, preferred);
    if (!('device' in lease)) {
      const waited = Date.now() - job.timestamp;
      // No phone of the requested model exists: wait briefly in case one is
      // rebooting, then fail (and refund) rather than measure on other hardware.
      // No phone ready: look for (and set up) phones within ~30 s instead of waiting for the next 5-minute sync.
      if (lease.reason === 'NO_COMPATIBLE_DEVICE') syncSoon();
      if (lease.reason === 'NO_COMPATIBLE_DEVICE' && waited > NO_DEVICE_GRACE_MS) {
        await settlePin(pin.id, { error: 'NO_COMPATIBLE_DEVICE' });
        return;
      }
      if (waited > 86400000) {
        await settlePin(pin.id, { error: 'DEVICE_WAIT_TIMEOUT' });
        return;
      }
      await job.moveToDelayed(
        Date.now() + (lease.reason === 'BUSY' ? 25000 : 60000),
        token,
      );
      throw new DelayedError();
    }
    const d = lease.device;
    // Only ever measure on a phone that is powered on right now. If it was switched
    // off or expired since the last fleet sync, take it out of service and put this
    // point straight back in the queue for another phone: no credit used, no blame.
    const power = await phonePowerStatus(d.imageId);
    // Still applying settings (or booting): busy, not offline. Try again shortly, same phone stays in service.
    if (power && !power.on && (power.status === 'configuring' || power.status === 'powering on')) {
      await d.release();
      await job.moveToDelayed(Date.now() + 15000, token);
      throw new DelayedError();
    }
    if (power && !power.on) {
      console.warn('[duoplus] phone', d.imageId, 'is', power.status, '- taken out of service; point requeued');
      await db.devicePool.update({ where: { imageId: d.imageId }, data: { offlineAt: new Date() } }).catch(() => {});
      await d.release();
      await job.moveToDelayed(Date.now() + 5000, token);
      throw new DelayedError();
    }
    // First time a phone picks this pin up: the end of its queue wait.
    await db.gridPin.updateMany({
      where: { id: pin.id, startedAt: null },
      data: { startedAt: new Date() },
    });
    let pinError: unknown = null;
    try {
      const result = await measureMobile(pin, d);
      await d.assertOwned();
      await settlePin(pin.id, { data: result });
      await recordDeviceOutcome(d.imageId, null).catch(() => {});
    } catch (e) {
      pinError = e;
      await recordDeviceOutcome(d.imageId, failureCode(e)).catch(() => {});
      // Can't reach the phone over ADB: our outbound IP may have changed. Re-whitelist it.
      if (e instanceof Error && e.message.startsWith('ADB_CONNECT_FAILED') && Date.now() - lastWhitelistFix > 60000) {
        lastWhitelistFix = Date.now();
        await ensureAdbWhitelist(true).catch(() => {});
      }
      if (e instanceof Error && e.message === 'FLAG_CAPTCHA_DETECTED') {
        await db.devicePool.update({
          where: { imageId: d.imageId },
          data: { cooldownUntil: new Date(Date.now() + 35 * 60000) },
        });
        await noteCaptcha(d.imageId);
      }
      throw e;
    } finally {
      // Pace only real searches: setup failures (ADB, proxy, DuoPlus) don't need a rest.
      if (searched(pinError)) await restPhone(d.imageId);
      await d.release();
    }
  } catch (e) {
    if (e instanceof DelayedError) throw e;
    const msg = e instanceof Error ? e.message : 'PIN_FAILED';
    if (/^RPA_(SURFACE_ERROR|TASK_FAILED|TASK_TIMEOUT|TEMPLATE_NOT_FOUND|NO_KEYWORD_VARIABLE)/.test(msg)) {
      // The search template failed. If it keeps failing before any point has completed,
      // stop the whole scan (refunded) instead of retrying every point three times.
      const k = 'stakeout:tplfail:' + pin.scanId;
      const n = await redis().incr(k).catch(() => 0);
      if (n === 1) await redis().expire(k, 86400).catch(() => {});
      const done = (await db.gridScan.findUnique({ where: { id: pin.scanId }, select: { completedPins: true } }))?.completedPins ?? 0;
      if (n >= AUTO_PAUSE_TEMPLATE_FAILS && done === 0) {
        const stopped = await stopScan(pin.scanId, 'AUTO_PAUSED: the search template failed on the first points (' + msg.slice(0, 120) + ')');
        console.warn('[scan] auto-paused', pin.scanId, 'after', n, 'template failures;', stopped, 'points stopped and refunded');
        throw new UnrecoverableError(msg);
      }
      // One more try (usually on another phone), not three full searches.
      if (job.attemptsMade >= 1) {
        await settlePin(pin.id, { error: msg });
        throw new UnrecoverableError(msg);
      }
    }
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1))
      await settlePin(pin.id, {
        error: e instanceof Error ? e.message : 'PIN_FAILED',
      });
    throw e;
  }
}

async function repeat(job: Job) {
  if (!job.id) throw new Error('Scheduled job ID required.');
  await cloneScheduledRun(job.data.templateScanId, job.id);
}

const deviceWorker = new Worker('stakeout-pins', execute, {
    connection: deviceWorkerConnection,
    concurrency: Number(process.env.MOBILE_CONCURRENCY ?? 3),
    lockDuration: 300000,
    stalledInterval: 120000,
    drainDelay: 30,
  }),
  cronWorker = new Worker('stakeout-recurring-schedules', repeat, {
    connection: cronWorkerConnection,
    concurrency: 1,
    lockDuration: 120000,
    stalledInterval: 300000,
    drainDelay: 60,
  });

for (const w of [deviceWorker, cronWorker]) {
  w.on('error', (e) => console.error(w.name, formatErr(e)));
  w.on('failed', (job, e) =>
    console.error(w.name, 'job failed', job?.id, formatErr(e)),
  );
}

const jobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 4000 },
  removeOnComplete: true,
  removeOnFail: { age: 86400 },
};

async function dispatch() {
  const queued = await db.gridScan.findMany({
    where: { dispatchedAt: null, status: 'QUEUED' },
    include: { pins: { select: { id: true } } },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });
  for (const s of queued) {
    if (s.scheduleType !== 'once' && s.scheduleCron) {
      await registerStakeoutSchedule(
        schedules,
        s.id,
        s.scheduleCron.replace(/^PAUSED:/, ''),
      );
    }
    await pins.addBulk(
      s.pins.map((p) => ({
        name: 'measure',
        data: { pinId: p.id },
        opts: { ...jobOptions, jobId: p.id },
      })),
    );
    await db.gridScan.updateMany({
      where: { id: s.id, status: 'QUEUED' },
      data: { dispatchedAt: new Date(), status: 'RUNNING' },
    });
  }
}

async function reconcile() {
  // Only inspect pins untouched for >10 minutes so active scans do not spam Redis
  const staleCutoff = new Date(Date.now() - 10 * 60000);
  const pending = await db.gridPin.findMany({
    where: {
      status: 'PENDING',
      updatedAt: { lt: staleCutoff },
      scan: { status: 'RUNNING' },
    },
    orderBy: { updatedAt: 'asc' },
    take: 50,
    select: { id: true, updatedAt: true },
  });
  for (const p of pending) {
    const job = await pins.getJob(p.id);
    if (!job)
      await pins.add(
        'measure',
        { pinId: p.id },
        { ...jobOptions, jobId: p.id },
      );
    else if ((await job.getState()) === 'failed') {
      // A point put back to PENDING after its last attempt failed is a deliberate re-run:
      // clear the old job and queue it again, instead of settling the old failure.
      if (job.finishedOn && p.updatedAt.getTime() > job.finishedOn) {
        await job.remove();
        await pins.add('measure', { pinId: p.id }, { ...jobOptions, jobId: p.id });
        console.log('[reconcile] re-running point', p.id);
      } else
        await settlePin(p.id, {
          error: job.failedReason || 'WORKER_INTERRUPTED',
        });
    }
    await db.gridPin.updateMany({
      where: { id: p.id, status: 'PENDING' },
      data: { updatedAt: new Date() },
    });
  }
}

/** Whether a point got as far as searching (success, or a failure after the search began). */
function searched(e: unknown) {
  if (!e) return true;
  return !/^(ADB_|PROXY_|DuoPlus|DUOPLUS_|PHONE_|RPA_TEMPLATE|RPA_NO_KEYWORD|NO_COMPATIBLE|DEVICE_LEASE)/.test(failureCode(e));
}

/**
 * A rest after every search on a phone (SEARCH_GAP_SECONDS, randomised); never shortens a longer one.
 * A shorter gap protects itself: after a captcha that phone rests the safe gap
 * (SEARCH_GAP_SAFE_SECONDS, default 120 s) for six hours, and two captchas within an hour
 * anywhere put the whole fleet back on the safe gap for six hours.
 */
async function restPhone(imageId: string) {
  let base = Number(process.env.SEARCH_GAP_SECONDS ?? 120);
  const safe = Number(process.env.SEARCH_GAP_SAFE_SECONDS ?? 120);
  if (safe > base && (await redis().exists(`stakeout:gapsafe:${imageId}`, 'stakeout:gapsafe:all').catch(() => 0)))
    base = safe;
  if (!(base > 0)) return;
  const until = new Date(Date.now() + base * 1000 * (0.8 + Math.random() * 0.6));
  await db.devicePool.updateMany({ where: { imageId, cooldownUntil: { lt: until } }, data: { cooldownUntil: until } }).catch(() => {});
}
/** A captcha: this phone (and, past two in an hour, every phone) goes back to the safe gap for six hours. */
async function noteCaptcha(imageId: string) {
  const safe = Number(process.env.SEARCH_GAP_SAFE_SECONDS ?? 120);
  await redis().set(`stakeout:gapsafe:${imageId}`, '1', 'EX', 6 * 3600).catch(() => {});
  const n = await redis().incr('stakeout:captchas:lasthour').catch(() => 0);
  if (n === 1) await redis().expire('stakeout:captchas:lasthour', 3600).catch(() => {});
  if (n >= 2) await redis().set('stakeout:gapsafe:all', '1', 'EX', 6 * 3600).catch(() => {});
  const day = new Date().toISOString().slice(0, 10);
  await redis().incr('stakeout:captchas:' + day).catch(() => {});
  await redis().expire('stakeout:captchas:' + day, 30 * 86400).catch(() => {});
  console.warn(
    `[captcha] ${imageId}: back to the ${safe}s gap for 6 h` +
      (n >= 2 ? ` · ${n} captchas this hour, the whole fleet is on the safe gap for 6 h` : '') +
      ` (gap now ${process.env.SEARCH_GAP_SECONDS ?? 120}s)`,
  );
}

/**
 * What the admin page's "System health" card shows: written every minute, so a missing key or
 * template is visible there instead of only in the logs.
 */
async function reportHealth() {
  const template = async (surface: 'chrome' | 'maps') => {
    const t = await rpaTemplate(surface).catch(() => null);
    const v = t?.vars.find((x) => x.key === 'template_version')?.value;
    return t ? { id: t.id, name: t.name, version: v == null || v === '' ? null : String(v) } : null;
  };
  const health = {
    at: new Date().toISOString(),
    proxySellerKey: Boolean(process.env.PROXY_SELLER_API_KEY),
    searchGapSeconds: Number(process.env.SEARCH_GAP_SECONDS ?? 120),
    templates: { chrome: await template('chrome'), maps: await template('maps') },
    proxyLists: await db.proxyList.count(),
    openScans: await db.gridScan.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }),
    pointsWithoutInsights: Number(
      (await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "GridPin" WHERE status = 'COMPLETED' AND insights IS NULL AND "dumpsTarUrl" IS NOT NULL`)[0]?.n ?? 0,
    ),
  };
  await redis().set('stakeout:health', JSON.stringify(health), 'EX', 900);
}

let lastWhitelistFix = 0;
let busy = false,
  lastRepair = Date.now(),
  lastProxyRelease = 0,
  lastInsightsBackfill = Date.now(),
  lastFleetSync = 0,
  fleetSyncRunning = false;

/** Bring the next fleet sync forward to ~30 s from now (at most once a minute). */
function syncSoon() {
  const every = Number(process.env.FLEET_SYNC_MINUTES ?? 5) * 60000;
  if (Date.now() - lastFleetSync > 60000) lastFleetSync = Math.min(lastFleetSync, Date.now() - every + 30000);
}

/**
 * Points the owner asked to re-run (RERUN_MARKER): queued ahead of waiting points within seconds.
 * An old job left by the failed attempt is removed first, so it is never settled again.
 */
async function startReruns() {
  const asked = await db.gridPin.findMany({
    where: { status: 'PENDING', lastError: RERUN_MARKER },
    select: { id: true },
    take: 50,
  });
  for (const p of asked) {
    const old = await pins.getJob(p.id);
    if (old) {
      if ((await old.getState()) === 'active') continue;
      await old.remove().catch(() => {});
    }
    await pins.add('measure', { pinId: p.id }, { ...jobOptions, jobId: p.id, lifo: true });
    await db.gridPin.updateMany({ where: { id: p.id, status: 'PENDING', lastError: RERUN_MARKER }, data: { lastError: null } });
    console.log('[rerun] queued point', p.id);
  }
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    await dispatch();
    await startReruns();
    // Every 30 minutes: points still without insights get them from their stored bundles.
    if (Date.now() - lastInsightsBackfill > 30 * 60000) {
      lastInsightsBackfill = Date.now();
      void backfillInsights().catch((e) => console.warn('[insights] backfill skipped:', (e as Error).message));
    }
    // Once a minute: with no scan queued or running, proxy lists are deleted (idle phones still use bandwidth).
    if (Date.now() - lastProxyRelease > 60000) {
      lastProxyRelease = Date.now();
      await releaseIdleProxyLists().catch((e) => console.warn('[proxy] release skipped:', (e as Error).message));
      await reportHealth().catch((e) => console.warn('[health] not reported:', (e as Error).message));
    }
    if (Date.now() - lastRepair > 300000) {
      lastRepair = Date.now();
      await reconcile();
    }
    // Picks up newly rented phones (and bootstraps them) without an admin click.
    // Runs in the background so bootstrapping new phones never delays dispatch.
    if (!fleetSyncRunning && Date.now() - lastFleetSync > Number(process.env.FLEET_SYNC_MINUTES ?? 5) * 60000) {
      lastFleetSync = Date.now();
      fleetSyncRunning = true;
      void syncDuoPlusDevicePool().finally(() => (fleetSyncRunning = false));
    }
  } catch (e) {
    console.error('Dispatch will retry', formatErr(e));
  } finally {
    busy = false;
  }
}

const timer = setInterval(tick, 10000);
void tick();

async function close() {
  clearInterval(timer);
  await Promise.all([deviceWorker.close(), cronWorker.close()]);
  await Promise.all([pins.close(), schedules.close()]);
  await Promise.allSettled([
    queueConnection.quit(),
    deviceWorkerConnection.quit(),
    cronWorkerConnection.quit(),
  ]);
  await db.$disconnect();
}

process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
console.info(
  `Stakeout Telemetry Engine online · target=${redactRedisUrl()} · stakeout-pins + stakeout-recurring-schedules`,
);
// Points finished before per-point insights existed get them once, from their stored bundles.
setTimeout(() => {
  backfillInsights().catch((e) => console.error('[insights] backfill skipped:', (e as Error).message));
}, 60_000);
if ((process.env.SEARCH_MODE ?? '').toLowerCase() === 'rpa') {
  console.info('[rpa] SEARCH_MODE=rpa: the search step runs your DuoPlus RPA template');
  void describeRpaTemplates();
}
