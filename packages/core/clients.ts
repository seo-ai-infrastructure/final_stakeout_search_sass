import { keptHash } from './kept';
import { addMerge, clientKey } from './clientNames';

/** Each account's merged client names: key of the name → name it joins. The lasting copy is in Postgres; Redis is the one that is read (see kept.ts). */
const kept = (userId: string) => keptHash('client-merges:' + userId, 'stakeout:client-merges:' + userId);

export async function clientMerges(userId: string): Promise<Record<string, string>> {
  return kept(userId).all().catch(() => ({}) as Record<string, string>);
}

export async function mergeClients(userId: string, from: string, into: string): Promise<boolean> {
  const next = addMerge(await clientMerges(userId), from, into);
  if (!next) return false;
  await kept(userId).set({ [clientKey(from)]: next[clientKey(from)] });
  return true;
}

export async function separateClient(userId: string, from: string): Promise<void> {
  await kept(userId).del(clientKey(from));
}
