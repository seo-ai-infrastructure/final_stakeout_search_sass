import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { ACCOUNT_PLANS, memberSeats, type AccountPlan } from '@stakeout/core/gbpPlans';
import { accountPlanNow } from './gbpBilling';
import { sendPasswordLink } from './passwordLinks';
import { appUrl, mailerConfigured, sendNoticeEmail } from './mailer';

/**
 * Team seats: an account's owner adds people by email, and they sign in with their own email and
 * password to work in the owner's account (see teamAccount in auth.ts): its scans, reports and
 * sessions. Billing, the team and API keys stay with the owner. Seats come with the plan: Agency 5,
 * Scale 15, Agency Max no limit, the owner included; Scout and no plan, the owner alone.
 */
export type TeamMember = { id: string; email: string; name: string | null; addedAt: string | null; joined: boolean };

/** The team: its members, earliest first, and how many more the plan allows. */
export async function listTeam(ownerId: string) {
  const [plan, rows] = await Promise.all([
    accountPlanNow(ownerId),
    db.user.findMany({ where: { teamOf: ownerId }, orderBy: [{ teamAddedAt: 'asc' }, { id: 'asc' }], select: { id: true, email: true, name: true, teamAddedAt: true, passwordHash: true } }),
  ]);
  const seats = memberSeats(plan);
  const members: TeamMember[] = rows.map((r) => ({ id: r.id, email: r.email, name: r.name, addedAt: r.teamAddedAt?.toISOString() ?? null, joined: Boolean(r.passwordHash) }));
  return { plan, seats: seats === Infinity ? null : seats, members, left: seats === Infinity ? null : Math.max(0, seats - members.length) };
}

const label = (o: { name: string | null; email: string }) => o.name?.trim() || o.email;

/**
 * Adds someone by email. A new address gets an account of its own to sign in with, and an email to
 * choose a password; an address that already has an empty account (no scans, purchases or plan)
 * joins with the password it has. An address with an account of its own in use, or on another
 * team, cannot be added: their own work would be hidden while they worked here.
 */
export async function addMember(owner: { id: string; email: string; name: string | null; role: string }, rawEmail: unknown) {
  if (owner.role !== 'AGENCY') throw new InputError('This account cannot have a team.');
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || email.endsWith('@internal.invalid')) throw new InputError('Enter a valid email address.');
  if (email === owner.email.toLowerCase()) throw new InputError('That is this account’s own address.');
  const team = await listTeam(owner.id);
  if (team.seats === 0) throw new InputError(`Team seats come with Agency (${ACCOUNT_PLANS.P_AGENCY.seats} people), Scale (${ACCOUNT_PLANS.P_SCALE.seats}) and Agency Max (no limit).`, 402);
  if (team.left === 0) throw new InputError(`Every seat on your plan is taken (${(team.seats ?? 0) + 1} people with you). Remove someone, or move up a plan for more.`, 402);
  const now = new Date();
  const had = await db.user.findUnique({ where: { email } });
  if (had) {
    if (had.teamOf === owner.id) throw new InputError('They are already on your team.', 409);
    if (had.teamOf) throw new InputError('That address is already on another account’s team.', 409);
    if (had.role !== 'AGENCY') throw new InputError('That address cannot be added.');
    const [scans, paid, sub] = await Promise.all([
      db.gridScan.count({ where: { userId: had.id } }),
      db.paymentOrder.count({ where: { userId: had.id, captureId: { not: null } } }),
      db.gbpSub.findUnique({ where: { userId: had.id }, select: { subscriptionId: true } }),
    ]);
    if (scans || paid || sub?.subscriptionId || had.creditBalance > 0) throw new InputError('That address already has its own Stakeout account in use. Ask them for another address to add.', 409);
    await db.user.update({ where: { id: had.id }, data: { teamOf: owner.id, teamAddedAt: now } });
    if (had.passwordHash) {
      if (mailerConfigured())
        await sendNoticeEmail(email, `${label(owner)} added you to their Stakeout Search account`, [`${label(owner)} added you to their Stakeout Search account, so you can run scans and open reports in it.`, `Sign in with ${email} and the password you already have.`], { label: 'Sign in', url: appUrl('/login') }).catch((e) => console.error('[team] email not sent:', (e as Error).message));
    } else {
      await sendPasswordLink(had, { days: 7, invited: true, team: label(owner) }).catch(() => null);
    }
    return listTeam(owner.id);
  }
  const u = await db.user.create({ data: { email, role: 'AGENCY', creditBalance: 0, teamOf: owner.id, teamAddedAt: now }, select: { id: true, email: true } });
  await sendPasswordLink(u, { days: 7, invited: true, team: label(owner) }).catch((e) => console.error('[team] invite not sent:', (e as Error).message));
  return listTeam(owner.id);
}

/** Takes someone off the team: their sessions stop working in the account at once. */
export async function removeMember(ownerId: string, memberId: unknown) {
  const id = String(memberId ?? '');
  const r = await db.user.updateMany({ where: { id, teamOf: ownerId }, data: { teamOf: null, teamAddedAt: null } });
  if (!r.count) throw new InputError('They are not on your team.', 404);
  return listTeam(ownerId);
}

/** Sends a member who has not chosen a password yet a fresh link. */
export async function resendInvite(owner: { id: string; email: string; name: string | null }, memberId: unknown) {
  const u = await db.user.findFirst({ where: { id: String(memberId ?? ''), teamOf: owner.id }, select: { id: true, email: true, passwordHash: true } });
  if (!u) throw new InputError('They are not on your team.', 404);
  if (u.passwordHash) throw new InputError('They have already chosen a password: they can sign in.', 409);
  await sendPasswordLink(u, { days: 7, invited: true, team: label(owner) });
  return listTeam(owner.id);
}

export type TeamPlan = AccountPlan | null;
