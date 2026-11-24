import { market } from './grid';
import { homeHasRoom } from './networkChoice';
import { listsEnabled, prepareGridProxies } from './proxyLists';
import { redis } from './redis';

/**
 * A mobile scan's home-internet town. Its points go out on the unlimited mobile lines; when every
 * line is busy, an idle phone picks a point up on home internet while Proxy-Seller's prepaid
 * package has room (the worker's lane door), so the scan's lists (any ISP) are set up when it is
 * made, as for a home-internet scan. Null when Proxy-Seller is off or out of room, or does not
 * know the town: the scan still runs, and its spill-over goes to metered mobile data instead.
 */
export async function mobileOverflowTown(centerLat: number, centerLng: number, places: { city: string; stateCode: string }[]) {
  if (!listsEnabled()) return null;
  const health = await redis()
    .get('stakeout:health')
    .then((h) => (h ? JSON.parse(h) : null))
    .catch(() => null);
  if (!homeHasRoom(health?.traffic)) return null;
  try {
    const { market: m } = await prepareGridProxies(market(centerLat, centerLng), places.filter((p) => p.city && p.stateCode), []);
    return { region: m.region, city: m.city };
  } catch (e) {
    console.warn('[scan] no home-internet spill-over for this mobile scan:', (e as Error).message);
    return null;
  }
}
