import { randomUUID } from 'node:crypto';
import { getAuthenticatedUser } from '@/lib/auth';
import { catalogFor, merchantId, paypal } from '@/lib/paypal';
import { db } from '@stakeout/db';
import { errorResponse } from '@/lib/api';
import { InputError } from '@stakeout/core/grid';
export async function GET() {
  try {
    return Response.json({ packs: await catalogFor(await getAuthenticatedUser()) });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser(),
      { credits } = await req.json(),
      pack = (await catalogFor(u)).find((p) => p.credits === credits);
    if (!pack || !merchantId())
      throw new InputError('That is not available for this account.');
    const o = await paypal(
      '/v2/checkout/orders',
      'POST',
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: u.id + ':PACK_' + credits,
            description: ('Stakeout ' + pack.name + ': ' + credits + ' credits').slice(0, 120),
            payee: { merchant_id: merchantId() },
            amount: {
              currency_code: 'USD',
              value: (pack.cents / 100).toFixed(2),
            },
          },
        ],
      },
      randomUUID(),
    );
    await db.paymentOrder.create({
      data: { id: o.id, userId: u.id, credits, cents: pack.cents },
    });
    return Response.json({ orderID: o.id });
  } catch (e) {
    return errorResponse(e);
  }
}
