import { createHash } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
export async function limit(
  scope: string,
  subject: string,
  max: number,
  seconds: number,
) {
  const key = createHash('sha256')
    .update(scope + ':' + subject)
    .digest('hex');
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "UsageBucket" (key,bucket,count) VALUES (${key},${bucket},1)
 ON CONFLICT (key) DO UPDATE SET bucket=EXCLUDED.bucket,count=CASE WHEN "UsageBucket".bucket=EXCLUDED.bucket THEN "UsageBucket".count+1 ELSE 1 END RETURNING count`;
  if (rows[0].count > max)
    throw new InputError('Request limit reached. Try again later.', 429);
}

let warned = false;
/**
 * The caller's IP from a header the hosting platform sets and clients cannot forge.
 * Vercel sets x-vercel-forwarded-for. Elsewhere set TRUSTED_IP_HEADER to your
 * edge's header (e.g. cf-connecting-ip). Returns null when the IP is unknown:
 * callers then skip per-IP limits instead of putting every visitor in one bucket.
 */
export function clientKey(req: Request): string | null {
  const vercel = req.headers.get('x-vercel-forwarded-for');
  const custom = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  const raw = vercel ?? (custom ? req.headers.get(custom) : null);
  const ip = raw?.split(',')[0].trim();
  if (ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip)) return ip;
  if (!warned && process.env.NODE_ENV === 'production') {
    warned = true;
    console.warn('Client IP unavailable; set TRUSTED_IP_HEADER. Per-IP limits are skipped.');
  }
  return null;
}

/** Applies a per-IP limit only when the IP is known. */
export async function limitIp(req: Request, scope: string, max: number, seconds: number) {
  const ip = clientKey(req);
  if (ip) await limit(scope, ip, max, seconds);
}

/** Lowercase and drop +tags so one inbox cannot claim many quotas. */
export function emailQuotaKey(email: string) {
  const [local, domain] = email.toLowerCase().split('@');
  let user = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') user = user.replaceAll('.', '');
  return user + '@' + domain;
}
