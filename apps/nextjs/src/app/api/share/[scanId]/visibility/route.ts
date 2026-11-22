import { errorResponse } from '@/lib/api';
import { InputError } from '@stakeout/core/grid';
import { hostOf } from '@stakeout/core/brandHost';
import { brandForShare } from '@/lib/brandShare';
import { visibilityForShare } from '@/lib/visibilityReport';

export const dynamic = 'force-dynamic';

/**
 * The visibility report behind a share link (/reports/visibility.html?share=…): the shared scan and
 * the owner's other shared scans of the same business. A white-label domain shows only its own
 * account's reports, under its own name and logo.
 */
export async function GET(req: Request, c: { params: Promise<{ scanId: string }> }) {
  try {
    const token = (await c.params).scanId;
    const { allowed, brand } = await brandForShare(token, hostOf(req.headers));
    if (!allowed) throw new InputError('Report unavailable.', 404);
    return Response.json(await visibilityForShare(token, brand), { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
  } catch (e) {
    return errorResponse(e);
  }
}
