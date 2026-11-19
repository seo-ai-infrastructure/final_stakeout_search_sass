import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { fulfill } from '@/lib/billing';
import { confirmPlan } from '@/lib/creditSub';
import { PLANS } from '@/lib/pricing';

/** The buyer is back from Stripe: record the payment now (the webhook does the same, once between them). */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser(),
      { sessionId } = await req.json();
    const o = typeof sessionId === 'string' ? await db.paymentOrder.findFirst({ where: { id: sessionId, userId: u.id } }) : null;
    if (!o && typeof sessionId === 'string' && /^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) {
      // Not a one-time purchase: a monthly plan's checkout.
      const r = await confirmPlan(sessionId, u.id);
      if (r) {
        const me = await db.user.findUniqueOrThrow({ where: { id: u.id }, select: { creditBalance: true } });
        return Response.json({ ...me, credits: r.granted, plan: PLANS.find((p) => p.key === r.plan)?.name ?? null, fresh: r.granted > 0, refunded: false });
      }
    }
    if (!o) throw new InputError('Order unavailable.', 404);
    return Response.json(await fulfill(o.id));
  } catch (e) {
    return errorResponse(e);
  }
}
