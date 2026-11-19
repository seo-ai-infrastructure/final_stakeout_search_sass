import { randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { PACK_REASONS, PLAN_ENDED, endPlan, renewPlan } from '@stakeout/core/creditPlan';
import { stripe } from '@/lib/stripe';
import { PLANS } from '@/lib/pricing';

/**
 * Monthly credit plans, billed by Stripe as a subscription: one per account, one line, the plan's
 * price. Every paid invoice adds the month's credits (once, whoever reports it first: the buyer
 * coming back, Stripe's webhook, or the account's next page load). The rules for rolling over and
 * lapsing are in packages/core/creditPlan.ts.
 */
type Invoice = { id: string; status?: string; hosted_invoice_url?: string | null };
type Item = { id: string; price?: { id: string; lookup_key?: string | null } };
type Sub = { id: string; status: string; customer: string; cancel_at_period_end?: boolean; current_period_end?: number; items?: { data?: (Item & { current_period_end?: number })[] }; metadata?: Record<string, string>; latest_invoice?: Invoice | string | null };
type Session = { id: string; url?: string; mode?: string; status?: string; client_reference_id?: string; subscription?: string | null; metadata?: Record<string, string> };

const lookup = (plan: string) => 'stakeout_credits_' + plan + '_v1';
const planOf = (s: Sub) => PLANS.find((p) => (s.items?.data ?? []).some((i) => i.price?.lookup_key === lookup(p.key))) ?? null;
const readSub = (id: string) => stripe<Sub>('/subscriptions/' + encodeURIComponent(id) + '?expand[]=latest_invoice');
const periodEnd = (s: Sub) => { const t = s.current_period_end ?? s.items?.data?.[0]?.current_period_end; return t ? new Date(t * 1000) : null; };

/** Stripe's monthly price for a plan, made the first time it is needed and found by its lookup key after that. */
async function priceFor(plan: (typeof PLANS)[number]): Promise<string> {
  const found = await stripe<{ data: { id: string }[] }>('/prices?active=true&limit=1&lookup_keys[0]=' + encodeURIComponent(lookup(plan.key)));
  if (found.data[0]) return found.data[0].id;
  return (await stripe<{ id: string }>('/prices', 'POST', { currency: 'usd', unit_amount: plan.cents, recurring: { interval: 'month' }, lookup_key: lookup(plan.key), product_data: { name: `Stakeout Search · ${plan.name} plan · ${plan.credits.toLocaleString('en-US')} credits a month` } }, 'price-' + lookup(plan.key))).id;
}

/** The plan an account's subscription is on right now (null: none, or it has ended). */
export async function activePlan(userId: string): Promise<{ plan: string; periodEnd: Date | null; cancelAtEnd: boolean; status: string } | null> {
  const mine = await db.creditSub.findUnique({ where: { userId } });
  return mine?.subscriptionId && !PLAN_ENDED.has(mine.status) ? { plan: mine.plan, periodEnd: mine.periodEnd, cancelAtEnd: mine.cancelAtEnd, status: mine.status } : null;
}

/**
 * Starts a plan, or moves a running subscription to another one. A new plan goes through Stripe's
 * checkout; a change of plan keeps the month already paid for and takes the new price, and the
 * new number of credits, from the next renewal.
 */
export async function startPlan(u: { id: string; email: string }, planKey: string, back: string): Promise<{ url?: string; changed?: string }> {
  const plan = PLANS.find((p) => p.key === planKey);
  if (!plan) throw new InputError('That plan is not available.');
  const mine = await db.creditSub.findUnique({ where: { userId: u.id } });
  const price = await priceFor(plan);
  if (mine?.subscriptionId && !PLAN_ENDED.has(mine.status)) {
    if (mine.plan === plan.key && !mine.cancelAtEnd) throw new InputError(`You are already on the ${plan.name} plan.`, 409);
    const s = await readSub(mine.subscriptionId);
    const item = s.items?.data?.[0];
    if (!item) throw new InputError('Your subscription could not be read. Email sass@stakeoutsearch.com.', 502);
    await stripe('/subscriptions/' + s.id, 'POST', { items: [{ id: item.id, price }], cancel_at_period_end: false, proration_behavior: 'none' }, randomUUID());
    await settle(s.id);
    return { changed: plan.name };
  }
  // The same Stripe customer as the account's listing subscription, when it has one.
  const known = mine?.customerId ?? (await db.gbpSub.findUnique({ where: { userId: u.id }, select: { customerId: true } }))?.customerId;
  const meta = { kind: 'credits', userId: u.id, plan: plan.key };
  const session = await stripe<Session>('/checkout/sessions', 'POST', {
    mode: 'subscription',
    allow_promotion_codes: true,
    client_reference_id: u.id,
    ...(known ? { customer: known } : { customer_email: u.email }),
    metadata: meta,
    subscription_data: { metadata: meta, description: `Stakeout Search: ${plan.name} plan` },
    line_items: [{ price, quantity: 1 }],
    success_url: back + '?paid={CHECKOUT_SESSION_ID}',
    cancel_url: back + '?paid=cancelled',
  }, randomUUID());
  if (!session.url) throw new InputError('Stripe did not open a checkout page. Try again.', 502);
  return { url: session.url };
}

/**
 * Brings an account's plan in line with Stripe: records the subscription as it is now, adds the
 * month's credits for a paid invoice that has not been counted yet, and lapses the plan's unused
 * credits when the subscription has ended. Safe to call any number of times.
 */
export async function settle(subscriptionId: string, expectUser?: string): Promise<{ userId: string; granted: number; plan: string | null } | null> {
  const s = await readSub(subscriptionId);
  if (s.metadata?.kind !== 'credits') return null;
  const userId = (await db.creditSub.findUnique({ where: { subscriptionId: s.id } }))?.userId ?? s.metadata.userId;
  if (!userId || (expectUser && userId !== expectUser)) return null;
  const plan = planOf(s);
  const ended = PLAN_ENDED.has(s.status);
  const invoice = typeof s.latest_invoice === 'object' ? s.latest_invoice : null;
  let granted = 0;
  await db.$transaction(async (tx) => {
    const mine = await tx.creditSub.findUnique({ where: { userId } });
    // An older subscription's news must not disturb the one that replaced it.
    if (mine?.subscriptionId && mine.subscriptionId !== s.id) return;
    const base = { customerId: s.customer, subscriptionId: ended ? null : s.id, plan: plan?.key ?? mine?.plan ?? '', status: s.status, periodEnd: periodEnd(s), cancelAtEnd: Boolean(s.cancel_at_period_end), updatedAt: new Date() };
    const row = await tx.creditSub.upsert({ where: { userId }, create: { userId, ...base }, update: base });
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { creditBalance: true } });
    // Pack credits added since the plan's credits were last counted: those are never the plan's.
    const bought = row.grantAt
      ? (await tx.creditLedger.aggregate({ where: { userId, reason: { in: PACK_REASONS }, createdAt: { gt: row.grantAt }, amount: { gt: 0 } }, _sum: { amount: true } }))._sum.amount ?? 0
      : 0;
    const state = { balance: user.creditBalance, bucket: row.bucket, packFloor: row.packFloor, bought };

    if (ended) {
      if (row.bucket === 0) return;
      const e = endPlan(state);
      if (e.lapse > 0) await tx.creditLedger.create({ data: { userId, amount: -e.lapse, reason: 'PLAN_ENDED', externalEventId: 'plan-ended:' + s.id } });
      // As a change to the balance, never a fixed figure, so a scan charged at the same moment is not lost.
      await tx.user.update({ where: { id: userId }, data: { creditBalance: { decrement: e.lapse } } });
      await tx.creditSub.update({ where: { userId }, data: { bucket: 0, packFloor: e.packFloor, grantAt: new Date() } });
      return;
    }
    if (!plan || !invoice || invoice.status !== 'paid') return;
    // Each invoice counts once: the ledger refuses a second entry for it.
    const key = 'stripe-inv:' + invoice.id;
    if (await tx.creditLedger.findUnique({ where: { externalEventId: key } })) return;
    const r = renewPlan(state, plan.credits);
    if (r.lapse > 0) await tx.creditLedger.create({ data: { userId, amount: -r.lapse, reason: 'PLAN_LAPSE', externalEventId: key + ':lapse' } });
    await tx.creditLedger.create({ data: { userId, amount: r.grant, reason: 'PLAN_CREDITS', externalEventId: key } });
    await tx.user.update({ where: { id: userId }, data: { creditBalance: { increment: r.grant - r.lapse } } });
    await tx.creditSub.update({ where: { userId }, data: { bucket: r.bucket, packFloor: r.packFloor, grantAt: new Date() } });
    granted = r.grant;
  }).catch((e: unknown) => {
    // Two reports of the same invoice at once: the ledger let one through, and the other changes nothing.
    if ((e as { code?: string })?.code === 'P2002') { granted = 0; return; }
    throw e;
  });
  return { userId, granted, plan: plan?.key ?? null };
}

/** Back from Stripe's checkout for a plan: the subscription is recorded and its first month's credits added. */
export async function confirmPlan(sessionId: string, userId: string) {
  const s = await stripe<Session>('/checkout/sessions/' + encodeURIComponent(sessionId));
  if (s.mode !== 'subscription' || s.metadata?.kind !== 'credits' || s.client_reference_id !== userId || s.metadata.userId !== userId) return null;
  if (s.status !== 'complete' || !s.subscription) throw new InputError('Payment is still pending.', 409);
  return settle(s.subscription, userId);
}

/** A renewal the webhook did not tell us about: once the paid month has run out, Stripe is asked how the subscription stands. */
export async function settleIfDue(userId: string) {
  const mine = await db.creditSub.findUnique({ where: { userId }, select: { subscriptionId: true, periodEnd: true } });
  if (mine?.subscriptionId && mine.periodEnd && mine.periodEnd.getTime() < Date.now()) await settle(mine.subscriptionId, userId).catch((e) => console.error('[credit-plan] could not settle:', (e as Error).message));
}

/** Stripe's own page for the card on file, invoices and cancelling. */
export async function planPortal(userId: string, back: string) {
  const mine = await db.creditSub.findUnique({ where: { userId } });
  if (!mine) throw new InputError('There is no plan on this account yet.', 404);
  return (await stripe<{ url: string }>('/billing_portal/sessions', 'POST', { customer: mine.customerId, return_url: back })).url;
}
