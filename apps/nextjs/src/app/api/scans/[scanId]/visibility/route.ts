import { db } from '@stakeout/db';
import { pinAi } from '@stakeout/core/aiFlags';
import { oneBoxOf } from '@stakeout/core/localRank';
import { report } from '@/lib/reports';
import { getAuthenticatedUser, readScope } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { InputError } from '@stakeout/core/grid';
import { searchShare } from '@/lib/reportSummary';
import type { InsightPin } from '@/lib/marketInsights';

type C = { params: Promise<{ scanId: string }> };
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
 * One point as the visibility report reads it: where it is, the map pack, and the AI Overview by
 * its four flags (or the earlier reading, or unparsed), with the first three businesses the phone saw.
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
    status: p.status,
    rank: p.status === 'COMPLETED' ? (p.rankFound ?? null) : null,
    /** A map pack (or a single-business panel) was on the page. */
    pack: p.status === 'COMPLETED' && !m?.noLocal,
    oneBox: p.status === 'COMPLETED' ? oneBoxOf(p.proxyMeta, p.rankFound) : null,
    aiShown: p.status === 'COMPLETED' && Boolean(p.hasAiOverview),
    old: Boolean(p.targetCitedInAi),
    state: p.status !== 'COMPLETED' || !p.hasAiOverview ? 'none' : a.state,
    featured: a.state === 'parsed' && f ? (f.kind === 'card' ? { card: f.card_position, of: f.card_count ?? null, afterMore: f.after_expansion === true } : { inline: true }) : null,
    named: a.state === 'parsed' && a.named,
    listing: a.state === 'parsed' && a.listing ? (a.listing.links ? { links: a.listing.links } : { inSources: a.listing.inSources }) : null,
    website: a.state === 'parsed' ? (a.websiteCited === 'verified' ? 'confirmed' : a.websiteCited === 'unverified' ? 'possible' : null) : null,
    first: ((p.topCompetitors as string[] | null) ?? []).slice(0, 3),
    sources: [...new Set(sources)].slice(0, 12),
  };
}

function scanOf(s: Report) {
  const done = s.pins.filter((p) => p.status === 'COMPLETED');
  const share = searchShare(s.pins as unknown as InsightPin[], s.targetBusiness, { pageOne: s.scoring?.pageOne === true });
  return {
    id: s.id,
    kw: s.keyword,
    at: s.createdAt,
    size: s.gridSize,
    km: s.spacingKm,
    status: s.status,
    points: done.length,
    failed: s.pins.length - done.length,
    share: { rule: share.rule, share: share.share, wins: share.wins, points: share.points, packTop3: share.local.top3, packPoints: share.local.points, aiOnly: share.ai.onlyWins, left: share.noLocalSurface + share.unknown },
    pins: s.pins.filter((p) => p.status === 'COMPLETED').map(pointOf),
  };
}

/**
 * The data behind the visibility report (/reports/visibility.html?scan=…): the scan, and up to
 * seven other finished scans of the same business by the same account, newest first. Admins only
 * for now.
 */
export async function GET(_: Request, c: C) {
  try {
    const id = (await c.params).scanId;
    const me = await getAuthenticatedUser();
    if (me.role !== 'ADMIN') throw new InputError('Report unavailable.', 404);
    const main = await report({ id, ...readScope(me) }, { admin: true });
    const owner = await db.gridScan.findUnique({ where: { id }, select: { userId: true } });
    const others = owner
      ? await db.gridScan.findMany({
          where: { userId: owner.userId, id: { not: id }, targetBusiness: { equals: main.targetBusiness, mode: 'insensitive' }, status: { in: ['COMPLETED', 'PARTIAL'] }, completedPins: { gt: 0 } },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
          take: 7,
        })
      : [];
    const more = (await Promise.all(others.map((o) => report({ id: o.id }, { admin: true }).catch(() => null)))).filter((x): x is Report => Boolean(x));
    const scans = [main, ...more].map(scanOf).filter((s) => s.pins.length > 0);
    // The market: the city of the point nearest the grid's centre.
    const mid = Math.floor(main.gridSize / 2);
    const centre = main.pins.find((p) => p.rowIdx === mid && p.colIdx === mid) ?? main.pins[0];
    const website = domainOf(main.targetDomain ?? more.find((x) => x.targetDomain)?.targetDomain);
    // What is connected for this account: Google sign-in (Search Console and Analytics), and the
    // listing itself (watched once it is on a seat). Only whether; the numbers live in Connected Accounts.
    const [gsc, listing] = owner
      ? await Promise.all([
          db.googleConnection.findUnique({ where: { userId: owner.userId }, select: { userId: true } }).catch(() => null),
          db.gbpWatch.findFirst({ where: { title: { equals: main.targetBusiness, mode: 'insensitive' } }, select: { locationId: true } }).catch(() => null),
        ])
      : [null, null];
    return Response.json(
      {
        business: main.targetBusiness,
        website: website || null,
        market: centre?.city ? centre.city + (centre.stateCode ? ', ' + centre.stateCode : '') : null,
        app: '/scans/',
        built: new Date().toISOString(),
        scan: id,
        google: { searchConsole: Boolean(gsc), profile: Boolean(listing) },
        scans,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
