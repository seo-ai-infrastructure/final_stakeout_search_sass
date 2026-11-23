import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { briefFor, updateBrief } from '@/lib/briefStore';

type C = { params: Promise<{ briefId: string }> };

/** A compiled brief, for its owner (or an admin). */
export async function GET(_: Request, c: C) {
  try {
    const me = await getAuthenticatedUser();
    return Response.json(await briefFor((await c.params).briefId, me), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST { assumptions } | { reset: true } | { share: true | false }. */
export async function POST(req: Request, c: C) {
  try {
    const me = await getAuthenticatedUser();
    return Response.json(await updateBrief((await c.params).briefId, me, await req.json().catch(() => ({}))));
  } catch (e) {
    return errorResponse(e);
  }
}
