import { db } from '@stakeout/db';
import { ACCOUNT_PLANS, isAccountPlan, type AccountPlan } from './gbpPlans';
import type { Brand } from './brands';

/** The account plan an account pays for now (a failed card keeps it while Stripe retries), or null. */
export async function paidPlan(userId: string): Promise<AccountPlan | null> {
  const sub = await db.gbpSub.findUnique({ where: { userId }, select: { accountPlan: true, status: true, subscriptionId: true } }).catch(() => null);
  return sub?.subscriptionId && isAccountPlan(sub.accountPlan) && ['active', 'trialing', 'past_due'].includes(sub.status) ? sub.accountPlan : null;
}

/** Our own account (the admin's), which has every plan feature to try them out. */
export async function isAdminAccount(userId: string): Promise<boolean> {
  return (await db.user.findUnique({ where: { id: userId }, select: { role: true } }).catch(() => null))?.role === 'ADMIN';
}

/**
 * Whether a brand shows now: one we set up always does; one an account set up itself (self-serve,
 * Agency and up) only while its plan includes white label, so a move down to Scout brings our badge back.
 */
export async function brandInForce(b: Brand | null): Promise<Brand | null> {
  if (!b?.self) return b;
  const plan = await paidPlan(b.userId);
  return plan && ACCOUNT_PLANS[plan].whiteLabel ? b : null;
}
