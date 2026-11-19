import { NextResponse } from 'next/server';
import { db } from '@stakeout/db';
import { errorResponse } from '@/lib/api';
import { gbpAdmin, readLocation, target } from '@/lib/gbpAdmin';
import { everything, get } from '@/lib/gbpExtras';
import { rivalListings, rivalsConfigured } from '@/lib/rivals';
import { ACTION_TYPES } from '@stakeout/core/gbpExtras';
import { findGaps, topRivals } from '@stakeout/core/gbpGaps';

export const maxDuration = 60;

/**
 * GET /api/admin/gbp/gaps?profile=&location=&lookup=1 (admins only): what this listing is missing.
 * Always: the yes/no attributes it has not answered, Google's own services for its categories that
 * are not on it, and the kinds of booking link it has none of. With a finished scan of the same
 * business: its top rivals there (three, going down the list when a listing cannot be found), and (once the rival lookup is set up) what their listings
 * have that this one lacks, including the additional categories they use, with each rival's
 * description, hours, review make-up and recent Google posts. Rival listings are only
 * looked up, and paid for, when lookup=1; otherwise what was kept from the last 14 days is used.
 * Read-only: nothing on the listing is changed here.
 */
export async function GET(req: Request) {
  try {
    await gbpAdmin();
    const q = new URL(req.url).searchParams;
    const t = target(q.get('profile'), q.get('location'));
    const loc = await readLocation(t.profile, t.location);
    const x = await everything(t, loc);

    // The newest finished scan of a business with this name (any account: this page is for admins).
    const scan = loc.title
      ? await db.gridScan.findFirst({ where: { targetBusiness: { equals: loc.title, mode: 'insensitive' }, completedPins: { gt: 0 } }, orderBy: { createdAt: 'desc' }, select: { id: true, keyword: true, createdAt: true, centerLat: true, centerLng: true } })
      : null;
    const top = scan ? topRivals(await db.gridPin.findMany({ where: { scanId: scan.id, status: 'COMPLETED' }, select: { status: true, topCompetitors: true } }) as { status: string; topCompetitors: string[] | null }[], loc.title ?? '') : [];
    const listings = scan && top.length ? await rivalListings(top.map((r) => r.name), scan.centerLat, scan.centerLng, q.get('lookup') === '1') : { rivals: [], missing: [], waiting: 0, problem: null, lookedUp: 0 };

    // A rival's category that came back as a name only is matched to Google's own list for its id.
    const region = String(loc.storefrontAddress?.regionCode ?? 'US');
    const ids = new Map<string, string>();
    for (const r of listings.rivals)
      for (const c of r.categories) {
        if (c.id || !c.name) continue;
        const k = c.name.toLowerCase();
        if (!ids.has(k)) {
          const found = await get<{ categories?: { name: string; displayName?: string }[] }>(t, 'available_location_categories', { region_code: region, language_code: 'en', filter: 'displayName=' + c.name.replace(/[^\p{L}\p{N} &'-]/gu, ' ').trim(), page_size: '20' }).catch(() => null);
          ids.set(k, found?.categories?.find((x) => (x.displayName ?? '').toLowerCase() === k)?.name.replace(/^categories\/gcid:/, '') ?? '');
        }
        c.id = ids.get(k) ?? '';
      }

    const gaps = findGaps({
      primaryCategory: loc.categories?.primaryCategory?.name,
      additionalCategories: (loc.categories?.additionalCategories ?? []).map((c) => c.name),
      categoryNames: [loc.categories?.primaryCategory, ...(loc.categories?.additionalCategories ?? [])].map((c) => c?.displayName ?? '').filter(Boolean),
      attributes: x.attributes.list,
      suggestedServices: x.services.canEdit ? x.services.suggested : [],
      services: x.services.list,
      links: x.links.list,
      linkTypes: x.links.types,
    }, listings.rivals, ACTION_TYPES);
    return NextResponse.json({
      gaps,
      scan: scan ? { id: scan.id, keyword: scan.keyword, at: scan.createdAt } : null,
      top,
      rivals: listings.rivals.map((r) => ({ name: r.name, categories: r.categories.map((c) => c.name), services: r.services, attributes: r.attributes.length, photos: r.photos, rating: r.rating, reviews: r.reviews, facts: r.facts, posts: r.posts })),
      you: { description: (loc.profile?.description ?? '').length, categories: 1 + (loc.categories?.additionalCategories ?? []).length, attributes: x.attributes.list.filter((a) => (Array.isArray(a.value) ? a.value.length > 0 : a.value !== null)).length, services: x.services.list.length },
      missing: listings.missing,
      lookup: { ready: rivalsConfigured(), problem: listings.problem, lookedUp: listings.lookedUp, waiting: listings.waiting },
      current: { additionalCategories: loc.categories?.additionalCategories ?? [] },
      problems: [x.attributes.problem, x.services.problem, x.links.problem].filter(Boolean),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
