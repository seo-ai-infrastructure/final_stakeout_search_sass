import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gbpAdmin, target } from '@/lib/gbpAdmin';
import { postproxy, gbpPath } from '@/lib/postproxy';

/**
 * GET /api/admin/gbp/categories?profile=&location=&region=&q= (admins only): Google's categories
 * whose name contains `q`, for the region the business is in. Categories are sent to Google by
 * their id, never by a typed name.
 */
export async function GET(req: Request) {
  try {
    await gbpAdmin();
    const q = new URL(req.url).searchParams;
    const t = target(q.get('profile'), q.get('location'));
    const text = String(q.get('q') ?? '').replace(/[^\p{L}\p{N} &'-]/gu, '').trim().slice(0, 60);
    const region = /^[A-Z]{2}$/.test(String(q.get('region'))) ? String(q.get('region')) : 'US';
    if (text.length < 2) throw new InputError('Type at least two letters.');
    const r = await postproxy<{ categories?: { name: string; displayName?: string }[] }>(gbpPath(t.profile, 'available_location_categories'), {
      query: { location_id: t.location, region_code: region, language_code: 'en', filter: 'displayName=' + text, page_size: '20' },
    });
    return NextResponse.json({ categories: (r.categories ?? []).map((c) => ({ name: c.name, displayName: c.displayName ?? c.name })) });
  } catch (e) {
    return errorResponse(e);
  }
}
