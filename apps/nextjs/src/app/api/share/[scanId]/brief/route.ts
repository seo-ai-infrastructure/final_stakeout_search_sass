import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { hostOf } from '@stakeout/core/brandHost';
import { redis } from '@stakeout/core/redis';
import { errorResponse } from '@/lib/api';
import { brandForShare } from '@/lib/brandShare';
import { visibilityForShare } from '@/lib/visibilityReport';
import { assumptionsKey, buildBrief } from '@/lib/brief';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The brief behind a share link (/reports/brief.html?share=…). It shows what the visibility report's
 * share link shows, with the owner's own inputs; local prices only when already looked up (a share
 * link never pays for a lookup).
 */
export async function GET(req: Request, c: { params: Promise<{ scanId: string }> }) {
  try {
    const token = (await c.params).scanId;
    const { allowed, brand } = await brandForShare(token, hostOf(req.headers));
    if (!allowed) throw new InputError('Report unavailable.', 404);
    const s = await db.gridScan.findFirst({ where: { shareToken: token }, select: { userId: true, targetBusiness: true } });
    if (!s) throw new InputError('Report unavailable.', 404);
    const v = await visibilityForShare(token, brand);
    const kept = await redis().get(assumptionsKey(s.userId, s.targetBusiness)).catch(() => null);
    const brief = await buildBrief(v, { lookUp: false, assumptions: kept ? JSON.parse(kept) : null, link: { report: '/reports/visibility.html?share=' + encodeURIComponent(token) } });
    return Response.json({ ...brief, canEdit: false }, { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
  } catch (e) {
    return errorResponse(e);
  }
}
