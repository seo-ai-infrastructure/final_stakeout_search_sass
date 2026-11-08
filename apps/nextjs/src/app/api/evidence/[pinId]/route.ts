import { GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@stakeout/db';
import { r2, bucket } from '@stakeout/core/r2';
import { InputError } from '@stakeout/core/grid';
import { untarGz, readResultsPage, readLocalFinder, readAiOverview, rankIn } from '@stakeout/core/serpEvidence';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

/** Rebuilt pages per point, kept briefly so flipping between points is instant. */
const cache = new Map<string, { at: number; body: string }>();
const TTL = 10 * 60000;

/**
 * GET /api/evidence/:pinId[?share=token] — what the phone saw at one point, rebuilt from
 * its own evidence bundle: the results page, the Local Finder and the AI Overview, in
 * Google's order, ads labelled and never ranked. Same access rules as /api/proof.
 */
export async function GET(req: Request, c: { params: Promise<{ pinId: string }> }) {
  try {
    const share = new URL(req.url).searchParams.get('share');
    const scope = share ? { shareToken: share } : { userId: (await getAuthenticatedUser()).id };
    const pin = await db.gridPin.findFirst({
      where: { id: (await c.params).pinId, scan: scope },
      include: { scan: { select: { targetBusiness: true } } },
    });
    if (!pin?.dumpsTarUrl) throw new InputError('Evidence unavailable for this point.', 404);
    let key = pin.dumpsTarUrl;
    if (key.startsWith('https://')) key = decodeURIComponent(new URL(key).pathname.slice(1));
    if (!key.startsWith('scans/' + pin.scanId + '/')) throw new InputError('Evidence unavailable for this point.', 404);

    const hit = cache.get(pin.id);
    if (hit && Date.now() - hit.at < TTL) return reply(hit.body);

    const obj = await r2().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const files = untarGz(await obj.Body!.transformToByteArray());
    const read = (name: string) => {
      for (const [path, data] of files) if (path.endsWith('/' + name)) return data.toString('utf8');
      return null;
    };
    const serp = read('serp.xml'), finder = read('final.xml'), aio = read('aio_expanded.xml');
    const resultsPage = serp ? readResultsPage(serp) : null;
    // Capture-only template extras: the first screen, its manifest and its timestamped event log.
    const first = read('first_screen.xml');
    let capture: Record<string, string> | null = null;
    try {
      const c = read('capture.json');
      capture = c ? JSON.parse(c) : null;
    } catch {
      capture = null;
    }
    const events = (read('events.tsv') ?? '')
      .split('\n')
      .slice(1)
      .map((l) => l.split('\t'))
      .filter((x) => x.length >= 2 && x[1])
      .slice(-40)
      .map(([time, event]) => ({ time, event }));
    const localFinder = finder ? readLocalFinder(finder) : [];
    const aiOverview = aio ? readAiOverview(aio) : null;
    const target = pin.scan.targetBusiness;
    const body = JSON.stringify({
      pinId: pin.id,
      resultsPage,
      firstScreen: first ? readResultsPage(first) : null,
      capture,
      events,
      localFinder,
      aiOverview,
      ranks: {
        pack: resultsPage ? rankIn(resultsPage.pack, target) : null,
        finder: rankIn(localFinder, target),
        ai: aiOverview ? rankIn(aiOverview.businesses, target) : null,
      },
    });
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    cache.set(pin.id, { at: Date.now(), body });
    return reply(body);
  } catch (e) {
    return errorResponse(e);
  }
}

const reply = (body: string) =>
  new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=600' } });
