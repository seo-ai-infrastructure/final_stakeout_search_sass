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

/** GET /api/admin/gbp/media?profile=&location=: the listing's cover and logo, its newest photos, and how many it has. */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await read(await gate(q.get('profile'), q.get('location'), 'manage')));
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/admin/gbp/media { profile, location, url, category }: adds a photo. Google fetches it
 * itself from `url`, which must be a public https link to an image. A cover or logo replaces the
 * one the listing has. Answers with the listing's photos as they are afterwards.
 */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { profile?: unknown; location?: unknown; url?: unknown; category?: unknown };
    const t = await gate(b.profile, b.location, 'manage');
    const url = String(b.url ?? '').trim();
    let ok = false;
    try { const u = new URL(url); ok = u.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname) && u.hostname.includes('.'); } catch { /* not a link */ }
    if (!ok || url.length > 2000) throw new InputError('Give a public https link to the image. Google downloads it from there itself.');
    const category = CATEGORIES.includes(String(b.category)) ? String(b.category) : 'ADDITIONAL';
    await postproxy(gbpPath(t.profile, 'create_media'), { method: 'POST', body: { location_id: t.location, media_url: url, category } });
    return NextResponse.json({ added: category, ...(await read(t)) });
  } catch (e) {
    return errorResponse(e);
  }
}
