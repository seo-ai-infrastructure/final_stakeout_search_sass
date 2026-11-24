import { db } from '@stakeout/db';
import { buildGrid, market, parseSpec } from '@stakeout/core/grid';
import { listsEnabled, prepareGridProxies } from '@stakeout/core/proxyLists';
import { createScan } from '@stakeout/core/scans';
import { mobileOverflowTown } from '@stakeout/core/overflowTown';

/**
 * A one-off: run a finished scan again around a different centre, for the same account, with the
 * same search, grid and network, at no credit cost. Set RESCAN to "<scanId>@<lat>,<lng>". Used
 * when a report was run around the wrong place. It is made once: a restart finds the scan it
 * already made and leaves it alone. The original scan is not touched.
 */
export async function rescanAt() {
  const m = /^([A-Za-z0-9]+)@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec((process.env.RESCAN ?? '').trim());
  if (!m) return;
  const [, scanId, lat, lng] = m;
  const old = await db.gridScan.findUnique({ where: { id: scanId } });
  if (!old) return console.warn('[rescan] no such scan:', scanId);
  const s = parseSpec({
    keyword: old.keyword,
    targetBusiness: old.targetBusiness,
    targetDomain: old.targetDomain ?? '',
    targetKgmid: old.targetKgmid ?? '',
    centerLat: Number(lat),
    centerLng: Number(lng),
    gridSize: old.gridSize,
    spacingKm: old.spacingKm,
    targetType: old.targetType,
    scheduleType: 'once',
    ispMode: old.ispMode,
    isps: old.isps,
    network: old.network,
  });
  // Home proxies for the new place are made ready first, as the website does before queueing.
  if (listsEnabled() && s.network !== 'mobile') {
    const { market: mk } = await prepareGridProxies(market(s.centerLat, s.centerLng), buildGrid(s).map((p) => ({ city: p.city, stateCode: p.stateCode })), s.isps);
    s.proxyRegion = mk.region;
    s.proxyCity = mk.city;
  } else if (s.network === 'mobile') {
    const town = await mobileOverflowTown(s.centerLat, s.centerLng, buildGrid(s).map((p) => ({ city: p.city, stateCode: p.stateCode })));
    if (town) {
      s.proxyRegion = town.region;
      s.proxyCity = town.city;
    }
  }
  const made = await createScan(old.userId, s, `${old.userId}:rescan:${scanId}:${lat},${lng}`, undefined, undefined, { free: true });
  console.log(`[rescan] ${scanId} run again around ${lat},${lng} as ${made.id} (${made.totalPins} points, ${made.creditsCharged} credits, ${made.status})`);
}
