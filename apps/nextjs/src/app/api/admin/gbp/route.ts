import { NextResponse } from 'next/server';
import { db } from '@stakeout/db';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser } from '@/lib/auth';
import { InputError } from '@stakeout/core/grid';
import { gbpOpen, paidLocations } from '@/lib/gbpAccess';
import { connectionPaid, unpaidClock } from '@stakeout/core/gbpPlans';
import { postproxy, postproxyConfigured } from '@/lib/postproxy';

type Profile = { id: string; name: string; platform: string; status: string };

/** How many days a connection has left before it is disconnected for having no paying listing (null: it has one). */
async function daysLeft(userId: string, a: { profileId: string | null; unpaidSince: Date | null }) {
  const [rows, sub] = await Promise.all([
    a.profileId ? db.gbpPlan.findMany({ where: { userId, profileId: a.profileId }, select: { plan: true, status: true, endsAt: true } }) : Promise.resolve([]),
    db.gbpSub.findUnique({ where: { userId }, select: { status: true } }),
  ]);
  const now = new Date();
  return unpaidClock(connectionPaid(rows, sub?.status, now), a.unpaidSince, now).daysLeft;
}
type Placement = { id: string; name: string; metadata?: { place_id?: string } };

/**
 * GET /api/admin/gbp: the Google Business accounts this account can reach and the listings in
 * each. An admin sees every connected account. A customer sees the ones they connected, with the
 * plan each listing is on (`plan`: null is free, which reads but does not change).
 */
export async function GET() {
  try {
    const u = await getAuthenticatedUser();
    const admin = u.role === 'ADMIN';
    if (!gbpOpen(u)) throw new InputError('Connected Accounts is not open on this account yet.', 403);
    if (!postproxyConfigured()) return NextResponse.json({ ready: false, admin, profiles: [], accounts: [] });
    const accounts = await db.gbpAccount.findMany({ where: admin ? { profileId: { not: null } } : { userId: u.id }, orderBy: { createdAt: 'asc' } });
    const all = await postproxy<{ data: Profile[] }>('/api/profiles');
    const own = new Set(accounts.map((a) => a.profileId));
    const paid = admin ? null : await paidLocations(u.id);
    const profiles = await Promise.all(
      (all.data ?? [])
        .filter((p) => p.platform === 'google_business' && (admin || own.has(p.id)))
        .map(async (p) => {
          const places = await postproxy<{ data: Placement[] }>('/api/profiles/' + encodeURIComponent(p.id) + '/placements')
            .then((r) => ({ locations: (r.data ?? []).map((l) => ({ id: l.id, name: l.name, placeId: l.metadata?.place_id ?? null, plan: paid ? paid.get(l.id) ?? null : 'ADMIN' })), problem: null as string | null }))
            .catch((e) => ({ locations: [], problem: e instanceof Error ? e.message : 'Could not list locations.' }));
          // For an admin, an account a customer connected is marked so.
          return { id: p.id, name: p.name, status: p.status, customer: own.has(p.id), ...places };
        }),
    );
    return NextResponse.json({ ready: true, admin, profiles, accounts: admin ? [] : await Promise.all(accounts.map(async (a) => ({ id: a.id, profile: a.profileId, name: a.name, daysLeft: await daysLeft(u.id, a) }))) });
  } catch (e) {
    return errorResponse(e);
  }
}
