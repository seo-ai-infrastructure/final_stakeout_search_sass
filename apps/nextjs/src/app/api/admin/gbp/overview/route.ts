import { NextResponse } from 'next/server';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { listingTotals, type ListingTotals } from '@stakeout/core/gbpInsights';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser } from '@/lib/auth';
import { gbpOpen, paidLocations } from '@/lib/gbpAccess';
import { postproxy, postproxyConfigured } from '@/lib/postproxy';

export const maxDuration = 60;

/**
 * GET /api/admin/gbp/overview: every listing this account can reach with Google's newest 30-day
 * totals for it (views, calls, website clicks, directions, and actions per 100 views), busiest
 * first. One request per connected Google account. An admin sees every listing; a customer sees the listings on a paid plan.
 */
export async function GET() {
  try {
    const u = await getAuthenticatedUser();
    if (!gbpOpen(u)) throw new InputError('Google profiles are not open on this account yet.', 403);
    if (!postproxyConfigured()) return NextResponse.json({ rows: [] });
    let ids: string[];
    // A customer's listing numbers come with the paid plan: only those listings have totals here.
    let paid: Set<string> | null = null;
    if (u.role === 'ADMIN') {
      const all = await postproxy<{ data?: { id: string; platform: string }[] }>('/api/profiles');
      ids = (all.data ?? []).filter((p) => p.platform === 'google_business').map((p) => p.id);
    } else {
      const mine = await db.gbpAccount.findMany({ where: { userId: u.id, profileId: { not: null } }, select: { profileId: true } });
      ids = mine.map((a) => String(a.profileId));
      paid = new Set((await paidLocations(u.id)).keys());
      if (!paid.size) return NextResponse.json({ rows: [] });
    }
    const rows: (ListingTotals & { profile: string })[] = [];
    const problems: string[] = [];
    await Promise.all(
      ids.slice(0, 40).map(async (id) => {
        try {
          const p = await postproxy<{ latest_stats?: unknown }>('/api/profiles/' + encodeURIComponent(id));
          for (const r of listingTotals(p.latest_stats)) if (!paid || paid.has(r.location)) rows.push({ ...r, profile: id });
        } catch (e) {
          problems.push(e instanceof Error ? e.message : 'Could not read an account.');
        }
      }),
    );
    rows.sort((a, b) => b.actions - a.actions || b.views - a.views);
    return NextResponse.json({ rows, problems: [...new Set(problems)].slice(0, 3) });
  } catch (e) {
    return errorResponse(e);
  }
}
