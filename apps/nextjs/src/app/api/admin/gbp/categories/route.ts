import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gate } from '@/lib/gbpAccess';
import { postproxy, gbpPath, categoryFilter } from '@/lib/postproxy';
import { readLocation } from '@/lib/gbpAdmin';

/**
 * GET /api/admin/gbp/categories?profile=&location=&region=&q= (admins only): Google's categories
 * whose name contains `q`, for the region the business is in. Categories are sent to Google by
 * their id, never by a typed name. With full=1 each category comes with the services and the named
 * hour sets Google offers for it, and the region is the listing's own when none is given.
 */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const t = await gate(q.get('profile'), q.get('location'), 'manage');
    const text = String(q.get('q') ?? '').replace(/[^\p{L}\p{N} &'-]/gu, '').trim().slice(0, 60);
    if (text.length < 2) throw new InputError('Type at least two letters.');
    const full = q.get('full') === '1';
    const own = /^[A-Z]{2}$/.test(String(q.get('region'))) ? String(q.get('region')) : full ? String((await readLocation(t.profile, t.location).catch(() => null))?.storefrontAddress?.regionCode ?? '') : '';
    const region = /^[A-Z]{2}$/.test(own) ? own : 'US';
    type Cat = { name: string; displayName?: string; serviceTypes?: { serviceTypeId?: string; displayName?: string }[]; moreHoursTypes?: { hoursTypeId?: string; displayName?: string }[] };
    const r = await postproxy<{ categories?: Cat[] }>(gbpPath(t.profile, 'available_location_categories'), {
      query: { location_id: t.location, region_code: region, language_code: 'en', filter: categoryFilter(text), page_size: '20', view: full ? 'FULL' : undefined },
    });
    return NextResponse.json({
      region,
      categories: (r.categories ?? []).map((c) => ({
        name: c.name, displayName: c.displayName ?? c.name,
        ...(full ? { services: (c.serviceTypes ?? []).map((x) => ({ typeId: x.serviceTypeId ?? '', name: x.displayName ?? '' })).filter((x) => x.typeId), moreHours: (c.moreHoursTypes ?? []).map((x) => String(x.hoursTypeId ?? '')).filter(Boolean) } : {}),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
