import { redis } from '@stakeout/core/redis';
import { InputError } from '@stakeout/core/grid';

/**
 * How many scan credits an account's AI agents may spend in a calendar month (UTC). A person sets
 * it on the AI agents page; scans started on the site itself never count against it.
 */
export const DEFAULT_AGENT_CREDITS = Math.max(0, Number(process.env.AGENT_MONTHLY_CREDITS) || 250);
export const MAX_AGENT_CREDITS = 20000;
const month = (now = new Date()) => now.toISOString().slice(0, 7);
const capKey = (user: string) => 'stakeout:agentcap:' + user;
const usedKey = (user: string, m = month()) => 'stakeout:agentcredits:' + user + ':' + m;

export async function agentBudget(user: string): Promise<{ cap: number; used: number; left: number; month: string }> {
  const [cap, used] = await Promise.all([redis().get(capKey(user)), redis().get(usedKey(user))]);
  const c = cap === null ? DEFAULT_AGENT_CREDITS : Math.max(0, Number(cap) || 0), u = Math.max(0, Number(used) || 0);
  return { cap: c, used: u, left: Math.max(0, c - u), month: month() };
}

export async function setAgentCap(user: string, credits: unknown): Promise<void> {
  const n = Math.round(Number(credits));
  if (!Number.isFinite(n) || n < 0 || n > MAX_AGENT_CREDITS) throw new InputError('Give a number of credits between 0 and ' + MAX_AGENT_CREDITS + '.');
  await redis().set(capKey(user), String(n));
}

/**
 * Sets the credits aside before a scan is started, so two scans started at once cannot both slip
 * under the limit. Returns how to give them back if the scan does not start.
 */
export async function reserveAgentCredits(user: string, credits: number): Promise<() => Promise<void>> {
  const b = await agentBudget(user);
  const refuse = () => new InputError(`This scan costs ${credits} credits, and this account’s agents have ${b.left} of their ${b.cap} left for ${b.month}. A person can raise the limit on the Connected Accounts page, under AI agents.`, 402);
  if (credits > b.left) throw refuse();
  const key = usedKey(user);
  const after = await redis().incrby(key, credits);
  await redis().expire(key, 40 * 86400).catch(() => {});
  const back = async () => { await redis().decrby(key, credits).catch(() => {}); };
  if (after > b.cap) { await back(); throw refuse(); }
  return back;
}
