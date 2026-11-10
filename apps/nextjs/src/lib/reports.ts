import { db, Prisma } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
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
export const pinSelect = {
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
export const reportSelect = {
  id: true,
  keyword: true,
  targetBusiness: true,
  centerLat: true,
  centerLng: true,
  gridSize: true,
  spacingKm: true,
  targetType: true,
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
export async function report(where: Prisma.GridScanWhereInput) {
  const s = await db.gridScan.findFirst({ where, select: reportSelect });
  if (!s) throw new InputError('Report unavailable.', 404);
  await fillCensus(s.pins);
  return {
    ...s,
    pins: s.pins.map((p) => {
      const m = p.proxyMeta as Record<string, unknown> | null;
      const token =
        typeof where.shareToken === 'string' ? where.shareToken : null;
      const route = '/api/proof/' + p.id + '?kind=';
      return {
        ...p,
        videoUrl: p.videoUrl
          ? route + 'video' + (token ? '&share=' + token : '')
          : null,
        // The report needs each point's summary, not its whole Local Finder list (the Evidence tab reads that).
        insights: p.insights ? { ...(p.insights as Record<string, unknown>), finder: undefined } : null,
        metaJsonUrl: !token && p.metaJsonUrl ? route + 'meta' : null,
        dumpsTarUrl: !token && p.dumpsTarUrl ? route + 'bundle' : null,
        proxyMeta: m
          ? {
              city: m.city,
              region: m.region,
              rungUsed: m.rungUsed,
              country: m.country,
            }
          : null,
      };
    }),
  };
}
