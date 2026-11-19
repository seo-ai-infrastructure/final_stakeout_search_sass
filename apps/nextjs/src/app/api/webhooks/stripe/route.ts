import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { fulfill } from '@/lib/billing';
import { activate, subscriptionEvent } from '@/lib/gbpBilling';
import { stripeSignatureValid } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * Stripe's own report that a checkout was paid: the safety net for a buyer who closes the tab
 * before coming back. Only messages signed with STRIPE_WEBHOOK_SECRET are acted on.
 */
export async function POST(req: Request) {
  try {
    const secret = (process.env.STRIPE_WEBHOOK_SECRET ?? '').trim();
    if (!secret) throw new InputError('Webhook is awaiting configuration.', 503);
    const raw = await req.text();
    if (!stripeSignatureValid(raw, req.headers.get('stripe-signature'), secret)) throw new InputError('Invalid webhook signature.', 401);
    const e = JSON.parse(raw) as { type?: string; data?: { object?: { id?: string; mode?: string; metadata?: Record<string, string> } } };
    if (e.type === 'checkout.session.completed' || e.type === 'checkout.session.async_payment_succeeded') {
      const id = e.data?.object?.id;
      // A Google listings subscription: the listings picked for it switch on.
      if (typeof id === 'string' && e.data?.object?.mode === 'subscription' && e.data.object.metadata?.kind === 'gbp')
        await activate(id).catch((err) => {
          if (!(err instanceof InputError && err.status === 409)) throw err;
        });
      // A session still waiting on a slow payment method is reported again when it is paid.
      if (typeof id === 'string' && (await db.paymentOrder.findUnique({ where: { id } })))
        await fulfill(id).catch((err) => {
          if (!(err instanceof InputError && err.status === 409)) throw err;
        });
    }
    // A renewal, a failed card, a cancellation: the subscription is read back from Stripe as it is now.
    if ((e.type === 'customer.subscription.updated' || e.type === 'customer.subscription.deleted') && e.data?.object?.metadata?.kind === 'gbp' && typeof e.data.object.id === 'string')
      await subscriptionEvent(e.data.object.id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
