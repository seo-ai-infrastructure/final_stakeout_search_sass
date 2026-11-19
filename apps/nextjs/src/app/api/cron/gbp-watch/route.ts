import { redis } from '@stakeout/core/redis';
import { postproxyConfigured } from '@/lib/postproxy';
import { checkAllListings } from '@/lib/gbpWatch';
import { sweepUnpaid } from '@/lib/gbpUnpaid';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * The daily listing check (the site's own schedule, vercel.json): reads every Google listing,
 * compares it with what we last knew, and emails the admins anything that changed without us.
 * It runs at most once every six hours however often it is called, and says only how the run went.
 * With CRON_SECRET set on Vercel, only Vercel's scheduler can start it.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== 'Bearer ' + secret) return Response.json({ error: 'Not allowed.' }, { status: 401 });
  if (!postproxyConfigured()) return Response.json({ skipped: 'not set up' });
  const first = await redis().set('stakeout:gbpwatch:ran', '1', 'EX', 6 * 3600, 'NX').catch(() => null);
  if (!first) return Response.json({ skipped: 'already ran in the last six hours' });
  try {
    // First, connections nobody is paying for are settled, so the check below does not read them.
    const unpaid = await sweepUnpaid().catch((e) => { console.error('[gbp-unpaid] sweep failed:', (e as Error).message); return null; });
    const { listings, fresh, changed, found, problems } = await checkAllListings();
    return Response.json({ listings, fresh, changed, found, problems, unpaid });
  } catch (e) {
    console.error('[gbp-watch] run failed:', (e as Error).message);
    return Response.json({ error: 'The check did not finish.' }, { status: 500 });
  }
}
