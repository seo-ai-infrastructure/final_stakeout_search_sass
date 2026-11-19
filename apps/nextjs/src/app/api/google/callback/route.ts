import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@stakeout/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { STATE_COOKIE, exchangeCode, sealToken } from '@/lib/googleOAuth';

/**
 * GET /api/google/callback: where Google returns after sign-in. Checks the one-time state, trades
 * the code for tokens, stores the refresh token encrypted, and goes back to the profiles page.
 */
export async function GET(req: Request) {
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL('/profiles?google=' + result, req.url));
    res.cookies.set(STATE_COOKIE, '', { path: '/api/google', maxAge: 0 });
    return res;
  };
  try {
    const u = await getAuthenticatedUser();
    const q = new URL(req.url).searchParams;
    if (q.get('error')) return back(q.get('error') === 'access_denied' ? 'declined' : 'failed');
    const state = q.get('state') ?? '';
    const expected = (await cookies()).get(STATE_COOKIE)?.value ?? '';
    const code = q.get('code') ?? '';
    if (!code || !state || state.length !== expected.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) return back('failed');
    const t = await exchangeCode(code);
    // Google lets a person untick permissions: with neither one granted there is nothing to read. With one, the page says which is missing.
    if (!/webmasters\.readonly/.test(t.scopes) && !/analytics\.readonly/.test(t.scopes)) return back('nopermission');
    const data = { email: t.email, scopes: t.scopes, refreshToken: sealToken(t.refreshToken), updatedAt: new Date() };
    await db.googleConnection.upsert({ where: { userId: u.id }, create: { userId: u.id, ...data }, update: data });
    return back('connected');
  } catch (e) {
    console.error('Google sign-in failed', e instanceof Error ? e.message : e);
    return back('failed');
  }
}
