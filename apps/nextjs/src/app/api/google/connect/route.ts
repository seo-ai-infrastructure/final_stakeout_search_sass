import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gbpAdmin } from '@/lib/gbpAdmin';
import { STATE_COOKIE, googleAuthUrl, googleConfigured } from '@/lib/googleOAuth';

/** GET /api/google/connect (admins only): sends the browser to Google's sign-in for Search Console and Analytics (read-only). */
export async function GET() {
  try {
    await gbpAdmin();
    if (!googleConfigured()) throw new InputError('Google sign-in is not set up: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Vercel.', 503);
    // A one-time value Google hands back, checked against this cookie, so a sign-in started elsewhere cannot be finished here.
    const state = randomBytes(24).toString('base64url');
    const res = NextResponse.redirect(googleAuthUrl(state));
    res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/google', maxAge: 600 });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
