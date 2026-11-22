import { gunzipSync } from 'node:zlib';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@stakeout/db';
import { r2, bucket } from '@stakeout/core/r2';
import { cardsBeforeExpansion, uiLabels, untarGz } from '@stakeout/core/serpEvidence';
import { AIO_CAPTURE_VERSION, aiPresence, buildAioCapture, noPageRead, NOT_WATCHED, readCopiedAnswer, type WatcherFacts } from '@stakeout/core/aioCapture';
import { placementText, presenceVisible, type AiPresenceData } from '@stakeout/core/aiFlags';
import type { AioDossier } from '@stakeout/core/aioSources';

const keyOf = (v: string) => (v.startsWith('https://') ? decodeURIComponent(new URL(v).pathname.slice(1)) : v);
const fetchR2 = async (key: string) => (await r2().send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body!.transformToByteArray();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const words = (s: string) => ' ' + s.toLowerCase().replace(/&/g, ' and ').replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const hasName = (text: string, name: string) => {
  const n = words(name).trim();
  return n.length >= 3 && words(text).includes(' ' + n + ' ');
};

type Cand = {
  id: string;
  scanId: string;
  dumpsTarUrl: string | null;
  old: boolean;
  rankFound: number | null;
  copied: boolean;
  readKey: string | null;
  tele: Partial<WatcherFacts> | null;
  aiText: string | null;
  keyword: string;
  target: string;
  kgmid: string | null;
  domain: string | null;
  userId: string;
  createdAt: Date;
  role: string;
};

/** The flags of a presence in a few characters, for the summary ("featured card #6 of 10 · named · listing · website (possible)"). */
const flagText = (p: AiPresenceData) =>
  [
    p.featured ? 'featured ' + placementText(p.featured) : null,
    p.named ? 'named' : null,
    p.listingCitedAsSource ? `listing cited (${p.listingCitedAsSource.links} link(s))` : (p.listingInSources ?? null) !== null ? `listing among the sources (#${p.listingInSources})` : null,
    p.websiteCited === 'verified' ? 'website cited' : p.websiteCited === 'unverified' ? 'possible website citation' : null,
    p.advertised ? 'ad' : null,
  ]
    .filter(Boolean)
    .join(' · ') || 'none';

/**
 * Older points read again with the role-aware capture, from the evidence each kept: Google's copied
 * answer (and the page read, on admin points that have one) in the point's bundle, checked against
 * its own snapshots. A point that kept neither has only its earlier single reading ("legacy").
 *
 * Dry run (the default, once per capture version): nothing on any point changes. What would change
 * is written to the Kept table (scope "aio-backfill", key "dry-run-<version>"): every point's earlier
 * reading against its four flags; each positive that goes and why (an ad, a source chip, a website
 * only possibly theirs, an answer that could not be read); the possible-website addresses for
 * review; and, where the business's saved Google ID or website was not on the scan, what they
 * would change. Pauses while a scan runs.
 */
export async function aioBackfill() {
  const runKey = 'dry-run-' + AIO_CAPTURE_VERSION;
  const already = await db.$queryRaw<{ key: string }[]>`SELECT key FROM "Kept" WHERE scope = 'aio-backfill' AND key = ${runKey}`;
  if (already.length) return;
  const cands = await db.$queryRaw<Cand[]>`
    SELECT p.id, p."scanId", p."dumpsTarUrl", p."targetCitedInAi" AS old, p."rankFound",
      (p."proxyMeta" ? 'aiLead') AS copied, p."proxyMeta"->'aioSources'->>'key' AS "readKey",
      p."proxyMeta"->'aioSources'->'capture'->'telemetry' AS tele, p."aiOverviewText" AS "aiText",
      s.keyword, s."targetBusiness" AS target, s."targetKgmid" AS kgmid, s."targetDomain" AS domain, s."userId", s."createdAt", u.role
    FROM "GridPin" p JOIN "GridScan" s ON s.id = p."scanId" JOIN "User" u ON u.id = s."userId"
    WHERE p.status = 'COMPLETED' AND p."hasAiOverview" = true
    ORDER BY s."createdAt" DESC, p."rowIdx", p."colIdx"`;
  const saved = await db.savedBusiness.findMany({ select: { userId: true, name: true, kgmid: true, domain: true } });
  const savedFor = (c: Cand) => saved.find((b) => b.userId === c.userId && words(b.name) === words(c.target)) ?? null;

  type Out = {
    pin: string;
    scan: string;
    keyword: string;
    business: string;
    owner: string;
    at: string;
    old: boolean;
    state: 'parsed' | 'unparsed' | 'legacy';
    appeared: boolean | null;
    flags: string;
    identity: string | null;
    change: 'kept' | 'gained' | 'lost' | 'still not' | 'unknown' | 'legacy';
    why: string[];
    possibleUrls: string[];
    withSaved: { identity: string | null; appeared: boolean | null; flags: string } | null;
  };
  const rows: Out[] = [];
  let read = 0;
  for (const c of cands) {
    const base = { pin: c.id, scan: c.scanId, keyword: c.keyword, business: c.target, owner: c.role === 'ADMIN' ? 'admin' : 'customer', at: c.createdAt.toISOString().slice(0, 16), old: c.old };
    if (!c.dumpsTarUrl || (!c.copied && !c.readKey)) {
      rows.push({ ...base, state: 'legacy', appeared: c.old, flags: '', identity: null, change: 'legacy', why: [c.dumpsTarUrl ? 'no copied answer or page read kept' : 'no evidence bundle'], possibleUrls: [], withSaved: null });
      continue;
    }
    // Out of the way of scans: wait (up to 30 minutes) while one runs.
    if (read++ % 10 === 0)
      for (let waited = 0; waited < 30 * 60000; waited += 30000) {
        const busy = await db.gridScan.count({ where: { status: 'RUNNING' } }).catch(() => 0);
        if (!busy) break;
        await sleep(30000);
      }
    try {
      const files = untarGz(await fetchR2(keyOf(c.dumpsTarUrl)));
      const file = (name: string) => {
        for (const [path, data] of files) if (path === name || path.endsWith('/' + name)) return data.toString('utf8');
        return null;
      };
      const shots = [...files].filter(([path]) => /(^|\/)aio_.*\.xml$/.test(path) || /(^|\/)serp\.xml$/.test(path)).map(([, data]) => data.toString('utf8'));
      const copy = file('aio_copy.txt');
      const dossier: AioDossier = c.readKey && c.readKey.startsWith('scans/' + c.scanId + '/') ? JSON.parse(gunzipSync(await fetchR2(c.readKey)).toString('utf8')) : noPageRead(c.keyword);
      const opts = {
        keyword: c.keyword,
        targetDomain: c.domain,
        targetBusinessId: c.kgmid,
        targetName: c.target,
        mapPackRank: c.rankFound,
        copy,
        copyCheck: shots.flatMap((x) => uiLabels(x).map((l) => l.label)),
        overviewOnScreen: true,
        shownBeforeExpansion: cardsBeforeExpansion(file('aio_initial.xml')),
        telemetry: c.readKey && c.tele ? ({ ...NOT_WATCHED, ...c.tele, capture_version: AIO_CAPTURE_VERSION } as WatcherFacts) : NOT_WATCHED,
        scanPointId: c.id,
      };
      const capture = buildAioCapture(dossier, opts);
      const p = aiPresence(capture);
      const appeared = p.status === 'parsed' ? presenceVisible(p) : null;
      const change: Out['change'] = appeared === null ? 'unknown' : c.old ? (appeared ? 'kept' : 'lost') : appeared ? 'gained' : 'still not';
      const why: string[] = [];
      if (appeared === null) why.push(copy ? 'unparsed: the copied answer is not this page’s answer' : 'unparsed: no copied answer');
      else if (change === 'lost') {
        // Where the earlier reading (its name anywhere in the AI panel's text) found it.
        const sponsored = copy ? readCopiedAnswer(copy).sponsored : [];
        const lines = (c.aiText ?? '').split('\n').filter((l) => hasName(l, c.target));
        if (p.websiteCited === 'unverified') why.push('its website is cited, but only possibly its own (not confirmed)');
        if (sponsored.some((l) => hasName(l, c.target)) || p.advertised) why.push('named in the ads (Sponsored), not the answer');
        if (lines.some((l) => /\(\+\d+\)|related results/i.test(l))) why.push('named on a source chip, not in the answer');
        if (!why.length) why.push(lines.length ? 'its name was in other text of the AI panel: “' + lines[0].slice(0, 90) + '”' : 'not in the answer, its cards or its sources');
      } else if (change === 'gained') why.push(flagText(p));
      // The business's saved Google ID or website, when the scan was made without it.
      const sb = savedFor(c);
      let withSaved: Out['withSaved'] = null;
      if (sb && ((sb.kgmid && !c.kgmid) || (sb.domain && !c.domain))) {
        const alt = aiPresence(buildAioCapture(dossier, { ...opts, targetBusinessId: c.kgmid ?? sb.kgmid, targetDomain: c.domain ?? sb.domain }));
        withSaved = { identity: alt.identity, appeared: alt.status === 'parsed' ? presenceVisible(alt) : null, flags: alt.status === 'parsed' ? flagText(alt) : 'unparsed' };
      }
      rows.push({
        ...base,
        state: p.status === 'parsed' ? 'parsed' : 'unparsed',
        appeared,
        flags: p.status === 'parsed' ? flagText(p) : '',
        identity: p.identity,
        change,
        why,
        possibleUrls: [...new Set((p.evidence ?? []).filter((e) => e.flag === 'website_possible' && e.url).map((e) => e.url as string))].slice(0, 4),
        withSaved,
      });
    } catch (e) {
      rows.push({ ...base, state: 'unparsed', appeared: null, flags: '', identity: null, change: 'unknown', why: ['not read: ' + (e as Error).message.slice(0, 120)], possibleUrls: [], withSaved: null });
    }
  }

  const count = (f: (r: Out) => boolean) => rows.filter(f).length;
  const lostWhy = new Map<string, number>();
  for (const r of rows) if (r.change === 'lost' || (r.change === 'unknown' && r.old)) for (const w of r.why) lostWhy.set(w.replace(/: “.*$/, ''), (lostWhy.get(w.replace(/: “.*$/, '')) ?? 0) + 1);
  const scans = new Map<string, Out[]>();
  for (const r of rows) scans.set(r.scan, [...(scans.get(r.scan) ?? []), r]);
  const summary = {
    version: AIO_CAPTURE_VERSION,
    at: new Date().toISOString(),
    points: rows.length,
    reread: count((r) => r.state === 'parsed'),
    unparsed: count((r) => r.state === 'unparsed'),
    legacy: count((r) => r.state === 'legacy'),
    byOwner: { admin: count((r) => r.owner === 'admin' && r.state !== 'legacy'), customer: count((r) => r.owner === 'customer' && r.state !== 'legacy') },
    earlierPositives: count((r) => r.old && r.state !== 'legacy'),
    kept: count((r) => r.change === 'kept'),
    lost: count((r) => r.change === 'lost'),
    lostToUnparsed: count((r) => r.change === 'unknown' && r.old),
    gained: count((r) => r.change === 'gained'),
    lostWhy: Object.fromEntries([...lostWhy].sort((a, b) => b[1] - a[1])),
    possibleWebsite: count((r) => r.flags.includes('possible website')),
    savedIdsWouldChange: count((r) => Boolean(r.withSaved && (r.withSaved.flags !== r.flags || r.withSaved.identity !== r.identity))),
    byScan: [...scans.values()].map((list) => ({
      scan: list[0].scan,
      keyword: list[0].keyword,
      business: list[0].business,
      owner: list[0].owner,
      at: list[0].at,
      points: list.length,
      legacy: list.filter((r) => r.state === 'legacy').length,
      unparsed: list.filter((r) => r.state === 'unparsed').length,
      earlier: list.filter((r) => r.old && r.state !== 'legacy').length,
      appeared: list.filter((r) => r.appeared === true && r.state === 'parsed').length,
      featured: list.filter((r) => r.flags.includes('featured')).length,
      named: list.filter((r) => /(^|· )named/.test(r.flags)).length,
      listing: list.filter((r) => r.flags.includes('listing')).length,
      website: list.filter((r) => /(^|· )website cited/.test(r.flags)).length,
      possibleWebsite: list.filter((r) => r.flags.includes('possible website')).length,
      lost: list.filter((r) => r.change === 'lost').length,
      gained: list.filter((r) => r.change === 'gained').length,
    })),
  };
  const value = JSON.stringify({ summary, points: rows.filter((r) => r.state !== 'legacy').slice(0, 400) });
  await db.$executeRaw`INSERT INTO "Kept" (scope, key, value, "updatedAt") VALUES ('aio-backfill', ${runKey}, ${value}, now()) ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`;
  console.log(
    `[aio-backfill] dry run ${AIO_CAPTURE_VERSION}: ${summary.points} point(s) with an AI Overview · re-read ${summary.reread}, unparsed ${summary.unparsed}, legacy ${summary.legacy} · earlier positives ${summary.earlierPositives}: kept ${summary.kept}, lost ${summary.lost} (+${summary.lostToUnparsed} now unparsed), gained ${summary.gained} · nothing on the points changed`,
  );
}
