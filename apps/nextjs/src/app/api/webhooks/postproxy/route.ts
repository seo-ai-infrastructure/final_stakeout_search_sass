import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { stripeSignatureValid } from '@/lib/stripe';
import { newReview, webhookSecret } from '@/lib/reviewAlerts';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/postproxy: Postproxy telling us something happened on a connected account
 * (today: a new review). Its messages are signed the way Stripe's are (a time and an HMAC-SHA256
 * of "<time>.<body>"), in X-Postproxy-Signature; anything unsigned or old is refused.
 */
export async function POST(req: Request) {
  try {
    const secret = await webhookSecret();
    if (!secret) throw new InputError('Webhook is awaiting configuration.', 503);
    const raw = await req.text();
    if (!stripeSignatureValid(raw, req.headers.get('x-postproxy-signature'), secret)) throw new InputError('Invalid webhook signature.', 401);
    const e = JSON.parse(raw) as { type?: string; data?: { object?: unknown } };
    const did = e.type === 'profile_comment.created' ? await newReview(e.data?.object) : 'ignored';
    return Response.json({ ok: true, did });
  } catch (e) {
    return errorResponse(e);
  }
}
