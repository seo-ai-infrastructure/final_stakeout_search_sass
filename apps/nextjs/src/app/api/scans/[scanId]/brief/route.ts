import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { redis } from '@stakeout/core/redis';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { visibilityForScan } from '@/lib/visibilityReport';
import { assumptionsKey, buildBrief, cleanAssumptions, defaultsFor } from '@/lib/brief';
import { canCompile, compilePrompt, compilesBriefs } from '@/lib/briefStore';

export const maxDuration = 60;
type C = { params: Promise<{ scanId: string }> };

async function ownerOf(id: string, me: { id: string; role: string }) {
  const s = await db.gridScan.findUnique({ where: { id }, select: { userId: true, targetBusiness: true, keyword: true } });
  if (!s || (s.userId !== me.id && me.role !== 'ADMIN')) throw new InputError('Scan not found.', 404);
  return s;
}

/**
 * The local search and revenue brief (/reports/brief.html?scan=…) for someone signed in: the scan,
 * the business's other scans, its Google numbers when connected, and local prices (a first view may
 * pay for a lookup; kept 45 days per place and search). It recalculates on every open; compiling keeps a copy.
 */
export async function GET(_: Request, c: C) {
  try {
    const id = (await c.params).scanId;
    const me = await getAuthenticatedUser();
    const s = await ownerOf(id, me);
    // With the account plans a brief is compiled, not read live: the page asks first.
    if (await compilesBriefs(me)) return Response.json(await compilePrompt(id, me), { headers: { 'Cache-Control': 'private, no-store' } });
    const v = await visibilityForScan(id, me);
    const kept = await redis().get(assumptionsKey(s.userId, s.targetBusiness)).catch(() => null);
    const brief = await buildBrief(v, { lookUp: true, assumptions: kept ? JSON.parse(kept) : null, link: { report: '/reports/visibility.html?scan=' + encodeURIComponent(id) } });
    return Response.json({ ...brief, canEdit: true, canCompile: canCompile(me) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST { assumptions: { qualified, close, value, tap, cpc } }: the client's own inputs for the modeled figures. */
export async function POST(req: Request, c: C) {
  try {
    const id = (await c.params).scanId;
    const me = await getAuthenticatedUser();
    const s = await ownerOf(id, me);
    const b = (await req.json().catch(() => ({}))) as { assumptions?: unknown; reset?: unknown };
    const key = assumptionsKey(s.userId, s.targetBusiness);
    if (b.reset === true) {
      await redis().del(key);
      return Response.json({ ok: true, assumptions: null });
    }
    const a = cleanAssumptions(b.assumptions, defaultsFor([s.keyword]));
    await redis().set(key, JSON.stringify(a));
    return Response.json({ ok: true, assumptions: a });
  } catch (e) {
    return errorResponse(e);
  }
}
