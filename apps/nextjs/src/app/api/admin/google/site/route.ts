import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser } from '@/lib/auth';
import { agentGate } from '@/lib/gbpAccess';
import { google, googleAccess } from '@/lib/googleOAuth';
import { periods, propertyFor } from '@stakeout/core/googleSite';

export const maxDuration = 60;

type Row = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type Range = { from: string; to: string };

/**
 * GET /api/admin/google/site?website= : Search Console for a client's website, the
 * last 28 days against the 28 before: clicks, times shown, average position, and the top searches.
 * Read-only. `property: null` means the connected Google login has no Search Console property for that site.
 */
export async function GET(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    await agentGate(u);
    const website = String(new URL(req.url).searchParams.get('website') ?? '');
    if (!/^https?:\/\//.test(website)) throw new InputError('This listing has no website.');
    const token = await googleAccess(u.id);
    const sites = await google<{ siteEntry?: { siteUrl: string; permissionLevel?: string }[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites');
    const property = propertyFor(website, sites.siteEntry ?? []);
    if (!property) return NextResponse.json({ property: null, properties: (sites.siteEntry ?? []).length });

    const p = periods(new Date());
    const query = (r: Range, byQuery: boolean) =>
      google<{ rows?: Row[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(property) + '/searchAnalytics/query', {
        startDate: r.from,
        endDate: r.to,
        ...(byQuery ? { dimensions: ['query'], rowLimit: 25 } : {}),
      });
    const [now, was, top] = await Promise.all([query(p.recent, false), query(p.before, false), query(p.recent, true)]);
    const total = (x: { rows?: Row[] }) => ({ clicks: x.rows?.[0]?.clicks ?? 0, impressions: x.rows?.[0]?.impressions ?? 0, position: x.rows?.[0]?.position ?? null });
    return NextResponse.json({
      property,
      periods: p,
      recent: total(now),
      before: total(was),
      queries: (top.rows ?? []).map((r) => ({ query: r.keys?.[0] ?? '', clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: r.position ?? null })).filter((r) => r.query),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
