import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { topRivals } from '@stakeout/core/gbpGaps';
import { toolCall, type Call } from '@stakeout/core/agentTools';
import { acting, type ActingUser } from '@/lib/acting';
import { GET as listings } from '@/app/api/admin/gbp/route';
import { GET as location } from '@/app/api/admin/gbp/location/route';
import { GET as insights } from '@/app/api/admin/gbp/insights/route';
import { GET as extrasGet, POST as extrasPost } from '@/app/api/admin/gbp/extras/route';
import { GET as reviewsGet, POST as reviewsPost } from '@/app/api/admin/gbp/reviews/route';
import { GET as postsGet, POST as postsPost, PATCH as postsPatch, DELETE as postsDelete } from '@/app/api/admin/gbp/posts/route';
import { GET as queuesGet, POST as queuesPost } from '@/app/api/admin/gbp/queues/route';
import { GET as mediaGet, POST as mediaPost, DELETE as mediaDelete } from '@/app/api/admin/gbp/media/route';
import { GET as categories } from '@/app/api/admin/gbp/categories/route';
import { POST as overview } from '@/app/api/admin/google/overview/route';
import { POST as update } from '@/app/api/admin/gbp/update/route';
import { GET as watch, POST as watchPost } from '@/app/api/admin/gbp/watch/route';
import { POST as explore } from '@/app/api/admin/google/explore/route';
import { GET as site } from '@/app/api/admin/google/site/route';
import { GET as scans } from '@/app/api/scans/route';
import { POST as scanCreate } from '@/app/api/scans/create/route';
import { getListed } from '@stakeout/core/citeSites';
import { needsReply, isLow, type Review } from '@stakeout/core/gbpReviews';
import type { GbpChange } from '@stakeout/core/gbp';
import type { GbpPost } from '@stakeout/core/gbpPosts';
import { keptRivals } from '@/lib/rivals';
import { siteFromScans } from '@/lib/businessSite';
import { agentBudget, reserveAgentCredits } from '@/lib/agentLimits';
import { postproxy } from '@/lib/postproxy';
import { appUrl } from '@/lib/mailer';

/**
 * Carries out a tool call for an account's AI agent by handing it to the same handler the site's
 * own pages use, as that account. So an agent meets every check a person does (whose listing it
 * is, the plan it is on, what Google allows), and nothing an agent does skips the edit log.
 */
type Handler = (req: Request) => Promise<Response>;
const ROUTES: Record<string, Handler> = {
  'listings GET': listings as unknown as Handler,
  'location GET': location,
  'insights GET': insights,
  'extras GET': extrasGet,
  'extras POST': extrasPost,
  'reviews GET': reviewsGet,
  'reviews POST': reviewsPost,
  'posts GET': postsGet,
  'posts POST': postsPost,
  'posts PATCH': postsPatch,
  'posts DELETE': postsDelete,
  'queues GET': queuesGet,
  'queues POST': queuesPost,
  'media GET': mediaGet,
  'media POST': mediaPost,
  'media DELETE': mediaDelete,
  'categories GET': categories,
  'overview POST': overview,
  'watch POST': watchPost,
  'update POST': update,
  'watch GET': watch as unknown as Handler,
  'explore POST': explore,
  'site GET': site,
  'scans GET': scans as unknown as Handler,
  'scan-create POST': scanCreate,
};

/** One scan, small enough for an agent to read: the rank at each point and who showed up most above the business. */
async function scanSummary(user: ActingUser, id: string) {
  const scan = await db.gridScan.findFirst({
    where: { id, ...(user.role === 'ADMIN' ? {} : { userId: user.id }) },
    select: { id: true, userId: true, targetType: true, keyword: true, targetBusiness: true, targetDomain: true, centerLat: true, centerLng: true, status: true, solv: true, gridSize: true, spacingKm: true, city: true, stateCode: true, totalPins: true, completedPins: true, failedPins: true, createdAt: true, trackAiOverviews: true },
  });
  if (!scan) throw new InputError('Unknown scan.', 404);
  const pins = await db.gridPin.findMany({ where: { scanId: id }, orderBy: [{ rowIdx: 'asc' }, { colIdx: 'asc' }], select: { rowIdx: true, colIdx: true, city: true, status: true, rankFound: true, topCompetitors: true, hasAiOverview: true, targetCitedInAi: true, aiCitations: true } });
  const done = pins.filter((p) => p.status === 'COMPLETED');
  const ranked = done.filter((p) => p.rankFound !== null);
  const rivals = topRivals(done.map((p) => ({ status: p.status, topCompetitors: p.topCompetitors as string[] | null })), scan.targetBusiness, 8);
  // Categories, rating and review count for the three most often above the business, from what is already kept.
  const known = await keptRivals(rivals.slice(0, 3).map((r) => r.name), scan.centerLat, scan.centerLng).catch(() => ({}) as Awaited<ReturnType<typeof keptRivals>>);
  const answered = done.filter((p) => p.hasAiOverview);
  const maps = scan.targetType === 'mobile_maps';
  const { userId: _owner, targetDomain: _site, targetType: _type, trackAiOverviews: _ai, centerLat: _lat, centerLng: _lng, ...shown } = scan;
  // A scan with no website of its own borrows the one from the account's other scans of the same business.
  const website = scan.targetDomain ?? (await siteFromScans(scan.userId, scan.targetBusiness).catch(() => null));
  const cited = getListed(done, website);
  return {
    ...shown,
    website,
    searchedIn: maps ? 'Google Maps app' : 'Google search in Chrome',
    points: pins.map((p) => ({ row: p.rowIdx, col: p.colIdx, city: p.city, status: p.status, rank: p.rankFound, ...(scan.trackAiOverviews ? { aiAnswer: p.hasAiOverview, citedInAi: p.targetCitedInAi } : {}) })),
    averageRank: ranked.length ? Math.round((ranked.reduce((n, p) => n + (p.rankFound ?? 0), 0) / ranked.length) * 10) / 10 : null,
    notFoundAt: done.length - ranked.length,
    topRivals: rivals.map((r, i) => (i < 3 ? { ...r, ...(known[r.name] ?? { details: 'Not looked up yet: a person can open this scan’s rival comparison on the site to fetch them.' }) } : r)),
    ...(maps ? { aiAnswers: 'Not applicable: this scan searched the Google Maps app, which shows no AI Overview. A scan in Google search (the default) always records them.' } : {}),
    ...(scan.trackAiOverviews ? { aiAnswers: { pointsWithAnAnswer: answered.length, pointsCitingTheBusiness: answered.filter((p) => p.targetCitedInAi).length, ownSiteCitedAt: cited.ownAnswers, mostCitedSites: [...cited.act, ...cited.others].sort((a, b) => b.answers - a.answers).slice(0, 10).map((c) => ({ site: c.site, name: c.name, answers: c.answers, share: c.share })) } } : {}),
  };
}

/** Keeps an answer to a size an agent can take in: long lists are cut, and the cut is said. */
function trim(v: unknown, depth = 0): unknown {
  if (Array.isArray(v)) {
    const max = depth === 0 ? 400 : 250;
    const out = v.slice(0, max).map((x) => trim(x, depth + 1));
    return v.length > max ? [...out, `…and ${v.length - max} more`] : out;
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, trim(x, depth + 1)]));
  return typeof v === 'string' && v.length > 6000 ? v.slice(0, 6000) + '…' : v;
}

type Invoke = <T = Record<string, unknown>>(route: string, method: string, o?: { query?: Record<string, string>; body?: Record<string, unknown> }) => Promise<T>;
/** Fields an agent may settle by itself when someone else changed them; everything else waits for a person. */
const SAFE_FIELDS = new Set(['description', 'regularHours', 'specialHours']);

/**
 * Decides one change the watchdog found. A description or hours are accepted or put back at once
 * (the edit goes through the editor's own checks and its log). An identity field is left open: the
 * answer says a person has to decide it, so an agent can never confirm or undo one by itself.
 */
async function resolveChange(invoke: Invoke, b: { id: string; action: 'accept' | 'revert' }) {
  const w = await invoke<{ open: { id: string; profileId: string; locationId: string; title: string | null; field: string; label: string; was: string; now: string; revert: GbpChange | null }[] }>('watch', 'GET');
  const d = w.open.find((x) => x.id === b.id);
  if (!d) throw new InputError('Unknown change, or one that has already been dealt with. list_changes shows the open ones.', 404);
  const about = { listing: d.title, field: d.label, was: d.was, now: d.now };
  const staged = (why: string) => ({ done: false, staged: true, ...about, message: why + ' Nothing was changed. A person decides it on the Changes tab: ' + appUrl('/profiles?tab=changes') });
  if (!SAFE_FIELDS.has(d.field)) return staged(`“${d.label}” is an identity field, which an agent may not confirm or undo.`);
  if (b.action === 'accept') {
    await invoke('watch', 'POST', { body: { action: 'keep', id: d.id } });
    return { done: true, action: 'accepted', ...about };
  }
  if (!d.revert) return staged('This change cannot be put back from here (the earlier value is no longer held, or the hours are a kind the editor cannot write).');
  let edit: Record<string, unknown> | null = null;
  try {
    edit = await invoke('update', 'POST', { body: { profile: d.profileId, location: d.locationId, change: d.revert as Record<string, unknown> } });
  } catch (e) {
    // Already back as it was (Google or someone else got there first): the change is still closed.
    if (!(e instanceof InputError) || !/^Nothing to change/.test(e.message)) throw e;
  }
  await invoke('watch', 'POST', { body: { action: 'reverted', id: d.id } });
  return { done: true, action: 'reverted', ...about, ...(edit ? { edit: { status: edit.status, waiting: edit.waiting } } : {}) };
}

/** One short read of what needs attention. Each part is read on its own, so one that fails does not hide the rest. */
async function briefing(user: ActingUser, invoke: Invoke) {
  const part = async <T,>(f: () => Promise<T>): Promise<T | { problem: string }> => { try { return await f(); } catch (e) { return { problem: e instanceof InputError ? e.message : 'Could not be read just now.' }; } };
  const listed = await part(() => invoke<{ profiles: { id: string; name: string; locations: { id: string; name: string; plan: string | null }[] }[] }>('listings', 'GET'));
  // The listings an agent can work on: the ones on a plan (for an admin, the first dozen).
  const mine = 'profiles' in listed ? listed.profiles.flatMap((p) => p.locations.filter((l) => l.plan).map((l) => ({ profile: p.id, location: l.id, name: l.name }))).slice(0, 12) : [];
  const [changes, reviews, posts, scans, budget, activity] = await Promise.all([
    part(async () => {
      const w = await invoke<{ open: { id: string; title: string | null; field: string; label: string; was: string; now: string }[] }>('watch', 'GET');
      return { waiting: w.open.length, first: w.open.slice(0, 8).map((d) => ({ id: d.id, listing: d.title, field: d.label, was: d.was.slice(0, 120), now: d.now.slice(0, 120), agentMayResolve: SAFE_FIELDS.has(d.field) })) };
    }),
    part(async () => {
      const pages = await Promise.all(mine.slice(0, 8).map((l) => invoke<{ reviews: Review[]; total: number }>('reviews', 'GET', { query: { profile: l.profile, location: l.location, page: '1' } }).then((r) => ({ l, r })).catch(() => null)));
      const open = pages.flatMap((x) => (x ? x.r.reviews.filter(needsReply).map((r) => ({ x, r })) : []));
      return {
        listingsRead: pages.filter(Boolean).length, withoutReply: open.length, withoutReplyAt3StarsOrFewer: open.filter((o) => isLow(o.r)).length,
        draftsWaitingForAPerson: open.filter((o) => o.r.agentDraft).length,
        oldestFirst: open.sort((a, b) => String(a.r.postedAt).localeCompare(String(b.r.postedAt))).slice(0, 6).map((o) => ({ profile: o.x.l.profile, listing: o.x.l.name, review: o.r.id, stars: o.r.stars, author: o.r.author, postedAt: o.r.postedAt, text: o.r.text.slice(0, 160), hasDraft: Boolean(o.r.agentDraft) })),
        note: 'From the newest 50 reviews of each listing.',
      };
    }),
    part(async () => {
      const all = await invoke<{ posts: (GbpPost & { profile: string })[] }>('posts', 'GET', { query: { all: '1' } });
      const names = new Map(mine.map((l) => [l.location, l.name]));
      const waiting = all.posts.filter((p) => p.state === 'scheduled'), week = Date.now() - 7 * 86400000;
      const out = all.posts.filter((p) => p.state === 'published' && Date.parse(String(p.at)) > week);
      return {
        scheduled: waiting.length, next: waiting[0] ? { listing: names.get(waiting[0].location) ?? waiting[0].location, at: waiting[0].at } : null, publishedLast7Days: out.length,
        failed: all.posts.filter((p) => p.state === 'failed' && Date.parse(String(p.at)) > Date.now() - 14 * 86400000).slice(0, 5).map((p) => ({ listing: names.get(p.location) ?? p.location, id: p.id, at: p.at, error: p.error })),
        listingsWithNoPostIn7Days: mine.filter((l) => !out.some((p) => p.location === l.location) && !waiting.some((p) => p.location === l.location)).map((l) => l.name).slice(0, 12),
      };
    }),
    part(async () => {
      const rows = await db.gridScan.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 40, select: { id: true, keyword: true, targetBusiness: true, status: true, solv: true, createdAt: true } });
      const same = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.keyword.toLowerCase() === b.keyword.toLowerCase() && a.targetBusiness.toLowerCase() === b.targetBusiness.toLowerCase();
      return rows.slice(0, 6).map((s, i) => {
        const before = rows.slice(i + 1).find((x) => x.status === 'COMPLETED' && same(x, s));
        return { id: s.id, keyword: s.keyword, business: s.targetBusiness, status: s.status, at: s.createdAt, shareOfLocalVoice: s.solv, before: before ? { id: before.id, shareOfLocalVoice: before.solv, at: before.createdAt } : null };
      });
    }),
    part(() => agentBudget(user.id).then((b) => ({ scanCreditsLeftThisMonth: b.left, monthlyLimit: b.cap, usedThisMonth: b.used }))),
    // The service's own tally of the last week: every connected account for an admin, a customer's own otherwise. Left out when it cannot be read.
    (async () => {
      type Sum = { posts?: { published?: number; published_previous?: number | null; failed?: number }; reviews?: { awaiting_reply?: number } };
      const groups = user.role === 'ADMIN' ? [undefined] : (await db.gbpAccount.findMany({ where: { userId: user.id, profileId: { not: null } }, select: { groupId: true }, take: 5 }).catch(() => [])).map((g: { groupId: string }) => g.groupId);
      const got = (await Promise.all(groups.map((g: string | undefined) => postproxy<Sum>('/api/summary', { query: { window: '7d', profile_group_id: g } }).catch(() => null)))).filter((r): r is Sum => Boolean(r?.posts));
      if (!got.length) return null;
      const sum = (f: (r: Sum) => number | null | undefined) => got.reduce((n, r) => n + (Number(f(r)) || 0), 0);
      return { last7Days: { postsPublished: sum((r) => r.posts?.published), postsPublishedTheWeekBefore: sum((r) => r.posts?.published_previous), postsFailed: sum((r) => r.posts?.failed) }, reviewsAwaitingReplyOnTheWholeGoogleAccount: sum((r) => r.reviews?.awaiting_reply) };
    })(),
  ]);
  return {
    asOf: new Date().toISOString(),
    // An admin reaches every connected listing, so "on a plan" would be wrong for one: this briefing looks at the first dozen and says so.
    listings: 'profiles' in listed
      ? user.role === 'ADMIN'
        ? { connected: listed.profiles.reduce((n, p) => n + p.locations.length, 0), coveredByThisBriefing: mine.length, note: 'An admin account reaches every connected listing. The reviews and posts below cover only the listings in `list` (the first ' + mine.length + '); use list_listings and the listing tools for the rest.', list: mine }
        : { onAPlan: mine.length, connected: listed.profiles.reduce((n, p) => n + p.locations.length, 0), list: mine }
      : listed,
    changesNobodyHereMade: changes, reviews, posts, latestScans: scans, agentScanBudget: budget, ...(activity ? { activity } : {}),
  };
}

/** Runs one tool for this account and returns its answer, or throws what went wrong in plain words. */
export async function runTool(user: ActingUser, name: string, args: Record<string, unknown>, origin: string): Promise<unknown> {
  const call: Call | string = toolCall(name, args);
  if (typeof call === 'string') throw new InputError(call);
  return acting.run({ user }, async () => {
    const invoke: Invoke = async <T,>(route: string, method: string, o: { query?: Record<string, string>; body?: Record<string, unknown> } = {}) => {
      const handler = ROUTES[route + ' ' + method];
      if (!handler) throw new InputError('Unknown tool.');
      const url = new URL(origin + '/agent/' + route);
      for (const [k, v] of Object.entries(o.query ?? {})) url.searchParams.set(k, v);
      const res = await handler(new Request(url, { method, ...(o.body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o.body) } : {}) }));
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new InputError(data?.error ?? 'That did not work.', res.status);
      return data as T;
    };
    if (call.route === 'scan') return scanSummary(user, String(call.query?.scanId));
    if (call.route === 'briefing') return trim(await briefing(user, invoke));
    if (call.route === 'resolve') return resolveChange(invoke, call.body as { id: string; action: 'accept' | 'revert' });
    if (call.route === 'scan-create') {
      // An agent's scans count against the account's monthly limit; the credits go back if the scan does not start.
      const size = Number(call.body?.gridSize) || 5;
      const back = await reserveAgentCredits(user.id, size * size);
      try {
        const made = await invoke<{ scanId: string; creditsCharged: number }>('scan-create', 'POST', { body: call.body });
        const b = await agentBudget(user.id).catch(() => null);
        return { ...made, ...(b ? { agentCreditsLeftThisMonth: b.left } : {}) };
      } catch (e) {
        await back();
        throw e;
      }
    }
    return trim(await invoke(call.route, call.method, { query: call.query, body: call.body }));
  });
}
