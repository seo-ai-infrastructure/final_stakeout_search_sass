import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { gbpAdmin, target } from '@/lib/gbpAdmin';
import { postproxy, gbpPath } from '@/lib/postproxy';
import { comparePeriods, latestSnapshot, topKeywords } from '@stakeout/core/gbpInsights';

export const maxDuration = 60;

type Row = Record<string, unknown>;
const said = (e: unknown) => (e instanceof Error ? e.message : 'Not available.');

/**
 * GET /api/admin/gbp/insights?profile=&location= (admins only): the listing's last 30 days against
 * the 30 before (views, calls, website clicks, directions), and the searches that showed it over
 * the last three complete months. Read-only. Each half is fetched on its own, so a listing Google
 * gives no keywords for still shows its numbers, and the other way round.
 */
export async function GET(req: Request) {
  try {
    await gbpAdmin();
    const q = new URL(req.url).searchParams;
    const t = target(q.get('profile'), q.get('location'));
    const day = (ago: number) => new Date(Date.now() - ago * 86400000).toISOString().slice(0, 10);
    const to = day(1);
    const profile = '/api/profiles/' + encodeURIComponent(t.profile);

    const [performance, keywords] = await Promise.all([
      (async () => {
        const daily = await postproxy<{ data?: { records?: Row[] } }>(profile + '/daily_stats', { query: { placement_id: t.location, from: day(60), to } });
        const records = daily.data?.records ?? [];
        const periods = comparePeriods(records, to);
        if (periods.known.length) return { kind: 'daily' as const, to, ...periods };
        // No daily figures (yet): the newest snapshot of trailing 30-day totals, if there is one.
        const snaps = await postproxy<{ data?: { records?: Row[] } }>(profile + '/stats', { query: { placement_id: t.location } });
        const snap = latestSnapshot(snaps.data?.records ?? []);
        if (snap) return { kind: 'snapshot' as const, ...snap };
        // Names only, never values: enough to see in the log what the service sent when nothing could be read.
        if (records[0]) console.info('[gbp] daily_stats fields not recognised:', Object.keys(records[0]).join(','), '| platform_stats:', Object.keys((records[0].platform_stats as Row) ?? {}).join(','));
        return { kind: 'none' as const };
      })().catch((e) => ({ kind: 'problem' as const, problem: said(e) })),
      postproxy<{ months?: Parameters<typeof topKeywords>[0] }>(gbpPath(t.profile, 'search_keywords'), { query: { location_id: t.location } })
        .then((r) => ({ ...topKeywords(r.months ?? []), problem: null as string | null }))
        .catch((e) => ({ rows: [], months: [], problem: said(e) })),
    ]);
    return NextResponse.json({ performance, keywords });
  } catch (e) {
    return errorResponse(e);
  }
}
