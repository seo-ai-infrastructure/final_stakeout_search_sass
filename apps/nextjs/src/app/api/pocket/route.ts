import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { clientKey, limit, limitIp } from '@/lib/limits';
import { cookies } from 'next/headers';
import { POCKET_COOKIE, checkPocketInput, pocketTimes } from '@/lib/pocketInput';
import { startPocket } from '@/lib/pocket';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/pocket (public): starts a $1 pocket test, one live phone search at the visitor's spot.
 * { email, keyword, business, lat, lng, placeLabel? } → { url } of Stripe's checkout page. Nothing
 * runs until it is paid.
 */
export async function POST(req: Request) {
  try {
    const input = checkPocketInput((await req.json().catch(() => ({}))) as Record<string, unknown>);
    if ('error' in input) throw new InputError(input.error);
    await limitIp(req, 'pocket-start', 12, 3600);
    await limit('pocket-start-email', input.email, 6, 3600);
    const had = pocketTimes((await cookies()).get(POCKET_COOKIE)?.value).length;
    return Response.json(await startPocket(input, new URL(req.url).origin, clientKey(req), had));
  } catch (e) {
    return errorResponse(e);
  }
}
