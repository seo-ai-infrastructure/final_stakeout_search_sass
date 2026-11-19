import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { businessKey, citesOf, kindOf, mentions, type AioPin } from '@stakeout/core/aioChecklist';
import { hostOf } from '@stakeout/core/brandHost';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser, readScope } from '@/lib/auth';
import { brandForShare } from '@/lib/brandShare';
import { readPublicPage } from '@/lib/pageCheck';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type C = { params: Promise<{ scanId: string }> };
const STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'DISMISSED'];
const PLAYBOOKS = ['CLAIM_LISTING', 'ASK_TO_BE_LISTED', 'PITCH_LOCAL_NEWS', 'PUBLISH_VIDEO', 'JOIN_THREAD', 'ANSWER_ON_YOUR_SITE'];
const checksOf = async (scanId: string) =>
  Object.fromEntries((await db.aioPageCheck.findMany({ where: { scanId }, select: { url: true, present: true, competitors: true, note: true } })).map((c: { url: string; present: boolean | null; competitors: number; note: string }) => [c.url, { present: c.present, competitors: c.competitors, note: c.note }]));

/**
 * GET /api/scans/:id/aio: for the AI citations tab, what a look at each cited page found, and
 * (for the scan's own account) where each checklist job stands. With ?share=1 the id is a share
 * token: a shared report gets the page findings only, never anyone's checklist.
 */
export async function GET(req: Request, c: C) {
  try {
    const id = (await c.params).scanId;
    if (new URL(req.url).searchParams.get('share') === '1') {
      const { allowed } = await brandForShare(id, hostOf(req.headers));
      const scan = allowed ? await db.gridScan.findFirst({ where: { shareToken: id }, select: { id: true } }) : null;
      if (!scan) throw new InputError('Report unavailable.', 404);
      return Response.json({ checks: await checksOf(scan.id), states: [] });
    }
    const me = await getAuthenticatedUser();
    const scan = await db.gridScan.findFirst({ where: { id, ...readScope(me) }, select: { id: true, userId: true, targetBusiness: true } });
    if (!scan) throw new InputError('Report unavailable.', 404);
    // The checklist belongs to the scan's owner: an admin looking at a customer's scan sees theirs.
    const states = await db.aioTaskState.findMany({ where: { userId: scan.userId, business: businessKey(scan.targetBusiness) }, select: { target: true, playbook: true, status: true, originScanId: true, verifiedScanId: true, updatedAt: true } });
    return Response.json({ checks: await checksOf(scan.id), states });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/scans/:id/aio (the scan's account, or an admin)
 *   { action: "status", target, playbook, status }   where a checklist job stands
 *   { action: "verify", target, playbook }           this scan shows the job worked
 *   { action: "check", urls }                        look at up to 15 of the pages this scan's AI
 *                                                    answers cited: is the business on them?
 * Only pages this scan really cited are ever fetched, so this cannot be used to fetch anything else.
 */
export async function POST(req: Request, c: C) {
  try {
    const id = (await c.params).scanId;
    const me = await getAuthenticatedUser();
    const scan = await db.gridScan.findFirst({ where: { id, ...readScope(me) }, select: { id: true, userId: true, targetBusiness: true, targetDomain: true } });
    if (!scan) throw new InputError('Report unavailable.', 404);
    const b = (await req.json()) as { action?: unknown; target?: unknown; playbook?: unknown; status?: unknown; urls?: unknown };
    const business = businessKey(scan.targetBusiness);

    if (b.action === 'status' || b.action === 'verify') {
      const target = String(b.target ?? '').slice(0, 1000), playbook = String(b.playbook ?? '');
      if (!target || !PLAYBOOKS.includes(playbook)) throw new InputError('Unknown job.');
      const status = b.action === 'verify' ? 'DONE' : String(b.status ?? '');
      if (!STATUSES.includes(status)) throw new InputError('Unknown status.');
      const key = { userId_business_target_playbook: { userId: scan.userId, business, target, playbook } };
      const data = { status, updatedAt: new Date(), ...(b.action === 'verify' ? { verifiedScanId: scan.id } : status === 'OPEN' ? { verifiedScanId: null } : {}) };
      const state = await db.aioTaskState.upsert({ where: key, update: data, create: { userId: scan.userId, business, target, playbook, originScanId: scan.id, ...data } });
      return Response.json({ state: { target: state.target, playbook: state.playbook, status: state.status, originScanId: state.originScanId, verifiedScanId: state.verifiedScanId, updatedAt: state.updatedAt } });
    }

    if (b.action === 'check') {
      const pins = (await db.gridPin.findMany({ where: { scanId: scan.id, status: 'COMPLETED' }, select: { id: true, rowIdx: true, colIdx: true, status: true, hasAiOverview: true, aiCitations: true, insights: true, topCompetitors: true } })) as unknown as (AioPin & { topCompetitors: string[] | null })[];
      const cited = new Set(pins.flatMap((p) => citesOf(p).map((x) => x.url)));
      const asked = [...new Set((Array.isArray(b.urls) ? b.urls : []).map(String))].filter((u) => cited.has(u) && kindOf(u, scan.targetDomain) !== 'own').slice(0, 15);
      if (!asked.length) throw new InputError('None of those pages was cited in this scan.');
      // The rivals looked for: the five businesses that most often ranked in the top three here.
      const seen = new Map<string, number>();
      for (const p of pins) for (const n of (p.topCompetitors ?? []).slice(0, 3)) if (businessKey(n) !== business) seen.set(n, (seen.get(n) ?? 0) + 1);
      const rivals = [...seen].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([n]) => n);

      let next = 0;
      await Promise.all(Array.from({ length: 5 }, async () => {
        for (let url = asked[next++]; url; url = asked[next++]) {
          const page = await readPublicPage(url);
          const found = page.note === 'ok'
            ? { present: mentions(page.text + ' ' + page.html, { name: scan.targetBusiness, domain: scan.targetDomain }), competitors: rivals.filter((n) => mentions(page.text, { name: n })).length }
            : { present: null, competitors: 0 };
          await db.aioPageCheck.upsert({ where: { scanId_url: { scanId: scan.id, url } }, update: { ...found, note: page.note, checkedAt: new Date() }, create: { scanId: scan.id, url, ...found, note: page.note } });
        }
      }));
      return Response.json({ checks: await checksOf(scan.id), checked: asked.length });
    }
    throw new InputError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}
