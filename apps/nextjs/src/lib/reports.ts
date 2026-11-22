import { pinAi, presenceOf, withoutFlags } from '@stakeout/core/aiFlags';
import { getSettings } from '@stakeout/core/settings';
import { siteFromScans } from '@/lib/businessSite';
import { db, Prisma } from '@stakeout/db';
import { ispLabel } from './ispLabel';
import { InputError, metrics } from '@stakeout/core/grid';
import { aiPositionOf, localRankOf, noLocalResults } from '@stakeout/core/localRank';
import { lookupCensus, type PinCensus } from '@stakeout/core/censusLookup';

const CENSUS_VINTAGE = (process.env.CENSUS_VINTAGE || process.env.NEXT_PUBLIC_CENSUS_VINTAGE || '').trim();

/**
 * Each point's Census neighborhood (block group, tract, ZIP), looked up once per data vintage
 * and saved on the point, so scans made before the data existed fill in the first time their
 * report is opened. A slow or failed lookup never holds up the report: it is retried next time.
 */
async function fillCensus(pins: { id: string; lat: number; lng: number; stateCode: string; census: unknown }[]) {
  if (!CENSUS_VINTAGE) return;
  const missing = pins.filter((p) => (p.census as PinCensus | null)?.v !== CENSUS_VINTAGE);
  if (!missing.length) return;
  try {
    const { byPin, failedFiles } = await Promise.race([
      lookupCensus(missing.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, stateCode: p.stateCode })), CENSUS_VINTAGE),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out after 8 s')), 8000)),
    ]);
    const saves = [];
    for (const p of missing) {
      const c = byPin.get(p.id)!;
      const found = Boolean(c.bg || c.tract || c.zcta);
      if (found) p.census = c;
      // A point with nothing found is saved only when every file was read, so a failed read is retried.
      if (found || !failedFiles.length) saves.push(db.gridPin.update({ where: { id: p.id }, data: { census: c } }));
    }
    if (saves.length) await db.$transaction(saves);
  } catch (e) {
    console.error('[census] lookup skipped:', (e as Error).message);
  }
}
const pinSelect = {
  id: true,
  rowIdx: true,
  colIdx: true,
  lat: true,
  lng: true,
  zip: true,
  city: true,
  stateCode: true,
  status: true,
  rankFound: true,
  topCompetitors: true,
  hasAiOverview: true,
  targetCitedInAi: true,
  aiOverviewText: true,
  aiCitations: true,
  videoUrl: true,
  proxyMeta: true,
  metaJsonUrl: true,
  dumpsTarUrl: true,
  census: true,
  insights: true,
} as const;
const reportSelect = {
  id: true,
  keyword: true,
  targetBusiness: true,
  targetDomain: true,
  targetKgmid: true,
  centerLat: true,
  centerLng: true,
  gridSize: true,
  spacingKm: true,
  targetType: true,
  network: true,
  phoneBrand: true,
  phoneModel: true,
  trackAiOverviews: true,
  totalPins: true,
  creditsCharged: true,
  completedPins: true,
  failedPins: true,
  createdAt: true,
  status: true,
  solv: true,
  atrp: true,
  arp: true,
  aioTriggerRate: true,
  aioCitationRate: true,
  pins: { select: pinSelect, orderBy: [{ rowIdx: 'asc' }, { colIdx: 'asc' }] },
} satisfies Prisma.GridScanSelect;
/**
 * A scan's report. `admin` adds the link to each point's raw evidence bundle: that file shows how
 * a search is carried out, so only an admin may download it. Everyone else gets `hasBundle`.
 */
export async function report(where: Prisma.GridScanWhereInput, opts: { admin?: boolean } = {}) {
  const found = await db.gridScan.findFirst({ where, select: reportSelect });
  if (!found) throw new InputError('Report unavailable.', 404);
  // The AI Overview's four flags (featured, named, listing cited, website cited): admins always see
  // them; customers once an admin turns them on. Until then a customer's pages get the points
  // without them, and read the AI Overview as before.
  const live = await getSettings().catch(() => null);
  const aiFlagsLive = live?.aiFlagsForCustomers ?? false;
  const aiFlags = Boolean(opts.admin) || aiFlagsLive;
  // Share of local search by page one (see searchShare): admins always, customers once it is switched on.
  const pageOneLive = live?.pageOneShareForCustomers ?? false;
  const s = aiFlags ? found : { ...found, pins: found.pins.map((p) => withoutFlags(p)) };
  await fillCensus(s.pins);
  // A scan made before websites were saved borrows the one from the account's other scans of the same business.
  // (Not where the AI Overview is read by the four flags: there a cited site counts as the business's
  // own only once its website is confirmed for the scan; until then it is a possible website citation.)
  const flagged = aiFlags && s.pins.some((p) => presenceOf(p));
  const borrowed = s.targetDomain || flagged ? null : await db.gridScan.findUnique({ where: { id: s.id }, select: { userId: true } }).then((o) => (o ? siteFromScans(o.userId, s.targetBusiness) : null)).catch(() => null);
  // A point whose page had no map pack has no local rank (see core/localRank): its stored rank,
  // if any, is its place in the AI Overview. The scan's rank numbers are worked out again here
  // without those points, so reports saved before this rule read the same way as new ones.
  const done = s.pins.filter((p) => p.status === 'COMPLETED');
  const totals = done.length ? metrics(done.map((p) => ({ rankFound: p.rankFound, hasAiOverview: p.hasAiOverview, targetCitedInAi: p.targetCitedInAi, noLocal: noLocalResults(p.proxyMeta), aiUnknown: pinAi(p).state === 'unparsed' }))) : null;
  return {
    ...s,
    /** Whether this page reads the AI Overview by the four flags; `forCustomers`: whether customers see them too. */
    aiFlags: { shown: aiFlags, forCustomers: aiFlagsLive },
    scoring: { pageOne: Boolean(opts.admin) || pageOneLive, forCustomers: pageOneLive },
    // (The AI citation rate too: an unread overview is left out of it, and corrected points count as they now read.)
    ...(totals ? { arp: totals.arp, atrp: totals.atrp, solv: totals.solv, aioCitationRate: totals.aioCitationRate } : {}),
    ...(borrowed ? { targetDomain: borrowed } : {}),
    pins: s.pins.map((p) => {
      const m = p.proxyMeta as Record<string, unknown> | null;
      const token =
        typeof where.shareToken === 'string' ? where.shareToken : null;
      const route = '/api/proof/' + p.id + '?kind=';
      return {
        ...p,
        rankFound: localRankOf(m, p.rankFound),
        videoUrl: p.videoUrl
          ? route + 'video' + (token ? '&share=' + token : '')
          : null,
        // The report needs each point's summary, not its whole Local Finder list (the Evidence tab reads that).
        insights: p.insights ? { ...(p.insights as Record<string, unknown>), finder: undefined } : null,
        metaJsonUrl: !token && p.metaJsonUrl ? route + 'meta' : null,
        dumpsTarUrl: opts.admin && !token && p.dumpsTarUrl ? route + 'bundle' : null,
        hasBundle: Boolean(p.dumpsTarUrl),
        // The AI Overview watch's own files (admins only): the capture, and the page read behind it.
        ...(() => {
          const kept = (m?.aioSources ?? null) as { key?: unknown; capture?: { key?: unknown } } | null;
          const ok = opts.admin && !token;
          return {
            aioCaptureUrl: ok && typeof kept?.capture?.key === 'string' ? route + 'aio' : null,
            aioReadUrl: ok && typeof kept?.key === 'string' ? route + 'aio-read' : null,
          };
        })(),
        // Only what a report shows: the provider's name, and where a rank came from when no Local
        // Finder opened. The exit's city is not sent: a point is located by its GPS, not its IP.
        proxyMeta: m
          ? {
              isp: ispLabel(m),
              finderShown: typeof m.finderShown === 'boolean' ? m.finderShown : null,
              rankFrom: typeof m.rankFrom === 'string' ? m.rankFrom : null,
              /** No map pack on the page: the local rank is "not applicable". */
              noLocal: noLocalResults(m),
              /** The business's place in the AI Overview's list on such a page (null: not in it). */
              aiPosition: aiPositionOf(m, p.rankFound),
              /** "Position zero": named in the AI Overview's opening sentences. */
              aiLead: m.aiLead === true,
            }
          : null,
      };
    }),
  };
}
