import { NextResponse } from 'next/server';
import { db } from '@stakeout/db';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser } from '@/lib/auth';
import { InputError } from '@stakeout/core/grid';
import { gbpOpen, paidLocations } from '@/lib/gbpAccess';
import { postproxy, postproxyConfigured } from '@/lib/postproxy';

type Profile = { id: string; name: string; platform: string; status: string };
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
    if (!gbpOpen(u)) throw new InputError('Google profiles are not open on this account yet.', 403);
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
    return NextResponse.json({ ready: true, admin, profiles, accounts: admin ? [] : accounts.map((a) => ({ id: a.id, profile: a.profileId, name: a.name })) });
  } catch (e) {
    return errorResponse(e);
  }
}
