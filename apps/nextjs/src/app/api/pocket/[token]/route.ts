import { NextResponse } from 'next/server';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { isAccountPlan } from '@stakeout/core/gbpPlans';
import { errorResponse } from '@/lib/api';
import { SESSION_COOKIE_NAME, getAuthenticatedUser, signSessionToken } from '@/lib/auth';
import { setAccountPlan } from '@/lib/gbpBilling';
import { cookies } from 'next/headers';
import { fulfilPocket, pocketState, unclaimedPocketAccount } from '@/lib/pocket';
import { POCKET_COOKIE, POCKET_WINDOW_DAYS, pocketTimes } from '@/lib/pocketInput';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const viewer = () => getAuthenticatedUser().then((u) => u.id).catch(() => null);

/** GET /api/pocket/<token> (public, the token is the secret): where the test is, and its result. */
export async function GET(_req: Request, c: { params: Promise<{ token: string }> }) {
  try {
    const s = await pocketState((await c.params).token, await viewer());
    if (!s) throw new InputError('This pocket test is not available.', 404);
    return Response.json(s, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/pocket/<token>
 *   { sessionId } the buyer is back from Stripe: the payment is checked and the search starts. When
 *                 this purchase made the account, the buyer's browser is signed in to it.
 *   { plan }      starts Scout or Agency for the test's account ($1 off the first month): { url }
 *                 of Stripe's checkout page. Only from a browser signed in to that account.
 */
export async function POST(req: Request, c: { params: Promise<{ token: string }> }) {
  try {
    const token = (await c.params).token;
    const b = (await req.json().catch(() => ({}))) as { sessionId?: unknown; plan?: unknown };
    const row = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? await db.pocketTest.findUnique({ where: { token } }) : null;
    if (!row) throw new InputError('This pocket test is not available.', 404);
    if (typeof b.sessionId === 'string') {
      if (!row.checkoutId || b.sessionId !== row.checkoutId) throw new InputError('That payment does not belong to this test.', 404);
      const done = await fulfilPocket(row.checkoutId);
      // A new account, nobody has chosen its password, paid within the last two hours: this browser is its owner's.
      const mine = done.paidAt && Date.now() - done.paidAt.getTime() < 2 * 3600000 ? await unclaimedPocketAccount(done) : null;
      const res = NextResponse.json(await pocketState(token, mine?.id ?? (await viewer())), { headers: { 'Cache-Control': 'private, no-store' } });
      if (mine && !(await viewer())) res.cookies.set(SESSION_COOKIE_NAME, signSessionToken(mine.id), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 2592000 });
      // The browser notes its paid tests, for the limit of two in 30 days.
      if (done.paidAt && !done.refundedAt) {
        const t = Math.floor(done.paidAt.getTime() / 1000);
        const times = pocketTimes((await cookies()).get(POCKET_COOKIE)?.value);
        if (!times.includes(t)) res.cookies.set(POCKET_COOKIE, [...times, t].slice(-6).join('.'), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: POCKET_WINDOW_DAYS * 86400 });
      }
      return res;
    }
    if (typeof b.plan === 'string') {
      if (!row.userId || !row.paidAt) throw new InputError('Run the pocket test first.', 409);
      if (!isAccountPlan(b.plan) || !['P_SCOUT', 'P_AGENCY'].includes(b.plan)) throw new InputError('Unknown plan.');
      const u = await getAuthenticatedUser().catch(() => null);
      if (!u || u.id !== row.userId) throw new InputError('Sign in with the email you used for this test to start a plan.', 401);
      const r = await setAccountPlan({ id: u.id, email: u.email, role: u.role }, b.plan, new URL(req.url).origin, 'month');
      return Response.json(r);
    }
    throw new InputError('Unknown request.');
  } catch (e) {
    return errorResponse(e);
  }
}
