import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gbpAdmin, target } from '@/lib/gbpAdmin';
import { postproxy, gbpPath } from '@/lib/postproxy';
import { dailySeries, keywordTrends, latestSnapshot, monthsOf } from '@stakeout/core/gbpInsights';
import { exploreRange } from '@stakeout/core/googleExplore';

export const maxDuration = 60;

type Row = Record<string, unknown>;
const said = (e: unknown) => (e instanceof Error ? e.message : 'Not available.');
const DAY = 86400000;

/**
 * GET /api/admin/gbp/insights?profile=&location=&days= (or &from=&to=) (admins only): Google's own
 * numbers for the listing over a range and the same number of days before it, day by day (calls,
 * website clicks, direction requests, views by where they were, messages, bookings), and the
 * searches that showed it month by month across the months the range touches. Read-only. Each
 * half is fetched on its own, so a listing Google gives no keywords for still shows its numbers.
 */
export async function GET(req: Request) {
  try {
    await gbpAdmin();
    const q = new URL(req.url).searchParams;
    const t = target(q.get('profile'), q.get('location'));
    // Google's listing numbers run about two days behind.
    const range = exploreRange({ days: q.get('days') ?? 30, from: q.get('from') ?? undefined, to: q.get('to') ?? undefined }, new Date(), 2);
    if (typeof range === 'string') throw new InputError(range);
    const profile = '/api/profiles/' + encodeURIComponent(t.profile);
    // One request covers both ranges where it can: the service gives at most 366 days at a time.
    const earliest = new Date(Date.parse(range.recent.to + 'T00:00:00Z') - 365 * DAY).toISOString().slice(0, 10);
    const from = range.before.from < earliest ? earliest : range.before.from;
    const months = monthsOf(range.recent.from, range.recent.to);

    const [performance, keywords] = await Promise.all([
      (async () => {
        const daily = await postproxy<{ data?: { records?: Row[] } }>(profile + '/daily_stats', { query: { placement_id: t.location, from, to: range.recent.to } });
        const records = daily.data?.records ?? [];
        const series = dailySeries(records, range.recent.from, range.recent.to);
        if (series.known.length) return { kind: 'daily' as const, ...series };
        // No daily figures (yet): the newest snapshot of trailing 30-day totals, if there is one.
        const snaps = await postproxy<{ data?: { records?: Row[] } }>(profile + '/stats', { query: { placement_id: t.location } });
        const snap = latestSnapshot(snaps.data?.records ?? []);
        if (snap) return { kind: 'snapshot' as const, ...snap };
        // Names only, never values: enough to see in the log what the service sent when nothing could be read.
        if (records[0]) console.info('[gbp] daily_stats fields not recognised:', Object.keys(records[0]).join(','), '| platform_stats:', Object.keys((records[0].platform_stats as Row) ?? {}).join(','));
        return { kind: 'none' as const };
      })().catch((e) => ({ kind: 'problem' as const, problem: said(e) })),
      postproxy<{ months?: Parameters<typeof keywordTrends>[0] }>(gbpPath(t.profile, 'search_keywords'), { query: { location_id: t.location, from_month: months.from, to_month: months.to } })
        .then((r) => ({ ...keywordTrends(r.months ?? []), problem: null as string | null }))
        .catch((e) => ({ rows: [], months: [], problem: said(e) })),
    ]);
    return NextResponse.json({ range, performance, keywords });
  } catch (e) {
    return errorResponse(e);
  }
}
