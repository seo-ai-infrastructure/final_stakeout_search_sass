import { db } from '@stakeout/db';

/**
 * Replies an account's AI agent has written to a low-rated review. They are not sent to Google:
 * they wait here for a person, who reads them in the review inbox and sends, edits or drops them.
 * One per review (a newer draft replaces the older), kept until it is sent or discarded.
 */
export type ReviewDraft = { text: string; at: string };

export async function saveDraft(profile: string, review: string, text: string): Promise<ReviewDraft> {
  const now = new Date();
  await db.reviewDraft.upsert({ where: { profileId_reviewId: { profileId: profile, reviewId: review } }, update: { text: text.trim(), createdAt: now }, create: { profileId: profile, reviewId: review, text: text.trim(), createdAt: now } });
  return { text: text.trim(), at: now.toISOString() };
}

/** The waiting drafts for these reviews, by review id. A failed read shows none, never an error. */
export async function draftsFor(profile: string, reviews: string[]): Promise<Record<string, ReviewDraft>> {
  if (!reviews.length) return {};
  const rows: { reviewId: string; text: string; createdAt: Date }[] = await db.reviewDraft.findMany({ where: { profileId: profile, reviewId: { in: reviews } }, select: { reviewId: true, text: true, createdAt: true } }).catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.reviewId, { text: r.text, at: r.createdAt.toISOString() }]));
}

export const dropDraft = (profile: string, review: string) => db.reviewDraft.deleteMany({ where: { profileId: profile, reviewId: review } }).then(() => {}).catch(() => {});
