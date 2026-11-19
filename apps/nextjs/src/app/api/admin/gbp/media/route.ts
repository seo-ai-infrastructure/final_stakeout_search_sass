import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gate } from '@/lib/gbpAccess';
import { get } from '@/lib/gbpExtras';
import { postproxy, gbpPath } from '@/lib/postproxy';

export const maxDuration = 60;

type Item = { name?: string; mediaFormat?: string; locationAssociation?: { category?: string }; googleUrl?: string; thumbnailUrl?: string; createTime?: string };
/** The places a photo can be filed under. Cover, logo and profile hold one photo each: a new one replaces it. */
const CATEGORIES = ['COVER', 'LOGO', 'PROFILE', 'EXTERIOR', 'INTERIOR', 'PRODUCT', 'AT_WORK', 'TEAMS', 'ADDITIONAL'];
const pic = (m: Item | undefined) => (m?.googleUrl ? { name: String(m.name ?? ''), url: m.googleUrl, thumb: m.thumbnailUrl ?? m.googleUrl, added: m.createTime ?? null } : null);

async function read(t: { profile: string; location: string }) {
  const r = await get<{ mediaItems?: Item[]; totalMediaItemCount?: number }>(t, 'media', { page_size: '100' });
  const items = r.mediaItems ?? [];
  const of = (c: string) => pic(items.find((m) => m.locationAssociation?.category === c));
  return {
    total: Number(r.totalMediaItemCount) || items.length,
    cover: of('COVER'), logo: of('LOGO') ?? of('PROFILE'),
    // The newest few of the rest, to see what the listing shows.
    recent: items.filter((m) => !['COVER', 'LOGO', 'PROFILE'].includes(m.locationAssociation?.category ?? '')).slice(0, 8).map(pic).filter((x) => x !== null),
  };
}

/** Every photo and video the listing has (the first 100), each with the name it is removed by and where it is filed. */
async function all(t: { profile: string; location: string }) {
  const r = await get<{ mediaItems?: Item[]; totalMediaItemCount?: number }>(t, 'media', { page_size: '100' });
  const items = r.mediaItems ?? [];
  return {
    total: Number(r.totalMediaItemCount) || items.length,
    media: items.filter((m) => m.name).map((m) => ({ name: String(m.name), category: m.locationAssociation?.category ?? 'ADDITIONAL', format: m.mediaFormat ?? 'PHOTO', url: m.googleUrl ?? null, added: m.createTime ?? null })),
  };
}

/**
 * GET /api/admin/gbp/media?profile=&location=: the listing's cover and logo, its newest photos, and
 * how many it has. With all=1: every item, with its name and category.
 */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const t = await gate(q.get('profile'), q.get('location'), 'manage');
    return NextResponse.json(q.get('all') === '1' ? await all(t) : await read(t));
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/admin/gbp/media { profile, location, url, category, format, description }: adds a photo
 * (or, with format "VIDEO", a video). Google fetches it
 * itself from `url`, which must be a public https link to an image. A cover or logo replaces the
 * one the listing has. Answers with the listing's photos as they are afterwards.
 */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { profile?: unknown; location?: unknown; url?: unknown; category?: unknown; format?: unknown; description?: unknown };
    const t = await gate(b.profile, b.location, 'manage');
    const url = String(b.url ?? '').trim();
    let ok = false;
    try { const u = new URL(url); ok = u.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname) && u.hostname.includes('.'); } catch { /* not a link */ }
    if (!ok || url.length > 2000) throw new InputError('Give a public https link to the image. Google downloads it from there itself.');
    const category = CATEGORIES.includes(String(b.category)) ? String(b.category) : 'ADDITIONAL';
    const video = String(b.format).toUpperCase() === 'VIDEO';
    // A cover, logo or profile picture is always a photo.
    if (video && ['COVER', 'LOGO', 'PROFILE'].includes(category)) throw new InputError('A cover or logo has to be a photo.');
    const description = typeof b.description === 'string' ? b.description.trim().slice(0, 2000) : '';
    await postproxy(gbpPath(t.profile, 'create_media'), { method: 'POST', body: { location_id: t.location, media_url: url, category, ...(video ? { media_format: 'VIDEO' } : {}), ...(description ? { description } : {}) } });
    return NextResponse.json({ added: category, format: video ? 'VIDEO' : 'PHOTO', ...(await read(t)) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * DELETE /api/admin/gbp/media?profile=&location=&name=: takes one photo or video off the listing
 * for good. `name` is the item's own, from the list, and has to belong to this listing.
 */
export async function DELETE(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const t = await gate(q.get('profile'), q.get('location'), 'manage');
    const name = String(q.get('name') ?? '');
    if (!name.startsWith(t.location + '/media/') || !/^[A-Za-z0-9_\-/]{10,300}$/.test(name)) throw new InputError('Unknown photo.');
    await postproxy(gbpPath(t.profile, 'delete_media'), { method: 'DELETE', query: { location_id: t.location, media_name: name } });
    return NextResponse.json({ removed: name, ...(await all(t)) });
  } catch (e) {
    return errorResponse(e);
  }
}
