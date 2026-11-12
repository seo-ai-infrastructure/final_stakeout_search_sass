import { market, InputError } from '@stakeout/core/grid';
import { getSettings, ispAllowed } from '@stakeout/core/settings';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ispDirectory } from '@/lib/ispDirectory';
import { targetableIspCodes } from '@stakeout/core/proxySeller';
import { listsEnabled, resolveMarket } from '@stakeout/core/proxyLists';

/**
 * The ISPs a customer can choose for the grid centred here. With Proxy-Seller
 * lists configured these are the ISPs that actually have residential IPs in the
 * market; otherwise the operator-mapped directory.
 */
export async function GET(req: Request) {
  try {
    await getAuthenticatedUser();
    const p = new URL(req.url).searchParams,
      lat = Number(p.get('lat')),
      lng = Number(p.get('lng'));
    if (!p.has('lat') || !p.has('lng') || !Number.isFinite(lat) || !Number.isFinite(lng))
      throw new InputError('Coordinates required.');
    const detectedMarket = market(lat, lng);
    const settings = await getSettings();
    if (listsEnabled()) {
      const m = await resolveMarket(detectedMarket.city, detectedMarket.stateCode);
      return Response.json({
        detectedMarket,
        proxyMarket: { region: m.region, city: m.city, level: m.level, km: m.km ?? null },
        isps: m.isps.filter((name) => ispAllowed(name, settings)).map((name) => ({ name })),
      });
    }
    return Response.json({
      detectedMarket,
      proxyMarket: null,
      isps: ispDirectory
        .filter((i) => i.code !== 'ANY' && targetableIspCodes().includes(i.code))
        .map((i) => ({ name: i.code, label: i.label })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
