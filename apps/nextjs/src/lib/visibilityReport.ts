import { db } from '@stakeout/db';
import { pinAi } from '@stakeout/core/aiFlags';
import { oneBoxOf } from '@stakeout/core/localRank';
import { report } from './reports';
import { searchShare } from './reportSummary';
import type { InsightPin } from './marketInsights';

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

async function build(main: Report, more: { r: Report; link: string }[], mainLink: string, userId: string | null, brand: { name: string; accent: string | null; logo: string | null } | null) {
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
  return {
    business: main.targetBusiness,
    website: website || null,
    market: centre?.city ? centre.city + (centre.stateCode ? ', ' + centre.stateCode : '') : null,
    built: new Date().toISOString(),
    scan: main.id,
    brand,
    google: { searchConsole: Boolean(gsc), profile: Boolean(listing) },
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
  return build(main, more, '/scans/' + id, owner, null);
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
