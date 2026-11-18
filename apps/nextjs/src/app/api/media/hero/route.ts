import { signedRead } from '@stakeout/core/r2';
import { HERO_VIDEO_KEY } from '@stakeout/core/heroVideo';

export const dynamic = 'force-dynamic';

/** The home page's recording: a short-lived address for that one stored video (it plays from storage). */
export async function GET() {
  try {
    return new Response(null, { status: 307, headers: { Location: await signedRead(HERO_VIDEO_KEY), 'Cache-Control': 'private, max-age=1800' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
