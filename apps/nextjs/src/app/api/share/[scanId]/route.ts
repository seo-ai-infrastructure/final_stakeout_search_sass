import { report } from '@/lib/reports';
import { errorResponse } from '@/lib/api';
import { InputError } from '@stakeout/core/grid';
import { hostOf } from '@stakeout/core/brandHost';
import { brandForShare } from '@/lib/brandShare';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, c: { params: Promise<{ scanId: string }> }) {
  try {
    const token = (await c.params).scanId;
    // A white-label domain shows only its own account's reports, under its own name and logo.
    const { allowed, brand } = await brandForShare(token, hostOf(req.headers));
    if (!allowed) throw new InputError('Report unavailable.', 404);
    return Response.json({ ...(await report({ shareToken: token })), brand });
  } catch (e) {
    return errorResponse(e);
  }
}
