import { settlePockets } from '@/lib/pocket';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Closes the pocket tests whose search is over: the buyer is emailed that the video is ready, or,
 * when the search failed for good, refunded and told so. Called by the worker the moment a pocket
 * test ends. Anyone may call it: it only acts on tests that are over, once each, and says nothing
 * but how many it closed.
 */
const handle = async () => Response.json(await settlePockets().catch((e) => (console.error('[pocket] settle failed:', (e as Error).message), { told: 0 })));
export const GET = handle;
export const POST = handle;
