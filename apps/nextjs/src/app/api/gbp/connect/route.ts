import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser } from '@/lib/auth';
import { postproxyConfigured } from '@/lib/postproxy';
import { gbpOpen } from '@/lib/gbpAccess';
import { disconnect, startConnect } from '@/lib/gbpConnect';
import { sweepUnpaid } from '@/lib/gbpUnpaid';

/** POST /api/gbp/connect: { url } to Google's sign-in, where the customer picks the Business account to connect. Free. */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    if (!gbpOpen(u)) throw new InputError('Connected Accounts is not open on this account yet.', 403);
    if (u.role === 'ADMIN') throw new InputError('Admin accounts connect Google accounts in Postproxy.');
    if (!postproxyConfigured()) throw new InputError('Connecting Google accounts is being set up. Email sass@stakeoutsearch.com and we will sort it out.', 503);
    // Connections nobody paid for in time are given back first, so their seats are free for this one.
    await sweepUnpaid().catch(() => null);
    return NextResponse.json({ url: await startConnect(u, new URL(req.url).origin) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/gbp/connect?account=: disconnects one of this account's Google accounts. Its listings come off their plans. */
export async function DELETE(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    await disconnect(u, String(new URL(req.url).searchParams.get('account') ?? ''));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
