import { randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { catalogFor } from '@/lib/billing';
import { stripe, stripeConfigured } from '@/lib/stripe';

/** What this account can buy, and whether checkout is switched on. */
export async function GET() {
  try {
    return Response.json({ packs: await catalogFor(await getAuthenticatedUser()), ready: stripeConfigured() });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Only a path on this site: where the buyer lands after paying or backing out. */
const safePath = (v: unknown) => (typeof v === 'string' && /^\/[A-Za-z0-9\-._~/?=&%]*$/.test(v) && !v.startsWith('//') ? v.split('?')[0] : '/scans');

/**
 * Starts a Stripe Checkout for one item of the price list (named by its key) and returns
 * the address of Stripe's payment page. The price comes from the price list here, never the browser.
 */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser(),
      { item: key, credits, returnTo } = await req.json(),
      catalog = await catalogFor(u),
      // By its key; a page loaded before keys were sent names its credits instead, which only counts when one item has that many.
      byCredits = catalog.filter((p) => p.credits === credits),
      item = typeof key === 'string' ? catalog.find((p) => p.key === key) : byCredits.length === 1 ? byCredits[0] : undefined;
    if (!item) throw new InputError('That is not available for this account.');
    const origin = new URL(req.url).origin,
      back = origin + safePath(returnTo);
    const session = await stripe<{ id: string; url: string }>(
      '/checkout/sessions',
      'POST',
      {
        mode: 'payment',
        client_reference_id: u.id,
        customer_email: u.email,
        metadata: { userId: u.id, credits: item.credits, item: item.key },
        payment_intent_data: { description: `Stakeout ${item.name}: ${item.credits} credits`, metadata: { userId: u.id, credits: item.credits, item: item.key } },
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: item.cents, product_data: { name: `Stakeout Search · ${item.name}`, description: `${item.credits.toLocaleString('en-US')} credits. 1 credit = 1 pin.` } } }],
        success_url: back + '?paid={CHECKOUT_SESSION_ID}',
        cancel_url: back + '?paid=cancelled',
      },
      randomUUID(),
    );
    await db.paymentOrder.create({ data: { id: session.id, userId: u.id, credits: item.credits, cents: item.cents, item: item.key } });
    return Response.json({ url: session.url });
  } catch (e) {
    return errorResponse(e);
  }
}
