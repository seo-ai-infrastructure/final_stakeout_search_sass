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
import { GET as postsGet, POST as postsPost, DELETE as postsDelete } from '@/app/api/admin/gbp/posts/route';
import { POST as update } from '@/app/api/admin/gbp/update/route';
import { GET as watch } from '@/app/api/admin/gbp/watch/route';
import { POST as explore } from '@/app/api/admin/google/explore/route';
import { GET as site } from '@/app/api/admin/google/site/route';
import { GET as scans } from '@/app/api/scans/route';
import { POST as scanCreate } from '@/app/api/scans/create/route';

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
  'posts DELETE': postsDelete,
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
    select: { id: true, keyword: true, targetBusiness: true, status: true, solv: true, gridSize: true, spacingKm: true, city: true, stateCode: true, totalPins: true, completedPins: true, failedPins: true, createdAt: true, trackAiOverviews: true },
  });
  if (!scan) throw new InputError('Unknown scan.', 404);
  const pins = await db.gridPin.findMany({ where: { scanId: id }, orderBy: [{ rowIdx: 'asc' }, { colIdx: 'asc' }], select: { rowIdx: true, colIdx: true, city: true, status: true, rankFound: true, topCompetitors: true, hasAiOverview: true, targetCitedInAi: true } });
  const done = pins.filter((p) => p.status === 'COMPLETED');
  const ranked = done.filter((p) => p.rankFound !== null);
  return {
    ...scan,
    points: pins.map((p) => ({ row: p.rowIdx, col: p.colIdx, city: p.city, status: p.status, rank: p.rankFound, ...(scan.trackAiOverviews ? { aiAnswer: p.hasAiOverview, citedInAi: p.targetCitedInAi } : {}) })),
    averageRank: ranked.length ? Math.round((ranked.reduce((n, p) => n + (p.rankFound ?? 0), 0) / ranked.length) * 10) / 10 : null,
    notFoundAt: done.length - ranked.length,
    topRivals: topRivals(done.map((p) => ({ status: p.status, topCompetitors: p.topCompetitors as string[] | null })), scan.targetBusiness, 8),
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

/** Runs one tool for this account and returns its answer, or throws what went wrong in plain words. */
export async function runTool(user: ActingUser, name: string, args: Record<string, unknown>, origin: string): Promise<unknown> {
  const call: Call | string = toolCall(name, args);
  if (typeof call === 'string') throw new InputError(call);
  return acting.run({ user }, async () => {
    if (call.route === 'scan') return scanSummary(user, String(call.query?.scanId));
    const handler = ROUTES[call.route + ' ' + call.method];
    if (!handler) throw new InputError('Unknown tool.');
    const url = new URL(origin + '/agent/' + call.route);
    for (const [k, v] of Object.entries(call.query ?? {})) url.searchParams.set(k, v);
    const res = await handler(new Request(url, { method: call.method, ...(call.body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(call.body) } : {}) }));
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new InputError(data?.error ?? 'That did not work.', res.status);
    return trim(data);
  });
}
