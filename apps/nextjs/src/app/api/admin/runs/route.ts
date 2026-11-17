import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { InputError } from '@stakeout/core/grid';
import { redis } from '@stakeout/core/redis';
import { signedRead } from '@stakeout/core/r2';
import { parseEntries, REFUSED_KEY, type RefusedRun } from '@stakeout/core/runLog';

export const dynamic = 'force-dynamic';

/** Only keys the worker writes for a point's evidence: scans/<scan>/pin_<r>_<c>/<run>/(video.mp4|raw.tar.gz). */
const EVIDENCE_KEY = /^scans\/[\w-]{1,64}\/pin_\d{1,3}_\d{1,3}\/[0-9a-f]{12}\/(video\.mp4|raw\.tar\.gz)$/;

/**
 * GET /api/admin/runs — the newest rejected searches, with the worker's own summary of where the
 * time goes in a search (written to its health record every minute). GET ?file=<key> — a
 * short-lived link to one rejected search's video or bundle (only keys that are in the list).
 */
export async function GET(req: Request) {
  try {
    if ((await getAuthenticatedUser()).role !== 'ADMIN') throw new InputError('Admins only.', 403);
    const file = new URL(req.url).searchParams.get('file');
    if (file !== null) {
      const listed = parseEntries<RefusedRun>(await redis().lrange(REFUSED_KEY, 0, -1));
      if (!EVIDENCE_KEY.test(file) || !listed.some((r) => r.video === file || r.bundle === file)) throw new InputError('No such file.', 404);
      return new Response(null, {
        status: 307,
        headers: { Location: await signedRead(file), 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
      });
    }
    const [list, health] = await Promise.all([redis().lrange(REFUSED_KEY, 0, 99), redis().get('stakeout:health')]);
    let system: { runs?: unknown; duoplus?: unknown } | null = null;
    try {
      system = health ? JSON.parse(health) : null;
    } catch {
      system = null;
    }
    return Response.json({ at: new Date().toISOString(), refused: parseEntries<RefusedRun>(list), summary: system?.runs ?? null, duoplus: system?.duoplus ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
