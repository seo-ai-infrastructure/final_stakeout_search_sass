import { redis } from './redis';
import { addMerge, clientKey } from './clientNames';

/** Each account's merged client names, kept in Redis (no schema change): key of the name → name it joins. */
const key = (userId: string) => 'stakeout:client-merges:' + userId;

export async function clientMerges(userId: string): Promise<Record<string, string>> {
  return redis().hgetall(key(userId)).catch(() => ({}) as Record<string, string>);
}

export async function mergeClients(userId: string, from: string, into: string): Promise<boolean> {
  const next = addMerge(await clientMerges(userId), from, into);
  if (!next) return false;
  await redis().hset(key(userId), clientKey(from), next[clientKey(from)]);
  return true;
}

export async function separateClient(userId: string, from: string): Promise<void> {
  await redis().hdel(key(userId), clientKey(from));
}
