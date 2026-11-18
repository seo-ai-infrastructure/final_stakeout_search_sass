import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { fulfill } from '@/lib/billing';

/** The buyer is back from Stripe: record the payment now (the webhook does the same, once between them). */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser(),
      { sessionId } = await req.json();
    const o = typeof sessionId === 'string' ? await db.paymentOrder.findFirst({ where: { id: sessionId, userId: u.id } }) : null;
    if (!o) throw new InputError('Order unavailable.', 404);
    return Response.json(await fulfill(o.id));
  } catch (e) {
    return errorResponse(e);
  }
}
