import { randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { getListed } from '@stakeout/core/citeSites';
import { weekOf, type GbpLocation } from '@stakeout/core/gbp';
import { postproxy, postproxyConfigured } from './postproxy';
import { readLocation } from './gbpAdmin';
import { get as gbpGet } from './gbpExtras';
import { stripe } from './stripe';
import { appUrl, mailerConfigured, sendNoticeEmail } from './mailer';
import { paymentAlertRecipients } from './billing';
import { usd } from './pricing';

/**
 * White-label services an agency orders for a client: a citation build (once) and a local traffic
 * campaign (monthly, media included). Both are fulfilled by hand; each order is a row in
 * service_orders, from checkout to the proof report. Open to admins only until it is launched.
 */

export { SERVICES, STATUSES, isService, servicesOpen, servicesGate, intakeOf, intakeLines } from './serviceCatalog';
export type { Service, ServiceType, Status, CitationIntake, TrafficIntake } from './serviceCatalog';
import { SERVICES, STATUSES, isService, intakeOf, intakeLines, line, httpUrl } from './serviceCatalog';

/** A client: one of the account's Google listings, or a business it has scanned but not connected. */
export type Client = { id: string; name: string; profile: string | null; location: string | null; placeId: string | null; source: 'listing' | 'scans' };
type Profile = { id: string; name: string; platform: string };
type Placement = { id: string; name: string; metadata?: { place_id?: string } };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const byName = (a: Client, b: Client) => a.name.localeCompare(b.name);

/** The account's clients: its Google listings (an admin sees every connected one), then businesses from its scans. */
export async function clientsFor(u: { id: string; role: string }): Promise<Client[]> {
  const admin = u.role === 'ADMIN';
  let listings: Client[] = [];
  if (postproxyConfigured()) {
    const accounts = await db.gbpAccount.findMany({ where: admin ? { profileId: { not: null } } : { userId: u.id }, select: { profileId: true } });
    const own = new Set(accounts.map((a) => a.profileId));
    const all = await postproxy<{ data: Profile[] }>('/api/profiles').catch(() => ({ data: [] as Profile[] }));
    const profiles = (all.data ?? []).filter((p) => p.platform === 'google_business' && (admin || own.has(p.id)));
    const places = await Promise.all(
      profiles.map((p) =>
        postproxy<{ data: Placement[] }>('/api/profiles/' + encodeURIComponent(p.id) + '/placements')
          .then((r) => (r.data ?? []).map((l): Client => ({ id: l.id, name: l.name, profile: p.id, location: l.id, placeId: l.metadata?.place_id ?? null, source: 'listing' })))
          .catch(() => [] as Client[]),
      ),
    );
    const seenIds = new Set<string>();
    listings = places.flat().filter((c) => !seenIds.has(c.id) && Boolean(seenIds.add(c.id)));
  }
  const scans = await db.gridScan.findMany({
    where: { userId: u.id, createdAt: { gte: new Date(Date.now() - 180 * 86400000) } },
    orderBy: { createdAt: 'desc' },
    select: { targetBusiness: true, targetPlaceId: true },
    take: 500,
  });
  const seen = new Set(listings.map((l) => norm(l.name)));
  const fromScans: Client[] = [];
  for (const s of scans) {
    const name = s.targetBusiness.trim();
    if (!name || seen.has(norm(name))) continue;
    seen.add(norm(name));
    fromScans.push({ id: 'scan:' + name, name, profile: null, location: null, placeId: s.targetPlaceId ?? null, source: 'scans' });
  }
  return [...listings.sort(byName), ...fromScans.sort(byName)].slice(0, 400);
}

export type Listing = { name: string; address: string; phone: string; website: string; category: string; hours: string; logo: string | null; mapsUrl: string | null };
export type ScanSummary = {
  id: string;
  keyword: string;
  gridSize: number;
  at: string;
  /** Points in the outer band of the grid (further from the centre than half its radius). */
  outerPins: number;
  /** Of those, the ones where the business was not in the top 3 local results. */
  weakOuterPinsCount: number;
  weakZipCodes: string[];
  trackedKeywords: string[];
  aioCitedDomains: string[];
};
export type Context = { client: Client; listing: Listing | null; listingProblem: string | null; scan: ScanSummary | null };

const mapsUrl = (placeId: string) => 'https://www.google.com/maps/place/?q=place_id:' + encodeURIComponent(placeId);
const SHORT_DAY = (d: string) => d.slice(0, 1) + d.slice(1, 3).toLowerCase();
/** "Mon 08:00–17:00; Tue …", or '' when Google has no hours. */
function hoursText(loc: GbpLocation): string {
  const week = weekOf(loc);
  if (!week) return '';
  return week
    .map((d) => `${SHORT_DAY(d.day)} ${d.closed ? 'closed' : d.allDay ? 'open 24 hours' : [{ open: d.open, close: d.close }, ...(d.more ?? [])].map((x) => `${x.open}–${x.close}`).join(', ')}`)
    .join('; ');
}
function addressText(loc: GbpLocation): string {
  const a = loc.storefrontAddress;
  if (!a) return '';
  return [...(a.addressLines ?? []), a.locality, [a.administrativeArea, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}
type Media = { mediaItems?: { locationAssociation?: { category?: string }; googleUrl?: string }[] };

/**
 * What the order forms start from: the client's Google listing as it is now, and a summary of its
 * latest finished scan (on this account): the weak points of the outer band and their ZIP codes,
 * the keywords tracked for it, and the sites Google's AI Overviews cited.
 */
export async function clientContext(u: { id: string; role: string }, clientId: string): Promise<Context> {
  const client = (await clientsFor(u)).find((c) => c.id === clientId);
  if (!client) throw new InputError('Unknown client.', 404);
  let listing: Listing | null = null;
  let listingProblem: string | null = null;
  if (client.profile && client.location) {
    try {
      const t = { profile: client.profile, location: client.location };
      const [loc, logo] = await Promise.all([
        readLocation(t.profile, t.location),
        gbpGet<Media>(t, 'media', { page_size: '100' })
          .then((r) => {
            const items = r.mediaItems ?? [];
            return (items.find((m) => m.locationAssociation?.category === 'LOGO') ?? items.find((m) => m.locationAssociation?.category === 'PROFILE'))?.googleUrl ?? null;
          })
          .catch(() => null),
      ]);
      listing = {
        name: loc.title ?? client.name,
        address: addressText(loc),
        phone: loc.phoneNumbers?.primaryPhone ?? '',
        website: loc.websiteUri ?? '',
        category: loc.categories?.primaryCategory?.displayName ?? '',
        hours: hoursText(loc),
        logo,
        mapsUrl: client.placeId ? mapsUrl(client.placeId) : null,
      };
    } catch (e) {
      listingProblem = e instanceof Error ? e.message : 'Could not read the listing.';
    }
  }
  const match = { userId: u.id, OR: [...(client.placeId ? [{ targetPlaceId: client.placeId }] : []), { targetBusiness: { equals: client.name, mode: 'insensitive' as const } }] };
  const latest = await db.gridScan.findFirst({
    where: { ...match, status: { in: ['COMPLETED', 'PARTIAL'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, keyword: true, gridSize: true, createdAt: true, targetDomain: true },
  });
  let scan: ScanSummary | null = null;
  if (latest) {
    const [pins, kws] = await Promise.all([
      db.gridPin.findMany({ where: { scanId: latest.id, status: 'COMPLETED' }, select: { rowIdx: true, colIdx: true, rankFound: true, zip: true, hasAiOverview: true, aiCitations: true } }),
      db.gridScan.findMany({ where: match, orderBy: { createdAt: 'desc' }, distinct: ['keyword'], select: { keyword: true }, take: 10 }),
    ]);
    const c = (latest.gridSize - 1) / 2;
    const outer = pins.filter((p) => Math.max(Math.abs(p.rowIdx - c), Math.abs(p.colIdx - c)) > c / 2);
    const weak = outer.filter((p) => p.rankFound == null || p.rankFound > 3);
    const zips = new Map<string, number>();
    for (const p of weak) if (/^\d{5}$/.test(p.zip)) zips.set(p.zip, (zips.get(p.zip) ?? 0) + 1);
    const cited = getListed(pins, latest.targetDomain ?? listing?.website ?? null);
    scan = {
      id: latest.id,
      keyword: latest.keyword,
      gridSize: latest.gridSize,
      at: latest.createdAt.toISOString(),
      outerPins: outer.length,
      weakOuterPinsCount: weak.length,
      weakZipCodes: [...zips.entries()].sort((a, b) => b[1] - a[1]).map(([z]) => z),
      trackedKeywords: kws.map((k) => k.keyword),
      aioCitedDomains: [...cited.act, ...cited.others].filter((s) => !s.own).sort((a, b) => b.answers - a.answers).map((s) => s.site).slice(0, 12),
    };
  }
  return { client, listing, listingProblem, scan };
}

/** Stripe's checkout for a service: once for the citation build, monthly for the traffic campaign. */
export async function startService(u: { id: string; email: string; role: string }, body: { service?: unknown; client?: unknown; intake?: unknown }, origin: string): Promise<{ url: string }> {
  if (!isService(body.service)) throw new InputError('Unknown service.');
  const svc = SERVICES[body.service];
  const client = (await clientsFor(u)).find((c) => c.id === body.client);
  if (!client) throw new InputError('Pick a client first.');
  const intake = intakeOf(svc.type, body.intake);
  const id = randomUUID();
  const meta = { kind: 'service', orderId: id, service: svc.type, userId: u.id };
  const session = await stripe<{ id: string; url: string }>(
    '/checkout/sessions',
    'POST',
    {
      mode: svc.monthly ? 'subscription' : 'payment',
      client_reference_id: u.id,
      customer_email: u.email,
      metadata: meta,
      ...(svc.monthly ? { subscription_data: { metadata: meta, description: `${svc.name} for ${client.name}` } } : { payment_intent_data: { description: `Stakeout ${svc.name} for ${client.name}`, metadata: meta } }),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: svc.cents,
            ...(svc.monthly ? { recurring: { interval: 'month' } } : {}),
            product_data: { name: `Stakeout Search · ${svc.name}`, description: `For ${client.name}.${svc.monthly ? ' Media spend included.' : ''}` },
          },
        },
      ],
      success_url: origin + '/services?service_paid={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/services?service_paid=cancelled',
    },
    'service-' + id,
  );
  await db.serviceOrder.create({ data: { id, userId: u.id, locationId: client.id, clientName: client.name, serviceType: svc.type, stripeRef: session.id, checkoutId: session.id, cents: svc.cents, intake } });
  return { url: session.url };
}

type Order = Awaited<ReturnType<typeof db.serviceOrder.findUniqueOrThrow>>;

/** Tells the admins a service was paid for, with the order form. Never throws. */
async function alertService(o: Order) {
  try {
    if (!mailerConfigured()) return;
    const buyer = await db.user.findUnique({ where: { id: o.userId }, select: { email: true } });
    const svc = isService(o.serviceType) ? SERVICES[o.serviceType] : null;
    const price = usd(o.cents) + (svc?.monthly ? ' a month' : '');
    const lines = [
      `${buyer?.email ?? 'An account'} ordered ${svc?.name ?? o.serviceType} for ${o.clientName}: ${price}.`,
      ...intakeLines(o.serviceType, (o.intake ?? {}) as Record<string, unknown>),
      'Set it up by hand, then mark it live and add the proof link on the White-Label Services page.',
      `Stripe: ${o.stripeRef}.`,
    ];
    for (const to of await paymentAlertRecipients())
      await sendNoticeEmail(to, `Service order: ${svc?.name ?? o.serviceType}, ${o.clientName}, ${price}`, lines, { label: 'Open White-Label Services', url: appUrl('/services') }).catch((e) =>
        console.error('[services] order alert not sent to', to, (e as Error).message),
      );
  } catch (e) {
    console.error('[services] order alert failed:', (e as Error).message);
  }
}

type Session = { id: string; status?: string; payment_status?: string; amount_total?: number; amount_subtotal?: number; currency?: string; client_reference_id?: string; metadata?: Record<string, string>; subscription?: string | { id: string } | null };

/**
 * Records a paid service checkout, once: the order moves to intake_submitted and the admins get
 * the order form. Called when the buyer comes back from Stripe and again by Stripe's webhook.
 * Null when the checkout is not a service order.
 */
export async function confirmService(sessionId: string, expectUser?: string): Promise<Order | null> {
  const order = await db.serviceOrder.findUnique({ where: { checkoutId: sessionId } });
  if (!order) return null;
  if (expectUser && order.userId !== expectUser) throw new InputError('Unknown order.', 404);
  if (order.status !== 'awaiting_payment') return order;
  const s = await stripe<Session>('/checkout/sessions/' + encodeURIComponent(sessionId));
  const paid = s.status === 'complete' && (s.payment_status === 'paid' || s.payment_status === 'no_payment_required');
  if (!paid || s.metadata?.kind !== 'service' || s.metadata?.orderId !== order.id || s.client_reference_id !== order.userId || s.currency !== 'usd' || (s.amount_subtotal ?? s.amount_total) !== order.cents)
    throw new InputError('Payment is pending or could not be matched to this order.', 409);
  const sub = typeof s.subscription === 'string' ? s.subscription : (s.subscription?.id ?? null);
  const moved = await db.serviceOrder.updateMany({ where: { id: order.id, status: 'awaiting_payment' }, data: { status: 'intake_submitted', ...(sub ? { stripeRef: sub } : {}) } });
  const now = await db.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
  if (moved.count) await alertService(now);
  return now;
}

/** A monthly service's subscription changed: a failed card pauses it, a cancellation completes it, a fixed card resumes it. */
export async function serviceSubEvent(subscriptionId: string) {
  const order = await db.serviceOrder.findFirst({ where: { stripeRef: subscriptionId } });
  if (!order || order.status === 'awaiting_payment') return;
  const s = await stripe<{ status?: string }>('/subscriptions/' + encodeURIComponent(subscriptionId));
  const st = s.status ?? '';
  const next = ['canceled', 'incomplete_expired'].includes(st) ? 'completed' : ['past_due', 'unpaid', 'paused'].includes(st) ? 'paused' : order.status === 'paused' ? 'live' : order.status;
  if (next !== order.status) await db.serviceOrder.update({ where: { id: order.id }, data: { status: next } });
}

export type OrderView = { id: string; createdAt: string; client: string; service: string; serviceName: string; status: string; cents: number; monthly: boolean; deliverableUrl: string | null; buyer: string | null; intake: string[] | null };

/** Paid orders, newest first: an admin sees everyone's (to fulfil them), with the order form. */
export async function ordersFor(u: { id: string; role: string }): Promise<OrderView[]> {
  const admin = u.role === 'ADMIN';
  const rows = await db.serviceOrder.findMany({ where: { ...(admin ? {} : { userId: u.id }), status: { not: 'awaiting_payment' } }, orderBy: { createdAt: 'desc' }, take: 200 });
  const emails = admin ? new Map((await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, email: true } })).map((x) => [x.id, x.email])) : new Map<string, string>();
  return rows.map((r) => {
    const svc = isService(r.serviceType) ? SERVICES[r.serviceType] : null;
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      client: r.clientName,
      service: r.serviceType,
      serviceName: svc?.name ?? r.serviceType,
      status: r.status,
      cents: r.cents,
      monthly: Boolean(svc?.monthly),
      deliverableUrl: r.deliverableUrl,
      buyer: emails.get(r.userId) ?? null,
      intake: admin ? intakeLines(r.serviceType, (r.intake ?? {}) as Record<string, unknown>) : null,
    };
  });
}

/** An admin moves an order along (live, completed, paused) and attaches the proof report. */
export async function updateOrder(u: { role: string }, id: string, body: { status?: unknown; deliverableUrl?: unknown }) {
  if (u.role !== 'ADMIN') throw new InputError('Admins only.', 403);
  const row = await db.serviceOrder.findUnique({ where: { id } });
  if (!row) throw new InputError('Unknown order.', 404);
  if (row.status === 'awaiting_payment') throw new InputError('That order has not been paid.');
  const data: { status?: string; deliverableUrl?: string | null } = {};
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !(STATUSES as readonly string[]).includes(body.status) || body.status === 'awaiting_payment') throw new InputError('Unknown status.');
    data.status = body.status;
  }
  if (body.deliverableUrl !== undefined) {
    const v = line(body.deliverableUrl, 1000);
    if (v && !httpUrl(v)) throw new InputError('The proof link should start with https://.');
    data.deliverableUrl = v || null;
  }
  await db.serviceOrder.update({ where: { id }, data });
}
