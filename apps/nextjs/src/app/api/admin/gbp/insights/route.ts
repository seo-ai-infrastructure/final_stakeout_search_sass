import { NextResponse } from 'next/server';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gate } from '@/lib/gbpAccess';
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
    const q = new URL(req.url).searchParams;
    const t = await gate(q.get('profile'), q.get('location'), 'free');
    // Google's listing numbers run about two days behind.
    // Google keeps 18 months of a listing's numbers, so that is how far back a connected listing can be read from day one.
    const range = exploreRange({ days: q.get('days') ?? 30, from: q.get('from') ?? undefined, to: q.get('to') ?? undefined }, new Date(), 2, 18);
    if (typeof range === 'string') throw new InputError(range);
    const profile = '/api/profiles/' + encodeURIComponent(t.profile);
    // The range and the one before it, as far back as Google keeps (18 months). The service gives at
    // most 366 days at a time, so a long stretch is read in pieces.
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const end = Date.parse(range.recent.to + 'T00:00:00Z');
    const earliest = day(Date.now() - 18 * 30.5 * DAY);
    const from = range.before.from < earliest ? earliest : range.before.from;
    const pieces: { from: string; to: string }[] = [];
    for (let to = end; day(to) >= from && pieces.length < 3; to -= 366 * DAY) pieces.push({ from: day(Math.max(Date.parse(from + 'T00:00:00Z'), to - 365 * DAY)), to: day(to) });
    const months = monthsOf(range.recent.from, range.recent.to, 18);
    // Search terms come twelve months at a time.
    const year = (m: string, back: number) => { const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7); };
    const spans = months.from < year(months.to, 11) ? [{ from: months.from, to: year(months.to, 12) }, { from: year(months.to, 11), to: months.to }] : [months];

    const [performance, keywords] = await Promise.all([
      (async () => {
        const parts = await Promise.all(pieces.map((p) => postproxy<{ data?: { records?: Row[] } }>(profile + '/daily_stats', { query: { placement_id: t.location, from: p.from, to: p.to } })));
        const records = parts.flatMap((d) => d.data?.records ?? []);
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
      Promise.all(spans.map((m) => postproxy<{ months?: Parameters<typeof keywordTrends>[0] }>(gbpPath(t.profile, 'search_keywords'), { query: { location_id: t.location, from_month: m.from, to_month: m.to } })))
        .then((r) => ({ ...keywordTrends(r.flatMap((x) => x.months ?? [])), problem: null as string | null }))
        .catch((e) => ({ rows: [], months: [], problem: said(e) })),
    ]);
    return NextResponse.json({ range, performance, keywords });
  } catch (e) {
    return errorResponse(e);
  }
}
