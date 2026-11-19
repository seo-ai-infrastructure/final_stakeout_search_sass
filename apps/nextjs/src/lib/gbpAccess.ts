import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { allows, planNow, upgradeMessage, type Need, type Plan } from '@stakeout/core/gbpPlans';
import { getAuthenticatedUser } from '@/lib/auth';
import { target } from '@/lib/gbpAdmin';
import { isAgent } from '@/lib/acting';

type Account = { id: string; role: string; email?: string };

/**
 * Whether Google profiles are open to this account. Admins always. Customers when
 * GBP_CUSTOMER_ACCESS is "on", or, to try it with a few accounts first, when it lists their email
 * (comma-separated).
 */
export function gbpOpen(u: Account): boolean {
  if (u.role === 'ADMIN') return true;
  const v = (process.env.GBP_CUSTOMER_ACCESS ?? '').trim().toLowerCase();
  if (v === 'on') return true;
  return Boolean(u.email) && v.split(',').map((x) => x.trim()).includes(String(u.email).toLowerCase());
}

/**
 * Who may do what to a Google listing.
 *
 * Admins reach every connected account, as before. A customer reaches only the Google accounts
 * they connected themselves; reading those is free, and anything that changes a listing needs that
 * listing to be on a paid plan.
 */
export async function allow(u: Account, profile: string, location: string | null, need: Need): Promise<void> {
  if (u.role === 'ADMIN') return;
  if (!gbpOpen(u)) throw new InputError('Unknown profile.', 404);
  const account = await db.gbpAccount.findFirst({ where: { userId: u.id, profileId: profile }, select: { id: true } });
  // The same answer whether the account is someone else's or does not exist.
  if (!account) throw new InputError('Unknown profile.', 404);
  // Through an AI agent, even reading a listing takes the Agent plan.
  if (isAgent() && (location || need !== 'free')) need = 'agent';
  if (need === 'free') return;
  if (!location) throw new InputError('Pick a listing first.');
  if (!allows(await planOf(u.id, location, profile), need)) throw new InputError(upgradeMessage(need), 402);
}

/** The plan one of a customer's listings is on right now (null = free). */
export async function planOf(userId: string, location: string, profile?: string): Promise<Plan | null> {
  const [row, sub] = await Promise.all([
    db.gbpPlan.findUnique({ where: { userId_locationId: { userId, locationId: location } }, select: { plan: true, status: true, endsAt: true, profileId: true } }),
    db.gbpSub.findUnique({ where: { userId }, select: { status: true } }),
  ]);
  if (row !== null && profile && row.profileId !== profile) return null;
  return planNow(row, sub?.status, new Date());
}

/** The signed-in account, the listing a request names, and the check that it may do this to it. */
export async function gate(profile: unknown, location: unknown, need: Need) {
  const u = await getAuthenticatedUser();
  const t = target(profile, location);
  await allow(u, t.profile, t.location, need);
  return { u, ...t };
}

/** The listings a customer has on a paid plan right now, by location. */
export async function paidLocations(userId: string): Promise<Map<string, Plan>> {
  const [rows, sub] = await Promise.all([
    db.gbpPlan.findMany({ where: { userId }, select: { locationId: true, plan: true, status: true, endsAt: true } }),
    db.gbpSub.findUnique({ where: { userId }, select: { status: true } }),
  ]);
  const now = new Date();
  const out = new Map<string, Plan>();
  for (const r of rows) {
    const p = planNow(r, sub?.status, now);
    if (p) out.set(r.locationId, p);
  }
  return out;
}

/**
 * Which listings the nightly watchdog should leave alone: those in a customer's own Google account
 * that are not on a paid plan. Returns the customer profiles and, for each paid listing, its owner.
 */
export async function customerWatchScope(): Promise<{ profiles: Set<string>; owners: Map<string, string> }> {
  const accounts = await db.gbpAccount.findMany({ where: { profileId: { not: null } }, select: { profileId: true, userId: true } });
  const owners = new Map<string, string>();
  for (const userId of new Set(accounts.map((a) => a.userId))) for (const loc of (await paidLocations(userId)).keys()) owners.set(loc, userId);
  return { profiles: new Set(accounts.map((a) => String(a.profileId))), owners };
}

/**
 * Whether an account may use AI agents at all (make a key, call the agent server): admins, and
 * customers with a listing on the Agent plan. Agent access is not on sale at the moment, so for
 * now that is admins only.
 */
export async function agentOpen(u: Account): Promise<boolean> {
  if (u.role === 'ADMIN') return true;
  return [...(await paidLocations(u.id)).values()].includes('AGENT');
}
export const AGENT_CLOSED = 'AI agent access is not part of your plan. It is coming back as an add-on: email sass@stakeoutsearch.com to be told when.';

/**
 * For reads that are not about one listing (Search Console, Analytics): through an AI agent they
 * need the account to have at least one listing on the Agent plan. On the site they are free.
 */
export async function agentGate(u: Account): Promise<void> {
  if (!isAgent() || u.role === 'ADMIN') return;
  if (![...(await paidLocations(u.id)).values()].includes('AGENT')) throw new InputError('Search Console and Analytics through an agent need a listing on the Agent plan.', 402);
}
