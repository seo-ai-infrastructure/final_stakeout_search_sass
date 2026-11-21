import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { confirmService, servicesGate } from '@/lib/services';

/** POST /api/services/confirm { session }: the buyer is back from Stripe; the paid order is recorded. */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    servicesGate(u);
    const { session } = (await req.json()) as { session?: unknown };
    if (typeof session !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(session)) throw new InputError('Unknown checkout.');
    const order = await confirmService(session, u.id);
    if (!order) throw new InputError('Unknown order.', 404);
    return Response.json({ status: order.status, client: order.clientName });
  } catch (e) {
    return errorResponse(e);
  }
}
