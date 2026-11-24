import { db } from '@stakeout/db';

/**
 * Whether a scan is one of ours (an admin's test run). Internal runs never use metered mobile data
 * (VoidMob): only the unlimited line or home internet. Read once per account every ten minutes.
 */
const seen = new Map<string, { admin: boolean; at: number }>();
export async function internalScan(userId: string): Promise<boolean> {
  const hit = seen.get(userId);
  if (hit && Date.now() - hit.at < 600000) return hit.admin;
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true } }).catch(() => null);
  const admin = u?.role === 'ADMIN';
  seen.set(userId, { admin, at: Date.now() });
  return admin;
}
