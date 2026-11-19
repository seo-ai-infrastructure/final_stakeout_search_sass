import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { gate } from '@/lib/gbpAccess';
import { readLocation } from '@/lib/gbpAdmin';
import { attributesOf, get } from '@/lib/gbpExtras';
import { postproxy } from '@/lib/postproxy';
import { nextHoliday } from '@stakeout/core/gbp';
import { readServices } from '@stakeout/core/gbpExtras';
import { readReview } from '@stakeout/core/gbpReviews';

export const maxDuration = 60;

const quiet = <T,>(p: Promise<T>) => p.catch(() => null);

/**
 * GET /api/admin/gbp/health?profile=&location=: how ready the listing is, at a glance. Reviews
 * waiting for an answer (among the newest 100), whether hours are set for the next holiday, how
 * many attributes and services it has, how many photos, and where it is on the map. Read-only.
 * Each part is read on its own: one Google refuses comes back null and the rest still show.
 */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const t = await gate(q.get('profile'), q.get('location'), 'manage');
    const today = new Date().toISOString().slice(0, 10);
    const [reviews, loc, point, attributes, services, photos] = await Promise.all([
      quiet(postproxy<{ total?: number; data?: unknown[] }>('/api/profiles/' + encodeURIComponent(t.profile) + '/comments', { query: { placement_id: t.location, page: '1', per_page: '100' } }).then((r) => {
        const list = (r.data ?? []).map(readReview).filter((x) => x !== null);
        return { unreplied: list.filter((x) => !x.reply).length, read: list.length, total: Number(r.total) || list.length };
      })),
      quiet(readLocation(t.profile, t.location)),
      // Where the listing is, for starting a scan from it. A business with no shown address may have none.
      quiet(get<{ latlng?: { latitude?: number; longitude?: number } }>(t, 'location', { read_mask: 'latlng' }).then((r) => (typeof r.latlng?.latitude === 'number' && typeof r.latlng?.longitude === 'number' ? { lat: r.latlng.latitude, lng: r.latlng.longitude } : null))),
      quiet(attributesOf(t).then((list) => ({ set: list.filter((a) => a.value !== null && a.value !== undefined && !(Array.isArray(a.value) && a.value.length === 0)).length, available: list.length }))),
      quiet(get<{ serviceItems?: unknown[] }>(t, 'service_list').then((r) => readServices(r.serviceItems ?? []).length)),
      quiet(get<{ totalMediaItemCount?: number; mediaItems?: unknown[] }>(t, 'media', { page_size: '1' }).then((r) => Number(r.totalMediaItemCount) || (r.mediaItems ?? []).length)),
    ]);
    return NextResponse.json({ reviews, holiday: loc ? nextHoliday(loc, today) : null, hoursKnown: Boolean(loc), attributes, services, photos, point });
  } catch (e) {
    return errorResponse(e);
  }
}
