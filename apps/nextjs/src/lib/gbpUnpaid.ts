import { db } from '@stakeout/db';
import { UNPAID_DAYS, UNPAID_FIRST_MINUTES, connectionPaid, unpaidClock } from '@stakeout/core/gbpPlans';
import { disconnect } from '@/lib/gbpConnect';
import { appUrl, mailerConfigured, sendNoticeEmail } from '@/lib/mailer';

/**
 * Each connected Google Business account costs us money every month, so one with no paying listing
 * is disconnected: after an hour when nothing was ever paid for (connected to look around, no
 * checkout completed), after seven days when a paying account cancelled or its card keeps failing. The customer is emailed a way back, and reconnecting takes a minute. Search Console and
 * Analytics go through our own Google app, cost nothing, and are never touched here.
 */
export async function sweepUnpaid(now = new Date(), onlyUser?: string): Promise<{ checked: number; disconnected: number; problems: number }> {
  const accounts = await db.gbpAccount.findMany(onlyUser ? { where: { userId: onlyUser } } : undefined);
  const out = { checked: accounts.length, disconnected: 0, problems: 0 };
  for (const a of accounts) {
    try {
      const [rows, sub] = await Promise.all([
        a.profileId ? db.gbpPlan.findMany({ where: { userId: a.userId, profileId: a.profileId }, select: { plan: true, status: true, endsAt: true } }) : Promise.resolve([]),
        db.gbpSub.findUnique({ where: { userId: a.userId }, select: { status: true } }),
      ]);
      // A subscription on record, in any state, means a checkout was completed at some point.
      // Someone part-way through checkout is given the longer window too, so paying never lands on a removed connection.
      const everPaid = sub !== null || rows.some((r) => r.status === 'PENDING');
      const c = unpaidClock(connectionPaid(rows, sub?.status, now), a.unpaidSince, now, everPaid);
      if (c.disconnect) {
        await disconnect({ id: a.userId }, a.id);
        out.disconnected++;
        const u = await db.user.findUnique({ where: { id: a.userId }, select: { email: true } });
        if (u && mailerConfigured() && a.profileId)
          await sendNoticeEmail(
            u.email,
            'Stakeout: your Google Business Profile was disconnected',
            [
              everPaid ? `${a.name ?? 'Your Google Business account'} had no listing on a plan for ${UNPAID_DAYS} days, so we disconnected it. Nothing changed on Google.` : `${a.name ?? 'Your Google Business account'} was connected but no listing was put on a plan within ${UNPAID_FIRST_MINUTES} minutes, so we disconnected it. Nothing changed on Google.`,
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
