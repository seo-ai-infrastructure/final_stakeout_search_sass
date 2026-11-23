import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';

/**
 * How many scan credits an account's AI agents may spend in a calendar month (UTC). A person sets
 * it on the AI agents page; scans started on the site itself never count against it.
 */
export const DEFAULT_AGENT_CREDITS = Math.max(0, Number(process.env.AGENT_MONTHLY_CREDITS) || 250);
export const MAX_AGENT_CREDITS = 20000;
const month = (now = new Date()) => now.toISOString().slice(0, 7);

export async function agentBudget(user: string): Promise<{ cap: number; used: number; left: number; month: string }> {
  const row = await db.agentLimit.findUnique({ where: { userId: user } });
  const cap = row?.monthlyCredits ?? DEFAULT_AGENT_CREDITS, used = row && row.month === month() ? row.used : 0;
  return { cap, used, left: Math.max(0, cap - used), month: month() };
}

export async function setAgentCap(user: string, credits: unknown): Promise<void> {
  const n = Math.round(Number(credits));
  if (credits === null || credits === '' || !Number.isFinite(n) || n < 0 || n > MAX_AGENT_CREDITS) throw new InputError('Give a number of phone sessions between 0 and ' + MAX_AGENT_CREDITS + '.');
  await db.agentLimit.upsert({ where: { userId: user }, update: { monthlyCredits: n, updatedAt: new Date() }, create: { userId: user, monthlyCredits: n } });
}

/**
 * Sets the credits aside before a scan is started. The count only moves when it stays within the
 * limit (one statement, so two scans started at once cannot both slip under it). Returns how to
 * give the credits back if the scan does not start.
 */
export async function reserveAgentCredits(user: string, credits: number): Promise<() => Promise<void>> {
  const m = month();
  await db.agentLimit.upsert({ where: { userId: user }, update: {}, create: { userId: user } });
  const rows = await db.$queryRaw<{ used: number }[]>`
    UPDATE "AgentLimit" SET "used" = (CASE WHEN "month" = ${m} THEN "used" ELSE 0 END) + ${credits}, "month" = ${m}, "updatedAt" = NOW()
    WHERE "userId" = ${user} AND (CASE WHEN "month" = ${m} THEN "used" ELSE 0 END) + ${credits} <= COALESCE("monthlyCredits", ${DEFAULT_AGENT_CREDITS})
    RETURNING "used"`;
  if (!rows.length) {
    const b = await agentBudget(user);
    throw new InputError(`This scan uses ${credits} phone sessions, and this account’s agents have ${b.left} of their ${b.cap} left for ${b.month}. A person can raise the limit on the Connected Accounts page, under AI agents.`, 402);
  }
  return async () => { await db.$executeRaw`UPDATE "AgentLimit" SET "used" = GREATEST(0, "used" - ${credits}) WHERE "userId" = ${user} AND "month" = ${m}`.catch(() => {}); };
}
