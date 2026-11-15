import { brandForUser } from '@stakeout/core/brands';
import { randomBytes } from 'node:crypto';
import { db } from '@stakeout/db';
import { report } from '@/lib/reports';
import { getAuthenticatedUser, readScope } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { InputError, scheduleCron } from '@stakeout/core/grid';
import { requestRerun, stopScan } from '@stakeout/core/scans';
type C = { params: Promise<{ scanId: string }> };
export async function GET(_: Request, c: C) {
  try {
    const id = (await c.params).scanId,
      me = await getAuthenticatedUser(),
      data = await report({ id, ...readScope(me) }, { admin: me.role === 'ADMIN' });
    // An admin reading someone else's scan is told whose it is, so the page can say so.
    const owner = me.role === 'ADMIN' ? await db.gridScan.findUnique({ where: { id }, select: { userId: true, user: { select: { email: true } } } }) : null;
    return Response.json(owner && owner.userId !== me.id ? { ...data, viewingFor: owner.user.email } : data);
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
    if (action === 'rerun')
      return Response.json(
        await requestRerun(id, userId, Array.isArray(pinIds) ? pinIds.filter((x: unknown) => typeof x === 'string') : undefined),
      );
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
