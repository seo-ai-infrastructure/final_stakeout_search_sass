import { randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { pushAlert } from '@stakeout/core/alerts';
import { PLANS, dollars, isPlan, monthlyCents, planNow, quantityPlan, stripeTiers, type Plan } from '@stakeout/core/gbpPlans';
import { stripe, stripeTestMode } from '@/lib/stripe';
import { postproxy } from '@/lib/postproxy';
import { flushAlerts } from '@/lib/alerts';

/**
 * The monthly subscription for Google listings. One Stripe subscription per account with one line
 * per plan; the quantity on a line is how many listings are on that plan. Adding a listing raises
 * the quantity and charges the rest of the month now; taking one off lowers it without a refund,
 * and the listing keeps working until the month that was paid for ends.
 */
type Item = { id: string; quantity?: number; current_period_end?: number; price?: { id: string; lookup_key?: string | null } };
type Sub = { id: string; status: string; customer: string; cancel_at_period_end?: boolean; current_period_end?: number; items?: { data?: Item[] }; metadata?: Record<string, string> };
type Session = { id: string; url?: string; mode?: string; status?: string; payment_status?: string; client_reference_id?: string; customer?: string | null; subscription?: string | null; metadata?: Record<string, string> };
export type Pick = { profile: string; location: string; plan: Plan };

const ENDED = new Set(['canceled', 'unpaid', 'incomplete_expired']);
const planOfItem = (i: Item): Plan | null => (Object.keys(PLANS) as Plan[]).find((p) => PLANS[p].lookupKey === i.price?.lookup_key) ?? null;
const periodEnd = (s: Sub) => {
  const t = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
  return t ? new Date(t * 1000) : null;
};

/** Stripe's price for each plan, made the first time it is needed and found by its lookup key after that. */
async function prices(): Promise<Record<Plan, string>> {
  const keys = (Object.keys(PLANS) as Plan[]).map((p) => PLANS[p].lookupKey);
  const found = await stripe<{ data: { id: string; lookup_key: string | null }[] }>('/prices?active=true&limit=10&' + keys.map((k, i) => `lookup_keys[${i}]=${encodeURIComponent(k)}`).join('&'));
  const out = {} as Record<Plan, string>;
  for (const p of Object.keys(PLANS) as Plan[]) {
    const had = found.data.find((x) => x.lookup_key === PLANS[p].lookupKey);
    out[p] = had
      ? had.id
      : (
          await stripe<{ id: string }>(
            '/prices',
            'POST',
            {
              currency: 'usd',
              recurring: { interval: 'month' },
              billing_scheme: 'tiered',
              tiers_mode: 'volume',
              tiers: stripeTiers(p),
              lookup_key: PLANS[p].lookupKey,
              product_data: { name: `Stakeout Search · Google listings · ${PLANS[p].name}` },
            },
            'price-' + PLANS[p].lookupKey,
          )
        ).id;
  }
  return out;
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
  const data = { customerId: s.customer, subscriptionId: ended ? null : s.id, status: ended ? 'canceled' : s.status, periodEnd: periodEnd(s), updatedAt: new Date() };
  await db.gbpSub.upsert({ where: { userId: owner }, create: { userId: owner, ...data }, update: data });
  if (ended) await db.gbpPlan.deleteMany({ where: { userId: owner } });
  return owner;
}

/**
 * Makes the subscription match the listings that are ACTIVE. `charge`: bill the rest of the month
 * for what was added now; if the card refuses, nothing changes and the refusal is thrown.
 */
async function syncStripe(userId: string, charge: boolean) {
  const mine = await db.gbpSub.findUnique({ where: { userId } });
  if (!mine?.subscriptionId) return;
  const [s, rows] = await Promise.all([readSub(mine.subscriptionId), db.gbpPlan.findMany({ where: { userId }, select: { plan: true, status: true } })]);
  const items = s.items?.data ?? [];
  const current: Partial<Record<Plan, number>> = {};
  for (const i of items) { const p = planOfItem(i); if (p) current[p] = i.quantity ?? 0; }
  const q = quantityPlan(rows, current);
  if (q.empty) {
    // Nothing left on a plan: the subscription runs out at the end of the month already paid for.
    if (!s.cancel_at_period_end) await applySub(await stripe<Sub>('/subscriptions/' + s.id, 'POST', { cancel_at_period_end: true }), userId);
    return;
  }
  if (q.same && !s.cancel_at_period_end) return;
  const price = await prices();
  const change: Record<string, unknown>[] = [];
  for (const p of Object.keys(PLANS) as Plan[]) {
    const had = items.find((i) => planOfItem(i) === p);
    if (had) change.push({ id: had.id, quantity: q.want[p] });
    else if (q.want[p] > 0) change.push({ price: price[p], quantity: q.want[p] });
  }
  const bill = charge && q.grows;
  const next = await stripe<Sub>(
    '/subscriptions/' + s.id,
    'POST',
    { items: change, cancel_at_period_end: false, proration_behavior: bill ? 'always_invoice' : 'none', ...(bill ? { payment_behavior: 'error_if_incomplete' } : {}) },
    randomUUID(),
  );
  await applySub(next, userId);
}

/** A customer's listings in one of their connected Google accounts, by location: its name, checked before anything is sold for it. */
async function listingNames(userId: string, profile: string): Promise<Map<string, string>> {
  const account = await db.gbpAccount.findFirst({ where: { userId, profileId: profile }, select: { id: true } });
  if (!account) throw new InputError('Unknown profile.', 404);
  const r = await postproxy<{ data?: { id: string; name: string }[] }>('/api/profiles/' + encodeURIComponent(profile) + '/placements');
  return new Map((r.data ?? []).map((l) => [l.id, l.name]));
}

/**
 * Puts listings on a plan. With a subscription already running they are added to it and the rest
 * of the month is charged to the card on file; without one, the answer is the address of Stripe's
 * checkout page and the listings switch on when it is paid.
 */
export async function addListings(u: { id: string; email: string; role: string }, picks: Pick[], origin: string): Promise<{ url?: string; done?: boolean }> {
  if (u.role === 'ADMIN') throw new InputError('Admin accounts have every listing unlocked.');
  if (!picks.length || picks.length > 200) throw new InputError('Pick the listings to upgrade.');
  for (const p of picks) if (!isPlan(p.plan) || !PLANS[p.plan].available) throw new InputError('That plan is not available yet.');
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
      await syncStripe(u.id, charge);
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
  const price = await prices();
  const count = (plan: Plan) => picks.filter((p) => p.plan === plan).length;
  const meta = { kind: 'gbp', userId: u.id };
  const session = await stripe<Session>(
    '/checkout/sessions',
    'POST',
    {
      mode: 'subscription',
      client_reference_id: u.id,
      ...(mine?.customerId ? { customer: mine.customerId } : { customer_email: u.email }),
      metadata: meta,
      subscription_data: { metadata: meta, description: 'Stakeout Search: Google listings' },
      line_items: (Object.keys(PLANS) as Plan[]).filter((p) => count(p) > 0).map((p) => ({ price: price[p], quantity: count(p) })),
      success_url: origin + '/profiles?plan={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/profiles?plan=cancelled',
    },
    randomUUID(),
  );
  if (!session.url) throw new InputError('Stripe did not open a checkout page. Try again.', 502);
  return { url: session.url };
}

/**
 * A finished checkout: the subscription is recorded and the listings picked for it switch on.
 * Called when the buyer comes back and again by Stripe's webhook; doing it twice changes nothing.
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
  if (fresh.count) {
    const [buyer, rows] = await Promise.all([db.user.findUnique({ where: { id: owner }, select: { email: true } }), db.gbpPlan.findMany({ where: { userId: owner, status: 'ACTIVE' }, select: { plan: true, title: true } })]);
    const counts = { MANAGE: rows.filter((r) => r.plan === 'MANAGE').length, AGENT: rows.filter((r) => r.plan === 'AGENT').length };
    await pushAlert('gbp-sub:' + sub.id, {
      subject: `${stripeTestMode() ? '[TEST] ' : ''}Stakeout: new Google listings subscription, ${dollars(monthlyCents(counts))} a month`,
      lines: [`${buyer?.email ?? 'An account'} put ${rows.length} listing${rows.length === 1 ? '' : 's'} on a paid plan.`, rows.slice(0, 20).map((r) => `${r.title ?? 'A listing'} (${PLANS[r.plan as Plan]?.name ?? r.plan})`).join(', ')],
      path: '/admin/devices',
    }, 60).catch(() => {});
    await flushAlerts().catch(() => {});
  }
  return true;
}

/** Takes a listing off its plan. It keeps working until the month that was paid for ends; nothing is refunded. */
export async function removeListing(userId: string, location: string) {
  const row = await db.gbpPlan.findUnique({ where: { userId_locationId: { userId, locationId: location } } });
  if (!row) throw new InputError('That listing is not on a plan.', 404);
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

/** Takes every listing of one connected Google account off its plan: for when the account is disconnected. */
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
  if (s) await applySub(s);
}

/** What an account pays for: its listings, its subscription and the month's total. Listings whose paid month has run out are dropped. */
export async function billingSummary(userId: string) {
  const now = new Date();
  await db.gbpPlan.deleteMany({ where: { userId, status: 'ENDING', endsAt: { lte: now } } });
  const [rows, mine] = await Promise.all([db.gbpPlan.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }), db.gbpSub.findUnique({ where: { userId } })]);
  const active = rows.filter((r) => r.status === 'ACTIVE');
  const counts = { MANAGE: active.filter((r) => r.plan === 'MANAGE').length, AGENT: active.filter((r) => r.plan === 'AGENT').length };
  return {
    listings: rows.map((r) => ({ location: r.locationId, profile: r.profileId, title: r.title, plan: r.plan, status: r.status, endsAt: r.endsAt?.toISOString() ?? null, on: planNow(r, mine?.status, now) !== null })),
    sub: mine ? { status: mine.status, periodEnd: mine.periodEnd?.toISOString() ?? null, running: Boolean(mine.subscriptionId) } : null,
    counts,
    monthlyCents: monthlyCents(counts),
  };
}
