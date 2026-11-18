import { db } from '@stakeout/db';
import { stripe, stripeTestMode } from './stripe';
import { InputError } from '@stakeout/core/grid';
import { ONBOARDING, itemsFor, onboardingStatus, paymentNotice, type Onboarding, type PriceItem } from './pricing';
import { appUrl, mailerConfigured, sendNoticeEmail } from './mailer';

/** Accounts created before this pricing took effect, and admins, go straight to the plans. */
const PRICING_START = new Date('2026-11-12T00:00:00Z');
/** A zero-credit ledger entry an admin adds to waive onboarding (paid another way, or a guest). */
export const ONBOARDING_WAIVED = 'ONBOARDING_WAIVED';

/** Whether each account has onboarding behind it, and why. One query per source, for any number of accounts. */
export async function onboardingOf(users: { id: string; role: string; createdAt: Date }[]): Promise<Map<string, Onboarding>> {
  const ids = users.map((u) => u.id);
  const [paid, waived] = await Promise.all([
    db.paymentOrder.findMany({ where: { userId: { in: ids }, credits: ONBOARDING.credits, captureId: { not: null } }, select: { userId: true } }),
    db.creditLedger.findMany({ where: { userId: { in: ids }, reason: ONBOARDING_WAIVED }, select: { userId: true } }),
  ]);
  const paidIds = new Set(paid.map((x) => x.userId)), waivedIds = new Set(waived.map((x) => x.userId));
  return new Map(
    users.map((u) => [u.id, onboardingStatus({ paid: paidIds.has(u.id), waived: waivedIds.has(u.id), admin: u.role === 'ADMIN', beforePricing: u.createdAt < PRICING_START })] as [string, Onboarding]),
  );
}

/**
 * What this account can buy now: credit packs and monthly plans, the three-month offer while it
 * runs, and the optional onboarding until it is paid for or waived. Prices live in lib/pricing.ts.
 */
export async function catalogFor(user: { id: string; role: string; createdAt: Date }): Promise<PriceItem[]> {
  const onboarded = (await onboardingOf([user])).get(user.id) !== 'no';
  return itemsFor({ onboarded, admin: user.role === 'ADMIN' });
}

/**
 * Tells the admins a payment was recorded (to PAYMENT_ALERT_EMAIL if set, otherwise every admin
 * account). Never throws: a failed email must not undo or block a payment that went through.
 */
async function alertPayment(p: { userId: string; credits: number; cents: number; balance: number; orderId: string; captureId: string }) {
  try {
    if (!mailerConfigured()) return;
    const buyer = await db.user.findUnique({ where: { id: p.userId }, select: { email: true } });
    const to = (process.env.PAYMENT_ALERT_EMAIL ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const recipients = to.length ? to : (await db.user.findMany({ where: { role: 'ADMIN' }, select: { email: true } })).map((u) => u.email);
    const n = paymentNotice({ ...p, buyer: buyer?.email ?? 'An account', sandbox: stripeTestMode() });
    for (const email of recipients)
      await sendNoticeEmail(email, n.subject, n.lines, { label: 'Open accounts', url: appUrl('/admin/devices') }).catch((e) =>
        console.error('[billing] payment alert not sent to', email, (e as Error).message),
      );
  } catch (e) {
    console.error('[billing] payment alert failed:', (e as Error).message);
  }
}
type Session = {
  id: string;
  status?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  client_reference_id?: string;
  metadata?: Record<string, string>;
  payment_intent?: string | { id: string } | null;
};

/**
 * Records a paid checkout, once: the credits go on the account and the admins are told. Called when
 * the buyer comes back from Stripe and again by Stripe's webhook; whichever is first counts. The
 * session is read back from Stripe and must match what was ordered, to the cent.
 */
export async function fulfill(sessionId: string) {
  const purchase = await db.paymentOrder.findUnique({ where: { id: sessionId } });
  if (!purchase) throw new InputError('Unknown order.', 404);
  const s = await stripe<Session>('/checkout/sessions/' + encodeURIComponent(sessionId));
  const payment = typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id ?? '');
  if (
    s.status !== 'complete' ||
    s.payment_status !== 'paid' ||
    !payment ||
    s.currency !== 'usd' ||
    s.amount_total !== purchase.cents ||
    s.client_reference_id !== purchase.userId ||
    s.metadata?.credits !== String(purchase.credits)
  )
    throw new InputError('Payment is pending or could not be matched to this purchase.', 409);
  let fresh = false;
  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.paymentOrder.updateMany({ where: { id: sessionId, captureId: null }, data: { captureId: payment } });
    if (claimed.count) {
      fresh = true;
      await tx.creditLedger.create({ data: { userId: purchase.userId, amount: purchase.credits, reason: 'STRIPE_TOPUP', externalEventId: 'stripe:' + payment } });
      await tx.user.update({ where: { id: purchase.userId }, data: { creditBalance: { increment: purchase.credits } } });
    }
    return tx.user.findUniqueOrThrow({ where: { id: purchase.userId }, select: { creditBalance: true } });
  });
  // Only the first time this payment is recorded: the browser and Stripe's webhook both report it.
  if (fresh) await alertPayment({ userId: purchase.userId, credits: purchase.credits, cents: purchase.cents, balance: result.creditBalance, orderId: sessionId, captureId: payment });
  return { ...result, credits: purchase.credits, fresh };
}
