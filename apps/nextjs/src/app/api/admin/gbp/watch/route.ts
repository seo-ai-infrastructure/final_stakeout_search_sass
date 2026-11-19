import { NextResponse } from 'next/server';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { changeBack, watched } from '@stakeout/core/gbpWatch';
import type { GbpLocation } from '@stakeout/core/gbp';
import { errorResponse } from '@/lib/api';
import { readLocation } from '@/lib/gbpAdmin';
import { getAuthenticatedUser } from '@/lib/auth';
import { allow, paidLocations } from '@/lib/gbpAccess';
import { checkAllListings, checkOwnListings, lastWatchRun } from '@/lib/gbpWatch';

export const maxDuration = 300;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * GET /api/admin/gbp/watch: the changes found on our listings that we did not make
 * and that nobody has decided on yet, the last thirty that were, and how the last check went.
 * Each open change says whether it can be put back from here (`revert`: the edit that does it).
 */
export async function GET() {
  try {
    const u = await getAuthenticatedUser();
    // A customer sees the changes on their own paid listings; an admin sees every listing's.
    const mine = u.role === 'ADMIN' ? {} : { locationId: { in: [...(await paidLocations(u.id)).keys()] } };
    const [open, closed, watching, run] = await Promise.all([
      db.gbpDrift.findMany({ where: { status: 'OPEN', ...mine }, orderBy: { foundAt: 'desc' }, take: 200 }),
      db.gbpDrift.findMany({ where: { status: { not: 'OPEN' }, ...mine }, orderBy: { resolvedAt: 'desc' }, take: 30 }),
      db.gbpWatch.count({ where: mine }),
      lastWatchRun(),
    ]);
    const watches = await db.gbpWatch.findMany({ where: { locationId: { in: [...new Set(open.map((d) => d.locationId))] } }, select: { locationId: true, baseline: true, accepted: true } });
    const by = new Map(watches.map((w) => [w.locationId, w]));
    return NextResponse.json({
      open: open.map((d) => {
        const w = by.get(d.locationId);
        return { ...d, revert: w ? changeBack(w.baseline as unknown as GbpLocation, d.field, today(), (w.accepted as Record<string, string>) ?? {}) : null };
      }),
      closed,
      watching,
      run,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/admin/gbp/watch
 *   { action: "check" }          reads every listing now
 *   { action: "keep", id }       the change stays: it is what we expect from now on
 *   { action: "reverted", id }   the editor has just put it back (the edit itself goes through
 *                                /api/admin/gbp/update, with all of its checks)
 */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    const b = (await req.json()) as { action?: unknown; id?: unknown };
    if (b.action === 'check') return NextResponse.json({ run: u.role === 'ADMIN' ? await checkAllListings() : await checkOwnListings(u.id) });
    const d = await db.gbpDrift.findUnique({ where: { id: String(b.id ?? '') } });
    if (d) await allow(u, d.profileId, d.locationId, 'manage').catch(() => { throw new InputError('That change has already been dealt with.', 409); });
    if (!d || d.status !== 'OPEN') throw new InputError('That change has already been dealt with.', 409);
    if (b.action === 'keep') {
      const w = await db.gbpWatch.findUnique({ where: { locationId: d.locationId } });
      // Kept as Google shows it at this moment (it may have moved again since it was found).
      const live = await readLocation(d.profileId, d.locationId).catch(() => null);
      const now = live ? watched(live, today())[d.field] ?? d.now : d.now;
      if (w) await db.gbpWatch.update({ where: { locationId: d.locationId }, data: { accepted: { ...((w.accepted as Record<string, string>) ?? {}), [d.field]: now } } });
      await db.gbpDrift.update({ where: { id: d.id }, data: { status: 'ACCEPTED', now, resolvedAt: new Date() } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'reverted') {
      await db.gbpDrift.update({ where: { id: d.id }, data: { status: 'REVERTED', resolvedAt: new Date() } });
      return NextResponse.json({ ok: true });
    }
    throw new InputError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}
