import { getSettings } from '@stakeout/core/settings';

export const dynamic = 'force-dynamic';

/** What the sign-in page needs to know before anyone is signed in: whether new accounts are open. */
export async function GET() {
  const s = await getSettings().catch(() => null);
  return Response.json({ signupsOpen: Boolean(s?.signupsOpen) }, { headers: { 'Cache-Control': 'no-store' } });
}
