import { scrypt, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { db } from '@stakeout/db';
import { acting } from './acting';
import { InputError } from '@stakeout/core/grid';
import { isAccountPlan, memberSeats } from '@stakeout/core/gbpPlans';
const derive = promisify(scrypt);
export const SESSION_COOKIE_NAME = 'stakeout_uid';
const lifetime = 30 * 86400;
function signature(payload: string) {
  const key = process.env.AUTH_SECRET;
  if (!key || key.length < 32)
    throw new Error(
      'Set AUTH_SECRET to a random secret of at least 32 characters.',
    );
  return createHmac('sha256', key).update(payload).digest('base64url');
}
export function signSessionToken(id: string) {
  const payload = id + '.' + (Math.floor(Date.now() / 1000) + lifetime);
  return payload + '.' + signature(payload);
}
function verifySessionToken(value?: string) {
  if (!value) return null;
  const parts = value.split('.');
  if (
    parts.length !== 3 ||
    !/^\d{10}$/.test(parts[1]) ||
    +parts[1] <= Date.now() / 1000
  )
    return null;
  const a = Buffer.from(parts[2]),
    b = Buffer.from(signature(parts[0] + '.' + parts[1]));
  return a.length === b.length && timingSafeEqual(a, b) ? parts[0] : null;
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex'),
    hash = (await derive(password, salt, 64)) as Buffer;
  return salt + ':' + hash.toString('hex');
}
export async function verifyPassword(password: string, value: string) {
  const [salt, key] = value.split(':');
  if (!salt || !key || key.length !== 128) return false;
  return timingSafeEqual(
    (await derive(password, salt, 64)) as Buffer,
    Buffer.from(key, 'hex'),
  );
}
type UserRow = NonNullable<Awaited<ReturnType<typeof db.user.findUnique>>>;

/** Whoever the session cookie names: the account itself, or a team member of one. */
async function sessionUser(): Promise<UserRow | null> {
  const id = verifySessionToken((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  return id ? db.user.findUnique({ where: { id } }) : null;
}

/**
 * The account a team member works in: its owner's, while the owner's plan has a seat for them (the
 * earliest added keep theirs when a plan gets smaller). Never an admin's or a closed account.
 */
async function teamAccount(member: UserRow): Promise<{ owner: UserRow | null; paused: boolean }> {
  if (!member.teamOf) return { owner: null, paused: false };
  const owner = await db.user.findUnique({ where: { id: member.teamOf } });
  if (!owner || owner.role !== 'AGENCY') return { owner: null, paused: true };
  const sub = await db.gbpSub.findUnique({ where: { userId: owner.id }, select: { accountPlan: true, status: true, subscriptionId: true } });
  const plan = sub?.subscriptionId && isAccountPlan(sub.accountPlan) && ['active', 'trialing', 'past_due'].includes(sub.status) ? sub.accountPlan : null;
  const seats = memberSeats(plan);
  if (seats === 0) return { owner: null, paused: true };
  if (seats !== Infinity) {
    const before = await db.user.count({ where: { teamOf: owner.id, OR: [{ teamAddedAt: { lt: member.teamAddedAt ?? new Date(0) } }, { teamAddedAt: member.teamAddedAt, id: { lt: member.id } }] } });
    if (before >= seats) return { owner: null, paused: true };
  }
  return { owner, paused: false };
}

export async function getAuthenticatedUser() {
  // A request made for an account's AI agent runs as the account its key belongs to.
  const agent = acting.getStore();
  if (agent) return agent.user as unknown as UserRow;
  const user = await sessionUser();
  // A blocked account's existing sessions stop working at once.
  if (!user || user.role === 'BLOCKED') throw new Error('UNAUTHORIZED');
  // A team member works in the account that added them: everything they do is that account's.
  if (user.teamOf) {
    const { owner } = await teamAccount(user);
    if (owner) return owner;
  }
  return user;
}

/**
 * When a team member is signed in: who they are and whose account they work in (paused: the
 * owner's plan has no seat for them now, so they are in their own, empty account). Null for an
 * account's own sign-in and for AI agents.
 */
export async function teamSession(): Promise<{ member: { id: string; email: string; name: string | null }; owner: { id: string; email: string; name: string | null } | null; paused: boolean } | null> {
  if (acting.getStore()) return null;
  const user = await sessionUser();
  if (!user?.teamOf) return null;
  const { owner, paused } = await teamAccount(user);
  return { member: { id: user.id, email: user.email, name: user.name }, owner: owner ? { id: owner.id, email: owner.email, name: owner.name } : null, paused };
}

/** Billing, the team and API keys are the owner's: a team member working in the account is refused. */
export async function assertAccountOwner() {
  const t = await teamSession();
  if (t && !t.paused) throw new InputError('Only the account owner can do that. Ask them to make the change.', 403);
}

/**
 * Which scans an account may read: its own, or every scan for an admin (quality control: an admin
 * opens a customer's report and its recordings without digging through logs). Reading only;
 * re-running, sharing and schedules stay with the owner.
 */
export const readScope = (user: { id: string; role: string }): { userId?: string } => (user.role === 'ADMIN' ? {} : { userId: user.id });
