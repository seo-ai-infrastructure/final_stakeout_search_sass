import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gbpAdmin, target } from '@/lib/gbpAdmin';
import { postproxy } from '@/lib/postproxy';
import { readReview, replyProblem, type Review } from '@stakeout/core/gbpReviews';

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
 * GET /api/admin/gbp/reviews?profile=&location=&page= (admins only): one page of a connected
 * account's Google reviews, newest first, each with our reply if it has one. `location` narrows it
 * to one listing. Reviews reach the service from Google twice a day, so a review left in the last
 * few hours may not be here yet.
 */
export async function GET(req: Request) {
  try {
    await gbpAdmin();
    const q = new URL(req.url).searchParams;
    const { profile } = ids(q.get('profile'));
    const location = q.get('location') ? target(profile, q.get('location')).location : undefined;
    const page = Math.min(500, Math.max(1, Number(q.get('page')) || 1));
    const r = await postproxy<{ total?: number; data?: unknown[] }>(comments(profile), { query: { placement_id: location, page: String(page), per_page: String(PER_PAGE) } });
    const rows = r.data ?? [];
    const reviews = rows.map(readReview).filter((x): x is Review => x !== null);
    return NextResponse.json({ reviews, total: Number(r.total) || reviews.length, page, more: rows.length === PER_PAGE && page * PER_PAGE < (Number(r.total) || 0) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/admin/gbp/reviews (admins only) { profile, review, body }: answers a review. The
 * service accepts it at once and publishes it to Google in the background, so the reply comes back
 * as "pending"; reading the review again shows whether Google took it. A review has one reply: a
 * new one replaces the old.
 */
export async function POST(req: Request) {
  try {
    await gbpAdmin();
    const b = (await req.json()) as { profile?: unknown; review?: unknown; body?: unknown };
    const { profile, id } = ids(b.profile, b.review);
    const problem = replyProblem(b.body);
    if (problem) throw new InputError(problem);
    await postproxy(comments(profile), { method: 'POST', body: { parent_id: id, body: String(b.body).trim() } });
    return NextResponse.json({ review: await reread(profile, id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** PATCH /api/admin/gbp/reviews (admins only) { profile, review }: the review as the service has it now (has the reply reached Google?). */
export async function PATCH(req: Request) {
  try {
    await gbpAdmin();
    const b = (await req.json()) as { profile?: unknown; review?: unknown };
    const { profile, id } = ids(b.profile, b.review);
    return NextResponse.json({ review: await reread(profile, id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/admin/gbp/reviews?profile=&reply= (admins only): takes our reply down. The review itself stays: only Google can remove a review. */
export async function DELETE(req: Request) {
  try {
    await gbpAdmin();
    const q = new URL(req.url).searchParams;
    const { profile, id } = ids(q.get('profile'), q.get('reply'));
    await postproxy(comments(profile) + '/' + encodeURIComponent(id), { method: 'DELETE' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

const reread = (profile: string, id: string) => postproxy(comments(profile) + '/' + encodeURIComponent(id)).then(readReview).catch(() => null);
