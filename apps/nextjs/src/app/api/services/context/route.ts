import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { clientContext, servicesGate } from '@/lib/services';

export const maxDuration = 60;

/** GET /api/services/context?client=…: the client's Google listing and its latest scan, for the order forms. */
export async function GET(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    servicesGate(u);
    return Response.json(await clientContext(u, new URL(req.url).searchParams.get('client') ?? ''));
  } catch (e) {
    return errorResponse(e);
  }
}
