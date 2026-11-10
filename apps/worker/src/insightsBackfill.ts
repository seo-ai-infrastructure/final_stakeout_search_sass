import { GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@stakeout/db';
import { r2, bucket } from '@stakeout/core/r2';
import { untarGz } from '@stakeout/core/serpEvidence';
import { buildPinInsights } from '@stakeout/core/pinInsights';

/**
 * Points finished before insights existed get them once, read from their stored evidence bundle.
 * Runs in the background after the worker starts; a point that fails is retried at the next start.
 */
export async function backfillInsights(limit = 500) {
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
      const insights = buildPinInsights({
        serp: read('serp.xml'),
        finder: read('final.xml'),
        aiExpanded: read('aio_expanded.xml'),
        aiCopy: read('aio_copy.txt'),
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
