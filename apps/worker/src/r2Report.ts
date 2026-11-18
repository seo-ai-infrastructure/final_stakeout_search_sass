/**
 * A dry run of an R2 clean-up: what the bucket holds, what the database still points at, and what a
 * clean-up would free. Read-only: nothing is deleted. The report goes to the logs and, in full, to
 * reports/r2-dry-run-<date>.json in the bucket.
 *
 * Every object under scans/<scan id>/ is one of:
 *  - kept: a point still points at it (its video, record, evidence bundle or saved page);
 *  - leftover: its scan exists but nothing points at it (an earlier try of a point that was run
 *    again, a page saved by a try that did not count, ...);
 *  - orphan: its scan was deleted.
 * Anything outside scans/ is listed as other.
 */
import { ListObjectsV2Command, type _Object } from '@aws-sdk/client-s3';
import { db } from '@stakeout/db';
import { r2, bucket, put } from '@stakeout/core/r2';
import { redis } from '@stakeout/core/redis';
import { kindOf, keyOf } from '@stakeout/core/storageKeys';

type Tally = { objects: number; bytes: number };
const add = (t: Tally, size: number) => {
  t.objects++;
  t.bytes += size;
};
const mb = (b: number) => Math.round(b / 1e5) / 10;

export async function r2DryRun() {
  const started = Date.now();
  // 1. What the database points at.
  const scans = new Set((await db.gridScan.findMany({ select: { id: true } })).map((s) => s.id));
  const pins = await db.$queryRaw<{ videoUrl: string | null; metaJsonUrl: string | null; dumpsTarUrl: string | null; pages: Record<string, Record<string, unknown> | null> | null }[]>`
    SELECT "videoUrl", "metaJsonUrl", "dumpsTarUrl", "proxyMeta"->'pages' AS pages FROM "GridPin"`;
  const kept = new Set<string>();
  for (const p of pins) {
    for (const k of [p.videoUrl, p.metaJsonUrl, p.dumpsTarUrl].map(keyOf)) if (k) kept.add(k);
    for (const snap of Object.values(p.pages ?? {})) for (const f of ['replay', 'html', 'mhtml']) if (snap && keyOf(snap[f])) kept.add(keyOf(snap[f])!);
  }
  // 2. Every object in the bucket.
  const all: _Object[] = [];
  let token: string | undefined;
  do {
    const page = await r2().send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }));
    all.push(...(page.Contents ?? []));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  // 3. Each object's class and kind.
  const total: Tally = { objects: 0, bytes: 0 };
  const byClass: Record<string, Tally> = {};
  const byKind: Record<string, Record<string, Tally>> = {};
  const leftoverScans = new Map<string, Tally>();
  const byMonth: Record<string, Tally> = {};
  const oldSnapshots: Tally = { objects: 0, bytes: 0 };
  const cutoff = Date.now() - 90 * 86400_000;
  for (const o of all) {
    const key = o.Key ?? '';
    const size = o.Size ?? 0;
    add(total, size);
    const m = /^scans\/([^/]+)\//.exec(key);
    const cls = !m ? 'other' : !scans.has(m[1]) ? 'orphan (scan deleted)' : kept.has(key) ? 'kept' : 'leftover (scan kept, nothing points at it)';
    add((byClass[cls] ??= { objects: 0, bytes: 0 }), size);
    const kind = m ? kindOf(key) : key.split('/')[0] + '/';
    add(((byKind[cls] ??= {})[kind] ??= { objects: 0, bytes: 0 }), size);
    if (m && cls.startsWith('leftover')) add(leftoverScans.get(m[1]) ?? (leftoverScans.set(m[1], { objects: 0, bytes: 0 }).get(m[1]) as Tally), size);
    const month = (o.LastModified ?? new Date()).toISOString().slice(0, 7);
    add((byMonth[month] ??= { objects: 0, bytes: 0 }), size);
    if (/\.mhtml\.gz$/.test(key) && (o.LastModified?.getTime() ?? Date.now()) < cutoff) add(oldSnapshots, size);
  }
  const topLeftovers = [...leftoverScans.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 10);
  const scanNames = new Map(
    (await db.gridScan.findMany({ where: { id: { in: topLeftovers.map(([id]) => id) } }, select: { id: true, keyword: true, targetBusiness: true, createdAt: true } })).map((s) => [s.id, s]),
  );
  const report = {
    at: new Date().toISOString(),
    bucket,
    seconds: Math.round((Date.now() - started) / 1000),
    total,
    byClass,
    byKind,
    byMonth,
    topLeftoverScans: topLeftovers.map(([id, t]) => ({ id, ...t, keyword: scanNames.get(id)?.keyword ?? null, business: scanNames.get(id)?.targetBusiness ?? null, created: scanNames.get(id)?.createdAt ?? null })),
    snapshotsOlderThan90Days: oldSnapshots,
  };
  // 4. The summary in the logs; the whole report in the bucket and for the admin page.
  console.log(`[r2] dry run (nothing deleted): ${total.objects} objects, ${mb(total.bytes)} MB in ${bucket}`);
  for (const [cls, t] of Object.entries(byClass)) {
    const kinds = Object.entries(byKind[cls] ?? {})
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([k, x]) => `${k} ${mb(x.bytes)} MB (${x.objects})`)
      .join(', ');
    console.log(`[r2]   ${cls}: ${t.objects} objects, ${mb(t.bytes)} MB · ${kinds}`);
  }
  for (const [id, t] of topLeftovers.slice(0, 5)) {
    const s = scanNames.get(id);
    console.log(`[r2]   most left over: ${s ? `"${s.keyword}" for ${s.targetBusiness}, ${s.createdAt.toISOString().slice(0, 10)}` : id}: ${t.objects} objects, ${mb(t.bytes)} MB`);
  }
  console.log(`[r2]   raw page snapshots older than 90 days: ${oldSnapshots.objects} objects, ${mb(oldSnapshots.bytes)} MB`);
  const name = 'reports/r2-dry-run-' + report.at.slice(0, 10) + '.json';
  await put(name, JSON.stringify(report, null, 1), 'application/json').catch((e) => console.warn('[r2] report not saved:', (e as Error).message));
  await redis()
    .set('stakeout:r2:report', JSON.stringify({ ...report, byKind: undefined, file: name }), 'EX', 30 * 86400)
    .catch(() => {});
  return report;
}

/** Once a day at most (R2_REPORT=false turns it off): the dry run, a few minutes after the worker starts. */
export async function r2DryRunDaily() {
  if (process.env.R2_REPORT === 'false') return;
  const ok = await redis()
    .set('stakeout:r2:report:ran', new Date().toISOString(), 'EX', 20 * 3600, 'NX')
    .catch(() => null);
  if (!ok) return;
  await r2DryRun().catch((e) => console.warn('[r2] dry run skipped:', (e as Error).message));
}
