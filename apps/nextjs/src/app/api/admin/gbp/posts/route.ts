import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@stakeout/db';
import { allow, gate, paidLocations } from '@/lib/gbpAccess';
import { postproxy } from '@/lib/postproxy';
import { BODY_MAX, emptyDraft, postProblem, postRequest, readPost, type GbpPost, type PostDraft } from '@stakeout/core/gbpPosts';
import { queuesOf } from '@/lib/gbpQueues';
import { buildPostRequest, draftProblem, EXTRA_OUTLETS, isExtraOutlet, OUTLET_NAME, type ListingOutlets } from '@stakeout/core/outlets';
import { forgetPostOwner, isPostOwner, outletsToSend, postsOwnedBy, recordPostOwner, saveTicksOff, type Tick } from '@/lib/outlets';

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
    if (q.get('all') === '1') return NextResponse.json(await everyPost());
    const t = await gate(q.get('profile'), q.get('location'), 'manage');
    if (q.get('stats')) return NextResponse.json(await statsOf(t, String(q.get('stats'))));
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
    // Posts made here for this listing that have no Google copy (sent to Facebook or LinkedIn only):
    // found through our own record of which listing each was made for.
    const have = new Set(posts.map((p) => p.id));
    const more = (await postsOwnedBy(t).catch(() => [])).filter((id) => !have.has(id)).slice(0, 40);
    await Promise.all(
      more.map(async (id) => {
        const p = readPost(await postproxy('/api/posts/' + encodeURIComponent(id)).catch(() => null), t.location);
        if (p && p.location === t.location) posts.push(p);
      }),
    );
    const waiting = posts.filter((p) => p.state === 'scheduled').sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const rest = posts.filter((p) => p.state !== 'scheduled').sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return NextResponse.json({ posts: [...waiting, ...rest] });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Every listing's posts in one list, for the calendar across listings: all connected accounts for
 * an admin; for a customer, the listings they have on a paid plan. Up to the newest 300 posts of
 * each account. Each post says which account it belongs to.
 */
async function everyPost() {
  const u = await getAuthenticatedUser();
  let profiles: string[];
  let allowed: Set<string> | null = null;
  if (u.role === 'ADMIN') {
    const all = await postproxy<{ data?: { id: string; platform: string }[] }>('/api/profiles');
    profiles = (all.data ?? []).filter((p) => p.platform === 'google_business').map((p) => p.id);
  } else {
    allowed = new Set((await paidLocations(u.id)).keys());
    const mine = await db.gbpAccount.findMany({ where: { userId: u.id, profileId: { not: null } }, select: { profileId: true } });
    profiles = allowed.size ? mine.map((a) => String(a.profileId)) : [];
  }
  const posts: (GbpPost & { profile: string })[] = [];
  const problems: string[] = [];
  await Promise.all(
    profiles.slice(0, 40).map(async (profile) => {
      try {
        for (let page = 1; page <= 3; page++) {
          const r = await postproxy<{ data?: unknown[] }>('/api/posts', { query: { profile_id: profile, 'platforms[]': 'google_business', per_page: '100', page: String(page), include_media: 'true' } });
          const rows = r.data ?? [];
          for (const raw of rows) {
            const p = readPost(raw);
            if (p && (!allowed || allowed.has(p.location))) posts.push({ ...p, profile });
          }
          if (rows.length < 100) break;
        }
      } catch (e) {
        problems.push(e instanceof Error ? e.message : 'Could not read an account’s posts.');
      }
    }),
  );
  posts.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return { posts, problems: [...new Set(problems)].slice(0, 3) };
}

/** The post as the service has it, when it is a Google post on this listing; otherwise it is unknown here. */
async function ownPost(t: { profile: string; location: string }, id: string) {
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(id)) throw new InputError('Unknown post.');
  const raw = await postproxy('/api/posts/' + encodeURIComponent(id)).catch(() => null);
  // By its Google copy; one with no Google copy, by our record of the listing it was made for.
  const post = readPost(raw) ?? ((await isPostOwner(id, t).catch(() => false)) ? readPost(raw, t.location) : null);
  if (!post || post.location !== t.location) throw new InputError('Unknown post.', 404);
  return post;
}

/**
 * What the service has recorded for up to ten of this listing's posts. Google gives no numbers for
 * a single post (no views, no clicks): what comes back is each post's state and whatever the
 * service did record. The listing's own calls and clicks are in its insights.
 */
async function statsOf(t: { profile: string; location: string }, list: string) {
  const ids = [...new Set(list.split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 10);
  if (!ids.length) throw new InputError('Name at least one post.');
  const posts = await Promise.all(ids.map((id) => ownPost(t, id)));
  type Stats = { data?: Record<string, { platforms?: { platform?: string; records?: { stats?: Record<string, unknown>; recorded_at?: string }[] }[] }> };
  const r = await postproxy<Stats>('/api/posts/stats', { query: { post_ids: ids.join(',') } }).catch(() => ({ data: {} }) as Stats);
  return {
    note: 'Google does not report views or clicks for a single post. For what the listing got (calls, website clicks, direction requests), read its insights for the days after a post went out.',
    posts: posts.map((p) => {
      const last = (r.data?.[p.id]?.platforms ?? []).find((x) => x.platform === 'google_business')?.records?.slice(-1)[0];
      return { id: p.id, state: p.state, at: p.at, error: p.error, permalink: p.permalink, stats: last?.stats && Object.keys(last.stats).length ? last.stats : null, recordedAt: last?.recorded_at ?? null };
    }),
  };
}

/**
 * POST /api/admin/gbp/posts (admins only) { profile, location, draft, queue, priority }: publishes
 * the post now, or schedules it. With `queue` (one of this account's posting queues) the queue
 * gives it its next open slot instead.
 */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { profile?: unknown; location?: unknown; draft?: unknown; queue?: unknown; priority?: unknown; outlets?: unknown; google?: unknown };
    const t = await gate(b.profile, b.location, 'manage');
    const draft = draftOf(b.draft);
    // Where it goes: Google unless left out, and the listing's Facebook Page and LinkedIn page when
    // asked (the other outlets, and leaving Google out, are for admins only for now).
    const google = b.google !== false;
    const asked = Array.isArray(b.outlets) ? b.outlets.map(String) : [];
    if ((asked.length || !google) && (process.env.NEXT_PUBLIC_OUTLETS === 'off' || t.u.role !== 'ADMIN')) throw new InputError('Posting to other networks is not open on this account yet.', 403);
    const send: ListingOutlets = asked.length ? await outletsToSend(t, asked) : {};
    const missing = asked.filter(isExtraOutlet).find((o) => !send[o]);
    if (missing) throw new InputError(`${OUTLET_NAME[missing]} is not connected for this listing.`);
    const problem = draftProblem(draft, google, send);
    if (problem) throw new InputError(problem);
    const body: Record<string, unknown> = buildPostRequest(draft, google ? { profile: t.profile, location: t.location } : null, send);
    if (b.queue !== undefined) {
      if (draft.scheduledAt) throw new InputError('A queued post takes the queue’s next slot: leave the time out.');
      const queue = (await queuesOf(t.u, t.profile)).find((x) => x.id === String(b.queue));
      if (!queue) throw new InputError('Unknown queue. list_queues shows the ones this account has.', 404);
      if (!queue.enabled) throw new InputError('That queue is paused.', 409);
      if (!queue.timeslots.length) throw new InputError('That queue has no time slots yet, so it cannot place a post.', 409);
      body.queue_id = queue.id;
      body.queue_priority = ['high', 'medium', 'low'].includes(String(b.priority)) ? String(b.priority) : 'medium';
    }
    const made = await postproxy<{ id?: string }>('/api/posts', { method: 'POST', body });
    // Which listing it was made for is written down, and the ticks are remembered for the next post.
    if (made?.id) await recordPostOwner(String(made.id), t).catch((e) => console.warn('[posts] owner not recorded:', (e as Error).message));
    if (t.u.role === 'ADMIN') {
      const off: Tick[] = [...(google ? [] : ['google_business' as const]), ...EXTRA_OUTLETS.filter((o) => !send[o])];
      await saveTicksOff(t, off).catch(() => {});
    }
    return NextResponse.json({ post: readPost(made, t.location) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * PATCH /api/admin/gbp/posts { profile, location, id, change }: edits a post that has not gone out
 * yet (scheduled, more than five minutes away). `change` holds only what differs: body, image,
 * scheduledAt, cta + ctaUrl, title, startDate, endDate.
 */
export async function PATCH(req: Request) {
  try {
    const b = (await req.json()) as { profile?: unknown; location?: unknown; id?: unknown; change?: unknown };
    const t = await gate(b.profile, b.location, 'manage');
    const post = await ownPost(t, String(b.id ?? ''));
    if (post.state !== 'scheduled' && post.state !== 'draft') throw new InputError('Only a post that has not gone out yet can be edited. To change a published one, remove it and post again.', 409);
    if (post.state === 'scheduled' && post.at && Date.parse(post.at) - Date.now() < 5 * 60000) throw new InputError('This post goes out in under five minutes, too late to edit.', 409);
    const c = (b.change && typeof b.change === 'object' ? b.change : {}) as Record<string, unknown>;
    const text = (k: string) => (typeof c[k] === 'string' ? (c[k] as string).trim() : undefined);
    const https = (v: string | undefined) => v === undefined || v === '' || /^https:\/\/\S+$/.test(v);
    const out: { post: Record<string, string>; platforms?: { google_business: Record<string, string> }; media?: string[] } = { post: {} };
    const limit = post.google ? BODY_MAX : 3000;
    const g: Record<string, string> = {};
    const words = text('body');
    if (words !== undefined) {
      if (!words) throw new InputError('The post needs some text.');
      if (words.length > limit) throw new InputError(`The post is ${words.length} characters; ${post.google ? 'Google' : 'this post'} allows ${limit}.`);
      out.post.body = words;
    }
    const at = text('scheduledAt');
    if (at !== undefined) {
      const ms = Date.parse(at);
      if (Number.isNaN(ms) || ms - Date.now() < 10 * 60000) throw new InputError('The new time must be at least ten minutes from now.');
      out.post.scheduled_at = new Date(ms).toISOString();
    }
    if (!https(text('image')) || !https(text('ctaUrl'))) throw new InputError('Links and images must be https addresses.');
    if (text('image') !== undefined) out.media = text('image') ? [text('image') as string] : [];
    const cta = text('cta');
    if (cta !== undefined) {
      if (!['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL'].includes(cta)) throw new InputError('Unknown button.');
      if (cta !== 'CALL' && !text('ctaUrl')) throw new InputError('Give the address the button goes to (ctaUrl).');
      g.cta_action_type = cta;
    }
    if (text('ctaUrl')) g.cta_url = text('ctaUrl') as string;
    if (text('title')) g.event_title = text('title') as string;
    for (const [k, to] of [['startDate', 'event_start_date'], ['endDate', 'event_end_date']] as const) {
      const v = text(k);
      if (v === undefined) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new InputError('Dates are written YYYY-MM-DD.');
      g[to] = v;
    }
    if (Object.keys(g).length && !post.google) throw new InputError('This post is not on Google, so it has no button, title or dates to change.');
    if (Object.keys(g).length) out.platforms = { google_business: g };
    if (!Object.keys(out.post).length && !out.platforms && !out.media) throw new InputError('Say what to change: body, image, scheduledAt, cta, ctaUrl, title, startDate or endDate.');
    const made = await postproxy('/api/posts/' + encodeURIComponent(post.id), { method: 'PATCH', body: out });
    return NextResponse.json({ post: readPost(made, t.location) ?? (await ownPost(t, post.id)) });
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
    const raw = await postproxy<{ platforms?: { platform?: string; status?: string; params?: { location_id?: unknown } }[] }>('/api/posts/' + encodeURIComponent(id)).catch(() => null);
    if (u.role !== 'ADMIN') {
      // A customer may only take down a post on one of their own paid listings: the post says which listing it is on.
      const g = raw?.platforms?.find((p) => p.platform === 'google_business');
      const profile = String(q.get('profile') ?? ''), location = String(g?.params?.location_id ?? '');
      if (!g || !location) throw new InputError('Unknown post.', 404);
      await allow(u, profile, location, 'manage');
    }
    // A published post is taken down everywhere it went, in one request. When that is refused as a
    // whole, each place is asked on its own, so one that cannot take a post down is named and the
    // rest still go.
    const notes: string[] = [];
    const everywhere = q.get('google') === '1';
    const one = '/api/posts/' + encodeURIComponent(id);
    const label = (x?: string) => (x === 'google_business' ? 'Google' : isExtraOutlet(x) ? OUTLET_NAME[x] : String(x ?? 'One outlet'));
    try {
      await postproxy(one, { method: 'DELETE', query: { delete_on_platform: everywhere ? 'true' : undefined } });
    } catch (e) {
      if (!everywhere) throw e;
      const started: string[] = [];
      for (const p of (raw?.platforms ?? []).filter((x) => x.status === 'published')) {
        await postproxy(one + '/delete_on_platform', { method: 'POST', body: { network: p.platform } }).then(
          () => started.push(label(p.platform)),
          (err) => notes.push(`${label(p.platform)} could not take it down (${err instanceof Error ? err.message : 'refused'}): remove it there by hand.`),
        );
      }
      if (started.length) {
        // Those take a moment to finish, so the post stays listed here until they have.
        notes.unshift(`Being taken down from ${started.join(' and ')}.`);
        notes.push('Press Remove again in a minute to clear it from this list.');
        return NextResponse.json({ ok: true, notes });
      }
      await postproxy(one, { method: 'DELETE' });
      notes.push('It is cleared from this list.');
    }
    await forgetPostOwner(id).catch(() => 0);
    return NextResponse.json({ ok: true, notes });
  } catch (e) {
    return errorResponse(e);
  }
}
