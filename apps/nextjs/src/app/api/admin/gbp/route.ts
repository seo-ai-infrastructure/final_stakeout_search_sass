import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { gbpAdmin } from '@/lib/gbpAdmin';
import { postproxy, postproxyConfigured } from '@/lib/postproxy';

type Profile = { id: string; name: string; platform: string; status: string };
type Placement = { id: string; name: string; metadata?: { place_id?: string } };

/**
 * GET /api/admin/gbp (admins only): the Google Business accounts connected in Postproxy and the
 * locations each can manage.
 */
export async function GET() {
  try {
    await gbpAdmin();
    if (!postproxyConfigured()) return NextResponse.json({ ready: false, profiles: [] });
    const all = await postproxy<{ data: Profile[] }>('/api/profiles');
    const profiles = await Promise.all(
      (all.data ?? [])
        .filter((p) => p.platform === 'google_business')
        .map(async (p) => {
          const places = await postproxy<{ data: Placement[] }>('/api/profiles/' + encodeURIComponent(p.id) + '/placements')
            .then((r) => ({ locations: (r.data ?? []).map((l) => ({ id: l.id, name: l.name, placeId: l.metadata?.place_id ?? null })), problem: null as string | null }))
            .catch((e) => ({ locations: [], problem: e instanceof Error ? e.message : 'Could not list locations.' }));
          return { id: p.id, name: p.name, status: p.status, ...places };
        }),
    );
    return NextResponse.json({ ready: true, profiles });
  } catch (e) {
    return errorResponse(e);
  }
}
