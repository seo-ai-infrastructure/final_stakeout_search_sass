import { db } from '@stakeout/db';
import { stripe, stripeTestMode } from './stripe';
import { InputError } from '@stakeout/core/grid';
import { ONBOARDING, WELCOME, currentPlan, itemsFor, onboardingStatus, paymentNotice, type Onboarding, type PriceItem } from './pricing';
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
 * What this account can buy now: the welcome pack before its first purchase, its plan's top-up while
 * it is on a plan, credit packs and monthly plans, the three-month offer while it runs, and the
 * optional onboarding until it is paid for or waived. Prices live in lib/pricing.ts.
 */
export async function catalogFor(user: { id: string; role: string; createdAt: Date }): Promise<PriceItem[]> {
  const [onboarding, paid] = await Promise.all([
    onboardingOf([user]),
    db.paymentOrder.findMany({ where: { userId: user.id, captureId: { not: null }, refundedAt: null }, select: { item: true, credits: true, createdAt: true } }),
  ]);
  return itemsFor({ onboarded: onboarding.get(user.id) !== 'no', admin: user.role === 'ADMIN', firstPurchase: paid.length === 0, plan: currentPlan(paid) });
}

/**
 * Tells the admins a payment was recorded (to PAYMENT_ALERT_EMAIL if set, otherwise every admin
 * account). Never throws: a failed email must not undo or block a payment that went through.
 */
async function alertPayment(p: { userId: string; credits: number; cents: number; balance: number; orderId: string; captureId: string; item?: string | null; refunded?: boolean }) {
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
  // The welcome pack is one per account and one per card. Stripe cannot refuse a card before it is
  // charged, so a second one is sent straight back and adds nothing.
  let card: string | null = null;
  if (purchase.item === WELCOME.key && purchase.captureId === null) {
    const pi = await stripe<{ payment_method?: { card?: { fingerprint?: string } } | string | null }>('/payment_intents/' + encodeURIComponent(payment) + '?expand[]=payment_method').catch(() => null);
    card = (pi && typeof pi.payment_method === 'object' ? pi.payment_method?.card?.fingerprint : null) ?? null;
    const had = await db.paymentOrder.findFirst({
      where: { item: WELCOME.key, captureId: { not: null }, refundedAt: null, id: { not: sessionId }, OR: [{ userId: purchase.userId }, ...(card ? [{ cardFingerprint: card }] : [])] },
      select: { id: true },
    });
    if (had) {
      // The money goes back first (asking twice refunds once), then the order is closed without credits.
      await stripe('/refunds', 'POST', { payment_intent: payment, reason: 'duplicate' }, 'refund-' + payment);
      const closed = await db.paymentOrder.updateMany({ where: { id: sessionId, captureId: null }, data: { captureId: payment, cardFingerprint: card, refundedAt: new Date() } });
      const user = await db.user.findUniqueOrThrow({ where: { id: purchase.userId }, select: { creditBalance: true } });
      if (closed.count) await alertPayment({ userId: purchase.userId, credits: purchase.credits, cents: purchase.cents, balance: user.creditBalance, orderId: sessionId, captureId: payment, item: purchase.item, refunded: true });
      return { ...user, credits: 0, fresh: false, refunded: true as const };
    }
  }
  if (purchase.refundedAt) return { ...(await db.user.findUniqueOrThrow({ where: { id: purchase.userId }, select: { creditBalance: true } })), credits: 0, fresh: false, refunded: true as const };
  let fresh = false;
  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.paymentOrder.updateMany({ where: { id: sessionId, captureId: null }, data: { captureId: payment, ...(card ? { cardFingerprint: card } : {}) } });
    if (claimed.count) {
      fresh = true;
      await tx.creditLedger.create({ data: { userId: purchase.userId, amount: purchase.credits, reason: 'STRIPE_TOPUP', externalEventId: 'stripe:' + payment } });
      await tx.user.update({ where: { id: purchase.userId }, data: { creditBalance: { increment: purchase.credits } } });
    }
    return tx.user.findUniqueOrThrow({ where: { id: purchase.userId }, select: { creditBalance: true } });
  });
  // Only the first time this payment is recorded: the browser and Stripe's webhook both report it.
  if (fresh) await alertPayment({ userId: purchase.userId, credits: purchase.credits, cents: purchase.cents, balance: result.creditBalance, orderId: sessionId, captureId: payment, item: purchase.item });
  return { ...result, credits: purchase.credits, fresh, refunded: false as const };
}
