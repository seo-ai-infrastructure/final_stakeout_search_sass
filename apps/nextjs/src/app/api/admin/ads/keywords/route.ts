import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { InputError } from '@stakeout/core/grid';
import { redis } from '@stakeout/core/redis';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser } from '@/lib/auth';
import { ADS_API, adsConfigured, keywordPrices, placeFor } from '@/lib/googleAds';

export const maxDuration = 60;

/**
 * POST /api/admin/ads/keywords (admins only, read-only): Google Ads Keyword Planner's monthly
 * searches and top-of-page bids for up to 50 searches in one place.
 *   { keywords: ["car accident lawyer", ...], location: "Huntington, New York" | placeId: "1023191", language?: "en" | "es" }
 * Answers are kept a day: Google's figures are monthly, and each lookup counts against the daily quota.
 */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    if (u.role !== 'ADMIN') throw new InputError('Admins only.', 403);
    if (!adsConfigured()) throw new InputError('Google Ads is not set up: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN and GOOGLE_ADS_CUSTOMER_ID on Vercel.', 503);
    const b = (await req.json().catch(() => ({}))) as { keywords?: unknown; location?: unknown; placeId?: unknown; language?: unknown };
    const keywords = [...new Set((Array.isArray(b.keywords) ? b.keywords : []).map((k) => String(k).trim().toLowerCase()).filter(Boolean))].slice(0, 50);
    if (!keywords.length) throw new InputError('Give at least one search in "keywords".', 400);
    const language = b.language === 'es' ? 'es' : 'en';
    const place = typeof b.placeId === 'string' && /^\d+$/.test(b.placeId)
      ? { id: b.placeId, name: b.placeId, type: '', canonical: b.placeId }
      : typeof b.location === 'string' && b.location.trim()
        ? await placeFor(b.location.trim())
        : null;
    if (!place) throw new InputError('Give a "location" Google knows (e.g. "Huntington, New York") or a numeric "placeId".', 400);

    const key = 'stakeout:ads:kw:' + createHash('sha256').update(JSON.stringify([ADS_API, place.id, language, [...keywords].sort()])).digest('hex').slice(0, 32);
    const kept = await redis().get(key).catch(() => null);
    if (kept) return NextResponse.json({ ...JSON.parse(kept), cached: true });
    const results = await keywordPrices(keywords, place.id, language);
    const out = { version: ADS_API, place, language, results, at: new Date().toISOString() };
    await redis().set(key, JSON.stringify(out), 'EX', 86_400).catch(() => null);
    return NextResponse.json(out);
  } catch (e) {
    return errorResponse(e);
  }
}
