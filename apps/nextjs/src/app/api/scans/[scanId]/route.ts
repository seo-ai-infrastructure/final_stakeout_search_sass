import { wakeWorker } from '@stakeout/core/wake';
import { brandForUser } from '@stakeout/core/brands';
import { randomBytes } from 'node:crypto';
import { db } from '@stakeout/db';
import { report } from '@/lib/reports';
import { getAuthenticatedUser, readScope } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { InputError, scheduleCron } from '@stakeout/core/grid';
import { scanBridge } from '@stakeout/core/upgradeTriggers';
import { dollars, unitCents } from '@stakeout/core/gbpPlans';
import { gbpOpen, paidLocations } from '@/lib/gbpAccess';
import { requestRerun, stopScan } from '@stakeout/core/scans';
import { deleteScanFiles } from '@stakeout/core/r2';
import { removeStakeoutSchedule } from '@stakeout/core/scheduleHelper';
type C = { params: Promise<{ scanId: string }> };

/**
 * For a customer's own finished 5×5 scan of a business that has no listing on the Manage plan: how
 * many points it missed the top three on, so the page can point at what would move them.
 */
async function bridgeFor(id: string, me: { id: string; role: string; email?: string }) {
  if (me.role === 'ADMIN' || !gbpOpen(me)) return null;
  const scan = await db.gridScan.findFirst({ where: { id, userId: me.id }, select: { status: true, totalPins: true, trackAiOverviews: true, targetBusiness: true, pins: { select: { status: true, rankFound: true, hasAiOverview: true, targetCitedInAi: true } } } });
  if (!scan) return null;
  const found = scanBridge(scan, scan.pins);
  if (!found) return null;
  const name = scan.targetBusiness.trim().toLowerCase();
  const paid = await paidLocations(me.id);
  const plans = paid.size ? await db.gbpPlan.findMany({ where: { userId: me.id, locationId: { in: [...paid.keys()] } }, select: { title: true } }) : [];
  if (plans.some((p) => (p.title ?? '').trim().toLowerCase() === name)) return null;
  return { ...found, business: scan.targetBusiness, monthly: dollars(unitCents('MANAGE', 1)) };
}
export async function GET(_: Request, c: C) {
  try {
    const id = (await c.params).scanId,
      me = await getAuthenticatedUser(),
      data = await report({ id, ...readScope(me) }, { admin: me.role === 'ADMIN' });
    // An admin reading someone else's scan is told whose it is, so the page can say so.
    const owner = me.role === 'ADMIN' ? await db.gridScan.findUnique({ where: { id }, select: { userId: true, user: { select: { email: true } } } }) : null;
    if (owner && owner.userId !== me.id) return Response.json({ ...data, viewingFor: owner.user.email });
    return Response.json({ ...data, bridge: await bridgeFor(id, me).catch(() => null) });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request, c: C) {
  try {
    const id = (await c.params).scanId,
      me = await getAuthenticatedUser(),
      userId = me.id;
    const { action, pinIds } = await req.json();
    // Stop: the owner, or an admin for any scan. Finished points are kept; every point still
    // pending is settled and refunded, and the worker cancels a phone task that is under way.
    if (action === 'stop') {
      const open = await db.gridScan.findFirst({
        where: { id, ...(me.role === 'ADMIN' ? {} : { userId }), status: { in: ['QUEUED', 'RUNNING'] } },
        select: { id: true },
      });
      if (!open) throw new InputError('This scan is not running.', 400);
      return Response.json({ stopped: await stopScan(id, 'CANCELLED: stopped by the user') });
    }
    const s = await db.gridScan.findFirst({ where: { id, userId } });
    if (!s) throw new InputError('Scan unavailable.', 404);
    if (action === 'rerun') {
      const rerun = await requestRerun(id, userId, Array.isArray(pinIds) ? pinIds.filter((x: unknown) => typeof x === 'string') : undefined);
      await wakeWorker('re-run');
      return Response.json(rerun);
    }
    if (action === 'share') {
      await db.gridScan.updateMany({
        where: { id, userId, shareToken: null },
        data: { shareToken: randomBytes(24).toString('hex') },
      });
      const record = await db.gridScan.findUniqueOrThrow({
        where: { id },
        select: { shareToken: true },
      });
      // An account with a white-label domain shares on that domain.
      const brand = await brandForUser(userId).catch(() => null);
      const path = '/share/' + record.shareToken;
      return Response.json({ path, url: brand ? 'https://' + brand.domain + path : null });
    }
    if (action === 'revoke') {
      await db.gridScan.update({ where: { id }, data: { shareToken: null } });
      return Response.json({ ok: true });
    }
    const cron = scheduleCron(s.scheduleType);
    if (!cron || !['pause', 'resume'].includes(action))
      throw new InputError('Invalid schedule action.');
    await db.gridScan.update({
      where: { id },
      data: { scheduleCron: action === 'pause' ? 'PAUSED:' + cron : cron },
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Deletes a finished scan for good: its report, its points and their stored videos and evidence.
 * The owner, or an admin for any scan. A scan still running must be stopped first; a repeating
 * scan's schedule ends with it. Credits already charged or refunded stay as they are.
 */
export async function DELETE(_: Request, c: C) {
  try {
    const id = (await c.params).scanId,
      me = await getAuthenticatedUser();
    const s = await db.gridScan.findFirst({ where: { id, ...(me.role === 'ADMIN' ? {} : { userId: me.id }) }, select: { id: true, status: true, scheduleType: true } });
    if (!s) throw new InputError('Scan unavailable.', 404);
    if (['QUEUED', 'RUNNING', 'AWAITING_EMAIL'].includes(s.status)) throw new InputError('This scan is still running. Stop it first, then delete it.', 409);
    if (s.scheduleType !== 'once') {
      await removeStakeoutSchedule(id).catch((e) => console.warn('[delete] schedule not removed:', (e as Error).message));
    }
    await db.gridScan.delete({ where: { id } });
    // The files go last: if this fails they are only left over, never a report without its proof.
    const files = await deleteScanFiles(id).catch((e) => (console.warn('[delete] files of', id, 'not deleted:', (e as Error).message), null));
    return Response.json({ ok: true, files });
  } catch (e) {
    return errorResponse(e);
  }
}
