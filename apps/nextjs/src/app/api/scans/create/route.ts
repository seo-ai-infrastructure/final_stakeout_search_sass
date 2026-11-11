import { randomUUID } from 'node:crypto';
import { createScan } from '@stakeout/core/scans';
import { parseSpec, market, buildGrid, InputError } from '@stakeout/core/grid';
import { getSettings, ispAllowed } from '@stakeout/core/settings';
import { targetableIspCodes } from '@stakeout/core/proxySeller';
import { listsEnabled, prepareGridProxies } from '@stakeout/core/proxyLists';
import { assertFleetSupports } from '@stakeout/core/fleet';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

// Preparing proxy lists for every city in a new grid can take many Proxy-Seller calls.
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser(),
      s = parseSpec(await req.json());
      const settings = await getSettings();
      if (s.isps.some((v: string) => !ispAllowed(v, settings))) throw new InputError('That ISP is not available here. Choose another.');
    const key = req.headers.get('Idempotency-Key') ?? randomUUID();
    if (!/^[\w-]{8,80}$/.test(key))
      throw new InputError('Invalid request key.');
    // Only surfaces with a working search template can be scanned (Chrome today).
    if (s.targetType !== 'desktop_aimode' && !(process.env.NEXT_PUBLIC_ENABLED_SURFACES ?? 'mobile_chrome').split(',').map((x) => x.trim()).includes(s.targetType))
      throw new InputError('That search surface is not available yet. Choose Google Chrome.');
    await assertFleetSupports(s.targetType, s.phoneModel);
    if (s.targetType !== 'desktop_aimode') {
      if (listsEnabled()) {
        // Prepare the residential proxies BEFORE the grid is queued: for the centre
        // city and every other city the grid's points fall in, one list per chosen
        // ISP plus an any-ISP fallback. Lists are saved and reused by later scans.
        const center = market(s.centerLat, s.centerLng);
        const places = buildGrid(s).map((p) => ({ city: p.city, stateCode: p.stateCode }));
        const { market: m } = await prepareGridProxies(center, places, s.isps);
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
