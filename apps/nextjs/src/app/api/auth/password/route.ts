import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { hashPassword } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { limit, limitIp, emailQuotaKey } from '@/lib/limits';
import { consumeToken, peekToken } from '@/lib/emailTokens';
import { sendPasswordLink } from '@/lib/passwordLinks';

export const dynamic = 'force-dynamic';

/** Whether a link is still good, and whose it is: the page shows the address before asking for a password. */
export async function GET(req: Request) {
  try {
    await limitIp(req, 'password-peek', 60, 3600);
    const t = await peekToken(new URL(req.url).searchParams.get('token') ?? '');
    return Response.json(t && t.purpose === 'SET_PASSWORD' && t.userId ? { valid: true, email: t.email } : { valid: false });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (b.action === 'request') {
      const email = String(b.email ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new InputError('Enter a valid email address.');
      await limitIp(req, 'password-request', 5, 3600);
      await limit('password-inbox', emailQuotaKey(email), 3, 86400);
      const u = await db.user.findUnique({ where: { email }, select: { id: true, email: true, role: true } });
      if (u && u.role !== 'BLOCKED' && u.role !== 'SYSTEM') await sendPasswordLink(u, { days: 1, invited: false });
      // The same answer whether or not the address has an account, so this cannot be used to find out who has one.
      return Response.json({ ok: true });
    }
    if (b.action === 'set') {
      const password = String(b.password ?? '');
      if (password.length < 8 || password.length > 200) throw new InputError('Choose a password of at least 8 characters.');
      await limitIp(req, 'password-set', 20, 3600);
      const gone = new InputError('This link has expired or was already used. Ask for a new one.', 410);
      // Look before using it up: a link issued for something else (confirming an email) is refused untouched.
      const seen = await peekToken(String(b.token ?? ''));
      if (!seen || seen.purpose !== 'SET_PASSWORD' || !seen.userId) throw gone;
      const t = await consumeToken(String(b.token ?? ''));
      if (!t || !t.userId) throw gone;
      const u = await db.user.findUnique({ where: { id: t.userId }, select: { id: true, role: true, emailVerifiedAt: true } });
      if (!u || u.role === 'BLOCKED' || u.role === 'SYSTEM') throw new InputError('This account cannot sign in.', 403);
      await db.$transaction([
        // Opening the link proves the inbox, so an unconfirmed address is confirmed too.
        db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(password), emailVerifiedAt: u.emailVerifiedAt ?? new Date() } }),
        // Any other outstanding links for this account stop working.
        db.emailToken.updateMany({ where: { userId: u.id, purpose: 'SET_PASSWORD', usedAt: null }, data: { usedAt: new Date() } }),
      ]);
      return Response.json({ ok: true, email: t.email });
    }
    throw new InputError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}
