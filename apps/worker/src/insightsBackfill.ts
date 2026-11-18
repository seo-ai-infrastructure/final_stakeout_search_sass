import { GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@stakeout/db';
import { r2, bucket } from '@stakeout/core/r2';
import { untarGz, rankWithoutFinder } from '@stakeout/core/serpEvidence';
import { metrics } from '@stakeout/core/grid';
import { buildPinInsights, verifiedAiParts } from '@stakeout/core/pinInsights';

/**
 * Points finished before insights existed get them once, read from their stored evidence bundle.
 * Runs in the background after the worker starts; a point that fails is retried at the next start.
 */
export async function backfillInsights(limit = 500) {
  // Maps points read before the list merge kept an advertiser's own listing apart from its ad
  // (their stored position could be one too low) are cleared once, so they are rebuilt below.
  await db.$executeRaw`
    UPDATE "GridPin" p SET insights = NULL FROM "GridScan" s
    WHERE s.id = p."scanId" AND s."targetType" = 'mobile_maps' AND p.insights IS NOT NULL AND p.insights->>'m' IS NULL`;
  // Points with an AI Overview read before the copy reader found businesses named without a
  // Google link (the AI's list could be missing names, which shifts everyone's place in it) are
  // cleared once too.
  await db.$executeRaw`
    UPDATE "GridPin" p SET insights = NULL
    WHERE p.insights IS NOT NULL AND p.insights->'ai'->>'shown' = 'true' AND p.insights->>'c' IS NULL AND p."dumpsTarUrl" IS NOT NULL`;
  const pins = await db.$queryRaw<{ id: string; scanId: string; dumpsTarUrl: string; target: string }[]>`
    SELECT p.id, p."scanId", p."dumpsTarUrl", s."targetBusiness" AS target
    FROM "GridPin" p JOIN "GridScan" s ON s.id = p."scanId"
    WHERE p.status = 'COMPLETED' AND p.insights IS NULL AND p."dumpsTarUrl" IS NOT NULL
    ORDER BY p."updatedAt" DESC
    LIMIT ${limit}`;
  if (!pins.length) return;
  let done = 0,
    failed = 0,
    missing = 0;
  for (const p of pins) {
    try {
      let key = p.dumpsTarUrl;
      if (key.startsWith('https://')) key = decodeURIComponent(new URL(key).pathname.slice(1));
      const obj = await r2().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const files = untarGz(await obj.Body!.transformToByteArray());
      const read = (name: string) => {
        for (const [path, data] of files) if (path === name || path.endsWith('/' + name)) return data.toString('utf8');
        return null;
      };
      const dumps = [...files]
        .filter(([path]) => /(^|\/)dump_\d+\.xml$/.test(path))
        .sort((a, b) => Number(/dump_(\d+)/.exec(a[0])![1]) - Number(/dump_(\d+)/.exec(b[0])![1]))
        .map(([, data]) => data.toString('utf8'));
      const insights = buildPinInsights({
        serp: read('serp.xml'),
        finder: read('final.xml'),
        aiExpanded: read('aio_expanded.xml'),
        aiCopy: read('aio_copy.txt'),
        aiSnapshots: [read('aio_initial.xml')],
        mapsScreens: [...dumps, read('final.xml')],
        target: p.target,
      });
      await db.gridPin.update({ where: { id: p.id }, data: { insights } });
      done++;
    } catch (e) {
      const err = e as Error & { name?: string };
      if (err.name === 'NoSuchKey' || /specified key does not exist/i.test(err.message)) {
        // The bundle is gone (older scans): record that, so it is not retried at every start.
        await db.gridPin.update({ where: { id: p.id }, data: { insights: { v: 0, unavailable: 'bundle_missing' } } }).catch(() => {});
        missing++;
        continue;
      }
      failed++;
      console.error('[insights] backfill', p.id, err.message);
    }
  }
  console.log(
    `[insights] backfilled ${done} of ${pins.length} point(s)` +
      (missing ? ` · ${missing} without a stored bundle` : '') +
      (failed ? ` · ${failed} failed, retried next start` : ''),
  );
}

/**
 * Points saved as "no local results" before the worker read the results page's own map pack
 * (when no Local Finder opened) are re-read once from their stored bundle. A point whose page
 * did hold a map pack, or an AI Overview list, gets its rank and competitor list, and its scan's
 * headline numbers are recomputed the same way they were first computed. Each point is checked
 * once (proxyMeta.packChecked), whatever the outcome.
 */
export async function backfillPackRanks(limit = 200) {
  const pins = await db.$queryRaw<{ id: string; scanId: string; dumpsTarUrl: string; target: string; was: string }[]>`
    SELECT p.id, p."scanId", p."dumpsTarUrl", s."targetBusiness" AS target, p."proxyMeta"->>'rankFrom' AS was
    FROM "GridPin" p JOIN "GridScan" s ON s.id = p."scanId"
    WHERE s."targetType" = 'mobile_chrome' AND p.status = 'COMPLETED'
      AND p."proxyMeta"->>'finderShown' = 'false' AND p."dumpsTarUrl" IS NOT NULL
      AND ((p."rankFound" IS NULL AND p."proxyMeta"->>'rankFrom' = 'none' AND p."proxyMeta"->>'packChecked' IS NULL)
        -- Points ranked from an AI Overview's list before single-business panels were read (and again
        -- once the panel without its tab strip was): checked once for one.
        OR (p."proxyMeta"->>'rankFrom' = 'ai_overview_list' AND p."proxyMeta"->>'soloChecked2' IS NULL))
    LIMIT ${limit}`;
  if (!pins.length) return;
  let fixed = 0;
  const scans = new Set<string>();
  for (const p of pins) {
    let found: ReturnType<typeof rankWithoutFinder> | null = null;
    try {
      let key = p.dumpsTarUrl;
      if (key.startsWith('https://')) key = decodeURIComponent(new URL(key).pathname.slice(1));
      const obj = await r2().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const files = untarGz(await obj.Body!.transformToByteArray());
      const read = (name: string) => {
        for (const [path, data] of files) if (path === name || path.endsWith('/' + name)) return data.toString('utf8');
        return null;
      };
      const serp = read('serp.xml'),
        final = read('final.xml');
      found = rankWithoutFinder([serp, final], [read('aio_expanded.xml'), read('aio_initial.xml'), serp, final], p.target);
    } catch (e) {
      const err = e as Error & { name?: string };
      // A bundle that is gone cannot be re-read: mark the point checked. Anything else is retried next time.
      if (!(err.name === 'NoSuchKey' || /specified key does not exist/i.test(err.message))) {
        console.error('[rank] re-read', p.id, err.message);
        continue;
      }
    }
    const current = await db.gridPin.findUnique({ where: { id: p.id }, select: { proxyMeta: true } });
    const meta = { ...((current?.proxyMeta as Record<string, unknown> | null) ?? {}), packChecked: true, soloChecked: true, soloChecked2: true };
    if (found && found.from !== 'none' && found.from !== p.was) {
      await db.gridPin.update({ where: { id: p.id }, data: { rankFound: found.rank, topCompetitors: found.list, proxyMeta: { ...meta, rankFrom: found.from } } });
      scans.add(p.scanId);
      fixed++;
    } else await db.gridPin.update({ where: { id: p.id }, data: { proxyMeta: meta } });
  }
  for (const scanId of scans) {
    const completed = await db.gridPin.findMany({ where: { scanId, status: 'COMPLETED' }, select: { rankFound: true, hasAiOverview: true, targetCitedInAi: true } });
    await db.gridScan.update({ where: { id: scanId }, data: metrics(completed) });
  }
  console.log(`[rank] re-read ${pins.length} point(s) saved as "no local results": ${fixed} had a map pack or AI list and were corrected` + (scans.size ? ` · ${scans.size} scan(s) recomputed` : ''));
}

/**
 * Points with an AI Overview read before answers were split into three parts (opening answer,
 * business cards, other citations) get the parts once, from their stored bundle. Only the parts
 * are written (null when no copy of that run's answer could be read); the rest of the point's
 * insights stay as they are.
 */
export async function backfillAiParts(limit = 300) {
  const pins = await db.$queryRaw<{ id: string; dumpsTarUrl: string }[]>`
    SELECT p.id, p."dumpsTarUrl" FROM "GridPin" p
    WHERE p.status = 'COMPLETED' AND p."dumpsTarUrl" IS NOT NULL AND p.insights IS NOT NULL
      AND p.insights->'ai'->>'shown' = 'true' AND NOT (p.insights->'ai' ? 'parts')
    ORDER BY p."updatedAt" DESC
    LIMIT ${limit}`;
  if (!pins.length) return;
  let read = 0,
    unreadable = 0,
    failed = 0;
  for (const p of pins) {
    let parts: ReturnType<typeof verifiedAiParts> = null;
    try {
      let key = p.dumpsTarUrl;
      if (key.startsWith('https://')) key = decodeURIComponent(new URL(key).pathname.slice(1));
      const obj = await r2().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const files = untarGz(await obj.Body!.transformToByteArray());
      const file = (name: string) => {
        for (const [path, data] of files) if (path === name || path.endsWith('/' + name)) return data.toString('utf8');
        return null;
      };
      parts = verifiedAiParts(file('aio_copy.txt'), [file('serp.xml'), file('aio_expanded.xml'), file('aio_initial.xml')]);
    } catch (e) {
      const err = e as Error & { name?: string };
      // A bundle that is gone cannot be read: recorded as unreadable. Anything else is retried next time.
      if (!(err.name === 'NoSuchKey' || /specified key does not exist/i.test(err.message))) {
        failed++;
        console.error('[insights] AI parts', p.id, err.message);
        continue;
      }
    }
    await db.$executeRaw`UPDATE "GridPin" SET insights = jsonb_set(insights, '{ai,parts}', ${JSON.stringify(parts)}::jsonb) WHERE id = ${p.id}`;
    if (parts) read++;
    else unreadable++;
  }
  console.log(`[insights] AI answers split into three parts: ${read} of ${pins.length}` + (unreadable ? ` · ${unreadable} without a readable copy` : '') + (failed ? ` · ${failed} failed, retried next time` : ''));
}
