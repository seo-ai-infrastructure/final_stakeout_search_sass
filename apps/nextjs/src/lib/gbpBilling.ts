import { randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { pushAlert } from '@stakeout/core/alerts';
import { AGENT_ADDON, LINES, LINE_ORDER, PLANS, addonOn, clientSeats, dollars, isPlan, monthlyCents, planNow, quantityPlan, seatGrant, seatPoints, settlePending, stripeTiers, type Line, type Plan } from '@stakeout/core/gbpPlans';
import { PACK_REASONS, endPlan, renewPlan, topUpPlan } from '@stakeout/core/creditPlan';
import { stripe, stripeTestMode } from '@/lib/stripe';
import { postproxy } from '@/lib/postproxy';
import { flushAlerts } from '@/lib/alerts';
import { BONUS_POINTS, FIRST_AUDIT_COUPON, WELCOME, promoLive } from '@/lib/pricing';

/**
 * The monthly subscription: one Stripe subscription per account with one line per seat type. A
 * Command or Dominator seat is a Google listing switched on to that plan; Scout seats are bought
 * by number. Adding seats raises the quantity and charges the rest of the month now; taking some
 * off lowers it without a refund (a listing keeps working until the month that was paid for ends).
 * Every paid invoice adds the seats' points to the account (see grantPoints).
 */
type Item = { id: string; quantity?: number; current_period_end?: number; current_period_start?: number; price?: { id: string; lookup_key?: string | null } };
type Invoice = { id: string; status?: string; billing_reason?: string | null; created?: number; subscription?: string | null; parent?: { subscription_details?: { subscription?: string | null } | null } | null; hosted_invoice_url?: string | null };
type Sub = { id: string; status: string; customer: string; /** A change held back until its payment clears. */ pending_update?: unknown | null; latest_invoice?: Invoice | string | null; cancel_at_period_end?: boolean; current_period_end?: number; current_period_start?: number; items?: { data?: Item[] }; metadata?: Record<string, string> };
type Session = { id: string; url?: string; mode?: string; status?: string; payment_status?: string; client_reference_id?: string; customer?: string | null; subscription?: string | null; metadata?: Record<string, string> };
export type Pick = { profile: string; location: string; plan: Plan };

const ENDED = new Set(['canceled', 'unpaid', 'incomplete_expired']);
const lineOfItem = (i: Item): Line | null => LINE_ORDER.find((l) => LINES[l].lookupKey === i.price?.lookup_key) ?? null;
const isAddon = (i: Item) => i.price?.lookup_key === AGENT_ADDON.lookupKey;
const periodOf = (s: Sub) => ({ start: s.current_period_start ?? s.items?.data?.[0]?.current_period_start ?? 0, end: s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? 0 });
const periodEnd = (s: Sub) => { const t = periodOf(s).end; return t ? new Date(t * 1000) : null; };
const invoiceSub = (i: Invoice) => i.subscription ?? i.parent?.subscription_details?.subscription ?? null;
/** Seats on the subscription now, by line. */
function seatsOn(items: Item[]): Partial<Record<Line, number>> {
  const out: Partial<Record<Line, number>> = {};
  for (const i of items) { const l = lineOfItem(i); if (l) out[l] = (out[l] ?? 0) + (i.quantity ?? 0); }
  return out;
}

/** Stripe's price for each seat type asked for, made the first time it is needed and found by its lookup key after that. */
async function prices(lines: Line[]): Promise<Partial<Record<Line, string>>> {
  if (!lines.length) return {};
  const keys = lines.map((l) => LINES[l].lookupKey);
  const found = await stripe<{ data: { id: string; lookup_key: string | null }[] }>('/prices?active=true&limit=20&' + keys.map((k, i) => `lookup_keys[${i}]=${encodeURIComponent(k)}`).join('&'));
  const out: Partial<Record<Line, string>> = {};
  for (const l of lines) {
    const had = found.data.find((x) => x.lookup_key === LINES[l].lookupKey);
    if (had) { out[l] = had.id; continue; }
    if (!LINES[l].available) throw new InputError(`${LINES[l].name} is no longer sold.`);
    out[l] = (
      await stripe<{ id: string }>(
        '/prices',
        'POST',
        {
          currency: 'usd',
          recurring: { interval: 'month' },
          billing_scheme: 'tiered',
          tiers_mode: LINES[l].graduated ? 'graduated' : 'volume',
          tiers: stripeTiers(l),
          lookup_key: LINES[l].lookupKey,
          metadata: { points_per_seat: String(LINES[l].points) },
          product_data: { name: `Stakeout Search · ${LINES[l].name} seat`, unit_label: 'client' },
        },
        'price-' + LINES[l].lookupKey,
      )
    ).id;
  }
  return out;
}

/** Stripe's price for the AI agents add-on: one flat amount a month, made the first time it is needed. */
async function addonPrice(): Promise<string> {
  const found = await stripe<{ data: { id: string }[] }>('/prices?active=true&limit=1&lookup_keys[0]=' + encodeURIComponent(AGENT_ADDON.lookupKey));
  if (found.data[0]) return found.data[0].id;
  return (await stripe<{ id: string }>('/prices', 'POST', { currency: 'usd', unit_amount: AGENT_ADDON.cents, recurring: { interval: 'month' }, lookup_key: AGENT_ADDON.lookupKey, product_data: { name: 'Stakeout Search · AI agents add-on' } }, 'price-' + AGENT_ADDON.lookupKey)).id;
}

const readSub = (id: string) => stripe<Sub>('/subscriptions/' + encodeURIComponent(id));

/** What we keep about a subscription, from Stripe's own record of it. When it has ended, its listings go back to free. */
export async function applySub(s: Sub, userId?: string) {
  const mine = (await db.gbpSub.findUnique({ where: { subscriptionId: s.id } })) ?? (userId ? await db.gbpSub.findUnique({ where: { userId } }) : null);
  const owner = mine?.userId ?? userId ?? s.metadata?.userId;
  if (!owner || s.metadata?.kind !== 'gbp') return null;
  // An older subscription's ending must not switch off the one that replaced it.
  if (mine && mine.subscriptionId && mine.subscriptionId !== s.id) return null;
  const ended = ENDED.has(s.status);
  const items = s.items?.data ?? [];
  const data = {
    customerId: s.customer,
    subscriptionId: ended ? null : s.id,
    status: ended ? 'canceled' : s.status,
    periodEnd: periodEnd(s),
    updatedAt: new Date(),
    agentAddon: !ended && items.some(isAddon),
    scoutSeats: ended ? 0 : seatsOn(items).SCOUT ?? 0,
  };
  await db.gbpSub.upsert({ where: { userId: owner }, create: { userId: owner, ...data }, update: data });
  if (ended) await db.gbpPlan.deleteMany({ where: { userId: owner } });
  return owner;
}

/**
 * The monthly points a subscription's paid invoices have covered this month follow the seats taken
 * off it, so seats added back later are charged and given their points again; seats put back that
 * the month had already paid for (no charge) are covered again without new points.
 */
async function followSeats(userId: string, monthly: number, grew: boolean) {
  const row = await db.gbpSub.findUnique({ where: { userId }, select: { grantedPoints: true } });
  if (!row) return;
  const granted = grew ? Math.max(row.grantedPoints, monthly) : Math.min(row.grantedPoints, monthly);
  if (granted !== row.grantedPoints) await db.gbpSub.update({ where: { userId }, data: { grantedPoints: granted } });
}

/**
 * Makes the subscription match the listings that are ACTIVE and `scout` Scout seats (left as they
 * are when not given). `charge`: bill the rest of the month for what was added now. Stripe holds
 * the change back until that payment clears: when the card needs the customer (their bank asks for
 * a confirmation), the answer is `{ pay }`, the page where they finish it, and the seats are not on
 * the subscription yet. A card refused outright is thrown.
 */
async function syncStripe(userId: string, charge: boolean, scout?: number): Promise<{ pay?: string | null }> {
  const mine = await db.gbpSub.findUnique({ where: { userId } });
  if (!mine?.subscriptionId) return {};
  const [s, rows] = await Promise.all([readSub(mine.subscriptionId), db.gbpPlan.findMany({ where: { userId }, select: { plan: true, status: true } })]);
  const items = s.items?.data ?? [];
  const q = quantityPlan(rows, seatsOn(items), scout);
  if (q.empty && items.some(isAddon)) {
    // No seat left, but the add-on stays: the subscription carries on with it alone.
    const seats = items.filter((i) => lineOfItem(i) && (i.quantity ?? 0) > 0).map((i) => ({ id: i.id, quantity: 0 }));
    if (seats.length || s.cancel_at_period_end) await applySub(await stripe<Sub>('/subscriptions/' + s.id, 'POST', { ...(seats.length ? { items: seats } : {}), cancel_at_period_end: false, proration_behavior: 'none' }, randomUUID()), userId);
    await followSeats(userId, 0, false);
    return {};
  }
  if (q.empty) {
    // No seat left: the subscription runs out at the end of the month already paid for.
    if (!s.cancel_at_period_end) await applySub(await stripe<Sub>('/subscriptions/' + s.id, 'POST', { cancel_at_period_end: true }), userId);
    return {};
  }
  if (q.same && !s.cancel_at_period_end) return {};
  const needed = LINE_ORDER.filter((l) => q.want[l] > 0 && !items.some((i) => lineOfItem(i) === l));
  const price = await prices(needed);
  const change: Record<string, unknown>[] = [];
  for (const l of LINE_ORDER) {
    const had = items.find((i) => lineOfItem(i) === l);
    if (had) change.push({ id: had.id, quantity: q.want[l] });
    else if (q.want[l] > 0) change.push({ price: price[l], quantity: q.want[l] });
  }
  const bill = charge && q.grows;
  if (!bill) {
    await applySub(await stripe<Sub>('/subscriptions/' + s.id, 'POST', { items: change, cancel_at_period_end: false, proration_behavior: 'none' }, randomUUID()), userId);
    await followSeats(userId, seatPoints(q.want), q.grows);
    return {};
  }
  // A change that waits on its payment may only carry the seats and how they are charged, so a
  // subscription that was set to end is first set to carry on.
  if (s.cancel_at_period_end) await stripe<Sub>('/subscriptions/' + s.id, 'POST', { cancel_at_period_end: false });
  const next = await stripe<Sub>('/subscriptions/' + s.id, 'POST', { items: change, proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete', expand: ['latest_invoice'] }, randomUUID());
  await applySub(next, userId);
  if (!next.pending_update) {
    // Paid now: the added seats' points for the rest of the month, straight away (the webhook finds them counted).
    const inv = typeof next.latest_invoice === 'object' ? next.latest_invoice?.id : next.latest_invoice;
    await grantPoints(next.id, inv ?? undefined).catch((e) => console.error('[seats] points not added yet:', (e as Error).message));
    return {};
  }
  return { pay: typeof next.latest_invoice === 'object' ? next.latest_invoice?.hosted_invoice_url ?? null : null };
}

/** A customer's listings in one of their connected Google accounts, by location: its name, checked before anything is sold for it. */
async function listingNames(userId: string, profile: string): Promise<Map<string, string>> {
  const account = await db.gbpAccount.findFirst({ where: { userId, profileId: profile }, select: { id: true } });
  if (!account) throw new InputError('Unknown profile.', 404);
  const r = await postproxy<{ data?: { id: string; name: string }[] }>('/api/profiles/' + encodeURIComponent(profile) + '/placements');
  return new Map((r.data ?? []).map((l) => [l.id, l.name]));
}

/**
 * The Stripe coupon that takes the $5 of a first audit off the first month, for an account that
 * bought one and has never had a subscription. Made the first time it is needed.
 */
async function firstAuditCoupon(userId: string, hadSub: boolean): Promise<string | null> {
  if (hadSub) return null;
  const paid = await db.paymentOrder.findFirst({ where: { userId, item: WELCOME.key, captureId: { not: null }, refundedAt: null }, select: { id: true } });
  if (!paid) return null;
  type Coupon = { id: string; valid?: boolean };
  let c = await stripe<Coupon>('/coupons/' + FIRST_AUDIT_COUPON).catch(() => null);
  if (!c)
    c = await stripe<Coupon>('/coupons', 'POST', { id: FIRST_AUDIT_COUPON, amount_off: WELCOME.cents, currency: 'usd', duration: 'once', name: 'Your $5 first audit' }, 'coupon-' + FIRST_AUDIT_COUPON).catch(() => stripe<Coupon>('/coupons/' + FIRST_AUDIT_COUPON).catch(() => null));
  return c && c.valid !== false ? FIRST_AUDIT_COUPON : null;
}

/** Stripe's checkout page for a first subscription with these seats. */
async function checkout(u: { id: string; email: string }, mine: { customerId: string } | null, seats: Partial<Record<Line, number>>, origin: string, back: string): Promise<{ url: string }> {
  const lines = LINE_ORDER.filter((l) => (seats[l] ?? 0) > 0);
  if (!lines.length) throw new InputError('Choose at least one seat.');
  const price = await prices(lines);
  const coupon = await firstAuditCoupon(u.id, Boolean(mine));
  const meta = { kind: 'gbp', userId: u.id };
  const join = back.includes('?') ? '&' : '?';
  const session = await stripe<Session>(
    '/checkout/sessions',
    'POST',
    {
      mode: 'subscription',
      // The first audit's $5 off the first month; otherwise a box for a promotion code made in the Stripe dashboard.
      ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true }),
      client_reference_id: u.id,
      ...(mine?.customerId ? { customer: mine.customerId } : { customer_email: u.email }),
      metadata: meta,
      subscription_data: { metadata: meta, description: 'Stakeout Search seats' },
      line_items: lines.map((l) => ({ price: price[l], quantity: seats[l] })),
      success_url: origin + back + join + 'plan={CHECKOUT_SESSION_ID}',
      cancel_url: origin + back + join + 'plan=cancelled',
    },
    randomUUID(),
  );
  if (!session.url) throw new InputError('Stripe did not open a checkout page. Try again.', 502);
  return { url: session.url };
}

/**
 * Puts listings on Command or Dominator. With a subscription already running they are added to it
 * and the rest of the month is charged to the card on file; without one, the answer is the address
 * of Stripe's checkout page and the listings switch on when it is paid.
 */
export async function addListings(u: { id: string; email: string; role: string }, picks: Pick[], origin: string): Promise<{ url?: string; done?: boolean; /** The bank wants the customer to confirm the charge: the page where they do, and the listings wait until then. */ pay?: string | null }> {
  if (u.role === 'ADMIN') throw new InputError('Admin accounts have every listing unlocked.');
  if (!picks.length || picks.length > 200) throw new InputError('Pick the listings to switch on.');
  for (const p of picks) if (!isPlan(p.plan) || !PLANS[p.plan].available) throw new InputError('That seat is not on sale.');
  const names = new Map<string, Map<string, string>>();
  for (const p of picks) {
    if (!names.has(p.profile)) names.set(p.profile, await listingNames(u.id, p.profile));
    if (!names.get(p.profile)!.has(p.location)) throw new InputError('That listing is not in your connected Google account.', 404);
  }
  const [mine, before] = await Promise.all([db.gbpSub.findUnique({ where: { userId: u.id } }), db.gbpPlan.findMany({ where: { userId: u.id } })]);
  const now = new Date();
  const running = Boolean(mine?.subscriptionId);
  const status = running ? 'ACTIVE' : 'PENDING';
  // A listing taken off earlier this month is already paid for until the month ends: putting it back costs nothing extra.
  const paidAlready = (p: Pick) => { const b = before.find((x) => x.locationId === p.location); return Boolean(b && b.status === 'ENDING' && b.plan === p.plan && b.endsAt && b.endsAt > now); };
  const charge = picks.some((p) => !paidAlready(p));
  // An unfinished checkout from before is forgotten: only what is picked now is being bought.
  if (!running) await db.gbpPlan.deleteMany({ where: { userId: u.id, status: 'PENDING' } });
  for (const p of picks) {
    const data = { profileId: p.profile, title: names.get(p.profile)!.get(p.location) ?? null, plan: p.plan, status, endsAt: null };
    await db.gbpPlan.upsert({ where: { userId_locationId: { userId: u.id, locationId: p.location } }, create: { userId: u.id, locationId: p.location, ...data }, update: data });
  }
  if (running) {
    try {
      const r = await syncStripe(u.id, charge);
      if (r.pay !== undefined) {
        // Not paid yet: the listings added now wait (ones that were already on that seat stay as they were).
        const waiting = picks.filter((p) => { const b = before.find((x) => x.locationId === p.location); return !(b && b.status === 'ACTIVE' && b.plan === p.plan) && !paidAlready(p); });
        await db.gbpPlan.updateMany({ where: { userId: u.id, locationId: { in: waiting.map((p) => p.location) } }, data: { status: 'PENDING' } });
        return { pay: r.pay };
      }
    } catch (e) {
      // The card refused, or Stripe did not answer: the listings go back to how they were.
      for (const p of picks) {
        const b = before.find((x) => x.locationId === p.location);
        if (b) await db.gbpPlan.update({ where: { id: b.id }, data: { plan: b.plan, status: b.status, endsAt: b.endsAt, profileId: b.profileId } });
        else await db.gbpPlan.deleteMany({ where: { userId: u.id, locationId: p.location } });
      }
      throw e;
    }
    return { done: true };
  }
  const count = (plan: Plan) => picks.filter((p) => p.plan === plan).length;
  return checkout(u, mine, { DOMINATOR: count('DOMINATOR'), COMMAND: count('COMMAND'), SCOUT: mine?.scoutSeats ?? 0 }, origin, '/profiles?tab=plan');
}

/**
 * Sets how many Scout seats the account pays for. On a running subscription more seats are charged
 * for the rest of the month now and fewer take effect at once with no refund; without one, the
 * answer is the address of Stripe's checkout page.
 */
export async function setScoutSeats(u: { id: string; email: string; role: string }, seats: number, origin: string): Promise<{ url?: string; done?: boolean; pay?: string | null }> {
  if (u.role === 'ADMIN') throw new InputError('Admin accounts do not need seats.');
  if (!Number.isInteger(seats) || seats < 0 || seats > 500) throw new InputError('Choose between 0 and 500 Scout seats.');
  const mine = await db.gbpSub.findUnique({ where: { userId: u.id } });
  if (mine?.subscriptionId) {
    const r = await syncStripe(u.id, true, seats);
    return r.pay !== undefined ? { pay: r.pay } : { done: true };
  }
  if (!seats) return { done: true };
  return checkout(u, mine, { SCOUT: seats }, origin, '/profiles?tab=plan');
}

/**
 * A finished checkout: the subscription is recorded, the listings picked for it switch on and the
 * first month's points are added. Called when the buyer comes back and again by Stripe's webhook;
 * doing it twice changes nothing.
 */
export async function activate(sessionId: string, userId?: string) {
  const s = await stripe<Session>('/checkout/sessions/' + encodeURIComponent(sessionId));
  if (s.mode !== 'subscription' || s.metadata?.kind !== 'gbp') return false;
  const owner = s.metadata.userId;
  if (!owner || owner !== s.client_reference_id || (userId && owner !== userId)) throw new InputError('Order unavailable.', 404);
  if (s.status !== 'complete' || !s.subscription || !['paid', 'no_payment_required'].includes(s.payment_status ?? '')) throw new InputError('Payment is still pending.', 409);
  const sub = await readSub(s.subscription);
  if (!(await applySub(sub, owner)) || ENDED.has(sub.status)) return false;
  const fresh = await db.gbpPlan.updateMany({ where: { userId: owner, status: 'PENDING' }, data: { status: 'ACTIVE' } });
  const points = await grantPoints(sub.id).catch((e) => (console.error('[seats] points not added yet:', (e as Error).message), 0));
  if (fresh.count || points) {
    const counts = seatsOn(sub.items?.data ?? []);
    const buyer = await db.user.findUnique({ where: { id: owner }, select: { email: true } });
    await pushAlert('gbp-sub:' + sub.id, {
      subject: `${stripeTestMode() ? '[TEST] ' : ''}Stakeout: new seat subscription, ${dollars(monthlyCents(counts))} a month`,
      lines: [`${buyer?.email ?? 'An account'} started ${LINE_ORDER.filter((l) => counts[l]).map((l) => `${counts[l]} ${LINES[l].name}`).join(', ')}: ${seatPoints(counts).toLocaleString('en-US')} points a month.`],
      path: '/admin/devices',
    }, 60).catch(() => {});
    await flushAlerts().catch(() => {});
  }
  return true;
}

/**
 * Brings the account's points in line with a paid invoice of its subscription (`invoiceId`, or the
 * subscription's latest): the month's points at a new subscription or a renewal (last month's unused
 * ones roll over for one month, see creditPlan.ts), the added seats' share mid-month, and the Black
 * Friday prospect audits once. When the subscription has ended, the seats' unused points lapse.
 * Each invoice counts once, whoever reports it first. Returns the points added.
 */
export async function grantPoints(subscriptionId: string, invoiceId?: string): Promise<number> {
  const s = await stripe<Sub>('/subscriptions/' + encodeURIComponent(subscriptionId) + '?expand[]=latest_invoice');
  if (s.metadata?.kind !== 'gbp') return 0;
  const userId = (await db.gbpSub.findFirst({ where: { subscriptionId: s.id }, select: { userId: true } }))?.userId ?? s.metadata.userId;
  if (!userId) return 0;
  const ended = ENDED.has(s.status);
  const invoice = invoiceId ? await stripe<Invoice>('/invoices/' + encodeURIComponent(invoiceId)).catch(() => null) : typeof s.latest_invoice === 'object' ? s.latest_invoice : null;
  const monthly = ended ? 0 : seatPoints(seatsOn(s.items?.data ?? []));
  const { start, end } = periodOf(s);
  let added = 0;
  await db.$transaction(async (tx) => {
    const row = await tx.gbpSub.findUnique({ where: { userId } });
    // An older subscription's news must not disturb the one that replaced it.
    if (!row || (row.subscriptionId && row.subscriptionId !== s.id)) return;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { creditBalance: true } });
    // Points bought since the seats' points were last counted: those are never the seats'.
    const bought = row.grantAt
      ? (await tx.creditLedger.aggregate({ where: { userId, reason: { in: PACK_REASONS }, createdAt: { gt: row.grantAt }, amount: { gt: 0 } }, _sum: { amount: true } }))._sum.amount ?? 0
      : 0;
    const state = { balance: user.creditBalance, bucket: row.bucket, packFloor: row.packFloor, bought };
    if (ended) {
      if (row.bucket === 0) return;
      const e = endPlan(state);
      if (e.lapse > 0) await tx.creditLedger.create({ data: { userId, amount: -e.lapse, reason: 'SEAT_POINTS_ENDED', externalEventId: 'seats-ended:' + s.id } });
      // As a change to the balance, never a fixed figure, so a scan charged at the same moment is not lost.
      await tx.user.update({ where: { id: userId }, data: { creditBalance: { decrement: e.lapse } } });
      await tx.gbpSub.update({ where: { userId }, data: { bucket: 0, packFloor: e.packFloor, grantAt: new Date(), grantedPoints: 0 } });
      return;
    }
    if (!invoice || invoice.status !== 'paid' || invoiceSub(invoice) !== s.id) return;
    const key = 'stripe-inv:' + invoice.id;
    if (await tx.creditLedger.findUnique({ where: { externalEventId: key } })) return;
    const paidAt = (invoice.created ?? Math.floor(Date.now() / 1000));
    const share = end > start ? (end - paidAt) / (end - start) : 1;
    const g = seatGrant(invoice.billing_reason, monthly, row.grantedPoints, share);
    if (!g) return;
    // Black Friday: a first seat started before the offer ends brings 5 prospect audits, once per
    // account. Added first, as points of the account's own, never the seats'.
    if (g.points > 0 && promoLive(paidAt * 1000) && !(await tx.creditLedger.findUnique({ where: { externalEventId: 'bonus-pack:' + userId } }))) {
      await tx.creditLedger.create({ data: { userId, amount: BONUS_POINTS, reason: 'BONUS_PACK', externalEventId: 'bonus-pack:' + userId } });
      await tx.user.update({ where: { id: userId }, data: { creditBalance: { increment: BONUS_POINTS } } });
      state.balance += BONUS_POINTS;
      state.bought += BONUS_POINTS;
    }
    if (g.renew) {
      const r = renewPlan(state, g.points);
      if (r.lapse > 0) await tx.creditLedger.create({ data: { userId, amount: -r.lapse, reason: 'SEAT_POINTS_LAPSE', externalEventId: key + ':lapse' } });
      await tx.creditLedger.create({ data: { userId, amount: r.grant, reason: 'SEAT_POINTS', externalEventId: key } });
      await tx.user.update({ where: { id: userId }, data: { creditBalance: { increment: r.grant - r.lapse } } });
      await tx.gbpSub.update({ where: { userId }, data: { bucket: r.bucket, packFloor: r.packFloor, grantAt: new Date(), grantedPoints: g.granted } });
    } else {
      const t = topUpPlan(state, g.points);
      await tx.creditLedger.create({ data: { userId, amount: g.points, reason: 'SEAT_POINTS', externalEventId: key } });
      await tx.user.update({ where: { id: userId }, data: { creditBalance: { increment: g.points } } });
      await tx.gbpSub.update({ where: { userId }, data: { bucket: t.bucket, packFloor: t.packFloor, grantAt: new Date(), grantedPoints: g.granted } });
    }
    added = g.points;
  }).catch((e: unknown) => {
    // Two reports of the same invoice at once: the ledger let one through, and the other changes nothing.
    if ((e as { code?: string })?.code === 'P2002') { added = 0; return; }
    throw e;
  });
  return added;
}

/** Takes a listing off its seat. It keeps working until the month that was paid for ends; nothing is refunded. */
export async function removeListing(userId: string, location: string) {
  const row = await db.gbpPlan.findUnique({ where: { userId_locationId: { userId, locationId: location } } });
  if (!row) throw new InputError('That listing is not on a seat.', 404);
  if (row.status === 'PENDING') { await db.gbpPlan.delete({ where: { id: row.id } }); return; }
  if (row.status !== 'ACTIVE') return;
  const mine = await db.gbpSub.findUnique({ where: { userId } });
  await db.gbpPlan.update({ where: { id: row.id }, data: { status: 'ENDING', endsAt: mine?.periodEnd ?? new Date() } });
  try {
    await syncStripe(userId, false);
  } catch (e) {
    await db.gbpPlan.update({ where: { id: row.id }, data: { status: 'ACTIVE', endsAt: null } });
    throw e;
  }
}

/**
 * Adds the AI agents add-on. On a running subscription it is one more line, charged for the rest
 * of the month now (it switches on when that payment clears); otherwise the answer is the address
 * of Stripe's checkout page for a subscription with the add-on alone.
 */
export async function addAddon(u: { id: string; email: string; role: string }, origin: string): Promise<{ url?: string; done?: boolean; pay?: string | null }> {
  if (u.role === 'ADMIN') throw new InputError('Admin accounts already have agent access.');
  const mine = await db.gbpSub.findUnique({ where: { userId: u.id } });
  if (await db.gbpPlan.count({ where: { userId: u.id, status: 'ACTIVE' } })) throw new InputError('Agent access already comes with your listings on Command or Dominator: there is nothing to add.', 409);
  const price = await addonPrice();
  if (mine?.subscriptionId) {
    const s = await readSub(mine.subscriptionId);
    if ((s.items?.data ?? []).some(isAddon)) { await applySub(s, u.id); return { done: true }; }
    if (s.cancel_at_period_end) await stripe<Sub>('/subscriptions/' + s.id, 'POST', { cancel_at_period_end: false });
    const next = await stripe<Sub>('/subscriptions/' + s.id, 'POST', { items: [{ price, quantity: 1 }], proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete', expand: ['latest_invoice'] }, randomUUID());
    await applySub(next, u.id);
    if (next.pending_update) return { pay: typeof next.latest_invoice === 'object' ? next.latest_invoice?.hosted_invoice_url ?? null : null };
    return { done: true };
  }
  // A listing checkout left unfinished is forgotten: only the add-on is being bought here.
  await db.gbpPlan.deleteMany({ where: { userId: u.id, status: 'PENDING' } });
  const meta = { kind: 'gbp', userId: u.id };
  const session = await stripe<Session>('/checkout/sessions', 'POST', {
    mode: 'subscription',
    allow_promotion_codes: true,
    client_reference_id: u.id,
    ...(mine?.customerId ? { customer: mine.customerId } : { customer_email: u.email }),
    metadata: meta,
    subscription_data: { metadata: meta, description: 'Stakeout Search: AI agents' },
    line_items: [{ price, quantity: 1 }],
    success_url: origin + '/profiles?tab=agents&plan={CHECKOUT_SESSION_ID}',
    cancel_url: origin + '/profiles?tab=agents&plan=cancelled',
  }, randomUUID());
  if (!session.url) throw new InputError('Stripe did not open a checkout page. Try again.', 502);
  return { url: session.url };
}

/**
 * Takes the add-on off. With seats still on the subscription it comes off now; when it was the only
 * thing on it, the subscription is set to end with the month already paid for, and agent access
 * lasts until then. Nothing is refunded either way.
 */
export async function removeAddon(userId: string) {
  const mine = await db.gbpSub.findUnique({ where: { userId } });
  if (!mine?.subscriptionId) throw new InputError('The add-on is not on this account.', 404);
  const s = await readSub(mine.subscriptionId);
  const item = (s.items?.data ?? []).find(isAddon);
  if (!item) { await applySub(s, userId); return; }
  const others = (s.items?.data ?? []).some((i) => lineOfItem(i) && (i.quantity ?? 0) > 0);
  const next = others
    ? await stripe<Sub>('/subscriptions/' + s.id, 'POST', { items: [{ id: item.id, deleted: true }], proration_behavior: 'none' }, randomUUID())
    : await stripe<Sub>('/subscriptions/' + s.id, 'POST', { cancel_at_period_end: true });
  await applySub(next, userId);
}

/** Takes every listing of one connected Google account off its seat: for when the account is disconnected. */
export async function removeProfile(userId: string, profile: string) {
  const rows = await db.gbpPlan.findMany({ where: { userId, profileId: profile } });
  if (!rows.length) return;
  await db.gbpPlan.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  await syncStripe(userId, false);
}

/** Stripe's own page for the card on file, invoices and cancelling. */
export async function portalUrl(userId: string, origin: string) {
  const mine = await db.gbpSub.findUnique({ where: { userId } });
  if (!mine) throw new InputError('There is no subscription on this account yet.', 404);
  return (await stripe<{ url: string }>('/billing_portal/sessions', 'POST', { customer: mine.customerId, return_url: origin + '/profiles?tab=plan' })).url;
}

/** Stripe says a subscription changed or ended (a renewal, a failed card, a cancellation in its portal). */
export async function subscriptionEvent(id: string) {
  const s = await readSub(id).catch(() => null);
  if (!s) return;
  const owner = await applySub(s);
  if (!owner) return;
  // An ended subscription's unused seat points lapse.
  if (ENDED.has(s.status)) { await grantPoints(s.id).catch((e) => console.error('[seats] points not lapsed yet:', (e as Error).message)); return; }
  // Listings that were waiting on a payment: on once the subscription holds their seats, dropped if it lapsed.
  if (s.pending_update) return;
  const rows = await db.gbpPlan.findMany({ where: { userId: owner }, select: { plan: true, status: true } });
  const seats = seatsOn(s.items?.data ?? []);
  for (const p of Object.keys(PLANS) as Plan[]) {
    const what = settlePending(seats[p] ?? 0, rows.filter((r) => r.plan === p && r.status === 'ACTIVE').length, rows.filter((r) => r.plan === p && r.status === 'PENDING').length);
    if (what === 'activate') await db.gbpPlan.updateMany({ where: { userId: owner, plan: p, status: 'PENDING' }, data: { status: 'ACTIVE' } });
    if (what === 'drop') await db.gbpPlan.deleteMany({ where: { userId: owner, plan: p, status: 'PENDING' } });
  }
}

/** Client seats an account pays for now: its listings on a seat and its Scout seats. */
export async function clientSeatCount(userId: string): Promise<number> {
  const [rows, mine] = await Promise.all([db.gbpPlan.findMany({ where: { userId, status: 'ACTIVE' }, select: { plan: true } }), db.gbpSub.findUnique({ where: { userId }, select: { scoutSeats: true, subscriptionId: true } })]);
  return clientSeats({ COMMAND: rows.filter((r) => r.plan === 'COMMAND').length, DOMINATOR: rows.filter((r) => r.plan === 'DOMINATOR').length, SCOUT: mine?.subscriptionId ? mine.scoutSeats : 0 });
}

/** What an account pays for: its seats, its subscription, the month's total and points. Listings whose paid month has run out are dropped. */
export async function billingSummary(userId: string) {
  const now = new Date();
  await db.gbpPlan.deleteMany({ where: { userId, status: 'ENDING', endsAt: { lte: now } } });
  const [rows, mine] = await Promise.all([db.gbpPlan.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }), db.gbpSub.findUnique({ where: { userId } })]);
  const active = rows.filter((r) => r.status === 'ACTIVE');
  const counts: Record<Line, number> = {
    DOMINATOR: active.filter((r) => r.plan === 'DOMINATOR').length,
    COMMAND: active.filter((r) => r.plan === 'COMMAND').length,
    SCOUT: mine?.subscriptionId ? mine.scoutSeats : 0,
    MANAGE: active.filter((r) => r.plan === 'MANAGE').length,
    AGENT: active.filter((r) => r.plan === 'AGENT').length,
  };
  return {
    listings: rows.map((r) => ({ location: r.locationId, profile: r.profileId, title: r.title, plan: r.plan, status: r.status, endsAt: r.endsAt?.toISOString() ?? null, on: planNow(r, mine?.status, now) !== null })),
    sub: mine ? { status: mine.status, periodEnd: mine.periodEnd?.toISOString() ?? null, running: Boolean(mine.subscriptionId) } : null,
    counts,
    seats: clientSeats(counts),
    pointsPerMonth: seatPoints(counts),
    addon: { on: addonOn(mine), cents: AGENT_ADDON.cents },
    monthlyCents: monthlyCents(counts) + (addonOn(mine) ? AGENT_ADDON.cents : 0),
  };
}
