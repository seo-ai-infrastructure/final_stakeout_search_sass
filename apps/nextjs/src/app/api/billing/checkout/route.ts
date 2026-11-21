import { randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { catalogFor } from '@/lib/billing';
import { ADS_CAMPAIGN, type CampaignBrief } from '@/lib/pricing';
import { stripe, stripeConfigured } from '@/lib/stripe';
import { activePlan, planPortal, settleIfDue } from '@/lib/creditSub';

/** What this account can buy, and whether checkout is switched on. */
export async function GET() {
  try {
    const u = await getAuthenticatedUser();
    await settleIfDue(u.id);
    const plan = await activePlan(u.id);
    return Response.json({ packs: await catalogFor(u), ready: stripeConfigured(), plan: plan ? { ...plan, periodEnd: plan.periodEnd?.toISOString() ?? null } : null });
  } catch (e) {
    return errorResponse(e);
  }
}

/** One line of the buyer's text: spaces tidied, at most 450 characters (Stripe keeps 500 a value). */
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 450) : '');
/** The business, keywords and area of a local engagement campaign, each required. */
function campaignBrief(v: unknown): CampaignBrief {
  const b = (v ?? {}) as Record<string, unknown>;
  const brief = { business: clean(b.business), keywords: clean(b.keywords), area: clean(b.area) };
  if (brief.business.length < 2) throw new InputError('Name the business, with its Google Maps link if you have it.');
  if (brief.keywords.length < 2) throw new InputError('Give the keywords people search for.');
  if (brief.area.length < 2) throw new InputError('Give the area to target: a city or ZIP code, and how far around it.');
  return brief;
}
const campaignMeta = (c: CampaignBrief | null) => (c ? { campaign_business: c.business, campaign_keywords: c.keywords, campaign_area: c.area } : {});

/** Only a path on this site: where the buyer lands after paying or backing out. */
const safePath = (v: unknown) => (typeof v === 'string' && /^\/[A-Za-z0-9\-._~/?=&%]*$/.test(v) && !v.startsWith('//') ? v.split('?')[0] : '/scans');

/**
 * Starts a Stripe Checkout for one item of the price list (named by its key) and returns
 * the address of Stripe's payment page. The price comes from the price list here, never the browser.
 */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser(),
      { item: key, credits, returnTo, portal, brief } = await req.json(),
      catalog = await catalogFor(u),
      // By its key; a page loaded before keys were sent names its points instead, which only counts when one item has that many.
      byCredits = catalog.filter((p) => p.credits === credits),
      item = typeof key === 'string' ? catalog.find((p) => p.key === key) : byCredits.length === 1 ? byCredits[0] : undefined;
    const origin = new URL(req.url).origin,
      back = origin + safePath(returnTo);
    // { portal: true }: Stripe's page for the plan's card, invoices and cancelling.
    if (portal === true) return Response.json({ url: await planPortal(u.id, back) });
    if (!item) throw new InputError('That is not available for this account.');
    // A campaign needs its business, keywords and area: they go on the order for the admins' email.
    const campaign = item.key === ADS_CAMPAIGN.key ? campaignBrief(brief) : null;
    const what = item.credits ? `${item.credits.toLocaleString('en-US')} points${item.validityDays ? `, valid for ${item.validityDays} days` : ''}. 1 point = 1 real phone run at 1 grid point.` : item.blurb;
    const session = await stripe<{ id: string; url: string }>(
      '/checkout/sessions',
      'POST',
      {
        mode: 'payment',
        // A box on Stripe's page for a promotion code made in the Stripe dashboard.
        allow_promotion_codes: true,
        client_reference_id: u.id,
        customer_email: u.email,
        metadata: { userId: u.id, credits: item.credits, item: item.key, ...campaignMeta(campaign) },
        payment_intent_data: { description: `Stakeout ${item.name}${item.credits ? `: ${item.credits} points` : ''}`, metadata: { userId: u.id, credits: item.credits, item: item.key, ...campaignMeta(campaign) } },
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: item.cents, product_data: { name: `Stakeout Search · ${item.name}`, description: what, metadata: { item: item.key, points: String(item.credits), ...(item.validityDays ? { validity_days: String(item.validityDays) } : {}) } } } }],
        success_url: back + '?paid={CHECKOUT_SESSION_ID}',
        cancel_url: back + '?paid=cancelled',
      },
      randomUUID(),
    );
    await db.paymentOrder.create({ data: { id: session.id, userId: u.id, credits: item.credits, cents: item.cents, item: item.key } });
    return Response.json({ url: session.url });
  } catch (e) {
    return errorResponse(e);
  }
}
