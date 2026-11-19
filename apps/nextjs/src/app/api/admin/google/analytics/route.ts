import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser } from '@/lib/auth';
import { google, googleAccess } from '@/lib/googleOAuth';
import { periods } from '@stakeout/core/googleSite';

export const maxDuration = 60;

type Summary = { displayName?: string; propertySummaries?: { property: string; displayName?: string }[] };
type Report = { rows?: { metricValues?: { value?: string }[] }[] };
type Range = { from: string; to: string };

/** The campaign name the editor's "Add tracking tag" button puts on a listing's website link. */
const LISTING_CAMPAIGN = 'gbp_listing';

/**
 * GET /api/admin/google/analytics : the Analytics properties the connected login can read.
 * GET /api/admin/google/analytics?property=properties/123: that property's last 28 days against
 * the 28 before: all visits, and the visits and key events that came from the Google listing's
 * tracking tag. Read-only.
 */
export async function GET(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    const token = await googleAccess(u.id);
    const property = String(new URL(req.url).searchParams.get('property') ?? '');

    if (!property) {
      const list: { id: string; name: string; account: string }[] = [];
      let page = '';
      for (let i = 0; i < 5; i++) {
        const r = await google<{ accountSummaries?: Summary[]; nextPageToken?: string }>(token, 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200' + (page ? '&pageToken=' + encodeURIComponent(page) : ''));
        for (const a of r.accountSummaries ?? []) for (const p of a.propertySummaries ?? []) list.push({ id: p.property, name: p.displayName ?? p.property, account: a.displayName ?? '' });
        page = r.nextPageToken ?? '';
        if (!page) break;
      }
      return NextResponse.json({ properties: list.sort((a, b) => a.name.localeCompare(b.name)) });
    }

    if (!/^properties\/\d+$/.test(property)) return NextResponse.json({ error: 'Unknown property.' }, { status: 400 });
    const p = periods(new Date());
    const report = (r: Range, listingOnly: boolean) =>
      google<Report>(token, 'https://analyticsdata.googleapis.com/v1beta/' + property + ':runReport', {
        dateRanges: [{ startDate: r.from, endDate: r.to }],
        metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
        ...(listingOnly ? { dimensionFilter: { filter: { fieldName: 'sessionCampaignName', stringFilter: { matchType: 'EXACT', value: LISTING_CAMPAIGN } } } } : {}),
      });
    const read = (x: Report) => ({ sessions: Number(x.rows?.[0]?.metricValues?.[0]?.value ?? 0), keyEvents: Number(x.rows?.[0]?.metricValues?.[1]?.value ?? 0) });
    const [all, allWas, listing, listingWas] = await Promise.all([report(p.recent, false), report(p.before, false), report(p.recent, true), report(p.before, true)]);
    return NextResponse.json({ property, periods: p, campaign: LISTING_CAMPAIGN, all: { recent: read(all), before: read(allWas) }, listing: { recent: read(listing), before: read(listingWas) } });
  } catch (e) {
    return errorResponse(e);
  }
}
