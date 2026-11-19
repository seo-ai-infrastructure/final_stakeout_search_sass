import { NextResponse } from 'next/server';
import { db } from '@stakeout/db';
import { errorResponse } from '@/lib/api';
import { readLocation } from '@/lib/gbpAdmin';
import { gate } from '@/lib/gbpAccess';
import { weekOf } from '@stakeout/core/gbp';

/** GET /api/admin/gbp/location?profile=&location= (admins only): the live profile and its edit history. */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const t = await gate(q.get('profile'), q.get('location'), 'manage');
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
