import { db } from '@stakeout/db';
import { stripe, stripeTestMode } from './stripe';
import { InputError } from '@stakeout/core/grid';
import { CLOSER, WELCOME, WHITE_LABEL_ITEM, itemByKey, itemsFor, paymentNotice, type PriceItem } from './pricing';
import { appUrl, mailerConfigured, sendNoticeEmail } from './mailer';
import { accountPlanNow, clientSeatCount } from './gbpBilling';
import { getSettings, newPlansFor } from '@stakeout/core/settings';

/**
 * What this account can buy once now: the first audit before its first purchase, prospect audits,
 * a top-up while it holds a seat, and the white-label setup below 10 seats. Prices live in lib/pricing.ts.
 */
export async function catalogFor(user: { id: string; role: string; createdAt: Date; email?: string }): Promise<PriceItem[]> {
  const [paid, seats, plan, settings] = await Promise.all([
    db.paymentOrder.findMany({ where: { userId: user.id, captureId: { not: null }, refundedAt: null }, select: { item: true } }),
    clientSeatCount(user.id),
    accountPlanNow(user.id),
    getSettings(),
  ]);
  return itemsFor({
    admin: user.role === 'ADMIN',
    firstPurchase: paid.length === 0 && seats === 0,
    seats,
    whiteLabel: paid.some((o) => o.item === WHITE_LABEL_ITEM.key),
    newPlans: newPlansFor(user, settings),
    plan: Boolean(plan),
    closers: paid.filter((o) => o.item === CLOSER.key).length,
  });
}

/**
 * Tells the admins a payment was recorded (to PAYMENT_ALERT_EMAIL if set, otherwise every admin
 * account). Never throws: a failed email must not undo or block a payment that went through.
 */
/** Who hears about payments: PAYMENT_ALERT_EMAIL if set, otherwise every admin account. */
export async function paymentAlertRecipients(): Promise<string[]> {
  const to = (process.env.PAYMENT_ALERT_EMAIL ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return to.length ? to : (await db.user.findMany({ where: { role: 'ADMIN' }, select: { email: true } })).map((u) => u.email);
}

async function alertPayment(p: { userId: string; credits: number; cents: number; balance: number; orderId: string; captureId: string; item?: string | null; refunded?: boolean }) {
  try {
    if (!mailerConfigured()) return;
    const buyer = await db.user.findUnique({ where: { id: p.userId }, select: { email: true } });
    const recipients = await paymentAlertRecipients();
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
  /** The price before any promotion code. */
  amount_subtotal?: number;
  currency?: string;
  client_reference_id?: string;
  metadata?: Record<string, string>;
  payment_intent?: string | { id: string } | null;
};

/**
 * Records a paid checkout, once: the points go on the account and the admins are told. Called when
 * the buyer comes back from Stripe and again by Stripe's webhook; whichever is first counts. The
 * session is read back from Stripe and must match what was ordered, to the cent.
 */
export async function fulfill(sessionId: string) {
  const purchase = await db.paymentOrder.findUnique({ where: { id: sessionId } });
  if (!purchase) throw new InputError('Unknown order.', 404);
  const s = await stripe<Session>('/checkout/sessions/' + encodeURIComponent(sessionId));
  // A promotion code that covers the whole price leaves nothing to pay, and so no payment to name: the checkout stands in for it.
  const free = s.payment_status === 'no_payment_required' && s.amount_total === 0;
  const intent = typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id ?? '');
  const payment = intent || (free ? 'free:' + s.id : '');
  // What was ordered is the price before a promotion code; what was paid may be less.
  const paidCents = typeof s.amount_total === 'number' ? s.amount_total : purchase.cents;
  if (
    s.status !== 'complete' ||
    !(s.payment_status === 'paid' || free) ||
    !payment ||
    s.currency !== 'usd' ||
    (s.amount_subtotal ?? s.amount_total) !== purchase.cents ||
    s.client_reference_id !== purchase.userId ||
    s.metadata?.credits !== String(purchase.credits)
  )
    throw new InputError('Payment is pending or could not be matched to this purchase.', 409);
  // The first audit is one per account and one per card. Stripe cannot refuse a card before it is
  // charged, so a second one is sent straight back and adds nothing.
  let card: string | null = null;
  if (purchase.item === WELCOME.key && purchase.captureId === null) {
    const pi = !intent ? null : await stripe<{ payment_method?: { card?: { fingerprint?: string } } | string | null }>('/payment_intents/' + encodeURIComponent(payment) + '?expand[]=payment_method').catch(() => null);
    card = (pi && typeof pi.payment_method === 'object' ? pi.payment_method?.card?.fingerprint : null) ?? null;
    const had = await db.paymentOrder.findFirst({
      where: { item: WELCOME.key, captureId: { not: null }, refundedAt: null, id: { not: sessionId }, OR: [{ userId: purchase.userId }, ...(card ? [{ cardFingerprint: card }] : [])] },
      select: { id: true },
    });
    if (had) {
      // The money goes back first (asking twice refunds once), then the order is closed without points.
      if (intent) await stripe('/refunds', 'POST', { payment_intent: intent, reason: 'duplicate' }, 'refund-' + intent);
      const closed = await db.paymentOrder.updateMany({ where: { id: sessionId, captureId: null }, data: { captureId: payment, cardFingerprint: card, refundedAt: new Date() } });
      const user = await db.user.findUniqueOrThrow({ where: { id: purchase.userId }, select: { creditBalance: true } });
      if (closed.count) await alertPayment({ userId: purchase.userId, credits: purchase.credits, cents: paidCents, balance: user.creditBalance, orderId: sessionId, captureId: payment, item: purchase.item, refunded: true });
      return { ...user, credits: 0, fresh: false, refunded: true as const };
    }
  }
  if (purchase.refundedAt) return { ...(await db.user.findUniqueOrThrow({ where: { id: purchase.userId }, select: { creditBalance: true } })), credits: 0, fresh: false, refunded: true as const };
  let fresh = false;
  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.paymentOrder.updateMany({ where: { id: sessionId, captureId: null }, data: { captureId: payment, ...(card ? { cardFingerprint: card } : {}) } });
    if (claimed.count) {
      fresh = true;
      // An item with no points (the white-label setup) adds nothing to the balance.
      if (purchase.credits > 0) {
        await tx.creditLedger.create({ data: { userId: purchase.userId, amount: purchase.credits, reason: 'STRIPE_TOPUP', externalEventId: 'stripe:' + payment } });
        await tx.user.update({ where: { id: purchase.userId }, data: { creditBalance: { increment: purchase.credits } } });
      }
      // Briefs bought (packs, the Closer Pack's one): on the account for good.
      const briefs = itemByKey(purchase.item)?.briefs ?? 0;
      if (briefs > 0) await tx.user.update({ where: { id: purchase.userId }, data: { briefBalance: { increment: briefs } } });
    }
    return tx.user.findUniqueOrThrow({ where: { id: purchase.userId }, select: { creditBalance: true } });
  });
  // Only the first time this payment is recorded: the browser and Stripe's webhook both report it.
  if (fresh) await alertPayment({ userId: purchase.userId, credits: purchase.credits, cents: paidCents, balance: result.creditBalance, orderId: sessionId, captureId: payment, item: purchase.item });
  return { ...result, credits: purchase.credits, fresh, refunded: false as const };
}
