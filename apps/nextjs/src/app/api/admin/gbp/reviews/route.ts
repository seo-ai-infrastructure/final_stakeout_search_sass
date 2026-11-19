import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { target } from '@/lib/gbpAdmin';
import { getAuthenticatedUser } from '@/lib/auth';
import { allow } from '@/lib/gbpAccess';
import { postproxy } from '@/lib/postproxy';
import { draftFirst, readReview, replyProblem, type Review } from '@stakeout/core/gbpReviews';
import { isAgent } from '@/lib/acting';
import { draftsFor, dropDraft, saveDraft } from '@/lib/reviewDrafts';

export const maxDuration = 60;

const PER_PAGE = 50;
const comments = (profile: string) => '/api/profiles/' + encodeURIComponent(profile) + '/comments';

/** A profile id, and a review or reply id (Postproxy's short id), checked for shape before they go into a URL. */
function ids(profile: unknown, id?: unknown) {
  const p = String(profile ?? '');
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(p)) throw new InputError('Unknown profile.');
  if (id === undefined) return { profile: p, id: '' };
  const i = String(id ?? '');
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(i)) throw new InputError('Unknown review.');
  return { profile: p, id: i };
}

/**
 * GET /api/admin/gbp/reviews?profile=&location=&page=: one page of a connected
 * account's Google reviews, newest first, each with our reply if it has one. `location` narrows it
 * to one listing. Reviews reach the service from Google twice a day, so a review left in the last
 * few hours may not be here yet.
 */
export async function GET(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    const q = new URL(req.url).searchParams;
    const { profile } = ids(q.get('profile'));
    const location = q.get('location') ? target(profile, q.get('location')).location : undefined;
    // An admin can read a whole account's reviews; a customer reads one paid listing's at a time.
    await allow(u, profile, location ?? null, 'manage');
    const page = Math.min(500, Math.max(1, Number(q.get('page')) || 1));
    const r = await postproxy<{ total?: number; data?: unknown[] }>(comments(profile), { query: { placement_id: location, page: String(page), per_page: String(PER_PAGE) } });
    const rows = r.data ?? [];
    const read = rows.map(readReview).filter((x): x is Review => x !== null);
    // A reply an agent wrote to a low-rated review waits with the review for a person to send.
    const drafts = await draftsFor(profile, read.filter((x) => !x.reply).map((x) => x.id));
    const reviews = read.map((x) => (drafts[x.id] ? { ...x, agentDraft: drafts[x.id] } : x));
    return NextResponse.json({ reviews, total: Number(r.total) || reviews.length, page, more: rows.length === PER_PAGE && page * PER_PAGE < (Number(r.total) || 0) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/admin/gbp/reviews { profile, review, body }: answers a review. The
 * service accepts it at once and publishes it to Google in the background, so the reply comes back
 * as "pending"; reading the review again shows whether Google took it. A review has one reply: a
 * new one replaces the old.
 *
 * From an account's AI agent, a reply to a review of three stars or fewer (or with no rating) is
 * not sent: it is kept as a draft for a person to read and send from the review inbox.
 */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { profile?: unknown; review?: unknown; body?: unknown };
    const { profile, id } = ids(b.profile, b.review);
    await mayTouch(profile, id);
    const problem = replyProblem(b.body);
    if (problem) throw new InputError(problem);
    if (isAgent()) {
      const review = await reread(profile, id);
      if (!review) throw new InputError('Unknown review.', 404);
      if (review.deleted) throw new InputError('This review is no longer on Google, so it cannot be answered.', 409);
      if (draftFirst(review.stars)) {
        const agentDraft = await saveDraft(profile, id, String(b.body));
        return NextResponse.json({ sent: false, draft: true, message: 'Not sent. A reply to a review of three stars or fewer is kept as a draft: a person reads it and sends it from the review inbox on Stakeout.', review: { ...review, agentDraft } });
      }
    }
    await postproxy(comments(profile), { method: 'POST', body: { parent_id: id, body: String(b.body).trim() } });
    await dropDraft(profile, id);
    return NextResponse.json({ sent: true, review: await reread(profile, id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** PATCH /api/admin/gbp/reviews { profile, review }: the review as the service has it now (has the reply reached Google?). */
export async function PATCH(req: Request) {
  try {
    const b = (await req.json()) as { profile?: unknown; review?: unknown };
    const { profile, id } = ids(b.profile, b.review);
    await mayTouch(profile, id);
    return NextResponse.json({ review: await reread(profile, id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/admin/gbp/reviews?profile=&reply=: takes our reply down. The review itself stays: only Google can remove a review. */
export async function DELETE(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const { profile, id } = ids(q.get('profile'), q.get('reply'));
    await mayTouch(profile, id);
    await postproxy(comments(profile) + '/' + encodeURIComponent(id), { method: 'DELETE' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Whether the signed-in account may act on this review or reply. For a customer, the review itself
 * says which listing it is on, and that listing has to be one of theirs on a paid plan.
 */
async function mayTouch(profile: string, id: string) {
  const u = await getAuthenticatedUser();
  if (u.role === 'ADMIN') return;
  await allow(u, profile, null, 'free');
  const raw = await postproxy<{ placement_id?: unknown }>(comments(profile) + '/' + encodeURIComponent(id)).catch(() => null);
  const location = typeof raw?.placement_id === 'string' ? raw.placement_id : '';
  if (!location) throw new InputError('Unknown review.', 404);
  await allow(u, profile, location, 'manage');
}

const reread = (profile: string, id: string) => postproxy(comments(profile) + '/' + encodeURIComponent(id)).then(readReview).catch(() => null);

/** PUT /api/admin/gbp/reviews { profile, review }: drops an agent's waiting draft for a review without sending it. */
export async function PUT(req: Request) {
  try {
    const b = (await req.json()) as { profile?: unknown; review?: unknown };
    const { profile, id } = ids(b.profile, b.review);
    if (isAgent()) throw new InputError('Not available to agents.', 403);
    await mayTouch(profile, id);
    await dropDraft(profile, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
