import { db } from '@stakeout/db';
import { redis } from '@stakeout/core/redis';
import { keptValue } from '@stakeout/core/kept';
import { pushAlert } from '@stakeout/core/alerts';
import { openToken, sealToken } from '@stakeout/core/tokenSeal';
import { readReview } from '@stakeout/core/gbpReviews';
import { reviewAlert } from '@stakeout/core/reviewAlert';
import { postproxy } from '@/lib/postproxy';
import { paidLocations } from '@/lib/gbpAccess';
import { flushAlerts } from '@/lib/alerts';
import { appUrl, mailerConfigured, sendNoticeEmail } from '@/lib/mailer';

/**
 * Instant review alerts. Postproxy tells us the moment a new review reaches it (it reads Google
 * hourly); a low-star one is emailed at once to whoever looks after the listing: the customer who
 * pays for it, or the admins for the listings we manage ourselves.
 */
const SECRET_KEY = 'stakeout:postproxy:webhook';
// The secret is sealed before it is stored; its lasting copy is in Postgres, so alerts survive Redis being emptied.
const secret = keptValue('secrets', 'postproxy-webhook', SECRET_KEY);
const EVENTS = ['profile_comment.created'];
type Hook = { id: string; url: string; events?: string[]; enabled?: boolean; secret?: string };

const hookUrl = (origin: string) => origin + '/api/webhooks/postproxy';
/** The signing secret: POSTPROXY_WEBHOOK_SECRET if set, else the one saved (encrypted) when alerts were switched on here. */
export async function webhookSecret(): Promise<string> {
  const env = (process.env.POSTPROXY_WEBHOOK_SECRET ?? '').trim();
  if (env) return env;
  const kept = await secret.get().catch(() => null);
  return kept ? openToken(kept) ?? '' : '';
}

/** Whether Postproxy is set to tell us about new reviews, and whether we can check its messages. */
export async function alertsStatus(origin: string) {
  const list = await postproxy<{ data?: Hook[] }>('/api/webhooks');
  const hook = (list.data ?? []).find((h) => h.url === hookUrl(origin) && h.enabled !== false) ?? null;
  return { on: Boolean(hook) && Boolean(await webhookSecret()), hook: hook?.id ?? null, maxStars: maxStars() };
}

/** Switches the alerts on: registers our address with Postproxy and keeps the signing secret it hands back. */
export async function turnAlertsOn(origin: string) {
  const list = await postproxy<{ data?: Hook[] }>('/api/webhooks');
  // An older registration for the same address is replaced, since its secret can no longer be read.
  for (const h of (list.data ?? []).filter((x) => x.url === hookUrl(origin))) await postproxy('/api/webhooks/' + encodeURIComponent(h.id), { method: 'DELETE' }).catch(() => {});
  const made = await postproxy<Hook>('/api/webhooks', { method: 'POST', body: { url: hookUrl(origin), events: EVENTS, description: 'Stakeout: instant review alerts' } });
  if (!made.secret) throw new Error('Postproxy did not return a signing secret.');
  await secret.set(sealToken(made.secret));
  return alertsStatus(origin);
}

export const maxStars = () => { const n = Number(process.env.REVIEW_ALERT_MAX_STARS); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 2; };

/** A new review has arrived: if it is low enough, email whoever looks after that listing. Once per review. */
export async function newReview(raw: unknown): Promise<string> {
  const r = readReview(raw);
  if (!r || !r.location) return 'ignored';
  if (r.stars === null || r.stars > maxStars()) return 'fine';
  const first = await redis().set('stakeout:review-alert:' + r.id, '1', 'EX', 14 * 86400, 'NX').catch(() => 'OK');
  if (first !== 'OK') return 'seen';
  // Whose listing it is: customers who pay for it hear about it themselves.
  const plans = await db.gbpPlan.findMany({ where: { locationId: r.location }, select: { userId: true, title: true } });
  const owners: { userId: string; title: string | null }[] = [];
  for (const p of plans) if ((await paidLocations(p.userId)).has(r.location)) owners.push(p);
  if (owners.length) {
    if (!mailerConfigured()) return 'no mail';
    for (const o of owners) {
      const u = await db.user.findUnique({ where: { id: o.userId }, select: { email: true } });
      const a = reviewAlert(r, o.title ?? 'your listing');
      if (u) await sendNoticeEmail(u.email, a.subject, a.lines, { label: 'Answer it', url: appUrl('/profiles') }).catch((e) => console.error('[review-alert] not sent:', (e as Error).message));
    }
    return 'customer';
  }
  // Otherwise it is ours only if the watchdog knows it under an account no customer connected.
  const watch = await db.gbpWatch.findUnique({ where: { locationId: r.location }, select: { title: true, profileId: true } });
  if (!watch || (await db.gbpAccount.findFirst({ where: { profileId: watch.profileId }, select: { id: true } }))) return 'not watched';
  const a = reviewAlert(r, watch.title ?? 'a listing');
  await pushAlert('review:' + r.id, { ...a, path: '/profiles?tab=reviews' }, 60);
  await flushAlerts().catch((e) => console.error('[review-alert] not sent:', (e as Error).message));
  return 'admin';
}
