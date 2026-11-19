import { randomBytes } from 'node:crypto';
import { db, Prisma } from '@stakeout/db';
import {
  buildGrid,
  campaignId,
  InputError,
  metrics,
  parseSpec,
  scheduleCron,
  type ScanSpec,
} from './grid';
import { ispForPin } from './proxyGeo';
import { RERUN_MARKER, rerunCharge, rerunIsp } from './rerun';
import { nudgeAlerts, pushAlert, scanAlert } from './alerts';
import { creditsPerPoint, getSettings } from './settings';
import { pointPrice, scanCost } from './network';

export async function createScan(
  userId: string,
  s: ScanSpec,
  key: string,
  lead?: { email: string; holdForEmail?: boolean },
  templatePins?: ReturnType<typeof buildGrid>,
  opts?: { free?: boolean; /** A repeating scan's own schedule (see fixedCron), in place of the usual hour. */ cron?: string },
) {
  const prior = await db.gridScan.findUnique({ where: { requestKey: key } });
  if (prior) {
    if (prior.userId !== userId || prior.campaignId !== campaignId(userId, s))
      throw new InputError(
        'Request key already used for a different scan.',
        409,
      );
    return prior;
  }
  const pins = templatePins ?? buildGrid(s),
    // The grid's centre point; a grid with skipped points still has it (it can never be skipped).
    mid = (s.gridSize - 1) / 2,
    middle = pins.find((p) => p.rowIdx === mid && p.colIdx === mid) ?? pins[Math.floor((pins.length - 1) / 2)];
  // One credit per grid point, or the mobile-data price per point on a mobile scan (an admin
  // setting, 2 by default). AI Overview tracking is part of every Chrome scan, not an add-on.
  const cost = lead || opts?.free ? 0 : s.network === 'residential' ? pins.length : scanCost(s.network, pins, creditsPerPoint('mobile', await getSettings()));
  try {
    return await db.$transaction(
      async (tx) => {
        const scan = await tx.gridScan.create({
          data: {
            ...s,
            userId,
            requestKey: key,
            campaignId: campaignId(userId, s),
            leadEmail: lead?.email,
            // Teasers can be held until the lead confirms the inbox (released by /api/auth/verify).
            ...(lead?.holdForEmail ? { status: 'AWAITING_EMAIL' } : {}),
            shareToken: lead ? randomBytes(24).toString('hex') : null,
            scheduleCron: (s.scheduleType !== 'once' && opts?.cron) || scheduleCron(s.scheduleType),
            totalPins: pins.length,
            creditsCharged: cost,
            zip: middle.zip,
            city: middle.city,
            stateCode: middle.stateCode,
            // Each grid point gets a fixed ISP; mixed grids spread the chosen ISPs.
            pins: {
              create: pins.map((pin) => ({
                ...pin,
                isp: ispForPin(s.ispMode, s.isps, pin.rowIdx, pin.colIdx, s.gridSize),
              })),
            },
          },
        });
        if (cost) {
          const debit = await tx.user.updateMany({
            where: { id: userId, creditBalance: { gte: cost } },
            data: { creditBalance: { decrement: cost } },
          });
          if (debit.count !== 1)
            throw new InputError('Insufficient credits for this scan.', 402);
          await tx.creditLedger.create({
            data: {
              userId,
              amount: -cost,
              reason: key.startsWith('cron:') ? 'RECURRING_HOLD' : 'SCAN_HOLD',
              scanId: scan.id,
            },
          });
        }
        return scan;
      },
      { timeout: 20000 },
    );
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      const existing = await db.gridScan.findUnique({
        where: { requestKey: key },
      });
      if (
        existing &&
        existing.campaignId === campaignId(userId, s) &&
        existing.userId === userId
      )
        return existing;
      if (existing)
        throw new InputError(
          'Request key already used for a different scan.',
          409,
        );
    }
    throw e;
  }
}

export async function settlePin(
  pinId: string,
  result: { data: Prisma.GridPinUpdateManyMutationInput } | { error: string },
) {
  // Set when this point was the scan's last: the scan it finished.
  let finished: string | null = null;
  await db.$transaction(
    async (tx) => {
      const pin = await tx.gridPin.findUniqueOrThrow({
        where: { id: pinId },
        include: { scan: true },
      });
      const failed = 'error' in result;
      // A failed point gives back what it cost (in a mixed network, mobile and home-internet points differ).
      const refund = !failed
        ? 0
        : pin.scan.network === 'mix'
          ? pointPrice(pin.scan, await tx.gridPin.findMany({ where: { scanId: pin.scanId }, select: { rowIdx: true, colIdx: true } }))(pin)
          : pin.scan.creditsCharged / pin.scan.totalPins;
      const update = await tx.gridPin.updateMany({
        where: { id: pinId, status: 'PENDING' },
        data: failed
          ? {
              status: 'FAILED',
              lastError: result.error.slice(0, 200),
              isRefunded: refund > 0,
            }
          : { ...result.data, status: 'COMPLETED' },
      });
      if (!update.count) return;
      const scan = await tx.gridScan.update({
        where: { id: pin.scanId },
        data: failed
          ? {
              failedPins: { increment: 1 },
              creditsRefunded: { increment: refund },
            }
          : { completedPins: { increment: 1 } },
      });
      if (refund) {
        await tx.creditLedger.create({
          data: {
            userId: scan.userId,
            amount: refund,
            reason: 'PIN_REFUND',
            pinId,
            scanId: scan.id,
          },
        });
        await tx.user.update({
          where: { id: scan.userId },
          data: { creditBalance: { increment: refund } },
        });
      }
      if (scan.completedPins + scan.failedPins === scan.totalPins) {
        const completed = await tx.gridPin.findMany({
          where: { scanId: scan.id, status: 'COMPLETED' },
          select: {
            rankFound: true,
            hasAiOverview: true,
            targetCitedInAi: true,
          },
        });
        await tx.gridScan.update({
          where: { id: scan.id },
          data: {
            ...metrics(completed),
            completedAt: new Date(),
            status: !completed.length
              ? 'FAILED'
              : scan.failedPins
                ? 'PARTIAL'
                : 'COMPLETED',
          },
        });
        finished = scan.id;
      }
    },
    { timeout: 20000 },
  );
  if (finished) await alertIfScanWentBadly(finished).catch((e) => console.warn('[alert] scan not checked:', (e as Error).message));
}

/** A scan that finished with many points failed (not stopped by its owner): one email to the admins. */
async function alertIfScanWentBadly(scanId: string) {
  const s = await db.gridScan.findUnique({ where: { id: scanId }, select: { id: true, keyword: true, targetBusiness: true, totalPins: true, failedPins: true, status: true } });
  if (!s || !s.failedPins) return;
  const reasons = await db.$queryRaw<{ code: string; n: number }[]>`
    SELECT COALESCE(substring("lastError" from '^[A-Z][A-Z_0-9]+'), 'OTHER') AS code, count(*)::int AS n
    FROM "GridPin" WHERE "scanId" = ${scanId} AND status = 'FAILED' GROUP BY 1`;
  const alert = scanAlert(s, reasons);
  if (alert && (await pushAlert('scan:' + scanId, alert, 6 * 3600))) await nudgeAlerts();
}

/** A delivered BullMQ schedule occurrence is a single billable scan, even on replay. */
export async function cloneScheduledRun(
  templateScanId: string,
  occurrenceId: string,
) {
  const template = await db.gridScan.findUnique({
    where: { id: templateScanId },
    include: {
      pins: {
        select: {
          rowIdx: true,
          colIdx: true,
          lat: true,
          lng: true,
          zip: true,
          city: true,
          stateCode: true,
        },
        orderBy: [{ rowIdx: 'asc' }, { colIdx: 'asc' }],
      },
    },
  });
  if (
    !template ||
    !template.scheduleCron ||
    template.scheduleCron.startsWith('PAUSED:')
  )
    return null;
  if (template.pins.length !== template.totalPins)
    throw new Error('Template pin count mismatch.');
  try {
    return await createScan(
      template.userId,
      { ...parseSpec(template), scheduleType: 'once' },
      'cron:' + template.id + ':' + occurrenceId,
      undefined,
      template.pins,
    );
  } catch (e) {
    if (!(e instanceof InputError) || e.status !== 402) throw e;
    await db.gridScan.updateMany({
      where: { id: template.id, scheduleCron: template.scheduleCron },
      data: { scheduleCron: 'PAUSED:' + template.scheduleCron },
    });
    return null;
  }
}

/**
 * Stops a scan: every point still pending is settled as failed with `reason` and refunded
 * through settlePin (which only acts on PENDING points, so nothing is refunded twice).
 * Points already completed are kept. Returns how many points were stopped.
 */
export async function stopScan(scanId: string, reason: string) {
  const pending = await db.gridPin.findMany({ where: { scanId, status: 'PENDING' }, select: { id: true } });
  for (const p of pending) await settlePin(p.id, { error: reason.slice(0, 200) });
  return pending.length;
}

export { RERUN_MARKER } from './rerun';

/**
 * Puts a scan's failed points (or the chosen ones) back in line. Points that had been refunded are
 * charged the normal price again, and refunded automatically if the re-run fails too. The scan
 * reopens, and the worker queues the points ahead of waiting ones within seconds.
 */
export async function requestRerun(scanId: string, userId: string, pinIds?: string[]) {
  return db.$transaction(
    async (tx) => {
      const scan = await tx.gridScan.findFirst({
        where: { id: scanId, userId },
        select: { id: true, creditsCharged: true, totalPins: true, ispMode: true, isps: true, network: true },
      });
      if (!scan) throw new InputError('Scan unavailable.', 404);
      const points = await tx.gridPin.findMany({
        where: { scanId, status: 'FAILED', ...(pinIds?.length ? { id: { in: pinIds } } : {}) },
        select: { id: true, isRefunded: true, isp: true, lastError: true, rowIdx: true, colIdx: true },
      });
      if (!points.length) throw new InputError('There are no failed points to re-run.', 400);
      // Each refunded point costs what it cost the first time (mixed networks: mobile and home points differ).
      const price =
        scan.network === 'mix'
          ? pointPrice(scan, await tx.gridPin.findMany({ where: { scanId }, select: { rowIdx: true, colIdx: true } }))
          : () => rerunCharge(points, scan.creditsCharged, scan.totalPins).perPoint;
      const credits = points.filter((p) => p.isRefunded).reduce((n, p) => n + price(p), 0);
      if (credits > 0) {
        const paid = await tx.user.updateMany({
          where: { id: userId, creditBalance: { gte: credits } },
          data: { creditBalance: { decrement: credits } },
        });
        if (!paid.count)
          throw new InputError(
            `Re-running ${points.length === 1 ? 'this point' : `${points.length} points`} needs ${credits} credits.`,
            402,
          );
      }
      for (const p of points.filter((x) => x.isRefunded)) {
        // One ledger row per point and reason: earlier refunds and re-runs keep numbered names.
        const n = (await tx.creditLedger.count({ where: { pinId: p.id, reason: { startsWith: 'PIN_RETRY' } } })) + 1;
        await tx.creditLedger.updateMany({ where: { pinId: p.id, reason: 'PIN_REFUND' }, data: { reason: `PIN_REFUND_${n}` } });
        await tx.creditLedger.create({ data: { userId, amount: -price(p), reason: `PIN_RETRY_${n}`, pinId: p.id, scanId } });
      }
      await tx.gridPin.updateMany({
        where: { id: { in: points.map((p) => p.id) }, status: 'FAILED' },
        data: { status: 'PENDING', lastError: RERUN_MARKER, isRefunded: false },
      });
      // A point that failed for want of a working proxy moves to another ISP of the mix.
      for (const p of points) {
        const isp = rerunIsp(p.isp, scan.ispMode, scan.isps, p.lastError);
        if (isp !== p.isp) await tx.gridPin.update({ where: { id: p.id }, data: { isp } });
      }
      await tx.gridScan.update({
        where: { id: scanId },
        data: { failedPins: { decrement: points.length }, creditsRefunded: { decrement: credits }, status: 'RUNNING', completedAt: null },
      });
      return { points: points.length, credits };
    },
    { timeout: 20000 },
  );
}
