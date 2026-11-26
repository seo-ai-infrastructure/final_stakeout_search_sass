import { wakeWorker } from '@stakeout/core/wake';
import { randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { createScan } from '@stakeout/core/scans';
import { parseSpec, market, buildGrid, InputError } from '@stakeout/core/grid';
import { listsEnabled, prepareGridProxies } from '@stakeout/core/proxyLists';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { googleIdField } from '@/lib/googleId';
import { redis } from '@stakeout/core/redis';

export const maxDuration = 300;

/**
 * POST /api/admin/test-point (admins only): one free point at the grid centre, set up
 * exactly like a real scan, optionally on one chosen phone, for testing templates fast.
 */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    if (u.role !== 'ADMIN') throw new InputError('Admins only.', 403);
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const s = parseSpec({
      targetType: b.targetType ?? 'mobile_chrome',
      keyword: b.keyword,
      targetBusiness: b.targetBusiness,
      // The saved business's Google ID (or a pasted Google link, followed here) and website.
      targetKgmid: await googleIdField(b.targetKgmid),
      targetDomain: b.targetDomain,
      centerLat: b.centerLat,
      centerLng: b.centerLng,
      gridSize: 3,
      spacingKm: 1.60934,
      ispMode: 'any',
      isps: [],
      trackAiOverviews: true,
      scheduleType: 'once',
      // Like every phone scan: mobile data on the 5G lines (an admin's run never uses metered data).
      network: 'mobile',
    });
    if (s.network === 'mobile') {
      const health = await redis().get('stakeout:health').then((h) => (h ? JSON.parse(h) : null)).catch(() => null);
      if (!health?.mobileLanes) throw new InputError('No 5G line is connected to the worker right now. Try again in a few minutes.', 503);
    }
    const phone = typeof b.imageId === 'string' && /^[A-Za-z0-9]{3,20}$/.test(b.imageId) ? b.imageId : '';
    if (phone) {
      if (!(await db.devicePool.findUnique({ where: { imageId: phone } }))) throw new InputError('That phone is not in the fleet.', 404);
      s.phoneModel = 'device:' + phone;
    }
    const pins = buildGrid(s);
    const centre = pins[(pins.length - 1) / 2];
    if (listsEnabled()) {
      const { market: m } = await prepareGridProxies(market(s.centerLat, s.centerLng), [{ city: centre.city, stateCode: centre.stateCode }], s.isps);
      s.proxyRegion = m.region;
      s.proxyCity = m.city;
    }
    const scan = await createScan(u.id, s, u.id + ':test:' + randomUUID(), undefined, [centre], { free: true });
    await wakeWorker('test point');
    return Response.json({ scanId: scan.id }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
