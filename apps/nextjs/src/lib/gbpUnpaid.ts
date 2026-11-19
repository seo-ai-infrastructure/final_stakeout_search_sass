import { db } from '@stakeout/db';
import { UNPAID_DAYS, connectionPaid, unpaidClock } from '@stakeout/core/gbpPlans';
import { disconnect } from '@/lib/gbpConnect';
import { appUrl, mailerConfigured, sendNoticeEmail } from '@/lib/mailer';

/**
 * Each connected Google Business account costs us money every month, so one with no paying listing
 * is kept for seven days and then disconnected: never paid, cancelled, or a card that keeps
 * failing. The customer is emailed a way back, and reconnecting takes a minute. Search Console and
 * Analytics go through our own Google app, cost nothing, and are never touched here.
 */
export async function sweepUnpaid(now = new Date()): Promise<{ checked: number; disconnected: number; problems: number }> {
  const accounts = await db.gbpAccount.findMany();
  const out = { checked: accounts.length, disconnected: 0, problems: 0 };
  for (const a of accounts) {
    try {
      const [rows, sub] = await Promise.all([
        a.profileId ? db.gbpPlan.findMany({ where: { userId: a.userId, profileId: a.profileId }, select: { plan: true, status: true, endsAt: true } }) : Promise.resolve([]),
        db.gbpSub.findUnique({ where: { userId: a.userId }, select: { status: true } }),
      ]);
      const c = unpaidClock(connectionPaid(rows, sub?.status, now), a.unpaidSince, now);
      if (c.disconnect) {
        await disconnect({ id: a.userId }, a.id);
        out.disconnected++;
        const u = await db.user.findUnique({ where: { id: a.userId }, select: { email: true } });
        if (u && mailerConfigured() && a.profileId)
          await sendNoticeEmail(
            u.email,
            'Stakeout: your Google Business Profile was disconnected',
            [
              `${a.name ?? 'Your Google Business account'} had no listing on a plan for ${UNPAID_DAYS} days, so we disconnected it. Nothing changed on Google.`,
              'Your Search Console and Analytics are still connected and still free.',
              'To pick up where you left off, connect it again and put a listing on the Manage plan.',
            ],
            { label: 'Connect it again', url: appUrl('/profiles?tab=listing') },
          ).catch((e) => console.error('[gbp-unpaid] email not sent:', (e as Error).message));
      } else if ((c.unpaidSince?.getTime() ?? null) !== (a.unpaidSince?.getTime() ?? null)) {
        await db.gbpAccount.update({ where: { id: a.id }, data: { unpaidSince: c.unpaidSince } });
      }
    } catch (e) {
      out.problems++;
      console.error('[gbp-unpaid] could not settle a connection:', (e as Error).message);
    }
  }
  return out;
}
