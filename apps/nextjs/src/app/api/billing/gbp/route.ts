import { InputError } from '@stakeout/core/grid';
import { PLANS, isPlan } from '@stakeout/core/gbpPlans';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { target } from '@/lib/gbpAdmin';
import { activate, addAddon, addListings, billingSummary, portalUrl, removeAddon, removeListing, type Pick } from '@/lib/gbpBilling';
import { stripeConfigured } from '@/lib/stripe';

export const maxDuration = 60;

/** GET /api/billing/gbp: the plans and their prices, and what this account pays for now. */
export async function GET() {
  try {
    const u = await getAuthenticatedUser();
    return Response.json({ ready: stripeConfigured(), admin: u.role === 'ADMIN', plans: PLANS, ...(await billingSummary(u.id)) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/billing/gbp
 *   { add: [{ profile, location, plan }] }  puts listings on a plan: { url } to Stripe's checkout the
 *                                           first time, { done } when they joined a running subscription
 *   { remove: location }                    takes one off (it works until the paid month ends)
 *   { confirm: sessionId }                  back from checkout: switch the listings on now
 *   { portal: true }                        { url } to Stripe's page for the card, invoices and cancelling
 * Prices come from the price list here, never from the browser.
 */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    const b = (await req.json()) as { add?: unknown; remove?: unknown; confirm?: unknown; portal?: unknown; addon?: unknown };
    // { addon: true | false }: the AI agents add-on, on or off.
    if (b.addon === true) return Response.json({ ...(await addAddon(u, new URL(req.url).origin)), ...(await billingSummary(u.id)) });
    if (b.addon === false) { await removeAddon(u.id); return Response.json(await billingSummary(u.id)); }
    const origin = new URL(req.url).origin;
    if (Array.isArray(b.add)) {
      const picks: Pick[] = b.add.map((x: { profile?: unknown; location?: unknown; plan?: unknown }) => {
        if (!isPlan(x?.plan)) throw new InputError('Unknown plan.');
        return { ...target(x.profile, x.location), plan: x.plan };
      });
      return Response.json({ ...(await addListings(u, picks, origin)), ...(await billingSummary(u.id)) });
    }
    if (typeof b.remove === 'string') {
      await removeListing(u.id, target('xxx', b.remove).location);
      return Response.json(await billingSummary(u.id));
    }
    if (typeof b.confirm === 'string' && /^cs_[A-Za-z0-9_]{10,200}$/.test(b.confirm)) {
      const on = await activate(b.confirm, u.id);
      return Response.json({ on, ...(await billingSummary(u.id)) });
    }
    if (b.portal === true) return Response.json({ url: await portalUrl(u.id, origin) });
    throw new InputError('Unknown request.');
  } catch (e) {
    return errorResponse(e);
  }
}
