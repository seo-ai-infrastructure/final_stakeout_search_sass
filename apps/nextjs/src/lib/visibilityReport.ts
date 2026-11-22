import { db } from '@stakeout/db';
import { pinAi } from '@stakeout/core/aiFlags';
import { oneBoxOf } from '@stakeout/core/localRank';
import { report } from './reports';
import { searchShare } from './reportSummary';
import type { InsightPin } from './marketInsights';
import { clientsFor } from './services';
import { gbpPath, postproxy, postproxyConfigured } from './postproxy';
import { readLocation } from './gbpAdmin';
import { google, googleAccess } from './googleOAuth';
import { dailySeries, latestSnapshot, monthsOf, topKeywords } from '@stakeout/core/gbpInsights';
import { periods, propertyFor } from '@stakeout/core/googleSite';
import { gscRequest, pageOf } from '@stakeout/core/googleExplore';

/**
 * The data behind the Local & AI visibility report (/reports/visibility.html): a scan and the
 * other finished scans of the same business, each point as the report reads it. Built from what
 * the scans stored, nothing estimated.
 */
type Report = Awaited<ReturnType<typeof report>>;
type Pin = Report['pins'][number];

/** The site's bare domain ("https://www.x.com/a" → "x.com"). */
const domainOf = (v: string | null | undefined) =>
  (v ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0];

/**
 * One point: where it is, the map pack, and the AI Overview by its four flags (or the earlier
 * reading, or unparsed), with the first three businesses the phone saw.
 */
function pointOf(p: Pin) {
  const a = pinAi(p);
  const m = p.proxyMeta as { noLocal?: boolean } | null;
  const ins = p.insights as { ai?: { sources?: string[]; presence?: { citedSites?: string[] } } } | null;
  const sources = (a.state === 'parsed' ? (ins?.ai?.presence?.citedSites ?? []) : ((p.aiCitations as string[] | null) ?? ins?.ai?.sources ?? [])).map(domainOf).filter(Boolean);
  const f = a.featured;
  return {
    r: p.rowIdx,
    c: p.colIdx,
    area: p.city ?? null,
    zip: p.zip ?? null,
    rank: p.rankFound ?? null,
    /** A map pack (or a single-business panel) was on the page. */
    pack: !m?.noLocal,
    oneBox: oneBoxOf(p.proxyMeta, p.rankFound),
    aiShown: Boolean(p.hasAiOverview),
    old: Boolean(p.targetCitedInAi),
    state: !p.hasAiOverview ? 'none' : a.state,
    featured: a.state === 'parsed' && f ? (f.kind === 'card' ? { card: f.card_position, of: f.card_count ?? null, afterMore: f.after_expansion === true } : { inline: true }) : null,
    named: a.state === 'parsed' && a.named,
    listing: a.state === 'parsed' && a.listing ? (a.listing.links ? { links: a.listing.links } : { inSources: a.listing.inSources }) : null,
    website: a.state === 'parsed' ? (a.websiteCited === 'verified' ? 'confirmed' : a.websiteCited === 'unverified' ? 'possible' : null) : null,
    first: ((p.topCompetitors as string[] | null) ?? []).slice(0, 3),
    sources: [...new Set(sources)].slice(0, 12),
  };
}

/** One scan; `link` is where its recordings open (the scan's page, or its own share link). */
function scanOf(s: Report, link: string) {
  const share = searchShare(s.pins as unknown as InsightPin[], s.targetBusiness, { pageOne: s.scoring?.pageOne === true });
  return {
    id: s.id,
    link,
    kw: s.keyword,
    at: s.createdAt,
    size: s.gridSize,
    km: s.spacingKm,
    status: s.status,
    share: { rule: share.rule, share: share.share, wins: share.wins, points: share.points, packTop3: share.local.top3, packPoints: share.local.points, aiOnly: share.ai.onlyWins, left: share.noLocalSurface + share.unknown },
    pins: s.pins.filter((p) => p.status === 'COMPLETED').map(pointOf),
  };
}

/** Finished scans of the same business by the same account, newest first (at most seven), besides `main`. */
async function others(userId: string, main: Report, extra: Record<string, unknown> = {}) {
  return db.gridScan.findMany({
    where: { userId, id: { not: main.id }, targetBusiness: { equals: main.targetBusiness, mode: 'insensitive' }, status: { in: ['COMPLETED', 'PARTIAL'] }, completedPins: { gt: 0 }, ...extra },
    select: { id: true, shareToken: true },
    orderBy: { createdAt: 'desc' },
    take: 7,
  });
}

type Row = Record<string, unknown>;
const said = (e: unknown) => (e instanceof Error ? e.message : 'Not available.').slice(0, 160);
const words = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * The connected Google listing that is this scan's business: by Google's place ID, else by its exact
 * name when only one connected location has it (the same location under two Google logins counts once).
 */
async function listingFor(owner: { id: string; role: string }, scan: Report) {
  if (!postproxyConfigured()) return null;
  const all = (await clientsFor(owner).catch(() => [])).filter((c) => c.source === 'listing' && c.profile && c.location);
  const placeId = (scan as { targetPlaceId?: string | null }).targetPlaceId;
  const byId = placeId ? all.find((c) => c.placeId === placeId) : null;
  if (byId) return byId;
  const named = all.filter((c) => words(c.name) === words(scan.targetBusiness));
  const one = new Map(named.map((c) => [String(c.location).replace(/^accounts\/\d+\//, ''), c]));
  return one.size === 1 ? [...one.values()][0] : null;
}

/**
 * What Google counted for the listing over the last 28 days against the 28 before (it runs about three
 * days behind): views by where they were, calls, website clicks, direction requests; and the searches
 * that showed it over the last full months. Read through Postproxy, nothing estimated.
 */
async function listingActivity(t: { profile: string; location: string }) {
  const p = periods(new Date(), 28, 3);
  const profile = '/api/profiles/' + encodeURIComponent(t.profile);
  const [daily, keywords, loc] = await Promise.all([
    postproxy<{ data?: { records?: Row[] } }>(profile + '/daily_stats', { query: { placement_id: t.location, from: p.before.from, to: p.recent.to } })
      .then(async (d) => {
        const s = dailySeries(d.data?.records ?? [], p.recent.from, p.recent.to, p.before.from);
        if (s.known.length) return { kind: 'daily' as const, totals: s.totals, before: s.before, known: s.known, daysWithData: s.daysWithData, daysBefore: s.daysBefore, length: s.length };
        const snaps = await postproxy<{ data?: { records?: Row[] } }>(profile + '/stats', { query: { placement_id: t.location } });
        const snap = latestSnapshot(snaps.data?.records ?? []);
        return snap ? { kind: 'snapshot' as const, ...snap } : { kind: 'none' as const };
      })
      .catch((e) => ({ kind: 'problem' as const, problem: said(e) })),
    (async () => {
      const m = monthsOf(p.before.from, p.recent.to, 6);
      const r = await postproxy<{ months?: Parameters<typeof topKeywords>[0] }>(gbpPath(t.profile, 'search_keywords'), { query: { location_id: t.location, from_month: m.from, to_month: m.to } });
      const top = topKeywords(r.months ?? []);
      return { rows: top.rows.slice(0, 10), months: top.months, problem: null as string | null };
    })().catch((e) => ({ rows: [], months: [] as string[], problem: said(e) })),
    readLocation(t.profile, t.location).catch(() => null),
  ]);
  const a = loc?.storefrontAddress;
  return {
    periods: { recent: p.recent, before: p.before },
    title: loc?.title ?? null,
    address: a ? [...(a.addressLines ?? []), a.locality, a.administrativeArea].filter(Boolean).join(', ') : null,
    website: loc?.websiteUri ?? null,
    daily,
    keywords,
  };
}

type GscRow = { keys?: string[]; clicks?: number; impressions?: number; position?: number };
type GaReport = { rows?: { metricValues?: { value?: string }[] }[] };

/**
 * Search Console for the page the listing links to (else the website), the last 28 days against the
 * 28 before, with its top searches; and Analytics for the site (the property whose name has the
 * site's name in it, as Connected Accounts guesses), with the visits that came from the listing's
 * tracking tag. Through the scan owner's own Google sign-in; read-only.
 */
async function searchActivity(userId: string, website: string, page: string | null, campaign: string) {
  const token = await googleAccess(userId);
  const p = periods(new Date(), 28, 3);
  const url = page ?? 'https://' + website + '/';
  const [gsc, ga] = await Promise.all([
    (async () => {
      const sites = await google<{ siteEntry?: { siteUrl: string; permissionLevel?: string }[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites');
      const property = propertyFor(url, sites.siteEntry ?? []);
      if (!property) return { property: null as string | null, scope: null, recent: null, before: null, queries: [], problem: 'No Search Console property for ' + website + ' on the connected Google login.' };
      const scope: 'page' | 'site' = page ? 'page' : 'site';
      // The page however Google filed it (http or https, www or not, with or without the last slash), as Connected Accounts reads it.
      const at = page ? pageOf(page) || undefined : undefined;
      const ask = (r: { from: string; to: string }, byQuery: boolean) =>
        google<{ rows?: GscRow[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(property) + '/searchAnalytics/query', gscRequest(r, { page: at }, byQuery ? 'query' : null, 10));
      const [now, was, top] = await Promise.all([ask(p.recent, false), ask(p.before, false), ask(p.recent, true)]);
      const total = (x: { rows?: GscRow[] }) => ({ clicks: n(x.rows?.[0]?.clicks), impressions: n(x.rows?.[0]?.impressions), position: x.rows?.[0]?.position ?? null });
      return { property, scope, recent: total(now), before: total(was), queries: (top.rows ?? []).map((r) => ({ query: r.keys?.[0] ?? '', clicks: n(r.clicks), impressions: n(r.impressions), position: r.position ?? null })).filter((r) => r.query), problem: null as string | null };
    })().catch((e) => ({ property: null as string | null, scope: null, recent: null, before: null, queries: [], problem: said(e) })),
    (async () => {
      const list: { id: string; name: string }[] = [];
      const r = await google<{ accountSummaries?: { propertySummaries?: { property: string; displayName?: string }[] }[] }>(token, 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200');
      for (const a of r.accountSummaries ?? []) for (const x of a.propertySummaries ?? []) list.push({ id: x.property, name: x.displayName ?? x.property });
      const stem = website.split('.')[0].replace(/[^a-z0-9]/g, '');
      const hit = stem.length >= 4 ? list.filter((x) => x.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(stem)) : [];
      if (hit.length !== 1) return { property: null as string | null, name: null as string | null, recent: null, before: null, listing: null, problem: hit.length ? 'More than one Analytics property fits ' + website + ': pick it in Connected Accounts.' : 'No Analytics property named for ' + website + ' on the connected Google login.' };
      const run = (range: { from: string; to: string }, listingOnly: boolean) =>
        google<GaReport>(token, 'https://analyticsdata.googleapis.com/v1beta/' + hit[0].id + ':runReport', {
          dateRanges: [{ startDate: range.from, endDate: range.to }],
          metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
          ...(listingOnly ? { dimensionFilter: { filter: { fieldName: 'sessionCampaignName', stringFilter: { matchType: 'EXACT', value: campaign } } } } : {}),
        });
      const read = (x: GaReport) => ({ sessions: Number(x.rows?.[0]?.metricValues?.[0]?.value ?? 0), keyEvents: Number(x.rows?.[0]?.metricValues?.[1]?.value ?? 0) });
      const [all, allWas, tag, tagWas] = await Promise.all([run(p.recent, false), run(p.before, false), run(p.recent, true), run(p.before, true)]);
      return { property: hit[0].id, name: hit[0].name, campaign, recent: read(all), before: read(allWas), listing: { recent: read(tag), before: read(tagWas) }, problem: null as string | null };
    })().catch((e) => ({ property: null as string | null, name: null as string | null, recent: null, before: null, listing: null, problem: said(e) })),
  ]);
  return { periods: { recent: p.recent, before: p.before }, page: url, gsc, ga };
}

async function build(main: Report, more: { r: Report; link: string }[], mainLink: string, userId: string | null, brand: { name: string; accent: string | null; logo: string | null } | null, withNumbers = false) {
  const scans = [scanOf(main, mainLink), ...more.map((x) => scanOf(x.r, x.link))].filter((s) => s.pins.length > 0);
  // The market: the city of the point nearest the grid's centre.
  const mid = Math.floor(main.gridSize / 2);
  const centre = main.pins.find((p) => p.rowIdx === mid && p.colIdx === mid) ?? main.pins[0];
  const website = domainOf(main.targetDomain ?? more.find((x) => x.r.targetDomain)?.r.targetDomain);
  // What is connected for this account: Google sign-in (Search Console and Analytics), and the
  // listing itself (watched once it is on a seat). Only whether; the numbers live in Connected Accounts.
  const [gsc, listing] = userId
    ? await Promise.all([
        db.googleConnection.findUnique({ where: { userId }, select: { userId: true } }).catch(() => null),
        db.gbpWatch.findFirst({ where: { title: { equals: main.targetBusiness, mode: 'insensitive' } }, select: { locationId: true } }).catch(() => null),
      ])
    : [null, null];
  // Google's own numbers, for the owner's pages only (never on a share link): the listing's
  // activity, then Search Console and Analytics for the page it links to.
  let numbers: { listing: Awaited<ReturnType<typeof listingActivity>> | null; search: Awaited<ReturnType<typeof searchActivity>> | null; problem: string | null } | null = null;
  if (withNumbers && userId) {
    const owner = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    const t = owner ? await listingFor(owner, main).catch(() => null) : null;
    const listing = t?.profile && t.location ? await listingActivity({ profile: t.profile, location: t.location }).catch(() => null) : null;
    const page = listing?.website ? listing.website.replace(/[?#].*$/, '') : null;
    // The campaign tag on the listing's own website link (utm_campaign), else the one the editor adds.
    const campaign = (() => {
      try {
        return (listing?.website && new URL(listing.website).searchParams.get('utm_campaign')) || 'gbp_listing';
      } catch {
        return 'gbp_listing';
      }
    })();
    const search = gsc && (website || page) ? await searchActivity(userId, website || domainOf(page), page, campaign).catch((e) => ({ periods: null, page: null, gsc: null, ga: null, problem: said(e) }) as never) : null;
    numbers = { listing, search, problem: null };
  }
  return {
    business: main.targetBusiness,
    website: website || null,
    market: centre?.city ? centre.city + (centre.stateCode ? ', ' + centre.stateCode : '') : null,
    built: new Date().toISOString(),
    scan: main.id,
    brand,
    google: { searchConsole: Boolean(gsc), profile: Boolean(listing) || Boolean(numbers?.listing), numbers },
    scans,
  };
}

/** For someone signed in: their own scan (an admin: any scan, with its owner's other scans). */
export async function visibilityForScan(id: string, me: { id: string; role: string }) {
  const admin = me.role === 'ADMIN';
  const main = await report({ id, ...(admin ? {} : { userId: me.id }) }, { admin });
  const owner = admin ? ((await db.gridScan.findUnique({ where: { id }, select: { userId: true } }))?.userId ?? null) : me.id;
  const list = owner ? await others(owner, main) : [];
  const more = (await Promise.all(list.map((o) => report({ id: o.id }, { admin }).then((r) => ({ r, link: '/scans/' + o.id })).catch(() => null)))).filter((x): x is { r: Report; link: string } => Boolean(x));
  return build(main, more, '/scans/' + id, owner, null, true);
}

/**
 * For a share link: the shared scan, and only those other scans of the business that the owner has
 * shared too (a link shares what was shared, nothing more). Under the owner's brand when they have one.
 */
export async function visibilityForShare(token: string, brand: { name: string; accent: string | null; logo: string | null } | null) {
  const main = await report({ shareToken: token });
  const owner = (await db.gridScan.findFirst({ where: { shareToken: token }, select: { userId: true } }))?.userId ?? null;
  const list = owner ? await others(owner, main, { shareToken: { not: null } }) : [];
  const more = (
    await Promise.all(list.map((o) => (o.shareToken ? report({ shareToken: o.shareToken }).then((r) => ({ r, link: '/share/' + o.shareToken })).catch(() => null) : null)))
  ).filter((x): x is { r: Report; link: string } => Boolean(x));
  return build(main, more, '/share/' + token, owner, brand);
}
