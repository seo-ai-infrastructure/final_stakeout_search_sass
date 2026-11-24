import { InputError } from '@stakeout/core/grid';
import { ACCOUNT_PLANS } from '@stakeout/core/gbpPlans';
import { pushAlert } from '@stakeout/core/alerts';
import { BrandError, brandForUser, hasOwnDomain, ownAddressKey, removeBrand, saveBrand, type Brand } from '@stakeout/core/brands';
import { assertAccountOwner, getAuthenticatedUser, teamSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { accountPlanNow } from '@/lib/gbpBilling';
import { reportBrand } from '@/lib/brandShare';
import { addDomainToHost } from '@/lib/hostDomains';
import { flushAlerts } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

/**
 * Self-serve white label: an account on Agency or up sets the name, colour and logo its shared
 * reports carry, and if it likes its own domain for them. On Scout or without a plan it is locked
 * (a brand we set up by hand for an account stays as it is). Shared reports show a self-serve brand
 * only while the plan includes white label (brandShare's inForce).
 */
async function state(userId: string) {
  const [plan, b, team] = await Promise.all([accountPlanNow(userId), brandForUser(userId).catch(() => null), teamSession().catch(() => null)]);
  const planHas = Boolean(plan && ACCOUNT_PLANS[plan].whiteLabel);
  const ours = Boolean(b && !b.self);
  return {
    plan,
    allowed: planHas || ours,
    owner: !(team && !team.paused),
    brand: b ? { name: b.name, accent: b.accent, logo: reportBrand(b).logo, domain: hasOwnDomain(b) ? b.domain : null, showing: ours || planHas } : null,
    cname: 'cname.vercel-dns.com',
    autoDomains: Boolean(process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID),
  };
}

export async function GET() {
  try {
    const u = await getAuthenticatedUser();
    return Response.json(await state(u.id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/brand { name, accent, logo?: { type, base64 } | null, domain?: string ('' takes the domain off) }: the owner only. */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    await assertAccountOwner();
    const now = await state(u.id);
    if (!now.allowed) throw new InputError(`White-label reports come with Agency (${'$' + ACCOUNT_PLANS.P_AGENCY.tiers[0].cents / 100} a month) and up.`, 402);
    const b = (await req.json()) as { name?: unknown; accent?: unknown; logo?: unknown; domain?: unknown };
    const had: Brand | null = await brandForUser(u.id).catch(() => null);
    const asked = typeof b.domain === 'string' ? b.domain.trim() : undefined;
    const domain = asked === undefined ? (had ? had.domain : ownAddressKey(u.id)) : asked === '' ? ownAddressKey(u.id) : asked;
    const logo = b.logo && typeof b.logo === 'object' && typeof (b.logo as { type?: unknown }).type === 'string' && typeof (b.logo as { base64?: unknown }).base64 === 'string' ? (b.logo as { type: string; base64: string }) : null;
    let saved: Brand;
    try {
      // A brand we set up by hand keeps showing whatever the plan; the account's own follows the plan.
      saved = await saveBrand({ userId: u.id, domain, name: b.name, accent: b.accent, logo, self: had ? Boolean(had.self) : true });
    } catch (e) {
      if (e instanceof BrandError) throw new InputError(e.message);
      throw e;
    }
    let domainNote = '';
    if (hasOwnDomain(saved) && saved.domain !== had?.domain) {
      const host = await addDomainToHost(saved.domain);
      domainNote = host.added
        ? `Point a CNAME record for ${saved.domain} to cname.vercel-dns.com. Reports open on it as soon as the DNS change reaches us.`
        : `Point a CNAME record for ${saved.domain} to cname.vercel-dns.com. We switch the domain on at our end within a business day.`;
      if (!host.added) {
        await pushAlert('brand-domain:' + saved.domain, { subject: `Stakeout: add ${saved.domain} to Vercel (white label)`, lines: [`${u.email} set ${saved.domain} as the domain for their white-label reports.`, host.note], path: '/admin/devices' }, 86400).catch(() => {});
        await flushAlerts().catch(() => {});
      }
    }
    return Response.json({ ...(await state(u.id)), domainNote });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/brand: back to our name on reports (the owner only). */
export async function DELETE() {
  try {
    const u = await getAuthenticatedUser();
    await assertAccountOwner();
    const had = await brandForUser(u.id).catch(() => null);
    if (had) await removeBrand(had.domain);
    return Response.json(await state(u.id));
  } catch (e) {
    return errorResponse(e);
  }
}
