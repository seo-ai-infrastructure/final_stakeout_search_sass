import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser } from '@/lib/auth';
import { allow, gate } from '@/lib/gbpAccess';
import { postproxy } from '@/lib/postproxy';
import { emptyDraft, postProblem, postRequest, readPost, type GbpPost, type PostDraft } from '@stakeout/core/gbpPosts';

export const maxDuration = 60;

/** The draft from a request: only the fields a post has, each as text. */
function draftOf(v: unknown): PostDraft {
  const d = emptyDraft() as Record<string, string>;
  if (v && typeof v === 'object') for (const k of Object.keys(d)) if (typeof (v as Record<string, unknown>)[k] === 'string') d[k] = (v as Record<string, string>)[k];
  return d as PostDraft;
}

/**
 * GET /api/admin/gbp/posts?profile=&location= (admins only): this listing's posts sent from here,
 * the scheduled ones first (soonest on top), then the rest, newest first. The service lists a
 * connected account's posts together, so up to the newest 300 are looked through.
 */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const t = await gate(q.get('profile'), q.get('location'), 'manage');
    const posts: GbpPost[] = [];
    for (let page = 1; page <= 3; page++) {
      const r = await postproxy<{ total?: number; data?: unknown[] }>('/api/posts', { query: { profile_id: t.profile, 'platforms[]': 'google_business', per_page: '100', page: String(page), include_media: 'true' } });
      const rows = r.data ?? [];
      for (const raw of rows) {
        const p = readPost(raw);
        if (p && p.location === t.location) posts.push(p);
      }
      if (rows.length < 100) break;
    }
    const waiting = posts.filter((p) => p.state === 'scheduled').sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const rest = posts.filter((p) => p.state !== 'scheduled').sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return NextResponse.json({ posts: [...waiting, ...rest] });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/admin/gbp/posts (admins only) { profile, location, draft }: publishes the post now, or schedules it. */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { profile?: unknown; location?: unknown; draft?: unknown };
    const t = await gate(b.profile, b.location, 'manage');
    const draft = draftOf(b.draft);
    const problem = postProblem(draft);
    if (problem) throw new InputError(problem);
    const made = await postproxy('/api/posts', { method: 'POST', body: postRequest(draft, t.profile, t.location) });
    return NextResponse.json({ post: readPost(made) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * DELETE /api/admin/gbp/posts?id=&google=1 cancels a scheduled post, or with
 * google=1 also takes a published one off the listing.
 */
export async function DELETE(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    const q = new URL(req.url).searchParams;
    const id = String(q.get('id') ?? '');
    if (!/^[A-Za-z0-9_-]{3,80}$/.test(id)) throw new InputError('Unknown post.');
    if (u.role !== 'ADMIN') {
      // A customer may only take down a post on one of their own paid listings: the post says which listing it is on.
      const raw = await postproxy<{ platforms?: { platform?: string; params?: { location_id?: unknown } }[] }>('/api/posts/' + encodeURIComponent(id)).catch(() => null);
      const g = raw?.platforms?.find((p) => p.platform === 'google_business');
      const profile = String(q.get('profile') ?? ''), location = String(g?.params?.location_id ?? '');
      if (!g || !location) throw new InputError('Unknown post.', 404);
      await allow(u, profile, location, 'manage');
    }
    await postproxy('/api/posts/' + encodeURIComponent(id), { method: 'DELETE', query: { delete_on_platform: q.get('google') === '1' ? 'true' : undefined } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
