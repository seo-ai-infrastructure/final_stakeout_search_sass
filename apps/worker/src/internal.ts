import { db } from '@stakeout/db';
import { ACCOUNT_PLANS, isAccountPlan } from '@stakeout/core/gbpPlans';

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

/**
 * Whether an account's points go first (Scale and Agency Max: the priority queue): in the queue and
 * at the 5G lane door, where they also try again sooner. Read once per account every ten minutes.
 */
const firsts = new Map<string, { first: boolean; at: number }>();
export async function priorityAccount(userId: string): Promise<boolean> {
  const hit = firsts.get(userId);
  if (hit && Date.now() - hit.at < 600000) return hit.first;
  const sub = await db.gbpSub.findUnique({ where: { userId }, select: { accountPlan: true, status: true, subscriptionId: true } }).catch(() => null);
  const plan = sub?.subscriptionId && isAccountPlan(sub.accountPlan) && ['active', 'trialing', 'past_due'].includes(sub.status) ? sub.accountPlan : null;
  const first = Boolean(plan && ACCOUNT_PLANS[plan].priority);
  firsts.set(userId, { first, at: Date.now() });
  return first;
}
