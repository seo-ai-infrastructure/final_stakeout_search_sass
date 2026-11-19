import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { finishConnect } from '@/lib/gbpConnect';

/**
 * GET /api/gbp/connect/callback?a=: where the browser lands after the Google sign-in. Nothing on
 * this address is trusted: the connected account is read back from the service by its group.
 */
export async function GET(req: Request) {
  const back = (result: string) => NextResponse.redirect(new URL('/profiles?gbp=' + result, req.url));
  try {
    const u = await getAuthenticatedUser();
    const q = new URL(req.url).searchParams;
    if (q.get('failure')) return back(q.get('error_code') === 'user_abandoned' ? 'declined' : q.get('error_code') === 'account_is_already_connected' ? 'taken' : 'failed');
    return back(await finishConnect(u, String(q.get('a') ?? '')));
  } catch (e) {
    console.error('Google Business connection failed', e instanceof Error ? e.message : e);
    return back('failed');
  }
}
