import { NextResponse } from 'next/server';
import { getSettings } from '@stakeout/core/settings';
import { db, Prisma } from '@stakeout/db';
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  SESSION_COOKIE_NAME,
} from '@/lib/auth';
import { limit, limitIp, clientKey, emailQuotaKey } from '@/lib/limits';
import { requireHuman } from '@/lib/turnstile';
import {
  completeVerification,
  sendVerification,
  verificationRequired,
  BLOCKED_ROLE,
} from '@/lib/verification';
import { errorResponse } from '@/lib/api';
import { InputError } from '@stakeout/core/grid';

// Spends the same scrypt work for unknown emails so timing does not reveal accounts.
const DUMMY_HASH = '00000000000000000000000000000000:' + '0'.repeat(128);

export async function POST(req: Request) {
  try {
    const body = await req.json(),
      email = String(body.email ?? '')
        .trim()
        .toLowerCase(),
      pass = String(body.password ?? '');
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      !pass ||
      pass.length > 256
    )
      throw new InputError('Enter a valid email and password.');
    await limitIp(req, 'login-ip', 60, 900);
    await limit('login-email', email, 10, 900);
    let user;
    let verificationSent = false;
    if (body.mode === 'register') {
      if (!(await getSettings()).signupsOpen) throw new InputError('New accounts are closed right now.', 403);
      if (email.endsWith('@internal.invalid'))
        throw new InputError('Use your agency email address.');
      if (pass.length < 8)
        throw new InputError('Choose a password of at least 8 characters.');
      await requireHuman(body.turnstileToken, clientKey(req), 'signup');
      await limitIp(req, 'register-ip', 3, 86400);
      await limit('register-inbox', emailQuotaKey(email), 1, 86400);
      await limit(
        'register-global',
        'all',
        Number(process.env.REGISTER_DAILY_LIMIT ?? 200),
        86400,
      );
      const passwordHash = await hashPassword(pass);
      // No credits at signup: the starter grant is paid out when the email is confirmed.
      user = await db.user.create({
        data: {
          email,
          passwordHash,
          name:
            String(body.name ?? '')
              .trim()
              .slice(0, 100) || null,
          role: 'AGENCY',
          creditBalance: 0,
        },
      });
      if (!verificationRequired()) {
        // Disposable test instances only (EMAIL_VERIFICATION_REQUIRED=false).
        await completeVerification(user.id);
        user = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      } else {
        try {
          verificationSent = await sendVerification(user);
        } catch (e) {
          console.error('Verification email failed', e instanceof Error ? e.message : 'unknown');
        }
      }
    } else {
      user = await db.user.findUnique({ where: { email } });
      const valid = await verifyPassword(pass, user?.passwordHash ?? DUMMY_HASH);
      if (!user?.passwordHash || !valid)
        throw new InputError('Invalid email or password.', 401);
      // Said only after the password checks out, so it never reveals which addresses exist.
      if (user.role === BLOCKED_ROLE) throw new InputError('This account is closed.', 403);
    }
    const res = NextResponse.json({
      success: true,
      verificationSent,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        creditBalance: user.creditBalance,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    });
    res.cookies.set(SESSION_COOKIE_NAME, signSessionToken(user.id), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 2592000,
    });
    return res;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      return NextResponse.json(
        { error: 'That address is already registered. Sign in instead.' },
        { status: 409 },
      );
    return errorResponse(e);
  }
}
