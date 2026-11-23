import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { InputError } from '@stakeout/core/grid';
import { compileBrief } from '@/lib/briefStore';

export const maxDuration = 60;

/** POST { scanId }: compiles the scan's brief and keeps it. Admins only until the plans with briefs are live. */
export async function POST(req: Request) {
  try {
    const me = await getAuthenticatedUser();
    const b = (await req.json().catch(() => ({}))) as { scanId?: unknown };
    if (typeof b.scanId !== 'string' || !b.scanId) throw new InputError('Which scan?', 400);
    return Response.json(await compileBrief(b.scanId, me));
  } catch (e) {
    return errorResponse(e);
  }
}
