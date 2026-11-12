import { randomBytes } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { stopScan } from '@stakeout/core/scans';
import { redis } from '@stakeout/core/redis';
import { getSettings, saveSettings } from '@stakeout/core/settings';
import { getAuthenticatedUser, hashPassword } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ONBOARDING_WAIVED, onboardingOf } from '@/lib/paypal';
import { sendPasswordLink } from '@/lib/passwordLinks';

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
    const onboarding = await onboardingOf(users);
    const settings = await getSettings(true);
    const r = redis();
    const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
    const [health, capToday, capYesterday] = await r
      .mget('stakeout:health', 'stakeout:captchas:' + day(0), 'stakeout:captchas:' + day(1))
      .catch(() => [null, null, null] as (string | null)[]);
    const system = health ? JSON.parse(health) : null;
    // Timings come from each point's own record (ranSeconds, written by the worker since v72).
    const phones = await db.$queryRaw<{ phone: string | null; points: number; last_hour: number; median_seconds: number | null }[]>`
      SELECT p."assignedDeviceId" AS phone, count(*)::int AS points,
             count(*) FILTER (WHERE p."startedAt" > now() - interval '1 hour')::int AS last_hour,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY (p."proxyMeta"->>'ranSeconds')::float) AS median_seconds
      FROM "GridPin" p
      WHERE p.status = 'COMPLETED' AND p."startedAt" > now() - interval '24 hours'
      GROUP BY 1 ORDER BY 2 DESC`;
    const [totals] = await db.$queryRaw<{ started: number; median_seconds: number | null; timed: number }[]>`
      SELECT count(*)::int AS started,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY (p."proxyMeta"->>'ranSeconds')::float) FILTER (WHERE p.status = 'COMPLETED') AS median_seconds,
             count(*) FILTER (WHERE p.status = 'COMPLETED' AND p."proxyMeta"->>'ranSeconds' IS NOT NULL)::int AS timed
      FROM "GridPin" p WHERE p."startedAt" > now() - interval '24 hours'`;
    const [waiting, readyPhones] = await Promise.all([
      db.gridPin.count({ where: { status: 'PENDING', scan: { status: { in: ['QUEUED', 'RUNNING'] } } } }),
      db.devicePool.count({ where: { isEnabled: true, offlineAt: null, autoPausedAt: null, bootstrappedAt: { not: null } } }),
    ]);
    const median = totals?.median_seconds ?? null;
    // One phone's pace: a point, then the pause. Null until timed points exist.
    const perPhoneHour = median ? 3600 / (median + settings.searchGapSeconds) : null;
    const capacity = {
      completed24h: phones.reduce((n, p) => n + p.points, 0),
      completedLastHour: phones.reduce((n, p) => n + p.last_hour, 0),
      started24h: totals?.started ?? 0,
      timedPoints: totals?.timed ?? 0,
      medianSeconds: median === null ? null : Math.round(median),
      perPhoneHour: perPhoneHour === null ? null : Math.round(perPhoneHour * 10) / 10,
      waiting,
      readyPhones,
      etaMinutes: waiting && readyPhones && perPhoneHour ? Math.ceil((waiting / (readyPhones * perPhoneHour)) * 60) : null,
      cost24hUsd: Math.round((totals?.started ?? 0) * settings.costPerPointUsd * 100) / 100,
      phones: phones.map((p) => ({ phone: p.phone ?? '(unknown)', points: p.points, lastHour: p.last_hour, medianSeconds: p.median_seconds === null ? null : Math.round(p.median_seconds) })),
    };
    return Response.json({
      at: new Date().toISOString(),
      settings,
      system,
      capacity,
      captchas: { today: Number(capToday ?? 0), yesterday: Number(capYesterday ?? 0) },
      scans: scans.map((s) => ({ ...s, owner: s.user.email, user: undefined })),
      users: users.map((u) => ({ id: u.id, email: u.email, role: u.role, credits: u.creditBalance, confirmed: Boolean(u.emailVerifiedAt), createdAt: u.createdAt, scans: u._count.scans, onboarding: onboarding.get(u.id) ?? 'no' })),
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

    if (b.action === 'save_settings') {
      try {
        return Response.json({ settings: await saveSettings(b.settings && typeof b.settings === 'object' ? b.settings : {}) });
      } catch (e) {
        throw new InputError((e as Error).message);
      }
    }

    // The worker re-reads its DuoPlus templates within a minute (and every 10 minutes anyway).
    if (b.action === 'reload_templates') {
      await redis().set('stakeout:templates:reload', String(Date.now()));
      return Response.json({ ok: true });
    }

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

    if (b.action === 'set_onboarded') {
      const u = await db.user.findUnique({ where: { id: String(b.userId) }, select: { id: true, email: true } });
      if (!u) throw new InputError('No such account.');
      // A zero-credit ledger entry: no schema change, and a dated record of the waiver.
      if (b.on) await db.creditLedger.upsert({ where: { externalEventId: 'onboarding-waived:' + u.id }, update: {}, create: { userId: u.id, amount: 0, reason: ONBOARDING_WAIVED, externalEventId: 'onboarding-waived:' + u.id } });
      else await db.creditLedger.deleteMany({ where: { userId: u.id, reason: ONBOARDING_WAIVED } });
      return Response.json({ email: u.email, on: Boolean(b.on) });
    }

    if (b.action === 'password_link') {
      const u = await db.user.findUnique({ where: { id: String(b.userId) }, select: { id: true, email: true, role: true } });
      if (!u || u.role === 'SYSTEM') throw new InputError('No such account.');
      if (u.role === 'BLOCKED') throw new InputError('Unblock the account first.');
      return Response.json({ email: u.email, ...(await sendPasswordLink(u, { days: 7, invited: false })) });
    }

    if (b.action === 'create_account') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || email.endsWith('@internal.invalid')) throw new InputError('Enter a valid email address.');
      if (await db.user.findUnique({ where: { email }, select: { id: true } })) throw new InputError('That address already has an account.');
      // An invited account: confirmed already, with a one-time password shown once to the admin.
      const password = randomBytes(9).toString('base64url');
      const u = await db.user.create({ data: { email, passwordHash: await hashPassword(password), role: 'AGENCY', emailVerifiedAt: new Date() }, select: { id: true, email: true } });
      // They also get a link to choose their own password, so the admin never has to pass one on.
      const link = await sendPasswordLink(u, { days: 7, invited: true }).catch(() => ({ url: '', emailed: false }));
      return Response.json({ email, password, ...link });
    }

    throw new InputError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}
