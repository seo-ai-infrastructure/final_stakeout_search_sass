/**
 * Google reviews for the profiles we manage, as Postproxy lists them (profile "comments": a review
 * with its replies nested). Pure rules: reading a review, which ones still need an answer, and
 * what Google will not accept as a reply. Reviews reach Postproxy from Google twice a day.
 */

export type ReviewReply = {
  id: string; text: string; status: string; error: string | null; postedAt: string | null;
  /** Google's own check of the reply: pending, approved or rejected (null when it has not said). */
  moderation: 'pending' | 'approved' | 'rejected' | null;
  /** Why Google rejected it (its policy name in plain words), when it did. */
  policyReason: string | null;
};
export type Review = {
  id: string;
  location: string;
  author: string;
  avatar: string | null;
  /** 1 to 5, or null when Google sent no rating. */
  stars: number | null;
  text: string;
  postedAt: string | null;
  /** Where the review can be answered on Google itself, and where it is shown. */
  replyUrl: string | null;
  permalink: string | null;
  reply: ReviewReply | null;
  /** The review is no longer on Google (the reviewer or Google took it down). */
  deleted: boolean;
  /** A reply was there and has been taken down on Google itself. */
  replyRemoved: boolean;
  /** A reply the account's AI agent wrote that waits for a person to send it (never sent by itself). */
  agentDraft?: { text: string; at: string } | null;
};
export type ReviewFilter = 'unanswered' | 'low' | 'all';

/** Google's limit on a reply (4096 bytes; counted here as UTF-8). */
export const REPLY_MAX_BYTES = 4096;

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const link = (v: unknown) => (typeof v === 'string' && /^https:\/\//.test(v) ? v : null);

const gone = (r: unknown) => /delet/i.test(String((r as Raw)?.status ?? ''));
/** A reply that is on Google, on its way there, or that failed. A deleted one is no reply. */
function replyOf(list: unknown): ReviewReply | null {
  if (!Array.isArray(list)) return null;
  const kept = list.filter((r): r is Raw => Boolean(r) && typeof r === 'object' && !gone(r));
  // The newest is the one that counts (a review has one reply; a re-sent one replaces it).
  const r = kept[kept.length - 1];
  if (!r || !str(r.id)) return null;
  const pd = (r.platform_data && typeof r.platform_data === 'object' ? r.platform_data : {}) as Raw;
  const state = String(pd.reply_state ?? '').toLowerCase();
  return {
    id: String(r.id), text: String(r.body ?? ''), status: String(r.status ?? ''), error: str(r.error), postedAt: str(r.posted_at) ?? str(r.created_at),
    moderation: state === 'pending' || state === 'approved' || state === 'rejected' ? state : null,
    policyReason: str(pd.policy_violation)?.replace(/_/g, ' ').toLowerCase() ?? null,
  };
}

/** One review from a Postproxy comment, or null when it is not a review (no id, or itself a reply). */
export function readReview(raw: unknown): Review | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Raw;
  if (!str(r.id) || r.parent_external_id) return null;
  const pd = (r.platform_data && typeof r.platform_data === 'object' ? r.platform_data : {}) as Raw;
  const n = Number(pd.star_rating);
  return {
    id: String(r.id),
    location: String(r.placement_id ?? ''),
    author: str(r.author_username) ?? 'A Google user',
    avatar: link(r.author_avatar_url),
    stars: Number.isInteger(n) && n >= 1 && n <= 5 ? n : null,
    text: String(r.body ?? ''),
    postedAt: str(r.posted_at) ?? str(r.created_at),
    replyUrl: link(pd.review_reply_url),
    permalink: link(r.permalink),
    reply: replyOf(r.replies),
    deleted: gone(r),
    replyRemoved: Array.isArray(r.replies) && r.replies.some(gone) && !replyOf(r.replies),
  };
}

/** Still needs an answer: no reply, the reply never reached Google, or Google rejected it. */
export const needsReply = (r: Review) => !r.deleted && (!r.reply || /^failed/i.test(r.reply.status) || r.reply.moderation === 'rejected');
/** An agent's answer to this review waits for a person: three stars or fewer, or no rating to go by. */
export const draftFirst = (stars: number | null) => stars === null || stars <= 3;
/** Three stars or fewer: the ones a business most needs to see. */
export const isLow = (r: Review) => r.stars !== null && r.stars <= 3;

export function filterReviews(list: Review[], filter: ReviewFilter): Review[] {
  if (filter === 'unanswered') return list.filter(needsReply);
  if (filter === 'low') return list.filter(isLow);
  return list;
}

/** Counts for the reviews in hand (a page or several, never all of Google's unless all are loaded). */
export function reviewSummary(list: Review[]) {
  const rated = list.filter((r) => r.stars !== null);
  return {
    count: list.length,
    average: rated.length ? Math.round((rated.reduce((n, r) => n + (r.stars as number), 0) / rated.length) * 10) / 10 : null,
    unanswered: list.filter(needsReply).length,
    lowUnanswered: list.filter((r) => needsReply(r) && isLow(r)).length,
  };
}

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** The reply as it will be sent (trimmed), and why it cannot be sent, if it cannot. */
export function replyProblem(text: unknown): string | null {
  if (typeof text !== 'string' || !text.trim()) return 'Write a reply first.';
  if (bytes(text.trim()) > REPLY_MAX_BYTES) return 'Too long: Google allows ' + REPLY_MAX_BYTES + ' bytes in a reply (this is ' + bytes(text.trim()) + ').';
  return null;
}
export const replyBytes = (text: string) => bytes(text.trim());
