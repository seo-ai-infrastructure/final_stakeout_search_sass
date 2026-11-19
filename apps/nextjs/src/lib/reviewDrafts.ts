import { redis } from '@stakeout/core/redis';

/**
 * Replies an account's AI agent has written to a low-rated review. They are not sent to Google:
 * they wait here for a person, who reads them in the review inbox and sends, edits or drops them.
 * Kept 60 days, one per review (a newer draft replaces the older).
 */
export type ReviewDraft = { text: string; at: string };
const key = (profile: string) => 'stakeout:reviewdrafts:' + profile;
const KEEP = 60 * 86400;

export async function saveDraft(profile: string, review: string, text: string): Promise<ReviewDraft> {
  const draft = { text: text.trim(), at: new Date().toISOString() };
  await redis().hset(key(profile), review, JSON.stringify(draft));
  await redis().expire(key(profile), KEEP).catch(() => {});
  return draft;
}

/** The waiting drafts for these reviews, by review id. A failed read shows none, never an error. */
export async function draftsFor(profile: string, reviews: string[]): Promise<Record<string, ReviewDraft>> {
  if (!reviews.length) return {};
  const got = await redis().hmget(key(profile), ...reviews).catch(() => [] as (string | null)[]);
  const out: Record<string, ReviewDraft> = {};
  reviews.forEach((id, i) => { try { if (got[i]) out[id] = JSON.parse(got[i] as string) as ReviewDraft; } catch { /* unreadable: no draft */ } });
  return out;
}

export const dropDraft = (profile: string, review: string) => redis().hdel(key(profile), review).then(() => {}).catch(() => {});
/** How many drafts are waiting in one connected account. */
export const draftCount = (profile: string) => redis().hlen(key(profile)).catch(() => 0);
