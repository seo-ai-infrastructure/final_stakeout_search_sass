import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser } from '@/lib/auth';
import { google, googleAccess } from '@/lib/googleOAuth';
import { propertyFor } from '@stakeout/core/googleSite';
import { deviceFlag, lowMobileCtr } from '@stakeout/core/upgradeTriggers';
import { catalogFor } from '@/lib/billing';
import { createHash } from 'node:crypto';
import { redis } from '@stakeout/core/redis';
import {
  competingPages, exploreRange, gaEventRows, gaEventsRequest, gaRequest, gaRows, gaTotals, gscFilters, gscRequest, gscRows, pageOf, readInspection,
  type GaFilters, type GscFilters,
} from '@stakeout/core/googleExplore';

export const maxDuration = 60;

type GscRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type GaReport = { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[] };
const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * POST /api/admin/google/overview : everything the Search insights tab shows for a
 * client's website from Search Console or Analytics, for a range against the range before. Read-only.
 *   { source: "gsc", website, scope: "page" | "site", device, days | from+to }
 *     totals, a figure for each day, the searches (each with its clicks before), and for the whole
 *     site its pages. scope "page" (the default) reads only the page the Google listing links to.
 *   { source: "ga", property, came, device, days | from+to }
 *     totals, a figure for each day, where visits came from, and the key events and calls by name.
 */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    const b = (await req.json()) as Record<string, unknown>;
    const token = await googleAccess(u.id);

    // What phones see, over the last 28 days whatever dates are on screen: the searches shown near
    // the top and not clicked, and whether phones deserve their own look. For the scan offer.
    if (b.source === 'gsc-mobile') {
      const website = String(b.website ?? '');
      if (!/^https?:\/\//.test(website)) throw new InputError('This listing has no website.');
      const range = exploreRange({ days: 28 }, new Date(), 3);
      if (typeof range === 'string') throw new InputError(range);
      const sites = await google<{ siteEntry?: { siteUrl: string; permissionLevel?: string }[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites');
      const property = propertyFor(website, sites.siteEntry ?? []);
      if (!property) return NextResponse.json({ source: 'gsc-mobile', rows: [], fallback: true, device: null, offer: false });
      const page = pageOf(website);
      const at = b.scope === 'site' || !page ? undefined : page;
      const ask = (body: unknown) => google<{ rows?: GscRow[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(property) + '/searchAnalytics/query', body);
      const [queries, devices, catalog] = await Promise.all([ask(gscRequest(range.recent, { device: 'MOBILE', page: at }, 'query', 1000)), ask(gscRequest(range.recent, { page: at }, 'device', 10)), catalogFor(u)]);
      const pos = (r: GscRow) => (typeof r.position === 'number' ? round1(r.position) : null);
      const flagged = lowMobileCtr((queries.rows ?? []).map((r) => ({ query: r.keys?.[0] ?? '', clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: pos(r) })), new URL(website).hostname, text(b.brand) ?? '');
      // What the scan would cost this account: nothing more when it has the credits, otherwise its cheapest pack.
      const pack = catalog.find((i) => i.key === 'welcome') ?? catalog.find((i) => i.key === 'pack-25');
      return NextResponse.json({
        source: 'gsc-mobile', ...flagged,
        device: deviceFlag((devices.rows ?? []).map((r) => ({ device: r.keys?.[0] ?? '', impressions: r.impressions ?? 0, position: pos(r) }))),
        // Admins run scans as they like: the offer is for customers.
        offer: u.role !== 'ADMIN', balance: u.creditBalance, packCents: pack?.cents ?? null,
      });
    }

    // What Google's own inspection says about the listing's page: indexed or not, the address Google
    // filed it under, when it last fetched it and as what, and the rich results it found. Kept a day.
    if (b.source === 'inspect') {
      const website = String(b.website ?? '');
      const page = pageOf(website);
      if (!page) throw new InputError('This listing has no website.');
      const sites = await google<{ siteEntry?: { siteUrl: string; permissionLevel?: string }[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites');
      const property = propertyFor(website, sites.siteEntry ?? []);
      if (!property) return NextResponse.json({ source: 'inspect', inspection: null });
      const key = 'stakeout:inspect:' + createHash('sha256').update(u.id + '|' + property + '|' + page).digest('hex').slice(0, 32);
      const kept = await redis().get(key).then((v) => (v ? JSON.parse(v) : null)).catch(() => null);
      if (kept) return NextResponse.json({ source: 'inspect', page, ...kept, cached: true });
      const inspection = readInspection(await google(token, 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: page, siteUrl: property, languageCode: 'en-US' }), page);
      const out = { inspection, checkedAt: new Date().toISOString() };
      if (inspection) await redis().set(key, JSON.stringify(out), 'EX', 86400).catch(() => {});
      return NextResponse.json({ source: 'inspect', page, ...out, cached: false });
    }

    // Other pages of the same website shown for the listing page's 20 most-shown searches.
    if (b.source === 'gsc-compete') {
      const website = String(b.website ?? '');
      const page = pageOf(website);
      if (!page) throw new InputError('This listing has no website.');
      const range = exploreRange(b, new Date(), 3);
      if (typeof range === 'string') throw new InputError(range);
      const sites = await google<{ siteEntry?: { siteUrl: string; permissionLevel?: string }[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites');
      const property = propertyFor(website, sites.siteEntry ?? []);
      if (!property) return NextResponse.json({ source: 'gsc-compete', competing: {} });
      const url = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(property) + '/searchAnalytics/query';
      const own = await google<{ rows?: GscRow[] }>(token, url, gscRequest(range.recent, { device: text(b.device), page }, 'query', 500));
      const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const top: string[] = [];
      // Twenty at most, and no more than fit in one filter.
      for (const q of [...(own.rows ?? [])].sort((x, y) => (y.impressions ?? 0) - (x.impressions ?? 0)).map((r) => r.keys?.[0] ?? '').filter(Boolean)) {
        if (top.length >= 20 || top.map(esc).join('|').length + esc(q).length > 3800) break;
        top.push(q);
      }
      if (!top.length) return NextResponse.json({ source: 'gsc-compete', competing: {} });
      const device = gscFilters({ device: text(b.device) });
      const both = await google<{ rows?: GscRow[] }>(token, url, {
        startDate: range.recent.from, endDate: range.recent.to, type: 'web', dimensions: ['query', 'page'], rowLimit: 2000,
        dimensionFilterGroups: [{ groupType: 'and', filters: [...device, { dimension: 'query', operator: 'includingRegex', expression: '^(' + top.map(esc).join('|') + ')$' }] }],
      });
      const wanted = new Set(top);
      return NextResponse.json({ source: 'gsc-compete', competing: competingPages((both.rows ?? []).filter((r) => wanted.has(r.keys?.[0] ?? '')).map((r) => ({ query: r.keys?.[0] ?? '', page: r.keys?.[1] ?? '', impressions: r.impressions ?? 0 })), page) });
    }

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
      const [now, was, days, daysWas, queries, queriesWas, pages, pagesWas] = await Promise.all([
        ask(gscRequest(range.recent, f, null)), ask(gscRequest(range.before, f, null)), ask(gscRequest(range.recent, f, 'date', 500)), ask(gscRequest(range.before, f, 'date', 500)).catch(() => ({ rows: [] as GscRow[] })),
        ask(gscRequest(range.recent, f, 'query', 500)), ask(gscRequest(range.before, f, 'query', 2000)),
        scope === 'site' ? ask(gscRequest(range.recent, f, 'page', 100)) : none, scope === 'site' ? ask(gscRequest(range.before, f, 'page', 500)) : none,
      ]);
      const byDay = (rows?: GscRow[]) => (rows ?? []).map((r) => ({ date: r.keys?.[0] ?? '', clicks: r.clicks ?? 0, impressions: r.impressions ?? 0 })).filter((r) => r.date);
      const total = (x: { rows?: GscRow[] }) => {
        const r = x.rows?.[0];
        return { clicks: r?.clicks ?? 0, impressions: r?.impressions ?? 0, ctr: r?.impressions ? round1(((r.clicks ?? 0) / r.impressions) * 100) : null, position: typeof r?.position === 'number' ? round1(r.position) : null };
      };
      return NextResponse.json({
        source: 'gsc', property, page, scope, range, recent: total(now), before: total(was),
        days: byDay(days.rows), daysBefore: byDay(daysWas.rows),
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
      const [now, was, days, daysWas, sources, sourcesWas, channels, channelsWas, events, eventsWas] = await Promise.all([
        ask(gaRequest(range.recent, f, null)), ask(gaRequest(range.before, f, null)), ask(gaRequest(range.recent, f, 'date', 500)), ask(gaRequest(range.before, f, 'date', 500)).catch(() => ({ rows: [] } as GaReport)),
        ask(gaRequest(range.recent, f, 'sessionSourceMedium', 50)), ask(gaRequest(range.before, f, 'sessionSourceMedium', 500)),
        ask(gaRequest(range.recent, f, 'sessionDefaultChannelGroup', 25)), ask(gaRequest(range.before, f, 'sessionDefaultChannelGroup', 100)),
        ask(gaEventsRequest(range.recent, f)), ask(gaEventsRequest(range.before, f)),
      ]);
      return NextResponse.json({
        source: 'ga', property, range, recent: gaTotals(now.rows), before: gaTotals(was.rows),
        days: gaRows(days.rows ?? [], [], 'date').map((r) => ({ date: r.key, visits: r.a, keyEvents: r.c ?? 0 })),
        daysBefore: gaRows(daysWas.rows ?? [], [], 'date').map((r) => ({ date: r.key, visits: r.a, keyEvents: r.c ?? 0 })),
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
