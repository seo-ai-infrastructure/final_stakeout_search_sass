import { randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { pushAlert } from '@stakeout/core/alerts';
import { ACCOUNT_PLANS, AGENT_ADDON, ANNUAL_MONTHS_PAID, carryCap, LINES, LINE_ORDER, PLANS, accountPlanOf, addMonths, addonOn, annualKey, clientSeats, dollars, hasLegacySeats, isAccountPlan, isPlan, monthIndex, monthWindow, monthlyCents, monthlyPoints, nextPlan, planNow, quantityPlan, rolloverMonths, seatBriefs, seatGrant, settlePending, stripeTiers, yearCents, yearlyLine, type AccountPlan, type BillingInterval, type Line, type Plan } from '@stakeout/core/gbpPlans';
import { claimFounding, foundingLeft, isFounding } from '@stakeout/core/founding';
import { briefGrant, briefsLeft } from '@stakeout/core/briefWallet';
import { getSettings, newPlansFor } from '@stakeout/core/settings';
import { PACK_REASONS, endPlan, planRemaining, renewPlan, topUpPlan } from '@stakeout/core/creditPlan';
import { stripe, stripeTestMode } from '@/lib/stripe';
import { postproxy } from '@/lib/postproxy';
import { flushAlerts } from '@/lib/alerts';
import { BONUS_POINTS, BOOST, BOOST_BELOW, FIRST_AUDIT_COUPON, WELCOME, promoLive } from '@/lib/pricing';
import { pocketCoupon, pocketCustomer } from '@/lib/pocket';

/**
 * The monthly subscription: one Stripe subscription per account with one line per seat type. A
 * Command or Dominator seat is a Google listing switched on to that plan; Scout seats are bought
 * by number. Adding seats raises the quantity and charges the rest of the month now; taking some
 * off lowers it without a refund (a listing keeps working until the month that was paid for ends).
 * Every paid invoice adds the seats' points to the account (see grantPoints).
 */
type Item = { id: string; quantity?: number; current_period_end?: number; current_period_start?: number; price?: { id: string; lookup_key?: string | null; recurring?: { interval?: string } | null } };
type Invoice = { id: string; status?: string; billing_reason?: string | null; created?: number; subscription?: string | null; parent?: { subscription_details?: { subscription?: string | null } | null } | null; hosted_invoice_url?: string | null };
type Sub = { id: string; status: string; customer: string; /** A change held back until its payment clears. */ pending_update?: unknown | null; latest_invoice?: Invoice | string | null; cancel_at_period_end?: boolean; current_period_end?: number; current_period_start?: number; items?: { data?: Item[] }; metadata?: Record<string, string> };
type Session = { id: string; url?: string; mode?: string; status?: string; payment_status?: string; client_reference_id?: string; customer?: string | null; subscription?: string | null; metadata?: Record<string, string>; amount_total?: number | null };
export type Pick = { profile: string; location: string; plan: Plan };

const ENDED = new Set(['canceled', 'unpaid', 'incomplete_expired']);
// A line's monthly or yearly price (yearly ones carry the same key with _annual on the end).
const lineOfItem = (i: Item): Line | null => LINE_ORDER.find((l) => LINES[l].lookupKey === i.price?.lookup_key || annualKey(LINES[l].lookupKey) === i.price?.lookup_key) ?? null;
const isAddon = (i: Item) => i.price?.lookup_key === AGENT_ADDON.lookupKey || i.price?.lookup_key === annualKey(AGENT_ADDON.lookupKey);
/** How often Stripe bills the subscription: every item of one shares it. */
const intervalOf = (s: Sub): BillingInterval => ((s.items?.data ?? []).some((i) => i.price?.recurring?.interval === 'year') ? 'year' : 'month');
const PAYING_NOW = new Set(['active', 'trialing']);
const periodOf = (s: Sub) => ({ start: s.current_period_start ?? s.items?.data?.[0]?.current_period_start ?? 0, end: s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? 0 });
const periodEnd = (s: Sub) => { const t = periodOf(s).end; return t ? new Date(t * 1000) : null; };
const invoiceSub = (i: Invoice) => i.subscription ?? i.parent?.subscription_details?.subscription ?? null;
/** Seats on the subscription now, by line. */
function seatsOn(items: Item[]): Partial<Record<Line, number>> {
  const out: Partial<Record<Line, number>> = {};
  for (const i of items) { const l = lineOfItem(i); if (l) out[l] = (out[l] ?? 0) + (i.quantity ?? 0); }
  return out;
}

/**
 * Stripe's price for each seat type asked for, made the first time it is needed and found by its
 * lookup key after that. Yearly (`interval` 'year'): twelve months for the price of
 * ANNUAL_MONTHS_PAID, for the account plans and the listing add-on only.
 */
async function prices(lines: Line[], interval: BillingInterval = 'month'): Promise<Partial<Record<Line, string>>> {
  if (!lines.length) return {};
  const keyOf = (l: Line) => (interval === 'year' ? annualKey(LINES[l].lookupKey) : LINES[l].lookupKey);
  const keys = lines.map(keyOf);
  const found = await stripe<{ data: { id: string; lookup_key: string | null }[] }>('/prices?active=true&limit=20&' + keys.map((k, i) => `lookup_keys[${i}]=${encodeURIComponent(k)}`).join('&'));
  const out: Partial<Record<Line, string>> = {};
  for (const l of lines) {
    const had = found.data.find((x) => x.lookup_key === keyOf(l));
    if (had) { out[l] = had.id; continue; }
    if (!LINES[l].available) throw new InputError(`${LINES[l].name} is no longer sold.`);
    if (interval === 'year' && !yearlyLine(l)) throw new InputError(`${LINES[l].name} is billed monthly only.`);
    const yearly = interval === 'year' ? ' (yearly)' : '';
    out[l] = (
      await stripe<{ id: string }>(
        '/prices',
        'POST',
        {
          currency: 'usd',
          recurring: { interval },
          billing_scheme: 'tiered',
          tiers_mode: LINES[l].graduated ? 'graduated' : 'volume',
          tiers: stripeTiers(l).map((t) => ({ ...t, unit_amount: interval === 'year' ? t.unit_amount * ANNUAL_MONTHS_PAID : t.unit_amount })),
          lookup_key: keyOf(l),
          metadata: { points_per_seat: String(LINES[l].points), briefs_per_month: String(LINES[l].briefs ?? 0), interval },
          // What the customer reads on Stripe's pages and invoices: a plan per account, the add-on per listing, a seat per client.
          product_data: isAccountPlan(l)
            ? { name: `Stakeout Search · ${LINES[l].name} plan${yearly}`, unit_label: 'account' }
            : l === 'LISTING'
              ? { name: `Stakeout Search · Listing add-on${yearly}`, unit_label: 'listing' }
              : { name: `Stakeout Search · ${LINES[l].name} seat`, unit_label: 'client' },
        },
        'price-' + keyOf(l),
      )
    ).id;
  }
  return out;
}

/** Stripe's price for the AI agents add-on: one flat amount a month (or a year, at ANNUAL_MONTHS_PAID months), made the first time it is needed. */
async function addonPrice(interval: BillingInterval = 'month'): Promise<string> {
  const key = interval === 'year' ? annualKey(AGENT_ADDON.lookupKey) : AGENT_ADDON.lookupKey;
  const found = await stripe<{ data: { id: string }[] }>('/prices?active=true&limit=1&lookup_keys[0]=' + encodeURIComponent(key));
  if (found.data[0]) return found.data[0].id;
  const cents = interval === 'year' ? AGENT_ADDON.cents * ANNUAL_MONTHS_PAID : AGENT_ADDON.cents;
  return (await stripe<{ id: string }>('/prices', 'POST', { currency: 'usd', unit_amount: cents, recurring: { interval }, lookup_key: key, product_data: { name: `Stakeout Search · AI agents add-on${interval === 'year' ? ' (yearly)' : ''}` } }, 'price-' + key)).id;
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
    accountPlan: ended ? null : accountPlanOf(seatsOn(items)),
    billingInterval: intervalOf(s),
    periodStart: periodOf(s).start ? new Date(periodOf(s).start * 1000) : null,
  };
  await db.gbpSub.upsert({ where: { userId: owner }, create: { userId: owner, ...data }, update: data });
  if (ended) await db.gbpPlan.deleteMany({ where: { userId: owner } });
  // A plan paid for: one of the founding spots, while any are left (never in Stripe's test mode).
  if (!ended && data.accountPlan && ACCOUNT_PLANS[data.accountPlan].founding && PAYING_NOW.has(s.status) && !stripeTestMode()) await claimFounding(owner).catch((e) => console.error('[founding] not claimed:', (e as Error).message));
  return owner;
}

/**
 * The monthly points a subscription's paid invoices have covered this month follow the seats taken
 * off it, so seats added back later are charged and given their points again; seats put back that
 * the month had already paid for (no charge) are covered again without new points.
 */
async function followSeats(userId: string, monthly: number, grew: boolean, briefs = 0) {
  const row = await db.gbpSub.findUnique({ where: { userId }, select: { grantedPoints: true, grantedBriefs: true } });
  if (!row) return;
  const granted = grew ? Math.max(row.grantedPoints, monthly) : Math.min(row.grantedPoints, monthly);
  const gb = grew ? Math.max(row.grantedBriefs, briefs) : Math.min(row.grantedBriefs, briefs);
  if (granted !== row.grantedPoints || gb !== row.grantedBriefs) await db.gbpSub.update({ where: { userId }, data: { grantedPoints: granted, grantedBriefs: gb } });
}

/**
 * Makes the subscription match the listings that are ACTIVE and `scout` Scout seats (left as they
 * are when not given). `charge`: bill the rest of the month for what was added now. Stripe holds
 * the change back until that payment clears: when the card needs the customer (their bank asks for
 * a confirmation), the answer is `{ pay }`, the page where they finish it, and the seats are not on
 * the subscription yet. A card refused outright is thrown.
 */
async function syncStripe(userId: string, charge: boolean, scout?: number, account?: AccountPlan | null): Promise<{ pay?: string | null }> {
  const mine = await db.gbpSub.findUnique({ where: { userId } });
  if (!mine?.subscriptionId) return {};
  const [s, rows, founding] = await Promise.all([readSub(mine.subscriptionId), db.gbpPlan.findMany({ where: { userId }, select: { plan: true, status: true } }), isFounding(userId)]);
  const items = s.items?.data ?? [];
  const q = quantityPlan(rows, seatsOn(items), scout, account);
  const interval = intervalOf(s);
  // Less on a yearly subscription: the unused part of the year comes off its next invoice (a monthly one is never refunded).
  const smaller = interval === 'year' ? 'create_prorations' : 'none';
  if (q.empty && items.some(isAddon)) {
    // No seat left, but the add-on stays: the subscription carries on with it alone.
    const seats = items.filter((i) => lineOfItem(i) && (i.quantity ?? 0) > 0).map((i) => ({ id: i.id, quantity: 0 }));
    if (seats.length || s.cancel_at_period_end) await applySub(await stripe<Sub>('/subscriptions/' + s.id, 'POST', { ...(seats.length ? { items: seats } : {}), cancel_at_period_end: false, proration_behavior: smaller }, randomUUID()), userId);
    await followSeats(userId, 0, false, 0);
    return {};
  }
  if (q.empty) {
    // No seat left: the subscription runs out at the end of the month already paid for.
    if (!s.cancel_at_period_end) await applySub(await stripe<Sub>('/subscriptions/' + s.id, 'POST', { cancel_at_period_end: true }), userId);
    return {};
  }
  if (q.same && !s.cancel_at_period_end) return {};
  const needed = LINE_ORDER.filter((l) => q.want[l] > 0 && !items.some((i) => lineOfItem(i) === l));
  const price = await prices(needed, interval);
  const change: Record<string, unknown>[] = [];
  for (const l of LINE_ORDER) {
    const had = items.find((i) => lineOfItem(i) === l);
    if (had) change.push({ id: had.id, quantity: q.want[l] });
    else if (q.want[l] > 0) change.push({ price: price[l], quantity: q.want[l] });
  }
  const bill = charge && q.grows;
  if (!bill) {
    await applySub(await stripe<Sub>('/subscriptions/' + s.id, 'POST', { items: change, cancel_at_period_end: false, proration_behavior: smaller }, randomUUID()), userId);
    await followSeats(userId, monthlyPoints(q.want, founding), q.grows, seatBriefs(q.want));
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
async function checkout(u: { id: string; email: string }, mine: { customerId: string } | null, seats: Partial<Record<Line, number>>, origin: string, back: string, interval: BillingInterval = 'month'): Promise<{ url: string }> {
  const lines = LINE_ORDER.filter((l) => (seats[l] ?? 0) > 0);
  if (!lines.length) throw new InputError('Choose at least one seat.');
  const price = await prices(lines, interval);
  // $5 off for a first audit, else $1 off for a pocket test: either comes off the first month of a first plan.
  const coupon = (await firstAuditCoupon(u.id, Boolean(mine))) ?? (await pocketCoupon(u.id, Boolean(mine)));
  // An account a pocket test made, still only in its buyer's browser: the card Stripe saved then is offered.
  const saved = mine?.customerId ? null : await pocketCustomer(u.id);
  const meta = { kind: 'gbp', userId: u.id };
  const join = back.includes('?') ? '&' : '?';
  const body = (who: Record<string, unknown>) => ({
    mode: 'subscription',
    // The first audit's $5 (or a pocket test's $1) off the first month; otherwise a box for a promotion code made in the Stripe dashboard.
    ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true }),
    client_reference_id: u.id,
    ...who,
    metadata: meta,
    subscription_data: { metadata: meta, description: lines.some((l) => isAccountPlan(l)) ? `Stakeout Search plan${interval === 'year' ? ', billed yearly' : ''}` : 'Stakeout Search seats' },
    line_items: lines.map((l) => ({ price: price[l], quantity: seats[l] })),
    success_url: origin + back + join + 'plan={CHECKOUT_SESSION_ID}',
    cancel_url: origin + back + join + 'plan=cancelled',
  });
  const usual = mine?.customerId ? { customer: mine.customerId } : { customer_email: u.email };
  // With the pocket test's saved card on offer; should Stripe refuse that, the usual checkout.
  const session = saved
    ? await stripe<Session>('/checkout/sessions', 'POST', body({ customer: saved, saved_payment_method_options: { allow_redisplay_filters: ['always', 'limited', 'unspecified'] } }), randomUUID()).catch((e) => {
        console.warn('[pocket] plan checkout without the saved card:', (e as Error).message);
        return stripe<Session>('/checkout/sessions', 'POST', body(usual), randomUUID());
      })
    : await stripe<Session>('/checkout/sessions', 'POST', body(usual), randomUUID());
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
  await sellable(u, picks.map((p) => p.plan));
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
  return checkout(u, mine, { DOMINATOR: count('DOMINATOR'), COMMAND: count('COMMAND'), LISTING: count('LISTING'), SCOUT: mine?.scoutSeats ?? 0, ...(isAccountPlan(mine?.accountPlan) ? { [mine.accountPlan]: 1 } : {}) }, origin, '/profiles?tab=plan');
}

/**
 * Sets how many Scout seats the account pays for. On a running subscription more seats are charged
 * for the rest of the month now and fewer take effect at once with no refund; without one, the
 * answer is the address of Stripe's checkout page.
 */
export async function setScoutSeats(u: { id: string; email: string; role: string }, seats: number, origin: string): Promise<{ url?: string; done?: boolean; pay?: string | null }> {
  if (u.role === 'ADMIN') throw new InputError('Admin accounts do not need seats.');
  if (!Number.isInteger(seats) || seats < 0 || seats > 500) throw new InputError('Choose between 0 and 500 Scout seats.');
  if (seats > 0) await sellable(u, ['SCOUT']);
  const mine = await db.gbpSub.findUnique({ where: { userId: u.id } });
  if (mine?.subscriptionId) {
    const r = await syncStripe(u.id, true, seats);
    return r.pay !== undefined ? { pay: r.pay } : { done: true };
  }
  if (!seats) return { done: true };
  return checkout(u, mine, { SCOUT: seats }, origin, '/profiles?tab=plan');
}

/**
 * What an account may buy. With the account plans: the plans and the listing add-on (which needs a
 * plan), and seats only where the account already has some. Before them: the seats.
 */
async function seatsOf(userId: string) {
  const [mine, rows] = await Promise.all([db.gbpSub.findUnique({ where: { userId } }), db.gbpPlan.findMany({ where: { userId, status: { in: ['ACTIVE', 'ENDING'] } }, select: { plan: true } })]);
  const n = (p: string) => rows.filter((r) => r.plan === p).length;
  return { mine, legacy: hasLegacySeats({ SCOUT: mine?.subscriptionId ? mine.scoutSeats : 0, COMMAND: n('COMMAND'), DOMINATOR: n('DOMINATOR'), MANAGE: n('MANAGE'), AGENT: n('AGENT') }) };
}

/** Whether a listing is put to work with the listing add-on for this account (the account plans, and no seats from before them). */
export async function sellsAddon(u: { id: string; email?: string; role: string }): Promise<boolean> {
  if (u.role === 'ADMIN') return false;
  const settings = await getSettings();
  if (!newPlansFor(u, settings)) return false;
  return !(await seatsOf(u.id)).legacy;
}

async function sellable(u: { id: string; email?: string; role: string }, lines: Line[]) {
  const settings = await getSettings();
  const { mine, legacy } = await seatsOf(u.id);
  if (!newPlansFor(u, settings)) {
    if (lines.some((l) => l === 'LISTING' || isAccountPlan(l))) throw new InputError('That plan is not on sale yet.');
    return;
  }
  if (lines.some((l) => !isAccountPlan(l) && l !== 'LISTING') && !legacy) throw new InputError('Seats are no longer sold: choose Scout, Agency or Scale, and the listing add-on for each Google listing.');
  if (lines.includes('LISTING') && !(mine?.subscriptionId && isAccountPlan(mine.accountPlan))) throw new InputError('Choose a plan first: the listing add-on goes on top of Scout, Agency or Scale.');
}

/**
 * Puts the account on Scout, Agency or Scale, or changes which (null takes it off: the plan runs to
 * the end of the month already paid for). With a subscription running the change is made on it: an
 * upgrade charges the rest of the month now, a downgrade takes effect at once with no refund. Without
 * one, the answer is Stripe's checkout page.
 */
export async function setAccountPlan(u: { id: string; email: string; role: string }, plan: AccountPlan | null, origin: string, interval?: BillingInterval): Promise<{ url?: string; done?: boolean; pay?: string | null }> {
  if (u.role === 'ADMIN') throw new InputError('Admin accounts do not need a plan.');
  if (plan !== null && !isAccountPlan(plan)) throw new InputError('Unknown plan.');
  if (plan) await sellable(u, [plan]);
  const mine = await db.gbpSub.findUnique({ where: { userId: u.id } });
  if (mine?.subscriptionId) {
    // A running subscription keeps how it is billed: monthly and yearly are chosen at the first checkout.
    if (interval && plan && interval !== mine.billingInterval) throw new InputError(mine.billingInterval === 'year' ? 'Your plan is billed yearly. To go monthly, end it and choose monthly when the year is over.' : 'Your plan is billed monthly. To pay yearly, write to support@stakeoutsearch.com and we will switch it for you.');
    if (plan === null && (await db.gbpPlan.count({ where: { userId: u.id, plan: 'LISTING', status: 'ACTIVE' } }))) throw new InputError('Take the listing add-ons off first: they go on top of a plan.');
    const grows = plan !== null && (!isAccountPlan(mine.accountPlan) || ACCOUNT_PLANS[plan].tiers[0].cents > ACCOUNT_PLANS[mine.accountPlan].tiers[0].cents);
    const r = await syncStripe(u.id, grows, undefined, plan);
    return r.pay !== undefined ? { pay: r.pay } : { done: true };
  }
  if (!plan) return { done: true };
  return checkout(u, mine, { [plan]: 1 }, origin, '/profiles?tab=plan', interval ?? 'month');
}

/** The account plan an account pays for now (a failed card keeps it while Stripe retries), or null. */
export async function accountPlanNow(userId: string): Promise<AccountPlan | null> {
  const mine = await db.gbpSub.findUnique({ where: { userId }, select: { accountPlan: true, status: true, subscriptionId: true } });
  return mine?.subscriptionId && isAccountPlan(mine.accountPlan) && ['active', 'trialing', 'past_due'].includes(mine.status) ? mine.accountPlan : null;
}

/**
 * A finished checkout: the subscription is recorded, the listings picked for it switch on and the
 * first month's points are added. Called when the buyer comes back and again by Stripe's webhook;
 * doing it twice changes nothing.
 */
export async function activate(sessionId: string, userId?: string): Promise<{ on: boolean; cents: number | null }> {
  const s = await stripe<Session>('/checkout/sessions/' + encodeURIComponent(sessionId));
  if (s.mode !== 'subscription' || s.metadata?.kind !== 'gbp') return { on: false, cents: null };
  const owner = s.metadata.userId;
  if (!owner || owner !== s.client_reference_id || (userId && owner !== userId)) throw new InputError('Order unavailable.', 404);
  if (s.status !== 'complete' || !s.subscription || !['paid', 'no_payment_required'].includes(s.payment_status ?? '')) throw new InputError('Payment is still pending.', 409);
  const sub = await readSub(s.subscription);
  if (!(await applySub(sub, owner)) || ENDED.has(sub.status)) return { on: false, cents: null };
  const fresh = await db.gbpPlan.updateMany({ where: { userId: owner, status: 'PENDING' }, data: { status: 'ACTIVE' } });
  const points = await grantPoints(sub.id).catch((e) => (console.error('[seats] points not added yet:', (e as Error).message), 0));
  if (fresh.count || points) {
    const counts = seatsOn(sub.items?.data ?? []);
    const buyer = await db.user.findUnique({ where: { id: owner }, select: { email: true, foundingNo: true } });
    const yearly = intervalOf(sub) === 'year';
    await pushAlert('gbp-sub:' + sub.id, {
      subject: `${stripeTestMode() ? '[TEST] ' : ''}Stakeout: new subscription, ${yearly ? `${dollars(monthlyCents(counts) * ANNUAL_MONTHS_PAID)} a year` : `${dollars(monthlyCents(counts))} a month`}`,
      lines: [
        `${buyer?.email ?? 'An account'} started ${LINE_ORDER.filter((l) => counts[l]).map((l) => `${counts[l]} ${LINES[l].name}`).join(', ')}${yearly ? ', billed yearly' : ''}: ${monthlyPoints(counts, Boolean(buyer?.foundingNo)).toLocaleString('en-US')} phone sessions and ${seatBriefs(counts)} brief credits a month.`,
        ...(buyer?.foundingNo ? [`Founding member #${buyer.foundingNo} of 15: 25% more plan sessions every month.`] : []),
      ],
      path: '/admin/devices',
    }, 60).catch(() => {});
    await flushAlerts().catch(() => {});
  }
  // What the checkout charged (the first month), for the ad conversion.
  return { on: true, cents: typeof s.amount_total === 'number' ? s.amount_total : null };
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
  const counts = seatsOn(s.items?.data ?? []);
  // A plan paid for takes a founding spot before its first month is counted, so that month has the bonus too.
  const planNowOn = accountPlanOf(counts);
  if (!ended && planNowOn && ACCOUNT_PLANS[planNowOn].founding && PAYING_NOW.has(s.status) && !stripeTestMode()) await claimFounding(userId).catch((e) => console.error('[founding] not claimed:', (e as Error).message));
  const monthlyBriefs = ended ? 0 : seatBriefs(counts);
  const { start, end } = periodOf(s);
  const yearly = intervalOf(s) === 'year';
  let added = 0;
  await db.$transaction(async (tx) => {
    const row = await tx.gbpSub.findUnique({ where: { userId } });
    // An older subscription's news must not disturb the one that replaced it.
    if (!row || (row.subscriptionId && row.subscriptionId !== s.id)) return;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { creditBalance: true, foundingNo: true } });
    const monthly = ended ? 0 : monthlyPoints(counts, Boolean(user.foundingNo));
    // Points bought since the seats' points were last counted: those are never the seats'.
    const bought = row.grantAt
      ? (await tx.creditLedger.aggregate({ where: { userId, reason: { in: PACK_REASONS }, createdAt: { gt: row.grantAt }, amount: { gt: 0 } }, _sum: { amount: true } }))._sum.amount ?? 0
      : 0;
    const state = { balance: user.creditBalance, bucket: row.bucket, packFloor: row.packFloor, bought };
    if (ended) {
      // The plan's briefs end with it (bought ones stay on the account).
      if (row.briefPlan || row.briefCarry || row.grantedBriefs) await tx.gbpSub.update({ where: { userId }, data: { briefPlan: 0, briefCarry: 0, grantedBriefs: 0 } });
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
    // A change mid-way is shared out over what is left of the month (a yearly plan's billing month, not its year).
    const w = yearly && end > start ? monthWindow(start, end, paidAt) : { from: start, to: end };
    const share = w.to > w.from ? (w.to - paidAt) / (w.to - w.from) : 1;
    const g = seatGrant(invoice.billing_reason, monthly, row.grantedPoints, share);
    if (!g) return;
    // How much of last month a renewal keeps: the plan's rollover, in months' worth (none on Scout paid monthly).
    const keepMonths = rolloverMonths(planNowOn, yearly ? 'year' : 'month');
    // The plan's briefs: a new month brings them and carries last month's unused ones over once (when the plan rolls over at all).
    const bg = briefGrant(invoice.billing_reason, monthlyBriefs, { plan: row.briefPlan, carry: row.briefCarry, granted: row.grantedBriefs });
    const b = bg && keepMonths === 0 && invoice.billing_reason === 'subscription_cycle' ? { ...bg, carry: 0 } : bg;
    if (b) await tx.gbpSub.update({ where: { userId }, data: { briefPlan: b.plan, briefCarry: b.carry, grantedBriefs: b.granted } });
    // Black Friday: a first seat started before the offer ends brings 5 prospect audits, once per
    // account. Added first, as points of the account's own, never the seats'.
    if (g.points > 0 && promoLive(paidAt * 1000) && !(await tx.creditLedger.findUnique({ where: { externalEventId: 'bonus-pack:' + userId } }))) {
      await tx.creditLedger.create({ data: { userId, amount: BONUS_POINTS, reason: 'BONUS_PACK', externalEventId: 'bonus-pack:' + userId } });
      await tx.user.update({ where: { id: userId }, data: { creditBalance: { increment: BONUS_POINTS } } });
      state.balance += BONUS_POINTS;
      state.bought += BONUS_POINTS;
    }
    if (g.renew) {
      const r = renewPlan(state, g.points, carryCap(planNowOn, yearly ? 'year' : 'month', g.points));
      if (r.lapse > 0) await tx.creditLedger.create({ data: { userId, amount: -r.lapse, reason: 'SEAT_POINTS_LAPSE', externalEventId: key + ':lapse' } });
      await tx.creditLedger.create({ data: { userId, amount: r.grant, reason: 'SEAT_POINTS', externalEventId: key } });
      await tx.user.update({ where: { id: userId }, data: { creditBalance: { increment: r.grant - r.lapse } } });
      // A yearly plan's other eleven months come from grantPlanMonths, the first one month after the period began.
      const next = yearly ? addMonths(start, 1) : 0;
      await tx.gbpSub.update({ where: { userId }, data: { bucket: r.bucket, packFloor: r.packFloor, grantAt: new Date(), grantedPoints: g.granted, nextGrantAt: yearly && next < end ? new Date(next * 1000) : null } });
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

/**
 * A yearly plan's months: Stripe bills once a year, and that invoice brings the first month's points
 * and briefs (grantPoints). Each later month of the year brings them again, as a monthly renewal
 * would (last month's unused ones roll over once, older ones lapse). Runs from the daily schedule
 * and whenever the account's balance is read (catchUpPlanMonths), for one account or every one that
 * is due. Each month counts once. Returns how many months were added.
 */
export async function grantPlanMonths(userId?: string, now = new Date()): Promise<number> {
  const due = await db.gbpSub.findMany({ where: { ...(userId ? { userId } : {}), billingInterval: 'year', subscriptionId: { not: null }, nextGrantAt: { lte: now } }, select: { userId: true, subscriptionId: true } });
  let months = 0;
  for (const d of due) {
    try {
      const s = await readSub(d.subscriptionId!);
      if (s.metadata?.kind !== 'gbp' || ENDED.has(s.status) || intervalOf(s) !== 'year') continue;
      // A card that failed at the yearly renewal: no new month until Stripe's retries get it paid.
      if (!PAYING_NOW.has(s.status)) continue;
      const { start, end } = periodOf(s);
      const at = Math.floor(now.getTime() / 1000);
      const k = monthIndex(start, Math.min(at, end - 1));
      const next = addMonths(start, k + 1);
      const nextGrantAt = next < end ? new Date(next * 1000) : null;
      if (k < 1) {
        await db.gbpSub.update({ where: { userId: d.userId }, data: { nextGrantAt } });
        continue;
      }
      const counts = seatsOn(s.items?.data ?? []);
      const key = `plan-month:${s.id}:${start}:${k}`;
      await db.$transaction(async (tx) => {
        const row = await tx.gbpSub.findUnique({ where: { userId: d.userId } });
        if (!row || row.subscriptionId !== s.id) return;
        if (await tx.creditLedger.findUnique({ where: { externalEventId: key } })) {
          await tx.gbpSub.update({ where: { userId: d.userId }, data: { nextGrantAt } });
          return;
        }
        const user = await tx.user.findUniqueOrThrow({ where: { id: d.userId }, select: { creditBalance: true, foundingNo: true } });
        const bought = row.grantAt
          ? (await tx.creditLedger.aggregate({ where: { userId: d.userId, reason: { in: PACK_REASONS }, createdAt: { gt: row.grantAt }, amount: { gt: 0 } }, _sum: { amount: true } }))._sum.amount ?? 0
          : 0;
        const state = { balance: user.creditBalance, bucket: row.bucket, packFloor: row.packFloor, bought };
        const monthly = monthlyPoints(counts, Boolean(user.foundingNo));
        const keepMonths = rolloverMonths(accountPlanOf(counts), 'year');
        const bg = briefGrant('subscription_cycle', seatBriefs(counts), { plan: row.briefPlan, carry: row.briefCarry, granted: row.grantedBriefs });
        const b = bg && keepMonths === 0 ? { ...bg, carry: 0 } : bg;
        const r = renewPlan(state, monthly, carryCap(accountPlanOf(counts), 'year', monthly));
        if (r.lapse > 0) await tx.creditLedger.create({ data: { userId: d.userId, amount: -r.lapse, reason: 'SEAT_POINTS_LAPSE', externalEventId: key + ':lapse' } });
        await tx.creditLedger.create({ data: { userId: d.userId, amount: r.grant, reason: 'SEAT_POINTS', externalEventId: key } });
        await tx.user.update({ where: { id: d.userId }, data: { creditBalance: { increment: r.grant - r.lapse } } });
        await tx.gbpSub.update({
          where: { userId: d.userId },
          data: { bucket: r.bucket, packFloor: r.packFloor, grantAt: new Date(), grantedPoints: monthly, nextGrantAt, ...(b ? { briefPlan: b.plan, briefCarry: b.carry, grantedBriefs: b.granted } : {}) },
        });
        months++;
      }).catch((e: unknown) => {
        // The same month counted twice at once: the ledger let one through.
        if ((e as { code?: string })?.code !== 'P2002') throw e;
      });
    } catch (e) {
      console.error('[plan-months] not added for', d.userId, (e as Error).message);
    }
  }
  return months;
}

/**
 * An account plan's sessions this month: what the month brings (with the founding bonus), what is
 * left of the plan's share of the balance, and when its billing month began and ends (a yearly
 * plan's current month). Null without a paying account plan.
 */
export async function planMonth(userId: string, now = new Date()) {
  const row = await db.gbpSub.findUnique({ where: { userId } });
  if (!row?.subscriptionId || !isAccountPlan(row.accountPlan) || !['active', 'trialing', 'past_due'].includes(row.status)) return null;
  const plan = row.accountPlan;
  const [user, listings, bought] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { creditBalance: true, foundingNo: true } }),
    db.gbpPlan.count({ where: { userId, plan: 'LISTING', status: 'ACTIVE' } }),
    row.grantAt
      ? db.creditLedger.aggregate({ where: { userId, reason: { in: PACK_REASONS }, createdAt: { gt: row.grantAt }, amount: { gt: 0 } }, _sum: { amount: true } }).then((a) => a._sum.amount ?? 0)
      : Promise.resolve(0),
  ]);
  if (!user) return null;
  const counts: Partial<Record<Line, number>> = { [plan]: 1, LISTING: listings };
  const monthly = monthlyPoints(counts, Boolean(user.foundingNo));
  const left = planRemaining({ balance: user.creditBalance, bucket: row.bucket, packFloor: row.packFloor, bought });
  const yearly = row.billingInterval === 'year';
  const start = row.periodStart ? Math.floor(row.periodStart.getTime() / 1000) : 0;
  const end = row.periodEnd ? Math.floor(row.periodEnd.getTime() / 1000) : 0;
  const at = Math.floor(now.getTime() / 1000);
  const month = yearly && end > start ? monthWindow(start, end, at) : { from: start, to: end };
  return { plan, yearly, monthly, left, founding: Boolean(user.foundingNo), listings, start, end, monthFrom: month.from, monthTo: month.to };
}

/**
 * The Boost (250 sessions, $39) for an account on a plan: on sale while under BOOST_BELOW of the
 * month's sessions are left. A second Boost in the same billing month is met with what moving up
 * one plan costs now instead: Stripe charges the price difference for the rest of the period, and
 * the month's extra sessions come for the rest of this month (as an upgrade is counted, see
 * grantPoints), against the same sessions bought as Boosts. Figures are close estimates; Stripe's
 * proration is the exact charge.
 */
export async function boostOffer(userId: string, now = new Date()) {
  const m = await planMonth(userId, now);
  if (!m) return null;
  const eligible = m.monthly > 0 && m.left < m.monthly * BOOST_BELOW;
  const boosts = await db.paymentOrder.count({ where: { userId, item: BOOST.key, captureId: { not: null }, refundedAt: null, createdAt: { gte: new Date((m.monthFrom || 0) * 1000) } } });
  const to = nextPlan(m.plan);
  let upgrade: { to: AccountPlan; name: string; chargeCents: number; sessionsNow: number; boostCents: number; savingsCents: number; monthlyAfter: number; priceAfter: string } | null = null;
  if (to && m.end > m.start) {
    const at = Math.floor(now.getTime() / 1000);
    const periodLeft = Math.min(1, Math.max(0, (m.end - at) / (m.end - m.start)));
    const monthLeft = m.monthTo > m.monthFrom ? Math.min(1, Math.max(0, (m.monthTo - at) / (m.monthTo - m.monthFrom))) : periodLeft;
    const priceNow = (p: AccountPlan) => (m.yearly ? yearCents(p) : ACCOUNT_PLANS[p].tiers[0].cents);
    const chargeCents = Math.round((priceNow(to) - priceNow(m.plan)) * periodLeft);
    const after = monthlyPoints({ [to]: 1, LISTING: m.listings }, m.founding);
    const sessionsNow = Math.max(0, Math.round((after - m.monthly) * monthLeft));
    const boostCents = Math.round((sessionsNow * BOOST.cents) / BOOST.credits);
    upgrade = { to, name: ACCOUNT_PLANS[to].name, chargeCents, sessionsNow, boostCents, savingsCents: boostCents - chargeCents, monthlyAfter: after, priceAfter: m.yearly ? `${dollars(yearCents(to))} a year` : `${dollars(ACCOUNT_PLANS[to].tiers[0].cents)} a month` };
  }
  return { eligible, left: m.left, monthly: m.monthly, boosts, upgrade, monthFrom: m.monthFrom };
}

/** Brings a yearly plan's months up to date before the account's balance is shown or spent (one quick look when nothing is due). */
export async function catchUpPlanMonths(userId: string): Promise<boolean> {
  const row = await db.gbpSub.findUnique({ where: { userId }, select: { billingInterval: true, nextGrantAt: true, subscriptionId: true } }).catch(() => null);
  if (!row?.subscriptionId || row.billingInterval !== 'year' || !row.nextGrantAt || row.nextGrantAt > new Date()) return false;
  return (await grantPlanMonths(userId).catch(() => 0)) > 0;
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
  if (mine?.subscriptionId) {
    const s = await readSub(mine.subscriptionId);
    if ((s.items?.data ?? []).some(isAddon)) { await applySub(s, u.id); return { done: true }; }
    const price = await addonPrice(intervalOf(s));
    if (s.cancel_at_period_end) await stripe<Sub>('/subscriptions/' + s.id, 'POST', { cancel_at_period_end: false });
    const next = await stripe<Sub>('/subscriptions/' + s.id, 'POST', { items: [{ price, quantity: 1 }], proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete', expand: ['latest_invoice'] }, randomUUID());
    await applySub(next, u.id);
    if (next.pending_update) return { pay: typeof next.latest_invoice === 'object' ? next.latest_invoice?.hosted_invoice_url ?? null : null };
    return { done: true };
  }
  // A listing checkout left unfinished is forgotten: only the add-on is being bought here.
  await db.gbpPlan.deleteMany({ where: { userId: u.id, status: 'PENDING' } });
  const price = await addonPrice();
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
  const plan = mine?.subscriptionId && isAccountPlan(mine.accountPlan) ? mine.accountPlan : null;
  const counts: Record<Line, number> = {
    DOMINATOR: active.filter((r) => r.plan === 'DOMINATOR').length,
    COMMAND: active.filter((r) => r.plan === 'COMMAND').length,
    SCOUT: mine?.subscriptionId ? mine.scoutSeats : 0,
    MANAGE: active.filter((r) => r.plan === 'MANAGE').length,
    AGENT: active.filter((r) => r.plan === 'AGENT').length,
    LISTING: active.filter((r) => r.plan === 'LISTING').length,
    P_SCOUT: plan === 'P_SCOUT' ? 1 : 0,
    P_AGENCY: plan === 'P_AGENCY' ? 1 : 0,
    P_SCALE: plan === 'P_SCALE' ? 1 : 0,
    P_MAX: plan === 'P_MAX' ? 1 : 0,
  };
  const [user, settings, spots] = await Promise.all([db.user.findUnique({ where: { id: userId }, select: { email: true, role: true, briefBalance: true, foundingNo: true } }), getSettings(), foundingLeft().catch(() => 0)]);
  const paying = Boolean(mine?.subscriptionId) && ['active', 'trialing', 'past_due'].includes(mine?.status ?? '');
  const yearly = Boolean(mine?.subscriptionId) && mine?.billingInterval === 'year';
  return {
    /** Sold the account plans (Scout, Agency, Scale) rather than seats. */
    newPlans: user ? newPlansFor(user, settings) : false,
    /** Still on seats sold before the account plans. */
    legacy: hasLegacySeats(counts),
    plan,
    briefs: { plan: paying ? mine?.briefPlan ?? 0 : 0, carry: paying ? mine?.briefCarry ?? 0 : 0, bought: user?.briefBalance ?? 0, left: briefsLeft({ plan: mine?.briefPlan ?? 0, carry: mine?.briefCarry ?? 0, bought: user?.briefBalance ?? 0, paying }), perMonth: seatBriefs(counts) },
    listings: rows.map((r) => ({ location: r.locationId, profile: r.profileId, title: r.title, plan: r.plan, status: r.status, endsAt: r.endsAt?.toISOString() ?? null, on: planNow(r, mine?.status, now) !== null })),
    sub: mine ? { status: mine.status, periodEnd: mine.periodEnd?.toISOString() ?? null, running: Boolean(mine.subscriptionId) } : null,
    counts,
    seats: clientSeats(counts),
    pointsPerMonth: monthlyPoints(counts, Boolean(user?.foundingNo)),
    addon: { on: addonOn(mine), cents: AGENT_ADDON.cents },
    monthlyCents: monthlyCents(counts) + (addonOn(mine) ? AGENT_ADDON.cents : 0),
    /** How the running subscription is billed, and what each bill is (a yearly one: ANNUAL_MONTHS_PAID months). */
    interval: (yearly ? 'year' : 'month') as BillingInterval,
    periodCents: (monthlyCents(counts) + (addonOn(mine) ? AGENT_ADDON.cents : 0)) * (yearly ? ANNUAL_MONTHS_PAID : 1),
    /** Founding member number, or null; and how many founding spots are left. */
    founding: user?.foundingNo ?? null,
    foundingLeft: spots,
    /** Distinct businesses scanned this billing month, against the plan's cap (null: no limit). */
    locations: plan ? await import('./locationLimits').then((m) => m.locationUse(userId)).then((l) => (l ? { used: l.used, cap: l.cap } : null)).catch(() => null) : null,
  };
}
