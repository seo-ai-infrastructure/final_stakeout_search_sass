import { failureCode } from '@stakeout/core/fleetHealth';
import { evidenceOf, failureKind, parseEntries, refusedRun, refusedSummary, stageSeconds, timingLine, timingSummary, REFUSED_KEEP, REFUSED_KEY, TIMINGS_KEEP, TIMINGS_KEY, type Marks, type RefusedRun, type RunTiming } from '@stakeout/core/runLog';
import { backfillInsights, backfillPackRanks } from './insightsBackfill';
import 'dotenv/config';
import { Queue, Worker, DelayedError, UnrecoverableError, type Job } from 'bullmq';
import { db } from '@stakeout/db';
import { registerStakeoutSchedule } from '@stakeout/core/scheduleHelper';
import {
  redis,
  createRedisClient,
  redactRedisUrl,
  duoplusSlotStats,
} from '@stakeout/core/redis';
import { cloneScheduledRun, settlePin, stopScan, RERUN_MARKER } from '@stakeout/core/scans';
import { listsForPin, releaseIdleProxyLists, residentPackage } from '@stakeout/core/proxyLists';
import { describeRpaTemplates, rpaTemplate, clearTemplateCache } from './rpa';
import { getSettings } from '@stakeout/core/settings';
import { acquireDeviceLease, autoResumePhones, autoResumeSettings, recordDeviceOutcome, syncDuoPlusDevicePool, phonePowerStatus, ensureAdbWhitelist, readyPhoneCount, type LeasedDevice } from './duoplus';
import { targetConcurrency } from '@stakeout/core/concurrency';
import { measureDesktop } from './desktop';
import { measureMobile } from './mobile';
import { powerTick, powerReport } from './power';
import { idleProxyReport, idleProxyTick, leftIdle } from './idleProxy';
import { isProxyProblem, outageKey, pinOutageKey, proxyRetryDelay, trafficLow } from '@stakeout/core/proxyWait';
import { pinNetwork } from '@stakeout/core/network';
import { proxyProviders } from '@stakeout/core/decodo';
import { mobileProvider, voidmobUsage } from '@stakeout/core/voidmob';
import { claimProxyProbe, clearProxyOutage, noteProxyOutage, proxyOutageSince } from './proxyOutage';

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
/** How long a point keeps waiting for a working proxy before it is given up (and refunded). */
const PROXY_WAIT_MS = Number(process.env.PROXY_WAIT_HOURS ?? 24) * 3600000;

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
    // While this state's proxies are all down, one point at a time checks whether they are back;
    // the rest wait here, without taking a phone or calling DuoPlus.
    const region = pinOutageKey(pin);
    if (region && Date.now() - job.timestamp < PROXY_WAIT_MS && (await proxyOutageSince(region)) && !(await claimProxyProbe(region, pin.id))) {
      await job.moveToDelayed(Date.now() + 60000 + Math.floor(Math.random() * 30000), token);
      throw new DelayedError();
    }
    // A phone already on this point's Proxy-Seller list is preferred (home internet only).
    const preferred = pin.scan.proxyRegion && pinNetwork(pin.scan.network, pin.rowIdx, pin.colIdx) === 'residential' ? (await listsForPin(pin.scan, pin))[0]?.id : null;
    // A retry goes to another phone when one is free (the phone it failed on is tried last).
    const lease = await acquireDeviceLease(pin.id, pin.scan.phoneModel, preferred, typeof job.data.lastPhone === 'string' ? job.data.lastPhone : null);
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
    // Its idle proxy (if it had one) is over: this point binds the phone's own search proxy.
    await leftIdle(d.imageId);
    // A phone handed back early may still have its last point's evidence being pulled (only when
    // its rest is shorter than that): wait for it, then make sure that point did not end in a
    // captcha cooldown or a pause meanwhile.
    const tail = phoneTails.get(d.imageId);
    if (tail) {
      await Promise.race([tail, new Promise((r) => setTimeout(r, 90000))]);
      const now = await db.devicePool.findUnique({ where: { imageId: d.imageId }, select: { cooldownUntil: true, autoPausedAt: true } });
      if (now && (now.cooldownUntil > new Date() || now.autoPausedAt)) {
        await d.release();
        await job.moveToDelayed(Date.now() + 15000, token);
        throw new DelayedError();
      }
    }
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
    // This attempt's moments (for the timing record), and the early hand-back of the phone.
    const marks: Marks = {};
    const attemptStart = Date.now();
    let released = false;
    let measuring: Promise<unknown> | null = null;
    const phoneDone = async () => {
      if (released) return;
      await d.assertOwned();
      released = true;
      marks.released = Date.now();
      // Never let a failed write keep the lease: an unreleased lease would hold the phone for good.
      await restPhone(d.imageId).catch(() => {});
      await d.release().catch(() => {});
      if (measuring) {
        const t: Promise<unknown> = measuring.catch(() => {}).finally(() => {
          if (phoneTails.get(d.imageId) === t) phoneTails.delete(d.imageId);
        });
        phoneTails.set(d.imageId, t);
      }
    };
    try {
      const run = measureMobile(pin, d, { marks, phoneDone });
      measuring = run;
      const result = await run;
      if (!released) await d.assertOwned();
      await settlePin(pin.id, { data: result });
      await recordDeviceOutcome(d.imageId, null).catch(() => {});
    } catch (e) {
      pinError = e;
      await recordDeviceOutcome(d.imageId, failureCode(e), failureKind(e)).catch(() => {});
      // Every search that ran and was rejected is listed for the admin page, with its video.
      if (searched(e) && !/^CANCELLED/.test(e instanceof Error ? e.message : '')) {
        await noteRefused(pin, d, e, job.attemptsMade + 1, attemptStart).catch((err) => console.warn('[refused] not listed:', (err as Error).message));
        await job.updateData({ ...job.data, lastPhone: d.imageId }).catch(() => {});
      }
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
      if (!released) {
        if (searched(pinError)) await restPhone(d.imageId).catch(() => {});
        await d.release();
      }
      await noteTiming(pin, d.imageId, attemptStart, marks, pinError).catch(() => {});
    }
  } catch (e) {
    if (e instanceof DelayedError) throw e;
    const msg = e instanceof Error ? e.message : 'PIN_FAILED';
    // A proxy problem never fails a point: it goes back in the queue (no attempt used, nothing
    // refunded, nothing shown to the customer) and tries again, on whichever phone is free, until
    // a proxy works. The ladder (own town, nearest towns, then anywhere in the state) is tried
    // anew each time. Only after PROXY_WAIT_HOURS is the point given up.
    if (isProxyProblem(msg)) {
      const since = Number(job.data.proxyWaitSince) || Date.now();
      if (Date.now() - since < PROXY_WAIT_MS) {
        const waits = (Number(job.data.proxyWaits) || 0) + 1;
        const outage = msg.startsWith('PROXY_SUPPLY_DOWN');
        const key = pinOutageKey(pin);
        if (outage && key) {
          const down = await noteProxyOutage(key);
          console.warn('[proxy] every proxy in', key, 'is refused or dead since', down, '- points wait for them (out of traffic?)');
        } else if (key && !msg.startsWith('PROXY_LIST_MISSING')) {
          // Some port answered (wrong place, busy IP...): the proxies themselves are working.
          await clearProxyOutage(key);
        }
        await job.updateData({ ...job.data, proxyWaitSince: since, proxyWaits: waits });
        console.warn('[proxy] point', pin.id, 'waits for a working proxy, try', waits + ':', msg.slice(0, 140));
        await job.moveToDelayed(Date.now() + proxyRetryDelay(waits, outage), token);
        throw new DelayedError();
      }
      await settlePin(pin.id, { error: 'PROXY_UNAVAILABLE ' + msg.slice(0, 160) });
      throw new UnrecoverableError(msg);
    }
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
    // One point at a time per ready phone: set properly after each fleet check (followFleet).
    concurrency: targetConcurrency(null, process.env.MOBILE_CONCURRENCY).n,
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

/** Phones handed back before their evidence was pulled: the next point on one waits for this. */
const phoneTails = new Map<string, Promise<unknown>>();

/**
 * The latest attempts and rejected searches, kept in memory for the System health summary (one
 * small record a minute instead of every admin page reading the whole lists); loaded from Redis at
 * start so a restart keeps the history.
 */
const recentTimings: RunTiming[] = [];
const recentRefused: RefusedRun[] = [];
const remember = <T,>(list: T[], x: T, keep: number) => {
  list.push(x);
  if (list.length > keep) list.splice(0, list.length - keep);
};
async function loadRunLog() {
  const [t, r] = await Promise.all([redis().lrange(TIMINGS_KEY, 0, -1), redis().lrange(REFUSED_KEY, 0, -1)]);
  // Redis holds them newest first; memory oldest first. Anything noted meanwhile stays last.
  recentTimings.unshift(...parseEntries<RunTiming>(t).reverse());
  recentRefused.unshift(...parseEntries<RefusedRun>(r).reverse());
  recentTimings.splice(0, Math.max(0, recentTimings.length - TIMINGS_KEEP));
  recentRefused.splice(0, Math.max(0, recentRefused.length - REFUSED_KEEP));
}

type PinWithScan = NonNullable<Awaited<ReturnType<typeof db.gridPin.findUnique<{ where: { id: string }; include: { scan: true } }>>>>;

/** A search that ran and was rejected: listed (newest first) for the admin page, with its video and bundle. */
async function noteRefused(pin: PinWithScan, d: LeasedDevice, e: unknown, attempt: number, start: number) {
  const ev = evidenceOf(e);
  const entry = refusedRun({
    pinId: pin.id,
    scanId: pin.scanId,
    point: `${pin.rowIdx + 1},${pin.colIdx + 1}`,
    keyword: pin.scan.keyword,
    phone: d.imageId,
    model: d.hardwareModel ?? null,
    attempt,
    kind: failureKind(e),
    message: e instanceof Error ? e.message : String(e),
    template: ev?.template ?? null,
    locationPath: ev?.locationPath ?? null,
    video: ev?.video ?? null,
    bundle: ev?.bundle ?? null,
    seconds: Math.round((Date.now() - start) / 1000),
  });
  remember(recentRefused, entry, REFUSED_KEEP);
  await redis().multi().lpush(REFUSED_KEY, JSON.stringify(entry)).ltrim(REFUSED_KEY, 0, REFUSED_KEEP - 1).exec();
  console.warn('[refused]', entry.kind, '· point', entry.point, 'of scan', pin.scanId, 'on', d.imageId, '· attempt', attempt, '· evidence:', [entry.video && 'video', entry.bundle && 'bundle'].filter(Boolean).join(' + ') || 'none');
}

/** Where this attempt's time went: one log line, and a list for the admin page. */
async function noteTiming(pin: PinWithScan, imageId: string, start: number, marks: Marks, error: unknown) {
  const t = stageSeconds(start, marks, Date.now());
  const entry: RunTiming = { ...t, at: new Date().toISOString(), pinId: pin.id, phone: imageId, ok: !error, kind: error ? failureKind(error) : null, searched: Boolean(error) && searched(error) };
  remember(recentTimings, entry, TIMINGS_KEEP);
  console.log('[timing] point', `${pin.rowIdx + 1},${pin.colIdx + 1}`, 'on', imageId, error ? 'failed (' + entry.kind + ')' : 'ok', '·', timingLine(t));
  await redis().multi().lpush(TIMINGS_KEY, JSON.stringify(entry)).ltrim(TIMINGS_KEY, 0, TIMINGS_KEEP - 1).exec();
}

/**
 * A rest after every search on a phone (SEARCH_GAP_SECONDS, randomised); never shortens a longer one.
 * A shorter gap protects itself: after a captcha that phone rests the safe gap
 * (SEARCH_GAP_SAFE_SECONDS, default 120 s) for six hours, and two captchas within an hour
 * anywhere put the whole fleet back on the safe gap for six hours.
 */
async function restPhone(imageId: string) {
  // An admin can change the pause from the Device fleet page; it applies within about 15 seconds.
  let base = (await getSettings()).searchGapSeconds;
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
let templatesReadAt = Date.now(),
  templatesReloadSeen = 0,
  trafficAt = 0,
  traffic: { limitBytes: number | null; usedBytes: number | null; leftBytes: number | null; todayBytes: number | null; expires: string | null; at: string } | null = null,
  mobileTrafficAt = 0,
  mobileTraffic: { leftBytes: number | null; todayBytes: number | null; limitBytes: number | null; at: string } | null = null;

async function openProxyOutages() {
  const open = await db.gridScan.findMany({
    where: { status: { in: ['QUEUED', 'RUNNING'] } },
    select: { proxyRegion: true, stateCode: true, network: true },
    distinct: ['proxyRegion', 'stateCode', 'network'],
  });
  // A mix can be held up on either network.
  const keys = [...new Set(open.flatMap((s) => (s.network === 'mix' ? (['residential', 'mobile'] as const).map((network) => outageKey({ ...s, network })) : [outageKey(s)])).filter((k): k is string => Boolean(k)))];
  const down: { region: string; since: string }[] = [];
  for (const key of keys) {
    const since = await proxyOutageSince(key);
    if (since) down.push({ region: key, since });
  }
  return down;
}

async function reportHealth() {
  // Templates are re-read when an admin asks (stakeout:templates:reload) and every 10 minutes
  // anyway, so importing a template into DuoPlus never needs a worker restart.
  const asked = Number((await redis().get('stakeout:templates:reload').catch(() => null)) ?? 0);
  if (asked > templatesReloadSeen || Date.now() - templatesReadAt > 10 * 60000) {
    templatesReloadSeen = Math.max(asked, templatesReloadSeen);
    clearTemplateCache();
    templatesReadAt = Date.now();
  }
  // Proxy traffic, every 10 minutes (the API is rate-limited): the day's first reading is kept, so
  // "used today" is the difference.
  // Mobile data left on the VoidMob package, every 10 minutes (VOIDMOB_API_KEY + VOIDMOB_PROXY_ID).
  if (process.env.VOIDMOB_API_KEY && process.env.VOIDMOB_PROXY_ID && Date.now() - mobileTrafficAt > 10 * 60000) {
    mobileTrafficAt = Date.now();
    const u = await voidmobUsage().catch(() => null);
    if (u) mobileTraffic = { ...u, at: new Date().toISOString() };
  }
  if (process.env.PROXY_SELLER_API_KEY && Date.now() - trafficAt > 10 * 60000) {
    trafficAt = Date.now();
    const p = await residentPackage().catch(() => null);
    if (p && p.usedBytes !== null) {
      const dayKey = 'stakeout:traffic:' + new Date().toISOString().slice(0, 10);
      await redis().set(dayKey, String(p.usedBytes), 'EX', 3 * 86400, 'NX').catch(() => {});
      const first = Number((await redis().get(dayKey).catch(() => null)) ?? p.usedBytes);
      traffic = { limitBytes: p.limitBytes, usedBytes: p.usedBytes, leftBytes: p.leftBytes, todayBytes: Math.max(0, p.usedBytes - first), expires: p.expires, at: new Date().toISOString() };
    }
  }
  const template = async (surface: 'chrome' | 'maps' | 'google') => {
    const t = await rpaTemplate(surface).catch(() => null);
    const v = t?.vars.find((x) => x.key === 'template_version')?.value;
    return t ? { id: t.id, name: t.name, version: v == null || v === '' ? null : String(v) } : null;
  };
  const health = {
    at: new Date().toISOString(),
    proxySellerKey: Boolean(process.env.PROXY_SELLER_API_KEY),
    searchGapSeconds: (await getSettings()).searchGapSeconds,
    templatesReadAt: new Date(templatesReadAt).toISOString(),
    traffic,
    // Under PROXY_TRAFFIC_WARN_GB, or less than a day at today's pace: buy more before it runs out.
    trafficLow: trafficLow(traffic),
    // States whose proxies are all down right now, and since when (points there are waiting).
    proxyDown: await openProxyOutages(),
    // The proxy providers in use, in the order they are tried (PROXY_PROVIDERS).
    proxyProviders: proxyProviders(),
    // Mobile data scans need the Decodo mobile login on the worker.
    mobileData: Boolean(mobileProvider()),
    mobileProvider: mobileProvider(),
    mobileTraffic,
    // Under MOBILE_TRAFFIC_WARN_GB (half a GB unless set), or less than a day at today's pace.
    mobileTrafficLow: trafficLow(mobileTraffic, Number(process.env.MOBILE_TRAFFIC_WARN_GB ?? 0.5)),
    templates: { chrome: await template('chrome'), maps: await template('maps'), google: await template('google') },
    // DuoPlus allows about one request a second for the whole account: how busy that line is.
    duoplus: duoplusSlotStats(),
    // Where the time goes in a search, and what was rejected (admin page).
    runs: {
      timing2h: timingSummary(recentTimings, Date.now() - 2 * 3600000),
      timing6h: timingSummary(recentTimings, Date.now() - 6 * 3600000),
      refused1h: refusedSummary(recentRefused, Date.now() - 3600000),
      refused24h: refusedSummary(recentRefused, Date.now() - 86400000),
    },
    // Auto-paused phones are resumed on probation after this many minutes, this many times a day.
    autoResume: autoResumeSettings(),
    // Throughput: phones ready at the last fleet check, and how many points run at once.
    phonesReady: readyPhoneCount(),
    concurrency: deviceWorker.concurrency,
    // Power saving: phones on, points waiting, and when the phones will be switched off.
    power: powerReport(),
    // Idle proxies (IDLE_PROXY_GROUP): how many phones have one and are on it now.
    idleProxies: idleProxyReport(),
    concurrencyCeiling: targetConcurrency(readyPhoneCount(), process.env.MOBILE_CONCURRENCY).capped ? Number(process.env.MOBILE_CONCURRENCY) : null,
    proxyLists: await db.proxyList.count(),
    // How long the longest-idle list has gone unused. Idle lists are deleted after two minutes
    // with no scan open, so only a list idle for much longer than that is a problem.
    proxyListIdleSeconds: await db.proxyList
      .aggregate({ _min: { lastUsedAt: true } })
      .then((r) => (r._min.lastUsedAt ? Math.round((Date.now() - r._min.lastUsedAt.getTime()) / 1000) : 0)),
    openScans: await db.gridScan.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }),
    pointsWithoutInsights: Number(
      (await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "GridPin" WHERE status = 'COMPLETED' AND insights IS NULL AND "dumpsTarUrl" IS NOT NULL`)[0]?.n ?? 0,
    ),
  };
  await redis().set('stakeout:health', JSON.stringify(health), 'EX', 900);
}

/**
 * Runs one point at a time per ready phone, so a phone added to (or lost from) the fleet changes
 * the throughput by itself. Points already running are not interrupted when the number drops.
 */
function followFleet() {
  const ready = readyPhoneCount();
  const { n, capped } = targetConcurrency(ready, process.env.MOBILE_CONCURRENCY);
  if (n === deviceWorker.concurrency) return;
  const was = deviceWorker.concurrency;
  deviceWorker.concurrency = n;
  console.log(`[fleet] running up to ${n} point(s) at once (was ${was}) · ${ready ?? '?'} phone(s) ready` + (capped ? ` · held down by MOBILE_CONCURRENCY=${process.env.MOBILE_CONCURRENCY}` : ''));
}

let lastWhitelistFix = 0;
let busy = false,
  lastRepair = Date.now(),
  lastProxyRelease = 0,
  lastInsightsBackfill = Date.now(),
  lastFleetSync = 0,
  lastPowerLook = 0,
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
      void backfillPackRanks().catch((e) => console.warn('[rank] re-read skipped:', (e as Error).message));
    }
    // Once a minute: with no scan queued or running, proxy lists are deleted (idle phones still use bandwidth).
    if (Date.now() - lastProxyRelease > 60000) {
      lastProxyRelease = Date.now();
      await releaseIdleProxyLists().catch((e) => console.warn('[proxy] release skipped:', (e as Error).message));
      await autoResumePhones().catch((e) => console.warn('[duoplus] auto-resume skipped:', (e as Error).message));
      await reportHealth().catch((e) => console.warn('[health] not reported:', (e as Error).message));
    }
    if (Date.now() - lastRepair > 300000) {
      lastRepair = Date.now();
      await reconcile();
    }
    // Power saving (admin setting): phones start when points are waiting and stop when the queue
    // has been empty for a while. A change in what is on brings the fleet check forward.
    if (Date.now() - lastPowerLook > 30000) {
      lastPowerLook = Date.now();
      const changed = await powerTick().catch((e) => (console.warn('[power] skipped:', (e as Error).message), false));
      if (changed) lastFleetSync = 0;
      // Nothing waiting: idle phones move to their own cheap proxy (IDLE_PROXY_GROUP).
      await idleProxyTick().catch((e) => console.warn('[idle] skipped:', (e as Error).message));
    }
    // Picks up newly rented phones (and bootstraps them) without an admin click.
    // Runs in the background so bootstrapping new phones never delays dispatch.
    if (!fleetSyncRunning && Date.now() - lastFleetSync > Number(process.env.FLEET_SYNC_MINUTES ?? 5) * 60000) {
      lastFleetSync = Date.now();
      fleetSyncRunning = true;
      void syncDuoPlusDevicePool().finally(() => {
        fleetSyncRunning = false;
        followFleet();
      });
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
  backfillPackRanks().catch((e) => console.error('[rank] re-read skipped:', (e as Error).message));
}, 60_000);
void loadRunLog().catch((e) => console.warn('[runs] history not loaded:', (e as Error).message));
if ((process.env.SEARCH_MODE ?? '').toLowerCase() === 'rpa') {
  console.info('[rpa] SEARCH_MODE=rpa: the search step runs your DuoPlus RPA template');
  void describeRpaTemplates();
}
