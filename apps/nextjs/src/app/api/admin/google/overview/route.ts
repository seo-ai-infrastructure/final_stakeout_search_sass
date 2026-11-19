import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gbpAdmin } from '@/lib/gbpAdmin';
import { google, googleAccess } from '@/lib/googleOAuth';
import { propertyFor } from '@stakeout/core/googleSite';
import {
  exploreRange, gaEventRows, gaEventsRequest, gaRequest, gaRows, gaTotals, gscRequest, gscRows, pageOf,
  type GaFilters, type GscFilters,
} from '@stakeout/core/googleExplore';

export const maxDuration = 60;

type GscRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type GaReport = { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[] };
const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * POST /api/admin/google/overview (admins only): everything the Search insights tab shows for a
 * client's website from Search Console or Analytics, for a range against the range before. Read-only.
 *   { source: "gsc", website, scope: "page" | "site", device, days | from+to }
 *     totals, a figure for each day, the searches (each with its clicks before), and for the whole
 *     site its pages. scope "page" (the default) reads only the page the Google listing links to.
 *   { source: "ga", property, came, device, days | from+to }
 *     totals, a figure for each day, where visits came from, and the key events and calls by name.
 */
export async function POST(req: Request) {
  try {
    const u = await gbpAdmin();
    const b = (await req.json()) as Record<string, unknown>;
    const token = await googleAccess(u.id);

    if (b.source === 'gsc') {
      const website = String(b.website ?? '');
      if (!/^https?:\/\//.test(website)) throw new InputError('This listing has no website.');
      const range = exploreRange(b, new Date(), 3);
      if (typeof range === 'string') throw new InputError(range);
      const sites = await google<{ siteEntry?: { siteUrl: string; permissionLevel?: string }[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites');
      const property = propertyFor(website, sites.siteEntry ?? []);
      if (!property) return NextResponse.json({ source: 'gsc', property: null, properties: (sites.siteEntry ?? []).length });
      const page = pageOf(website);
      const scope = b.scope === 'site' || !page ? 'site' : 'page';
      const f: GscFilters = { device: text(b.device), page: scope === 'page' ? page : undefined };
      const ask = (body: unknown) => google<{ rows?: GscRow[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(property) + '/searchAnalytics/query', body);
      const none = Promise.resolve({ rows: [] as GscRow[] });
      const [now, was, days, queries, queriesWas, pages, pagesWas] = await Promise.all([
        ask(gscRequest(range.recent, f, null)), ask(gscRequest(range.before, f, null)), ask(gscRequest(range.recent, f, 'date', 500)),
        ask(gscRequest(range.recent, f, 'query', 500)), ask(gscRequest(range.before, f, 'query', 2000)),
        scope === 'site' ? ask(gscRequest(range.recent, f, 'page', 100)) : none, scope === 'site' ? ask(gscRequest(range.before, f, 'page', 500)) : none,
      ]);
      const total = (x: { rows?: GscRow[] }) => {
        const r = x.rows?.[0];
        return { clicks: r?.clicks ?? 0, impressions: r?.impressions ?? 0, ctr: r?.impressions ? round1(((r.clicks ?? 0) / r.impressions) * 100) : null, position: typeof r?.position === 'number' ? round1(r.position) : null };
      };
      return NextResponse.json({
        source: 'gsc', property, page, scope, range, recent: total(now), before: total(was),
        days: (days.rows ?? []).map((r) => ({ date: r.keys?.[0] ?? '', clicks: r.clicks ?? 0, impressions: r.impressions ?? 0 })).filter((r) => r.date),
        queries: gscRows(queries.rows ?? [], queriesWas.rows ?? []),
        pages: gscRows(pages.rows ?? [], pagesWas.rows ?? []),
      });
    }

    if (b.source === 'ga') {
      const property = String(b.property ?? '');
      if (!/^properties\/\d+$/.test(property)) throw new InputError('Choose the Analytics property first.');
      const range = exploreRange(b, new Date(), 1);
      if (typeof range === 'string') throw new InputError(range);
      const f: GaFilters = { device: text(b.device), source: text(b.came) };
      const ask = (body: unknown) => google<GaReport>(token, 'https://analyticsdata.googleapis.com/v1beta/' + property + ':runReport', body);
      const [now, was, days, sources, sourcesWas, channels, channelsWas, events, eventsWas] = await Promise.all([
        ask(gaRequest(range.recent, f, null)), ask(gaRequest(range.before, f, null)), ask(gaRequest(range.recent, f, 'date', 500)),
        ask(gaRequest(range.recent, f, 'sessionSourceMedium', 50)), ask(gaRequest(range.before, f, 'sessionSourceMedium', 500)),
        ask(gaRequest(range.recent, f, 'sessionDefaultChannelGroup', 25)), ask(gaRequest(range.before, f, 'sessionDefaultChannelGroup', 100)),
        ask(gaEventsRequest(range.recent, f)), ask(gaEventsRequest(range.before, f)),
      ]);
      return NextResponse.json({
        source: 'ga', property, range, recent: gaTotals(now.rows), before: gaTotals(was.rows),
        days: gaRows(days.rows ?? [], [], 'date').map((r) => ({ date: r.key, visits: r.a, keyEvents: r.c ?? 0 })),
        sources: gaRows(sources.rows ?? [], sourcesWas.rows ?? [], 'sessionSourceMedium'),
        channels: gaRows(channels.rows ?? [], channelsWas.rows ?? [], 'sessionDefaultChannelGroup'),
        events: gaEventRows(events.rows ?? [], eventsWas.rows ?? []),
      });
    }
    throw new InputError('Unknown source.');
  } catch (e) {
    return errorResponse(e);
  }
}
