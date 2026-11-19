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
  competingPages, exploreRange, gaCrossRequest, gaEventRows, gaEventsRequest, gaPairRequest, gaRequest, leadsBy, listingTags, gaRows, gaTotals, gscFilters, gscRequest, gscRows, pageOf, readInspection,
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
      const key = 'stakeout:inspect2:' + createHash('sha256').update(u.id + '|' + property + '|' + page).digest('hex').slice(0, 32);
      const kept = await redis().get(key).then((v) => (v ? JSON.parse(v) : null)).catch(() => null);
      if (kept) return NextResponse.json({ source: 'inspect', page, ...kept, cached: true });
      // The page can be reached under several addresses (http or https, with or without www), and all
      // but one of them only redirect. The one to inspect is the one Google actually shows: the form
      // of this page with the most impressions in the last 28 days.
      const recent = exploreRange({ days: 28 }, new Date(), 3);
      const forms = typeof recent === 'string' ? null : await google<{ rows?: GscRow[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(property) + '/searchAnalytics/query', gscRequest(recent.recent, { page }, 'page', 10)).catch(() => null);
      const shown = [...(forms?.rows ?? [])].sort((x, y) => (y.impressions ?? 0) - (x.impressions ?? 0) || (y.clicks ?? 0) - (x.clicks ?? 0))[0]?.keys?.[0];
      const inspected = shown && /^https?:\/\//.test(shown) ? shown : page;
      const inspection = readInspection(await google(token, 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: inspected, siteUrl: property, languageCode: 'en-US' }), inspected);
      const out = { inspection, inspected, checkedAt: new Date().toISOString() };
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
      const website = text(b.website);
      const f: GaFilters = { device: text(b.device), source: text(b.came), website, scope: b.scope === 'page' ? 'page' : 'site' };
      const ai: GaFilters = { ...f, source: 'ai' };
      // Analytics takes five reports in one request: twenty reports are four requests.
      const wanted = [
        gaRequest(range.recent, f, null), gaRequest(range.before, f, null), gaRequest(range.recent, f, 'date', 500), gaRequest(range.before, f, 'date', 500),
        gaRequest(range.recent, f, 'sessionSourceMedium', 50), gaRequest(range.before, f, 'sessionSourceMedium', 500), gaRequest(range.recent, f, 'sessionDefaultChannelGroup', 25), gaRequest(range.before, f, 'sessionDefaultChannelGroup', 100),
        gaEventsRequest(range.recent, f), gaEventsRequest(range.before, f),
        gaCrossRequest(range.recent, f, ['date']), gaCrossRequest(range.before, f, ['date']), gaCrossRequest(range.recent, f, ['sessionSourceMedium']), gaCrossRequest(range.recent, f, ['sessionDefaultChannelGroup']),
        gaPairRequest(range.recent, f, ['city', 'region'], 8), gaCrossRequest(range.recent, f, ['city', 'region'], 10000),
        gaRequest(range.recent, ai, null), gaRequest(range.before, ai, null), gaEventsRequest(range.recent, ai), gaRequest(range.recent, ai, 'landingPagePlusQueryString', 3),
      ];
      const groups = Array.from({ length: Math.ceil(wanted.length / 5) }, (_, i) => wanted.slice(i * 5, i * 5 + 5));
      const got = (await Promise.all(groups.map((requests) => google<{ reports?: GaReport[] }>(token, 'https://analyticsdata.googleapis.com/v1beta/' + property + ':batchRunReports', { requests })))).flatMap((g, i) => Array.from({ length: groups[i].length }, (_, k) => g.reports?.[k] ?? {}));
      const [now, was, days, daysWas, sources, sourcesWas, channels, channelsWas, events, eventsWas, dayEvents, dayEventsWas, sourceEvents, channelEvents, cities, cityEvents, aiNow, aiWas, aiEvents, aiPages] = got;
      const byDay = (rows: GaReport, leads: GaReport) => { const l = leadsBy(leads.rows); return gaRows(rows.rows ?? [], [], 'date').map((r) => ({ date: r.key, visits: r.a, keyEvents: r.c ?? 0, leads: l.get(r.key)?.leads ?? 0 })); };
      const withLeads = (rows: ReturnType<typeof gaRows>, leads: GaReport) => { const l = leadsBy(leads.rows); return rows.map((r) => ({ ...r, leads: l.get(r.key)?.leads ?? 0 })); };
      const townLeads = leadsBy(cityEvents.rows);
      const aiE = gaEventRows(aiEvents.rows ?? [], []);
      return NextResponse.json({
        source: 'ga', property, range, recent: gaTotals(now.rows), before: gaTotals(was.rows),
        days: byDay(days, dayEvents), daysBefore: byDay(daysWas, dayEventsWas),
        sources: withLeads(gaRows(sources.rows ?? [], sourcesWas.rows ?? [], 'sessionSourceMedium'), sourceEvents),
        channels: withLeads(gaRows(channels.rows ?? [], channelsWas.rows ?? [], 'sessionDefaultChannelGroup'), channelEvents),
        events: gaEventRows(events.rows ?? [], eventsWas.rows ?? []),
        cities: (cities.rows ?? []).map((r) => { const city = r.dimensionValues?.[0]?.value ?? '', region = r.dimensionValues?.[1]?.value ?? ''; const l = townLeads.get(city + ' / ' + region); return { city, region, visits: Number(r.metricValues?.[0]?.value ?? 0) || 0, calls: l?.calls ?? 0, leads: l?.leads ?? 0 }; }).filter((c) => c.city && c.city !== '(not set)'),
        ai: { visits: gaTotals(aiNow.rows).a, visitsBefore: gaTotals(aiWas.rows).a, leads: aiE.leads, calls: aiE.calls, pages: gaRows(aiPages.rows ?? [], [], 'landingPagePlusQueryString').map((r) => ({ page: r.key, visits: r.a })) },
        // The tags that count a visit as coming from the listing, so the page can say which.
        listingTags: listingTags(website).campaign,
      });
    }
    throw new InputError('Unknown source.');
  } catch (e) {
    return errorResponse(e);
  }
}
