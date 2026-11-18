import { NextResponse } from 'next/server';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gbpAdmin, readLocation, target } from '@/lib/gbpAdmin';
import { postproxy, gbpPath } from '@/lib/postproxy';
import { buildPatch, diff, problemWith, redBlock, showing, worst, type GbpChange } from '@stakeout/core/gbp';

export const maxDuration = 60;

/**
 * POST /api/admin/gbp/update (admins only) { profile, location, change, confirm }
 *
 * Every edit is built on the profile as Google has it at this moment, never on what the browser
 * last saw: read it, work out what really differs and how risky that is, refuse stacked identity
 * edits, save the profile as it was, send the smallest request, then read the profile back and
 * record whether Google is showing the change. An identity (red) edit needs confirm: "VERIFY".
 */
export async function POST(req: Request) {
  try {
    const u = await gbpAdmin();
    const b = (await req.json()) as { profile?: unknown; location?: unknown; change?: GbpChange; confirm?: unknown };
    const t = target(b.profile, b.location);
    const change = (b.change && typeof b.change === 'object' ? b.change : {}) as GbpChange;

    const live = await readLocation(t.profile, t.location);
    const problem = problemWith(live, change);
    if (problem) throw new InputError(problem);
    const changes = diff(live, change);
    if (!changes.length) throw new InputError('Nothing to change: the profile already has these values.');

    const tier = worst(changes);
    if (tier === 'red') {
      const last = await db.gbpEdit.findFirst({
        where: { locationId: t.location, tier: 'red', status: { not: 'FAILED' } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const blocked = redBlock(changes, last?.createdAt ?? null, new Date());
      if (blocked) throw new InputError(blocked, 409);
      if (b.confirm !== 'VERIFY') throw new InputError('Type VERIFY to send an identity change.', 428);
    }

    // The profile as it was is saved before anything is sent, so a failed or regretted edit can be undone by hand.
    const edit = await db.gbpEdit.create({
      // Through JSON so only plain values are stored.
      data: { userId: u.id, profileId: t.profile, locationId: t.location, title: live.title ?? null, tier, changes: JSON.parse(JSON.stringify(changes)), before: JSON.parse(JSON.stringify(live)), status: 'SENT' },
    });

    const patch = buildPatch(live, change, changes);
    try {
      if (patch.location) await postproxy(gbpPath(t.profile, 'update_location'), { method: 'PATCH', body: { location_id: t.location, ...patch.location } });
      if (patch.hours) await postproxy(gbpPath(t.profile, 'update_hours'), { method: 'PATCH', body: { location_id: t.location, ...patch.hours } });
    } catch (e) {
      const error = e instanceof Error ? e.message.slice(0, 500) : 'Failed';
      await db.gbpEdit.update({ where: { id: edit.id }, data: { status: 'FAILED', error, checkedAt: new Date() } });
      throw e;
    }

    // Google accepting a request is not Google showing it: read the profile back and compare.
    const after = await readLocation(t.profile, t.location).catch(() => null);
    const seen = after ? showing(after, change, changes) : { live: [], waiting: changes.map((c) => c.key as string) };
    const status = seen.waiting.length ? 'SENT' : 'LIVE';
    await db.gbpEdit.update({ where: { id: edit.id }, data: { status, checkedAt: new Date() } });
    return NextResponse.json({ id: edit.id, status, tier, changes, ...seen });
  } catch (e) {
    return errorResponse(e);
  }
}
