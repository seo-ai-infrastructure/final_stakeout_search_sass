import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError, buildGrid, parseSpec } from '@stakeout/core/grid';
import { createScan } from '@stakeout/core/scans';
import { wakeWorker } from '@stakeout/core/wake';
import { getSettings } from '@stakeout/core/settings';
import { ACCOUNT_PLANS } from '@stakeout/core/gbpPlans';
import { stripe, stripeConfigured } from './stripe';
import { POCKET, POCKET_COUPON } from './pricing';
import { appUrl, mailerConfigured, sendNoticeEmail } from './mailer';
import { sendPasswordLink } from './passwordLinks';
import { BLOCKED_ROLE } from './verification';
import { POCKET_LIMIT, POCKET_WINDOW_DAYS, pocketRef, pocketStage, type PocketInput } from './pocketInput';

/**
 * The $1 pocket test: a visitor with no account pays $1 on Stripe's checkout page and one live phone
 * search runs on our 5G lines at the exact spot they are standing, so they can compare it with the
 * phone in their hand. Always one point, never a grid. Paying makes their account (or uses the one
 * that email already has), and the $1 comes off the first month of a first plan.
 */
type Session = {
  id: string;
  url?: string | null;
  status?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  client_reference_id?: string | null;
  customer?: string | { id: string } | null;
  payment_intent?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
};
type Row = NonNullable<Awaited<ReturnType<typeof db.pocketTest.findUnique>>>;

/** One point at the buyer's spot, on mobile data (the spec has a grid size, but only its centre is ever made). */
const spec = (r: { keyword: string; business: string; lat: number; lng: number }) =>
  parseSpec({ targetType: 'mobile_chrome', keyword: r.keyword, targetBusiness: r.business, centerLat: r.lat, centerLng: r.lng, gridSize: 3, spacingKm: 1.60934, ispMode: 'any', isps: [], trackAiOverviews: true, scheduleType: 'once', network: 'mobile' });

const windowStart = () => new Date(Date.now() - POCKET_WINDOW_DAYS * 86400000);
const OVER = `The pocket test is ${POCKET_LIMIT} per person every ${POCKET_WINDOW_DAYS} days. A plan runs as many searches as you need, at every point of a grid.`;
const hashIp = (ip: string | null) => (ip ? createHash('sha256').update('pocket-ip:' + ip).digest('hex') : null);

/** Makes the test and Stripe's $1 checkout for it. Returns the checkout page's address. `ip`: the visitor's, when known. */
export async function startPocket(input: PocketInput, origin: string, ip: string | null = null, browserHad = 0): Promise<{ url: string }> {
  if (!stripeConfigured() || process.env.POCKET_TEST === 'off') throw new InputError('The pocket test is not running right now.', 503);
  if (browserHad >= POCKET_LIMIT) throw new InputError(OVER, 429);
  // Two paid tests per email, per IP and per browser every 30 days, all checked before any payment.
  const ipHash = hashIp(ip);
  const had = await db.pocketTest.count({ where: { paidAt: { gt: windowStart() }, refundedAt: null, OR: [{ email: input.email }, ...(ipHash ? [{ ipHash }] : [])] } });
  if (had >= POCKET_LIMIT) throw new InputError(OVER, 429);
  const existing = await db.user.findUnique({ where: { email: input.email }, select: { role: true } });
  if (existing?.role === BLOCKED_ROLE) throw new InputError('That email address cannot be used.', 403);
  if (!existing && !(await getSettings()).signupsOpen) throw new InputError('The pocket test is not open to new accounts right now.', 403);
  spec({ ...input }); // refuses anything a scan could not be made from, before any money moves
  const row = await db.pocketTest.create({ data: { token: randomBytes(24).toString('base64url'), ...input, ipHash } });
  const meta = { kind: 'pocket', pocket: row.id };
  const session = await stripe<Session>(
    '/checkout/sessions',
    'POST',
    {
      mode: 'payment',
      customer_creation: 'always',
      customer_email: input.email,
      client_reference_id: row.id,
      metadata: meta,
      // The card is kept with Stripe so a plan can be started later without typing it again.
      payment_intent_data: { setup_future_usage: 'off_session', description: 'Stakeout Pocket Test: one live phone search', metadata: meta },
      custom_text: { submit: { message: 'One live phone search at your spot. Stripe keeps your card so you can start a plan later without typing it again; nothing more is charged unless you choose a plan.' } },
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: POCKET.cents, product_data: { name: 'Stakeout Search · Pocket Test', description: `One live phone search for “${input.keyword}” at your spot, with its video.` } } }],
      success_url: `${origin}/pocket-test/${row.token}?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pocket-test?cancelled=1`,
    },
    randomUUID(),
  );
  if (!session.url) throw new InputError('Stripe did not open a checkout page. Try again.', 502);
  await db.pocketTest.update({ where: { id: row.id }, data: { checkoutId: session.id } });
  return { url: session.url };
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : (v?.id ?? ''));

/**
 * A paid pocket test, carried out once: the account (made here when the email has none), the $1
 * order and the one-point scan. Called when the buyer comes back from Stripe and by Stripe's webhook;
 * each step is safe to repeat, so a run cut short is finished by the next call.
 */
export async function fulfilPocket(sessionId: string): Promise<Row> {
  let row = await db.pocketTest.findUnique({ where: { checkoutId: sessionId } });
  if (!row) throw new InputError('Unknown pocket test.', 404);
  if (!row.paidAt) {
    const s = await stripe<Session>('/checkout/sessions/' + encodeURIComponent(sessionId));
    if (s.status !== 'complete' || s.payment_status !== 'paid' || s.currency !== 'usd' || s.amount_total !== POCKET.cents || s.client_reference_id !== row.id || s.metadata?.kind !== 'pocket' || !idOf(s.payment_intent))
      throw new InputError('Payment is pending or could not be matched to this test.', 409);
    const fresh = await db.pocketTest.updateMany({ where: { id: row.id, paidAt: null }, data: { paidAt: new Date(), customerId: idOf(s.customer) || null } });
    // The order, kept with the payment's id (the refund needs it).
    await db.paymentOrder.upsert({ where: { id: sessionId }, create: { id: sessionId, userId: 'pocket:' + row.id, credits: 0, cents: POCKET.cents, item: POCKET.key, captureId: idOf(s.payment_intent) }, update: {} });
    row = await db.pocketTest.findUniqueOrThrow({ where: { id: row.id } });
    if (fresh.count) {
      console.log('[pocket] paid:', row.id, 'for', JSON.stringify(row.keyword));
      // The card is noted. One past the limit still runs (it is paid for, and a refund would cost us
      // Stripe's fee): it is only logged, so a card rotating emails shows up.
      const pi = await stripe<{ payment_method?: { card?: { fingerprint?: string } } | string | null }>('/payment_intents/' + encodeURIComponent(idOf(s.payment_intent)) + '?expand[]=payment_method').catch(() => null);
      const card = (pi && typeof pi.payment_method === 'object' ? pi.payment_method?.card?.fingerprint : null) ?? null;
      if (card) {
        await db.pocketTest.update({ where: { id: row.id }, data: { cardFingerprint: card } });
        const sameCard = await db.pocketTest.count({ where: { cardFingerprint: card, id: { not: row.id }, paidAt: { gt: windowStart() }, refundedAt: null } });
        if (sameCard >= POCKET_LIMIT) console.warn('[pocket] card past the limit:', row.id, 'is test', sameCard + 1, 'on one card in', POCKET_WINDOW_DAYS, 'days (run, not refunded)');
      }
    }
  }
  if (row.refundedAt) return row;
  if (!row.userId) {
    let user = await db.user.findUnique({ where: { email: row.email }, select: { id: true, role: true } });
    let made = false;
    if (!user) {
      user = await db.user
        .create({ data: { email: row.email, role: 'AGENCY', creditBalance: 0 }, select: { id: true, role: true } })
        .then((u) => ((made = true), u))
        .catch(() => db.user.findUniqueOrThrow({ where: { email: row!.email }, select: { id: true, role: true } }));
    }
    if (user.role === BLOCKED_ROLE) return refundPocket(row, 'closed');
    // The buyer coming back and Stripe's webhook can both be here at once: one of them takes the step (and sends the emails).
    const mine = await db.pocketTest.updateMany({ where: { id: row.id, userId: null }, data: { userId: user.id, ...(made ? { madeAccount: true } : {}) } });
    if (!mine.count && made) await db.pocketTest.update({ where: { id: row.id }, data: { madeAccount: true } });
    await db.paymentOrder.updateMany({ where: { id: sessionId }, data: { userId: user.id } });
    row = await db.pocketTest.findUniqueOrThrow({ where: { id: row.id } });
    // The result's address, and for a new account a link to choose its password.
    if (mine.count && mailerConfigured()) {
      await sendNoticeEmail(row.email, 'Your Stakeout pocket test is running', [`One of our phones is searching “${row.keyword}” at your spot right now. It takes about five minutes.`, 'Your result, with the video of the search, opens at the link below. Keep it: it is the only way back to this test.'], { label: 'Open your pocket test', url: appUrl('/pocket-test/' + row.token) }).catch((e) => console.error('[pocket] result email not sent:', (e as Error).message));
      if (made) await sendPasswordLink({ id: user.id, email: row.email }, { days: 7, invited: true }).catch((e) => console.error('[pocket] password email not sent:', (e as Error).message));
    }
  }
  if (!row.scanId) {
    const s = spec(row);
    const pins = buildGrid(s);
    const centre = pins[(pins.length - 1) / 2];
    // Paid for with the $1, so no phone sessions are taken; on the 5G lines only, like a Proof audit.
    const scan = await createScan(row.userId!, s, 'pocket:' + row.id, undefined, [centre], { free: true, laneOnly: true });
    if (!scan.shareToken) await db.gridScan.updateMany({ where: { id: scan.id, shareToken: null }, data: { shareToken: randomBytes(24).toString('hex') } });
    await db.pocketTest.update({ where: { id: row.id }, data: { scanId: scan.id } });
    await wakeWorker('pocket test').catch(() => {});
    row = await db.pocketTest.findUniqueOrThrow({ where: { id: row.id } });
  }
  return row;
}

/**
 * The $1 goes back, once. why: 'failed' (the search could not be completed: the worker tries a point
 * again, usually on another phone, before it fails) or 'closed' (a closed account). Never for the limit, and never at a
 * buyer's click: a screenshot refund is sent by hand.
 */
export async function refundPocket(row: Row, why: 'failed' | 'closed'): Promise<Row> {
  if (row.refundedAt || !row.checkoutId) return row;
  const order = await db.paymentOrder.findUnique({ where: { id: row.checkoutId }, select: { captureId: true } });
  if (!order?.captureId) return row;
  await stripe('/refunds', 'POST', { payment_intent: order.captureId, reason: 'requested_by_customer', metadata: { kind: 'pocket', pocket: row.id } }, 'pocket-refund-' + row.id);
  const now = new Date();
  await db.pocketTest.update({ where: { id: row.id }, data: { refundedAt: now, refundWhy: why } });
  await db.paymentOrder.updateMany({ where: { id: row.checkoutId }, data: { refundedAt: now } });
  console.warn('[pocket] refunded', row.id, '·', why);
  return { ...row, refundedAt: now, refundWhy: why };
}

/** The account a pocket test made, while nobody has chosen its password: only the buyer's browser is in it. */
export async function unclaimedPocketAccount(row: Row): Promise<{ id: string; email: string; role: string } | null> {
  if (!row.madeAccount || !row.userId) return null;
  const u = await db.user.findUnique({ where: { id: row.userId }, select: { id: true, email: true, role: true, passwordHash: true, teamOf: true } });
  return u && !u.passwordHash && !u.teamOf && u.role === 'AGENCY' ? { id: u.id, email: u.email, role: u.role } : null;
}

/**
 * What the result page shows: where the test is, then the phone's result (rank, the businesses
 * above it, the video) and what moving to a plan costs. `viewer` is the signed-in account, if any.
 */
export async function pocketState(token: string, viewer: string | null) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  let row = await db.pocketTest.findUnique({ where: { token } });
  if (!row) return null;
  const scan = row.scanId ? await db.gridScan.findUnique({ where: { id: row.scanId }, select: { id: true, status: true, shareToken: true, createdAt: true, completedAt: true } }) : null;
  const pin = scan ? await db.gridPin.findFirst({ where: { scanId: scan.id }, select: { id: true, status: true, startedAt: true, rankFound: true, topCompetitors: true, hasAiOverview: true, targetCitedInAi: true, videoUrl: true, proxyMeta: true, city: true, stateCode: true, zip: true } }) : null;
  let stage = pocketStage({ paid: Boolean(row.paidAt), refunded: Boolean(row.refundedAt), scan, pin });
  // The search ended without a result: the $1 goes back, here, the first time anyone looks.
  if (stage === 'refunded' && !row.refundedAt) row = await refundPocket(row, 'failed').catch((e) => (console.error('[pocket] refund failed:', (e as Error).message), row!));
  if (stage === 'refunded' && !row.refundedAt) stage = 'searching';
  const meta = (pin?.proxyMeta ?? {}) as { locationText?: string; org?: string };
  const top = Array.isArray(pin?.topCompetitors) ? (pin!.topCompetitors as unknown[]).filter((n): n is string => typeof n === 'string').slice(0, 10) : [];
  const owner = row.userId ? await db.user.findUnique({ where: { id: row.userId }, select: { id: true, passwordHash: true } }) : null;
  const sub = row.userId ? await db.gbpSub.findUnique({ where: { userId: row.userId }, select: { subscriptionId: true, accountPlan: true } }) : null;
  return {
    stage,
    ref: pocketRef(row.id),
    email: row.email,
    refundWhy: row.refundedAt ? (row.refundWhy ?? 'failed') : null,
    keyword: row.keyword,
    business: row.business,
    place: row.placeLabel ?? ([pin?.city, pin?.stateCode].filter(Boolean).join(', ') || null),
    lat: row.lat,
    lng: row.lng,
    paidAt: row.paidAt?.toISOString() ?? null,
    searchingSince: pin?.startedAt?.toISOString() ?? null,
    result:
      stage === 'done' && pin && scan
        ? {
            rank: pin.rankFound ?? null,
            top,
            aiOverview: Boolean(pin.hasAiOverview),
            namedInAiOverview: Boolean(pin.targetCitedInAi),
            googleLocation: typeof meta.locationText === 'string' ? meta.locationText : null,
            carrier: typeof meta.org === 'string' && /t-?mobile/i.test(meta.org) ? 'T-Mobile 5G' : 'mobile data',
            video: pin.videoUrl && scan.shareToken ? `/api/proof/${pin.id}?share=${scan.shareToken}&kind=video` : null,
            report: scan.shareToken ? '/share/' + scan.shareToken : null,
            finishedAt: scan.completedAt?.toISOString() ?? null,
          }
        : null,
    upgrade: {
      // This browser is signed in to the test's account, so a plan can be started from here.
      signedIn: Boolean(viewer && row.userId && viewer === row.userId),
      hasPassword: Boolean(owner?.passwordHash),
      onPlan: Boolean(sub?.subscriptionId && sub.accountPlan),
      plans: (['P_SCOUT', 'P_AGENCY'] as const).map((k) => ({ key: k, name: ACCOUNT_PLANS[k].name, cents: ACCOUNT_PLANS[k].tiers[0].cents, sessions: ACCOUNT_PLANS[k].points })),
      offCents: POCKET.cents,
    },
  };
}

/** The Stripe customer of an account's own pocket test, while only the buyer's browser is in the account: its plan checkout offers the card saved there. */
export async function pocketCustomer(userId: string): Promise<string | null> {
  const row = await db.pocketTest.findFirst({ where: { userId, madeAccount: true, customerId: { not: null }, refundedAt: null, paidAt: { gt: new Date(Date.now() - 30 * 86400000) } }, orderBy: { paidAt: 'desc' } });
  return row && (await unclaimedPocketAccount(row)) ? row.customerId : null;
}

/** The coupon that takes a pocket test's $1 off the first month of a first plan. Made the first time it is needed. */
export async function pocketCoupon(userId: string, hadSub: boolean): Promise<string | null> {
  if (hadSub) return null;
  const paid = await db.paymentOrder.findFirst({ where: { userId, item: POCKET.key, captureId: { not: null }, refundedAt: null }, select: { id: true } });
  if (!paid) return null;
  type Coupon = { id: string; valid?: boolean };
  let c = await stripe<Coupon>('/coupons/' + POCKET_COUPON).catch(() => null);
  if (!c) c = await stripe<Coupon>('/coupons', 'POST', { id: POCKET_COUPON, amount_off: POCKET.cents, currency: 'usd', duration: 'once', name: 'Your $1 pocket test' }, 'coupon-' + POCKET_COUPON).catch(() => stripe<Coupon>('/coupons/' + POCKET_COUPON).catch(() => null));
  return c && c.valid !== false ? POCKET_COUPON : null;
}
