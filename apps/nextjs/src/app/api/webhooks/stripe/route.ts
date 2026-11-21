import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { fulfill } from '@/lib/billing';
import { activate, grantPoints, subscriptionEvent } from '@/lib/gbpBilling';
import { settle } from '@/lib/creditSub';
import { confirmService, serviceSubEvent } from '@/lib/services';
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
    const e = JSON.parse(raw) as { type?: string; data?: { object?: { id?: string; mode?: string; subscription?: unknown; parent?: { subscription_details?: { subscription?: unknown } }; metadata?: Record<string, string> } } };
    // A monthly credit plan: its checkout, a renewal paid, a change or an ending. Each brings the plan in line with Stripe.
    const o = e.data?.object;
    const planSub =
      (e.type === 'checkout.session.completed' || e.type === 'checkout.session.async_payment_succeeded') && o?.mode === 'subscription' && o.metadata?.kind === 'credits' ? o.subscription
      : (e.type === 'customer.subscription.updated' || e.type === 'customer.subscription.deleted') && o?.metadata?.kind === 'credits' ? o.id
      : e.type === 'invoice.paid' || e.type === 'invoice.payment_succeeded' ? o?.subscription ?? o?.parent?.subscription_details?.subscription
      : null;
    if (typeof planSub === 'string') await settle(planSub).catch((err) => { console.error('[credit-plan] webhook could not settle:', (err as Error).message); throw err; });
    // A paid invoice of a seat subscription: its points (grantPoints ignores any other subscription).
    if ((e.type === 'invoice.paid' || e.type === 'invoice.payment_succeeded') && typeof planSub === 'string' && typeof o?.id === 'string')
      await grantPoints(planSub, o.id).catch((err) => { console.error('[seats] webhook could not add points:', (err as Error).message); throw err; });
    if (e.type === 'checkout.session.completed' || e.type === 'checkout.session.async_payment_succeeded') {
      const id = e.data?.object?.id;
      // A Google listings subscription: the listings picked for it switch on.
      if (typeof id === 'string' && e.data?.object?.mode === 'subscription' && e.data.object.metadata?.kind === 'gbp')
        await activate(id).catch((err) => {
          if (!(err instanceof InputError && err.status === 409)) throw err;
        });
      // A white-label service order (a citation build, or a monthly traffic campaign).
      if (typeof id === 'string' && e.data?.object?.metadata?.kind === 'service')
        await confirmService(id).catch((err) => {
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
    // A monthly service's card failed, it was cancelled, or it resumed.
    if ((e.type === 'customer.subscription.updated' || e.type === 'customer.subscription.deleted') && e.data?.object?.metadata?.kind === 'service' && typeof e.data.object.id === 'string')
      await serviceSubEvent(e.data.object.id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
