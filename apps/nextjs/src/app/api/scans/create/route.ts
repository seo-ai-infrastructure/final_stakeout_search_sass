import { randomUUID } from 'node:crypto';
import { createScan } from '@stakeout/core/scans';
import { parseSpec, market, InputError } from '@stakeout/core/grid';
import { targetableIspCodes } from '@stakeout/core/proxySeller';
import { listsEnabled, prepareScanProxies } from '@stakeout/core/proxyLists';
import { assertFleetSupports } from '@stakeout/core/fleet';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

// Preparing proxy lists for a new market can take several Proxy-Seller calls.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser(),
      s = parseSpec(await req.json());
    const key = req.headers.get('Idempotency-Key') ?? randomUUID();
    if (!/^[\w-]{8,80}$/.test(key))
      throw new InputError('Invalid request key.');
    await assertFleetSupports(s.targetType, s.phoneModel);
    if (s.targetType !== 'desktop_aimode') {
      if (listsEnabled()) {
        // Prepare the residential proxies BEFORE the grid is queued: one list per
        // chosen ISP in the scan's market, plus an any-ISP fallback list.
        const center = market(s.centerLat, s.centerLng);
        const m = await prepareScanProxies(center.city, center.stateCode, s.isps);
        s.proxyRegion = m.region;
        s.proxyCity = m.city;
      } else if (s.ispMode !== 'any' && s.isps.some((i) => !targetableIspCodes().includes(i))) {
        throw new InputError('That ISP cannot be targeted yet. Choose "Any ISP".');
      }
    }
    const scan = await createScan(u.id, s, u.id + ':' + key);
    return Response.json(
      { scanId: scan.id, creditsCharged: scan.creditsCharged },
      { status: 202 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
