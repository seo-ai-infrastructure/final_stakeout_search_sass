import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gbpAdmin } from '@/lib/gbpAdmin';
import { google, googleAccess } from '@/lib/googleOAuth';
import { propertyFor } from '@stakeout/core/googleSite';
import {
  GA_DIMENSIONS, GSC_DIMENSIONS, exploreRange, gaRequest, gaRows, gaTotals, gscRequest, gscRows,
  type GaDimension, type GaFilters, type GscDimension, type GscFilters,
} from '@stakeout/core/googleExplore';

export const maxDuration = 60;

type GscRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type GaReport = { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[] };
const text = (v: unknown) => (typeof v === 'string' ? v : undefined);

/**
 * POST /api/admin/google/explore (admins only): a client's website in Search Console or Analytics
 * for a chosen range against the range before, broken down by one thing, with filters. Read-only.
 *   { source: "gsc", website, by, days | from+to, query, queryMode, page, device, appearance, type }
 *   { source: "ga", property, by, days | from+to, page, device, came }
 * Answers with the two ranges, the totals for each, and up to 250 rows (each with its figure before).
 */
export async function POST(req: Request) {
  try {
    const u = await gbpAdmin();
    const b = (await req.json()) as Record<string, unknown>;
    const token = await googleAccess(u.id);

    if (b.source === 'gsc') {
      const website = String(b.website ?? '');
      if (!/^https?:\/\//.test(website)) throw new InputError('This listing has no website.');
      const by = (text(b.by) && (b.by as string) in GSC_DIMENSIONS ? b.by : 'query') as GscDimension;
      const range = exploreRange(b, new Date(), 3);
      if (typeof range === 'string') throw new InputError(range);
      const sites = await google<{ siteEntry?: { siteUrl: string; permissionLevel?: string }[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites');
      const property = propertyFor(website, sites.siteEntry ?? []);
      if (!property) throw new InputError('The connected Google login has no Search Console property for this website.', 404);
      const f: GscFilters = { query: text(b.query), queryMode: text(b.queryMode), page: text(b.page), device: text(b.device), appearance: text(b.appearance), type: text(b.type) };
      const ask = (body: unknown) => google<{ rows?: GscRow[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(property) + '/searchAnalytics/query', body);
      // The ways the site appeared (rich results and the like) are listed too, so one can be chosen as a filter.
      const [now, was, rows, rowsWas, appearances] = await Promise.all([
        ask(gscRequest(range.recent, f, null)), ask(gscRequest(range.before, f, null)),
        ask(gscRequest(range.recent, f, by)), by === 'date' ? Promise.resolve({ rows: [] as GscRow[] }) : ask(gscRequest(range.before, f, by, 1000)),
        ask(gscRequest(range.recent, { type: f.type }, 'searchAppearance', 50)).catch(() => ({ rows: [] as GscRow[] })),
      ]);
      const total = (x: { rows?: GscRow[] }) => ({ a: x.rows?.[0]?.clicks ?? 0, b: x.rows?.[0]?.impressions ?? 0, c: typeof x.rows?.[0]?.position === 'number' ? Math.round((x.rows[0].position as number) * 10) / 10 : null });
      return NextResponse.json({
        source: 'gsc', property, by, range, recent: total(now), before: total(was),
        rows: gscRows(rows.rows ?? [], rowsWas.rows ?? []),
        appearances: (appearances.rows ?? []).map((r) => r.keys?.[0] ?? '').filter(Boolean),
      });
    }

    if (b.source === 'ga') {
      const property = String(b.property ?? '');
      if (!/^properties\/\d+$/.test(property)) throw new InputError('Choose the Analytics property first.');
      const by = (text(b.by) && (b.by as string) in GA_DIMENSIONS ? b.by : 'landingPagePlusQueryString') as GaDimension;
      const range = exploreRange(b, new Date(), 1);
      if (typeof range === 'string') throw new InputError(range);
      const f: GaFilters = { page: text(b.page), device: text(b.device), source: text(b.came) };
      const ask = (body: unknown) => google<GaReport>(token, 'https://analyticsdata.googleapis.com/v1beta/' + property + ':runReport', body);
      const [now, was, rows, rowsWas] = await Promise.all([
        ask(gaRequest(range.recent, f, null)), ask(gaRequest(range.before, f, null)),
        ask(gaRequest(range.recent, f, by)), by === 'date' ? Promise.resolve({ rows: [] } as GaReport) : ask(gaRequest(range.before, f, by, 1000)),
      ]);
      return NextResponse.json({ source: 'ga', property, by, range, recent: gaTotals(now.rows), before: gaTotals(was.rows), rows: gaRows(rows.rows ?? [], rowsWas.rows ?? [], by) });
    }
    throw new InputError('Unknown source.');
  } catch (e) {
    return errorResponse(e);
  }
}
