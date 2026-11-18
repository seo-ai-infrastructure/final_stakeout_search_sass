import { NextResponse } from 'next/server';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gbpAdmin, readLocation } from '@/lib/gbpAdmin';
import { describe, type FieldChange } from '@stakeout/core/gbp';

/**
 * POST /api/admin/gbp/recheck (admins only) { id }: reads the profile again and marks a sent edit
 * LIVE once Google shows every value it changed. An edit Google held for review turns up here later.
 */
export async function POST(req: Request) {
  try {
    await gbpAdmin();
    const { id } = (await req.json()) as { id?: unknown };
    const edit = typeof id === 'string' ? await db.gbpEdit.findUnique({ where: { id } }) : null;
    if (!edit) throw new InputError('Unknown edit.', 404);
    if (edit.status === 'FAILED') return NextResponse.json({ status: edit.status, waiting: [] });
    const now = await readLocation(edit.profileId, edit.locationId);
    // A field is showing when the live profile reads as the value this edit set. Names are compared
    // as text, so a category Google renamed, or a phone number it reformatted, stays "sent".
    const said = describe(now);
    const waiting = (edit.changes as unknown as FieldChange[]).filter((c) => said[c.key] !== c.to).map((c) => c.label);
    const status = waiting.length ? 'SENT' : 'LIVE';
    await db.gbpEdit.update({ where: { id: edit.id }, data: { status, checkedAt: new Date() } });
    return NextResponse.json({ status, waiting });
  } catch (e) {
    return errorResponse(e);
  }
}
