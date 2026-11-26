import { flushAlerts } from '@/lib/alerts';
import { settlePockets } from '@/lib/pocket';

export const dynamic = 'force-dynamic';

/**
 * Sends the queued alerts. Called by the worker when it queues one and once a day by the site's own
 * schedule (vercel.json). Anyone may call it: it only sends what the worker and the site queued,
 * to the admins, and says nothing but how many went out.
 */
const handle = async () => {
  // Also the pocket tests that ended without the worker saying so (a stopped scan, a missed call): once a day at the least.
  await settlePockets().catch((e) => console.error('[pocket] settle failed:', (e as Error).message));
  return Response.json(await flushAlerts().catch((e) => (console.error('[alert] flush failed:', (e as Error).message), { sent: 0 })));
};
export const GET = handle;
export const POST = handle;
