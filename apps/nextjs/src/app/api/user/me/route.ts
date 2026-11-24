// apps/nextjs/src/app/api/user/me/route.ts
import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@stakeout/db';
import { settleIfDue } from '@/lib/creditSub';
import { catchUpPlanMonths } from '@/lib/gbpBilling';
import { getSettings } from '@stakeout/core/settings';
import { redis } from '@stakeout/core/redis';
export async function GET() {
  try {
    let user = await getAuthenticatedUser();
    // A plan whose paid month has run out is brought up to date first, so the balance shown is the real one.
    const due = await db.creditSub.findUnique({ where: { userId: user.id }, select: { subscriptionId: true, periodEnd: true } }).catch(() => null);
    if (due?.subscriptionId && due.periodEnd && due.periodEnd.getTime() < Date.now()) { await settleIfDue(user.id); user = { ...user, creditBalance: (await db.user.findUnique({ where: { id: user.id }, select: { creditBalance: true } }))?.creditBalance ?? user.creditBalance }; }
    // A yearly plan's new month: its sessions are added before the balance is shown.
    if (await catchUpPlanMonths(user.id).catch(() => false)) user = { ...user, creditBalance: (await db.user.findUnique({ where: { id: user.id }, select: { creditBalance: true } }))?.creditBalance ?? user.creditBalance };
    const recentLedger = await db.creditLedger.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    // Mobile data scans: offered to admins, and to customers once switched on in admin settings;
    // ready once the worker has the Decodo mobile login (it says so in its health report).
    const settings = await getSettings();
    const health = await redis().get('stakeout:health').then((h) => (h ? JSON.parse(h) : null)).catch(() => null);
    const mobileData = {
      available: user.role === 'ADMIN' || settings.mobileForCustomers,
      ready: Boolean(health?.mobileData),
      creditsPerPoint: settings.mobileCreditsPerPoint,
    };
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      creditBalance: user.creditBalance,
      emailVerified: Boolean(user.emailVerifiedAt),
      recentLedger,
      mobileData,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
