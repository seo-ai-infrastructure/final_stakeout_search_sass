import { randomBytes } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { stopScan } from '@stakeout/core/scans';
import { getAuthenticatedUser, hashPassword } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

export const dynamic = 'force-dynamic';

async function admin() {
  const me = await getAuthenticatedUser();
  if (me.role !== 'ADMIN') throw new InputError('Admins only.', 403);
  return me;
}

/** Open scans (with progress) and every account, for the admin page's operations panels. */
export async function GET() {
  try {
    await admin();
    const [scans, users] = await Promise.all([
      db.gridScan.findMany({
        where: { status: { in: ['QUEUED', 'RUNNING'] } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, keyword: true, targetBusiness: true, targetType: true, gridSize: true, status: true, totalPins: true,
          completedPins: true, failedPins: true, createdAt: true, user: { select: { email: true } },
        },
      }),
      db.user.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, role: true, creditBalance: true, emailVerifiedAt: true, createdAt: true, _count: { select: { scans: true } } },
      }),
    ]);
    return Response.json({
      scans: scans.map((s) => ({ ...s, owner: s.user.email, user: undefined })),
      users: users.map((u) => ({ id: u.id, email: u.email, role: u.role, credits: u.creditBalance, confirmed: Boolean(u.emailVerifiedAt), createdAt: u.createdAt, scans: u._count.scans })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await admin();
    const b = await req.json();
    const email = String(b.email ?? '').trim().toLowerCase();

    if (b.action === 'stop_scan') {
      const open = await db.gridScan.findFirst({ where: { id: String(b.scanId), status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true } });
      if (!open) throw new InputError('That scan is not running.', 400);
      return Response.json({ stopped: await stopScan(open.id, 'CANCELLED: stopped by an admin') });
    }

    if (b.action === 'stop_all') {
      const open = await db.gridScan.findMany({ where: { status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true } });
      let stopped = 0;
      for (const s of open) stopped += await stopScan(s.id, 'CANCELLED: stopped by an admin');
      return Response.json({ scans: open.length, stopped });
    }

    if (b.action === 'add_credits') {
      const amount = Number(b.amount);
      if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 100000) throw new InputError('Enter a whole number of credits (not zero).');
      const note = String(b.note ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
      // The ledger row and the balance change together, so the balance always equals the ledger.
      const balance = await db.$transaction(async (tx) => {
        const u = await tx.user.findUnique({ where: { email }, select: { id: true, creditBalance: true } });
        if (!u) throw new InputError('No account has that email.', 404);
        if (u.creditBalance + amount < 0) throw new InputError(`That account only has ${u.creditBalance} credits.`);
        await tx.creditLedger.create({
          data: { userId: u.id, amount, reason: 'ADMIN_TOPUP', externalEventId: `admin:${me.email}:${Date.now()}:${randomBytes(3).toString('hex')}${note ? ':' + note : ''}` },
        });
        return (await tx.user.update({ where: { id: u.id }, data: { creditBalance: { increment: amount } }, select: { creditBalance: true } })).creditBalance;
      });
      return Response.json({ email, balance });
    }

    if (b.action === 'block' || b.action === 'unblock') {
      const u = await db.user.findUnique({ where: { id: String(b.userId) }, select: { id: true, role: true } });
      if (!u) throw new InputError('Account not found.', 404);
      if (u.id === me.id || u.role === 'ADMIN' || u.role === 'SYSTEM') throw new InputError('That account cannot be blocked.');
      if (b.action === 'unblock' && u.role !== 'BLOCKED') throw new InputError('That account is not blocked.');
      await db.user.update({ where: { id: u.id }, data: { role: b.action === 'block' ? 'BLOCKED' : 'AGENCY' } });
      return Response.json({ ok: true });
    }

    if (b.action === 'create_account') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || email.endsWith('@internal.invalid')) throw new InputError('Enter a valid email address.');
      if (await db.user.findUnique({ where: { email }, select: { id: true } })) throw new InputError('That address already has an account.');
      // An invited account: confirmed already, with a one-time password shown once to the admin.
      const password = randomBytes(9).toString('base64url');
      await db.user.create({ data: { email, passwordHash: await hashPassword(password), role: 'AGENCY', emailVerifiedAt: new Date() } });
      return Response.json({ email, password });
    }

    throw new InputError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}
