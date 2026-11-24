import { errorResponse } from '@/lib/api';
import { briefByToken } from '@/lib/briefStore';
import { hostOf } from '@stakeout/core/brandHost';

export const dynamic = 'force-dynamic';

/**
 * A compiled brief behind its share link (/reports/brief.html?b=…): read-only, never a paid look-up.
 * Under the owner's white label; a white-label domain opens only its own account's briefs.
 */
export async function GET(req: Request, c: { params: Promise<{ token: string }> }) {
  try {
    return Response.json(await briefByToken((await c.params).token, hostOf(req.headers)), { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
  } catch (e) {
    return errorResponse(e);
  }
}
