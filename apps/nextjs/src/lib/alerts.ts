import { db } from '@stakeout/db';
import { redis } from '@stakeout/core/redis';
import { ALERTS_KEY, pushAlert, type Alert } from '@stakeout/core/alerts';
import { appUrl, mailerConfigured, sendNoticeEmail } from '@/lib/mailer';

/** Who hears about problems: ALERT_EMAIL, else PAYMENT_ALERT_EMAIL, else every admin account. */
async function recipients() {
  const named = (process.env.ALERT_EMAIL ?? process.env.PAYMENT_ALERT_EMAIL ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return named.length ? named : (await db.user.findMany({ where: { role: 'ADMIN' }, select: { email: true } })).map((u) => u.email);
}

/**
 * Sends the queued alerts (see @stakeout/core/alerts), after checking that the worker is still
 * reporting in. Run when the worker queues an alert, when a scan is started, and once a day.
 */
export async function flushAlerts() {
  // The worker reports in every minute, even at rest. Quiet for 10 minutes: it is down or cut off.
  const health = await redis().get('stakeout:health').then((h) => (h ? (JSON.parse(h) as { at?: string }) : null)).catch(() => undefined);
  if (health !== undefined && (!health?.at || Date.now() - Date.parse(health.at) > 10 * 60000))
    await pushAlert('worker-quiet', {
      subject: 'Stakeout: the worker has stopped reporting in',
      lines: [health?.at ? `The worker last reported in at ${health.at} (UTC).` : 'The worker has not reported in for over 15 minutes.', 'Scans will not start until it is back. Check the worker on Railway.'],
      path: '/admin/devices',
    }, 6 * 3600);
  if (!mailerConfigured()) return { sent: 0, note: 'mail is not set up' };
  let sent = 0;
  let to: string[] | null = null;
  for (let i = 0; i < 10; i++) {
    const raw = await redis().lpop(ALERTS_KEY);
    if (!raw) break;
    let a: Alert;
    try {
      a = JSON.parse(raw) as Alert;
    } catch {
      continue;
    }
    to ??= await recipients();
    for (const email of to)
      await sendNoticeEmail(email, a.subject, a.lines, a.path ? { label: 'Open it', url: appUrl(a.path) } : undefined).then(
        () => sent++,
        (e) => console.error('[alert] not sent to', email, (e as Error).message),
      );
  }
  return { sent };
}

