import { gunzipSync, gzipSync } from 'node:zlib';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@stakeout/db';
import { r2, bucket, put } from '@stakeout/core/r2';
import { cardsBeforeExpansion, uiLabels, untarGz } from '@stakeout/core/serpEvidence';
import { AIO_CAPTURE_VERSION, aiPresence, buildAioCapture, captureDigest, type WatcherFacts } from '@stakeout/core/aioCapture';
import type { AioDossier } from '@stakeout/core/aioSources';

const keyOf = (v: string) => (v.startsWith('https://') ? decodeURIComponent(new URL(v).pathname.slice(1)) : v);
async function fetchR2(key: string): Promise<Uint8Array> {
  const obj = await r2().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return obj.Body!.transformToByteArray();
}

/**
 * Points whose page read is kept (the AI Overview watch's aio-sources file) get their capture built
 * again with the current rules, from what was stored: the page read, Google's copied answer and the
 * first screen in the evidence bundle. No search is run. The capture file and the point's admin
 * summary are replaced (proxyMeta.aioSources.capture); nothing a customer sees changes. Each point
 * is replayed once per capture version.
 */
export async function replayAioCaptures(limit = 40) {
  const pins = await db.$queryRaw<{ id: string; scanId: string; dumpsTarUrl: string | null; hasAiOverview: boolean; rankFound: number | null; keyword: string; target: string; kgmid: string | null; domain: string | null; role: string }[]>`
    SELECT p.id, p."scanId", p."dumpsTarUrl", p."hasAiOverview", p."rankFound", s.keyword, s."targetBusiness" AS target, s."targetKgmid" AS kgmid, s."targetDomain" AS domain, u.role
    FROM "GridPin" p JOIN "GridScan" s ON s.id = p."scanId" JOIN "User" u ON u.id = s."userId"
    WHERE p.status = 'COMPLETED' AND p."proxyMeta"->'aioSources'->>'key' IS NOT NULL
      AND COALESCE(p."proxyMeta"->'aioSources'->'capture'->>'capture_version', '') <> ${AIO_CAPTURE_VERSION}
      AND COALESCE(p."proxyMeta"->'aioSources'->'capture'->>'replay_failed', '') <> ${AIO_CAPTURE_VERSION}
    ORDER BY p."updatedAt" DESC
    LIMIT ${limit}`;
  if (!pins.length) return;
  let done = 0;
  for (const p of pins) {
    const row = await db.gridPin.findUnique({ where: { id: p.id }, select: { proxyMeta: true, insights: true } });
    const meta = (row?.proxyMeta as Record<string, unknown> | null) ?? {};
    const kept = (meta.aioSources as Record<string, unknown> | undefined) ?? {};
    try {
      const readKey = String(kept.key);
      if (!readKey.startsWith('scans/' + p.scanId + '/')) throw new Error('page read outside its scan');
      const dossier = JSON.parse(gunzipSync(await fetchR2(readKey)).toString('utf8')) as AioDossier;
      let copy: string | null = null,
        initial: string | null = null;
      const shots: string[] = [];
      if (p.dumpsTarUrl) {
        const files = untarGz(await fetchR2(keyOf(p.dumpsTarUrl)));
        const read = (name: string) => {
          for (const [path, data] of files) if (path === name || path.endsWith('/' + name)) return data.toString('utf8');
          return null;
        };
        copy = read('aio_copy.txt');
        initial = read('aio_initial.xml');
        for (const [path, data] of files) if (/(^|\/)(aio_.*|serp)\.xml$/.test(path)) shots.push(data.toString('utf8'));
      }
      const was = (kept.capture as Record<string, unknown> | undefined) ?? undefined;
      const tele = (was?.telemetry as Partial<WatcherFacts> | undefined) ?? {};
      const telemetry: WatcherFacts = {
        capture_version: AIO_CAPTURE_VERSION,
        resolved_via_warmup_tab: Boolean(tele.resolved_via_warmup_tab),
        warmup_tab_listed_url: tele.warmup_tab_listed_url ?? null,
        reads_succeeded: tele.reads_succeeded ?? Number(kept.reads ?? 0),
        reads_missed: tele.reads_missed ?? 0,
        first_read_ms: tele.first_read_ms ?? null,
        last_valid_read_ms: tele.last_valid_read_ms ?? null,
        stop_reason: tele.stop_reason ?? 'template_finished',
      };
      const capture = buildAioCapture(dossier, {
        keyword: p.keyword,
        targetDomain: p.domain,
        targetBusinessId: p.kgmid,
        targetName: p.target,
        mapPackRank: (was?.map_pack_rank as number | null | undefined) ?? p.rankFound,
        copy,
        overviewOnScreen: p.hasAiOverview,
        shownBeforeExpansion: cardsBeforeExpansion(initial),
        telemetry,
        scanPointId: p.id,
        copyCheck: shots.flatMap((x) => uiLabels(x).map((l) => l.label)),
      });
      const captureKey = typeof was?.key === 'string' && was.key.startsWith('scans/' + p.scanId + '/') ? was.key : readKey.replace(/aio-sources\.json\.gz$/, 'aio-capture.json.gz');
      await put(captureKey, gzipSync(JSON.stringify(capture)), 'application/gzip');
      kept.capture = { key: captureKey, ...captureDigest(capture), replayed_at: new Date().toISOString(), replayed_from: was?.capture_version ?? null };
      // An admin's own point also gets the four flags, so its pages can be checked (customers' points
      // wait for the backfill, after its dry run).
      const ins = (row?.insights as { ai?: Record<string, unknown> } | null) ?? null;
      const insights = p.role === 'ADMIN' && ins?.ai ? { ...ins, ai: { ...ins.ai, presence: aiPresence(capture) } } : undefined;
      await db.gridPin.update({ where: { id: p.id }, data: { proxyMeta: { ...meta, aioSources: kept } as object, ...(insights ? { insights: insights as object } : {}) } });
      done++;
      const t = capture;
      console.log(
        `[aio-replay] ${p.id} "${p.keyword}": ${t.capture_status}, ${t.overview_mode}${t.telemetry.copy_used ? ' (copy used)' : ''} · target (${t.target_identity ?? 'not found'}): featured ${t.target_featured_in_aio}` +
          (t.target_featured_placement ? ` (${t.target_featured_placement.kind === 'card' ? 'card #' + t.target_featured_placement.card_position + (t.target_featured_placement.after_expansion ? ' after expansion' : '') : 'inline recommendation'})` : '') +
          `, named ${t.target_named_in_prose}, listing cited as a source ${t.target_listing_cited_as_source}, website cited ${t.target_website_cited} · ${t.counts.featured_businesses_count} featured, ${t.counts.named_businesses_count} in the answer, ${t.counts.ads_count} ad(s)`,
      );
    } catch (e) {
      console.warn('[aio-replay]', p.id, 'not replayed:', (e as Error).message.slice(0, 160));
      // Not tried again for this version (a missing file stays missing).
      kept.capture = { ...((kept.capture as object) ?? {}), replay_failed: AIO_CAPTURE_VERSION };
      await db.gridPin.update({ where: { id: p.id }, data: { proxyMeta: { ...meta, aioSources: kept } as object } }).catch(() => {});
    }
  }
  console.log(`[aio-replay] ${done} of ${pins.length} point(s) rebuilt with ${AIO_CAPTURE_VERSION}`);
}
