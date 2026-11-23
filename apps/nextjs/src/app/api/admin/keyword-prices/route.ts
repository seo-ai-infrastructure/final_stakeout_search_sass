import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { InputError } from '@stakeout/core/grid';
import { redis } from '@stakeout/core/redis';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser } from '@/lib/auth';
import { cleanKeywords, keywordIdeas, keywordPrices, placeOf } from '@/lib/keywordPrices';

export const maxDuration = 60;
const KEEP_S = 45 * 86400;

/**
 * POST /api/admin/keyword-prices (admins only): monthly searches and cost per click for up to 100
 * searches in one place, from DataForSEO's Google Ads keyword data.
 *   { keywords: ["car accident lawyer", ...], location: "Suffolk County,New York,United States" | 1023022, language?: "en" | "es", fresh?: true }
 *   ideas: true: Google's related searches around up to 20 of them instead, with their prices.
 *   alone: true: also ask up to 10 searches that came back empty again on their own ($0.09 each).
 * One paid request ($0.09) unless alone or ideas. Answers are kept 45 days: Google's figures are
 * monthly. fresh: true asks again.
 */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    if (u.role !== 'ADMIN') throw new InputError('Admins only.', 403);
    const b = (await req.json().catch(() => ({}))) as { keywords?: unknown; location?: unknown; language?: unknown; fresh?: unknown; ideas?: unknown; alone?: unknown };
    const { keywords, skipped } = cleanKeywords(b.keywords);
    if (!keywords.length) throw new InputError('Give at least one search in "keywords".', 400);
    const place = placeOf(b.location);
    if (!place) throw new InputError('Give a "location": a name like "Suffolk County,New York,United States", or a location code like 1023022.', 400);
    const language = b.language === 'es' ? 'es' : 'en';

    const ideas = b.ideas === true;
    const alone = !ideas && b.alone === true;
    const key = (ideas ? 'stakeout:kwp:ideas:v1:' : alone ? 'stakeout:kwp:alone:v1:' : 'stakeout:kwp:v1:') + createHash('sha256').update(JSON.stringify([place, language, [...keywords].sort()])).digest('hex').slice(0, 32);
    if (b.fresh !== true) {
      const kept = await redis().get(key).catch(() => null);
      if (kept) return NextResponse.json({ ...JSON.parse(kept), cached: true });
    }
    const answer = ideas ? { ...(await keywordIdeas(keywords, place, language)), complete: true } : await keywordPrices(keywords, place, language, { alone });
    const out = { source: 'dataforseo', place, language, ...answer, skipped, at: new Date().toISOString() };
    if (answer.complete) await redis().set(key, JSON.stringify(out), 'EX', KEEP_S).catch(() => null);
    return NextResponse.json(out);
  } catch (e) {
    return errorResponse(e);
  }
}
