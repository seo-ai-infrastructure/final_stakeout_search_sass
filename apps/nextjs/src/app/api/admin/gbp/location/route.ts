import { NextResponse } from 'next/server';
import { db } from '@stakeout/db';
import { errorResponse } from '@/lib/api';
import { gbpAdmin, readLocation, target } from '@/lib/gbpAdmin';
import { weekOf } from '@stakeout/core/gbp';

/** GET /api/admin/gbp/location?profile=&location= (admins only): the live profile and its edit history. */
export async function GET(req: Request) {
  try {
    await gbpAdmin();
    const q = new URL(req.url).searchParams;
    const t = target(q.get('profile'), q.get('location'));
    const [location, edits] = await Promise.all([
      readLocation(t.profile, t.location),
      db.gbpEdit.findMany({
        where: { locationId: t.location },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, tier: true, changes: true, status: true, error: true, checkedAt: true, createdAt: true },
      }),
    ]);
    return NextResponse.json({ location, week: weekOf(location), edits });
  } catch (e) {
    return errorResponse(e);
  }
}
