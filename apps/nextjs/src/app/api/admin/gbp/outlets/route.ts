import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { isExtraOutlet } from '@stakeout/core/outlets';
import { errorResponse } from '@/lib/api';
import { gate } from '@/lib/gbpAccess';
import { chooseOutlet, connectOutlet, forgetOutlet, outletStrip, placementsOf, savedOutlets, savedTicksOff } from '@/lib/outlets';
import { rankChoices } from '@stakeout/core/outlets';

export const maxDuration = 30;

/** For now the other outlets are for admins only, while they are being tried out. */
async function adminGate(profile: unknown, location: unknown) {
  const t = await gate(profile, location, 'manage');
  // For admins only for now; NEXT_PUBLIC_OUTLETS=off switches it off for everyone.
  if (process.env.NEXT_PUBLIC_OUTLETS === 'off' || t.u.role !== 'ADMIN') throw new InputError('Posting to other networks is not open on this account yet.', 403);
  return t;
}

/** GET /api/admin/gbp/outlets?profile=&location=: the listing's outlet strip (Facebook, LinkedIn). */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const t = await adminGate(q.get('profile'), q.get('location'));
    const outlets = await outletStrip(t);
    // "Change": the Pages to choose from for an outlet that already has one chosen.
    const list = q.get('choices');
    if (isExtraOutlet(list)) {
      const saved = (await savedOutlets(t))[list];
      const row = outlets.find((o) => o.outlet === list);
      if (row && saved) {
        const all = await placementsOf(saved.profile).catch(() => null);
        const name = (await placementsOf(t.profile).catch(() => [])).find((x) => x.id === t.location)?.name ?? '';
        row.choices = all && all.length > 1 ? rankChoices(name, all) : all;
      }
    }
    return NextResponse.json({ outlets, off: await savedTicksOff(t) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/admin/gbp/outlets { profile, location, outlet, action }:
 *  connect → { url } to sign in to that network;
 *  choose  → records { placement } (a Page id, or null for the person's own LinkedIn profile) for this listing;
 *  forget  → this listing stops posting there (the sign-in stays for other listings).
 */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { profile?: unknown; location?: unknown; outlet?: unknown; action?: unknown; placement?: unknown };
    const t = await adminGate(b.profile, b.location);
    if (!isExtraOutlet(b.outlet)) throw new InputError('Unknown network.');
    if (b.action === 'connect') {
      const origin = new URL(req.url).origin;
      return NextResponse.json({ url: await connectOutlet(t, b.outlet, origin + '/profiles?outlet=' + b.outlet) });
    }
    if (b.action === 'choose') await chooseOutlet(t, b.outlet, typeof b.placement === 'string' && b.placement ? b.placement : null);
    else if (b.action === 'forget') await forgetOutlet(t, b.outlet);
    else throw new InputError('Unknown action.');
    return NextResponse.json({ outlets: await outletStrip(t), off: await savedTicksOff(t) });
  } catch (e) {
    return errorResponse(e);
  }
}
