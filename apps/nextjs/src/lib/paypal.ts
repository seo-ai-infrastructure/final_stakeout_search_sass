import { db } from '@stakeout/db';
import { paypalBase, paypalProblem } from './paypalBase';
import { InputError } from '@stakeout/core/grid';
import { ONBOARDING, itemsFor, type PriceItem } from './pricing';

/** Accounts created before this pricing took effect, and admins, go straight to the plans. */
const PRICING_START = new Date('2026-11-12T00:00:00Z');

/**
 * What this account can buy now: the one-time onboarding until it has been paid for, then the
 * monthly plans and extra credits. Prices live in lib/pricing.ts.
 */
export async function catalogFor(user: { id: string; role: string; createdAt: Date }): Promise<PriceItem[]> {
  const exempt = user.role === 'ADMIN' || user.createdAt < PRICING_START;
  const onboarded =
    exempt ||
    Boolean(
      await db.paymentOrder.findFirst({
        where: { userId: user.id, credits: ONBOARDING.credits, captureId: { not: null } },
        select: { id: true },
      }),
    );
  return itemsFor({ onboarded });
}
/** The merchant account orders must pay (PAYPAL_MERCHANT_ID), without stray spaces. */
export const merchantId = (): string => (process.env.PAYPAL_MERCHANT_ID ?? '').trim();

export async function paypal(
  path: string,
  method = 'GET',
  body?: unknown,
  requestId?: string,
) {
  let base: string;
  try {
    base = paypalBase(process.env.PAYPAL_API_BASE);
  } catch (e) {
    // Shown to whoever is checking out, so a mistyped setting is obvious instead of a silent failure.
    throw new InputError((e as Error).message, 503);
  }
  // The client ID is public (the checkout buttons carry it), so the server uses the same one the
  // browser does: two copies of it could disagree. PAYPAL_CLIENT_ID is only a fallback.
  const key = (process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || '').trim(),
    secret = (process.env.PAYPAL_CLIENT_SECRET ?? '').trim();
  if (!key || !secret)
    throw new InputError('PayPal checkout is awaiting configuration.', 503);
  const auth = await fetch(base + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' + Buffer.from(key + ':' + secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!auth.ok) {
    console.error('[paypal] sign-in refused:', auth.status, 'at', base);
    throw new InputError('PayPal did not accept the client ID and secret. NEXT_PUBLIC_PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must come from the same PayPal app, in the same environment (sandbox or live) as PAYPAL_API_BASE.', 503);
  }
  const token = (await auth.json()).access_token;
  const response = await fetch(base + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    // PayPal says exactly what it refused: keep it in the log, and tell the person in plain words.
    const detail = await response.json().catch(() => null);
    const first = detail?.details?.[0];
    const issue = String(first?.issue ?? detail?.name ?? 'HTTP ' + response.status);
    console.error('[paypal]', method, path.split('?')[0], response.status, issue, first?.field ?? '', first?.description ?? detail?.message ?? '', 'debug_id=' + (detail?.debug_id ?? ''));
    throw new InputError(paypalProblem(issue, String(first?.field ?? '')), 502);
  }
  return response.json();
}
export async function fulfill(orderId: string) {
  const purchase = await db.paymentOrder.findUnique({ where: { id: orderId } });
  if (!purchase) throw new InputError('Unknown order.', 404);
  const order = await paypal(
    '/v2/checkout/orders/' + encodeURIComponent(orderId),
  );
  const unit = order.purchase_units?.[0],
    captures = unit?.payments?.captures ?? [],
    c = captures[0];
  if (
    order.status !== 'COMPLETED' ||
    order.purchase_units?.length !== 1 ||
    captures.length !== 1 ||
    c?.status !== 'COMPLETED' ||
    !c.id ||
    unit.custom_id !== purchase.userId + ':PACK_' + purchase.credits ||
    c.amount?.currency_code !== 'USD' ||
    c.amount.value !== (purchase.cents / 100).toFixed(2) ||
    !merchantId() ||
    unit.payee?.merchant_id !== merchantId()
  )
    throw new InputError(
      'Payment is pending or could not be matched to this credit pack.',
      409,
    );
  return db.$transaction(async (tx) => {
    const claimed = await tx.paymentOrder.updateMany({
      where: { id: orderId, captureId: null },
      data: { captureId: c.id },
    });
    if (claimed.count) {
      await tx.creditLedger.create({
        data: {
          userId: purchase.userId,
          amount: purchase.credits,
          reason: 'PAYPAL_TOPUP',
          externalEventId: 'paypal:' + c.id,
        },
      });
      await tx.user.update({
        where: { id: purchase.userId },
        data: { creditBalance: { increment: purchase.credits } },
      });
    }
    return tx.user.findUniqueOrThrow({
      where: { id: purchase.userId },
      select: { creditBalance: true },
    });
  });
}
