import { NextResponse } from 'next/server';
import { db } from '@stakeout/db';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser } from '@/lib/auth';
import { googleConfigured, googleDisconnect } from '@/lib/googleOAuth';

/** GET /api/admin/google : whether Google sign-in is set up, and which Google login is connected. */
export async function GET() {
  try {
    const u = await getAuthenticatedUser();
    const c = await db.googleConnection.findUnique({ where: { userId: u.id }, select: { email: true, scopes: true, updatedAt: true } });
    return NextResponse.json({
      configured: googleConfigured(),
      connected: Boolean(c),
      email: c?.email ?? null,
      searchConsole: /webmasters\.readonly/.test(c?.scopes ?? ''),
      analytics: /analytics\.readonly/.test(c?.scopes ?? ''),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/admin/google : removes the connection here and at Google. */
export async function DELETE() {
  try {
    const u = await getAuthenticatedUser();
    await googleDisconnect(u.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
