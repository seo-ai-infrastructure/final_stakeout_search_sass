import { GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@stakeout/db';
import { r2, bucket } from '@stakeout/core/r2';
import { InputError } from '@stakeout/core/grid';
import { untarGz, readResultsPage, readLocalFinder, readAiOverview, readAiCopy, uiLabels, rankIn, sameBusiness, isLocalFinder, isMapsList, readMapsList } from '@stakeout/core/serpEvidence';
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
    const events = (read('events.tsv') ?? read('rpa_events.tsv') ?? '')
      .split('\n')
      .slice(1)
      .map((l) => l.split('\t'))
      .filter((x) => x.length >= 2 && x[1])
      .slice(-40)
      .map(([time, event]) => ({ time, event }));
    // A Maps app point: the results list rebuilt from every screen, in the order they were taken.
    const maps = isMapsList(finder)
      ? readMapsList([
          ...[...files]
            .filter(([path]) => /(^|\/)dump_\d+\.xml$/.test(path))
            .sort((a, b) => Number(/dump_(\d+)/.exec(a[0])![1]) - Number(/dump_(\d+)/.exec(b[0])![1]))
            .map(([, data]) => data.toString('utf8')),
          finder,
        ])
      : null;
    const mapsYou = maps?.find((c) => !c.ad && sameBusiness(c.name, pin.scan.targetBusiness)) ?? null;
    const localFinder = finder && !maps ? readLocalFinder(finder) : [];
    const aiOverview = aio ? readAiOverview(aio) : null;
    const target = pin.scan.targetBusiness;
    // The copied AI Overview counts only if it matches this run's own AI Overview snapshot.
    const copied = read('aio_copy.txt');
    const snapshotText = [aio, read('aio_initial.xml'), serp].filter(Boolean).flatMap((x) => uiLabels(x!).map((l) => l.label));
    const aiCopy = copied ? readAiCopy(copied, snapshotText) : null;
    const aiCopyRank = aiCopy?.verified ? (aiCopy.businesses.find((b) => sameBusiness(b.name, target))?.pos ?? null) : null;
    const body = JSON.stringify({
      pinId: pin.id,
      resultsPage,
      finderShown: finder ? isLocalFinder(finder) : null,
      firstScreen: first ? readResultsPage(first) : null,
      capture,
      events,
      localFinder,
      maps,
      mapsAdsAbove: maps ? maps.filter((c) => c.ad && (!mapsYou || c.listPos < mapsYou.listPos)).length : null,
      aiOverview,
      aiCopy,
      ranks: {
        maps: maps ? (mapsYou?.pos ?? null) : null,
        pack: resultsPage ? rankIn(resultsPage.pack, target) : null,
        finder: rankIn(localFinder, target),
        ai: aiCopy?.verified ? aiCopyRank : aiOverview ? rankIn(aiOverview.businesses, target) : null,
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
