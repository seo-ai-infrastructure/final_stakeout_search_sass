import { grantPlanMonths } from '@/lib/gbpBilling';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * The daily run for yearly plans (vercel.json): each yearly subscription whose next month has come
 * gets that month's phone sessions and brief credits (grantPlanMonths; a month counts once however
 * often this runs). An account that signs in first gets them then. With CRON_SECRET set on Vercel,
 * only Vercel's scheduler can start it.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== 'Bearer ' + secret) return Response.json({ error: 'Not allowed.' }, { status: 401 });
  try {
    return Response.json({ months: await grantPlanMonths() });
  } catch (e) {
    console.error('[plan-months] run failed:', (e as Error).message);
    return Response.json({ error: 'The run did not finish.' }, { status: 500 });
  }
}
