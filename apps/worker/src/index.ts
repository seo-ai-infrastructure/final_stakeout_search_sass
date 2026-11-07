import { failureCode } from '@stakeout/core/fleetHealth';
import 'dotenv/config';
import { Queue, Worker, DelayedError, type Job } from 'bullmq';
import { db } from '@stakeout/db';
import { registerStakeoutSchedule } from '@stakeout/core/scheduleHelper';
import {
  redis,
  createRedisClient,
  redactRedisUrl,
} from '@stakeout/core/redis';
import { cloneScheduledRun, settlePin } from '@stakeout/core/scans';
import { listsForPin } from '@stakeout/core/proxyLists';
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
    try {
      const result = await measureMobile(pin, d);
      await d.assertOwned();
      await settlePin(pin.id, { data: result });
      await recordDeviceOutcome(d.imageId, null).catch(() => {});
    } catch (e) {
      await recordDeviceOutcome(d.imageId, failureCode(e)).catch(() => {});
      // Can't reach the phone over ADB: our outbound IP may have changed. Re-whitelist it.
      if (e instanceof Error && e.message.startsWith('ADB_CONNECT_FAILED') && Date.now() - lastWhitelistFix > 60000) {
        lastWhitelistFix = Date.now();
        await ensureAdbWhitelist(true).catch(() => {});
      }
      if (e instanceof Error && e.message === 'FLAG_CAPTCHA_DETECTED')
        await db.devicePool.update({
          where: { imageId: d.imageId },
          data: { cooldownUntil: new Date(Date.now() + 35 * 60000) },
        });
      throw e;
    } finally {
      await d.release();
    }
  } catch (e) {
    if (e instanceof DelayedError) throw e;
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
    select: { id: true },
  });
  for (const p of pending) {
    const job = await pins.getJob(p.id);
    if (!job)
      await pins.add(
        'measure',
        { pinId: p.id },
        { ...jobOptions, jobId: p.id },
      );
    else if ((await job.getState()) === 'failed')
      await settlePin(p.id, {
        error: job.failedReason || 'WORKER_INTERRUPTED',
      });
    await db.gridPin.updateMany({
      where: { id: p.id, status: 'PENDING' },
      data: { updatedAt: new Date() },
    });
  }
}

let lastWhitelistFix = 0;
let busy = false,
  lastRepair = Date.now(),
  lastFleetSync = 0,
  fleetSyncRunning = false;

/** Bring the next fleet sync forward to ~30 s from now (at most once a minute). */
function syncSoon() {
  const every = Number(process.env.FLEET_SYNC_MINUTES ?? 5) * 60000;
  if (Date.now() - lastFleetSync > 60000) lastFleetSync = Math.min(lastFleetSync, Date.now() - every + 30000);
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    await dispatch();
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
