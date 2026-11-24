import { chooseNetwork } from '@stakeout/core/networkChoice';
import { mobileOverflowTown } from '@stakeout/core/overflowTown';
import { flushAlerts } from '@/lib/alerts';
import { wakeWorker } from '@stakeout/core/wake';
import { randomUUID } from 'node:crypto';
import { createScan } from '@stakeout/core/scans';
import { parseSpec, market, buildGrid, placedPins, InputError, OFFERED_GRID_SIZES, fixedCron } from '@stakeout/core/grid';
import { skippedPoints } from '@stakeout/core/gridSizes';
import { getSettings, ispAllowed } from '@stakeout/core/settings';
import { targetableIspCodes } from '@stakeout/core/proxySeller';
import { listsEnabled, prepareGridProxies } from '@stakeout/core/proxyLists';
import { assertFleetSupports } from '@stakeout/core/fleet';
import { requestKeyValid } from '@stakeout/core/requestKey';
import { getAuthenticatedUser } from '@/lib/auth';
import { asSpeed, schedulePlan } from '@stakeout/core/speed';
import { db } from '@stakeout/db';
import { WELCOME } from '@/lib/pricing';
import { errorResponse } from '@/lib/api';
import { redis } from '@stakeout/core/redis';
import { knownSite } from '@/lib/businessSite';
import { googleIdField } from '@/lib/googleId';

// Preparing proxy lists for every city in a new grid can take many Proxy-Seller calls.
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser(),
      body = (await req.json()) as Record<string, unknown>;
    // A pasted Share link is followed to Google's ID for the business before the scan is checked.
    if (typeof body.targetKgmid === 'string') body.targetKgmid = await googleIdField(body.targetKgmid);
    const s = parseSpec(body);
      // Checked here as well as on the page, so a size that is switched off cannot be requested directly.
      if (!OFFERED_GRID_SIZES.includes(s.gridSize))
        throw new InputError(`A ${s.gridSize}×${s.gridSize} grid is not available right now. Choose ${OFFERED_GRID_SIZES.map((n) => n + '×' + n).join(', ')}.`);
      // Freely placed points (top income areas) replace the grid; the size becomes the smallest that holds them.
      const placed = placedPins({ lat: s.centerLat, lng: s.centerLng }, body.points, OFFERED_GRID_SIZES);
      if (placed) s.gridSize = placed.gridSize;
      const settings = await getSettings();
      if (s.isps.some((v: string) => !ispAllowed(v, settings))) throw new InputError('That ISP is not available here. Choose another.');
      // The network is ours to choose, not the customer's (nor an admin's on Automatic): home internet
      // while Proxy-Seller has room for the scan, then mobile data for good (networkChoice.ts).
      if (u.role !== 'ADMIN' || body.network === 'auto') {
        s.network = await chooseNetwork(s.gridSize * s.gridSize, s.targetType, { internal: u.role === 'ADMIN' });
        if (s.network !== 'residential') {
          s.ispMode = 'any';
          s.isps = [];
        }
      } else if (s.network !== 'residential') {
        // An admin's own test runs never use metered mobile data: only the unlimited mobile line.
        const health = await redis().get('stakeout:health').then((h) => (h ? JSON.parse(h) : null)).catch(() => null);
        if (!health?.mobileLanes) throw new InputError('Admin test runs use only the unlimited mobile line, and none is connected. Choose Automatic or Residential.');
      }
      // The mobile network (on its own or in a mix): admins only until it is switched on for customers.
      if (s.network !== 'residential' && u.role !== 'ADMIN' && !settings.mobileForCustomers) throw new InputError('The mobile network is not available yet. Choose Residential Network.');
      if (s.network !== 'residential' && s.targetType === 'desktop_aimode') throw new InputError('The mobile network is for phone scans.');
      if (s.network !== 'residential') {
        const health = await redis().get('stakeout:health').then((h) => (h ? JSON.parse(h) : null)).catch(() => null);
        if (!health?.mobileData) throw new InputError('The mobile network is not available right now. Choose Residential Network.');
      }
    const key = req.headers.get('Idempotency-Key') ?? randomUUID();
    if (!requestKeyValid(key))
      throw new InputError('This launch could not be checked. Reload the page and try again.');
    // Only surfaces with a working search template can be scanned (Chrome today).
    if (s.targetType !== 'desktop_aimode' && !(process.env.NEXT_PUBLIC_ENABLED_SURFACES ?? 'mobile_chrome').split(',').map((x) => x.trim()).includes(s.targetType))
      throw new InputError('That search surface is not available yet. Choose Google Chrome.');
    await assertFleetSupports(s.targetType, s.phoneModel);
    if (s.targetType !== 'desktop_aimode') {
      // A mobile scan's points go out on the unlimited lines; the phones the lines can't take pick
      // points up on home internet while Proxy-Seller's prepaid data lasts (mobileOverflowTown). A
      // town Proxy-Seller does not know never stops a mobile scan.
      if (s.network === 'mobile') {
        const left = skippedPoints(body.skip, s.gridSize);
        const places = (placed?.pins ?? buildGrid(s)).filter((p) => !left.has(p.rowIdx + '_' + p.colIdx)).map((p) => ({ city: p.city, stateCode: p.stateCode }));
        const town = await mobileOverflowTown(s.centerLat, s.centerLng, places);
        if (town) {
          s.proxyRegion = town.region;
          s.proxyCity = town.city;
        }
      } else if (listsEnabled()) {
        // Prepare the residential proxies BEFORE the grid is queued: for the centre
        // city and every other city the grid's points fall in, one list per chosen
        // ISP plus an any-ISP fallback. Lists are saved and reused by later scans.
        const center = market(s.centerLat, s.centerLng);
        const left = skippedPoints(body.skip, s.gridSize);
        const places = (placed?.pins ?? buildGrid(s)).filter((p) => !left.has(p.rowIdx + '_' + p.colIdx)).map((p) => ({ city: p.city, stateCode: p.stateCode }));
        const { market: m } = await prepareGridProxies(center, places, s.isps);
        s.proxyRegion = m.region;
        s.proxyCity = m.city;
      } else if (s.ispMode !== 'any' && s.isps.some((i) => !targetableIspCodes().includes(i))) {
        throw new InputError('That ISP cannot be targeted yet. Choose "Any ISP".');
      }
    }
    // Points the customer left out on the map (water, empty land) are not created or charged.
    const skip = skippedPoints(body.skip, s.gridSize);
    const pins = placed ? placed.pins : skip.size ? buildGrid(s).filter((p) => !skip.has(p.rowIdx + '_' + p.colIdx)) : undefined;
    // The business's own website, when none was given: taken from what the account already has, so the report can tell when an AI answer cites it.
    if (!s.targetDomain) s.targetDomain = await knownSite(u.id, s.targetBusiness);
    // Scan Now (first in line, 2 points a grid point) or scheduled (1 point): as soon as possible, or at the day and hour picked.
    const speed = asSpeed(body.speed);
    let cron: string | undefined;
    let runAt: Date | undefined;
    if (speed === 'scheduled' && body.when === 'asap') {
      // Queued now, once: it starts right away when the phones are free, otherwise behind Scan Now and the scans already in line.
      s.scheduleType = 'once';
    } else if (speed === 'scheduled') {
      const plan = schedulePlan({ repeat: body.repeat, date: body.scheduleDate, at: body.scheduleAt, timezone: body.scheduleTimezone });
      if ('problem' in plan) throw new InputError(plan.problem);
      runAt = plan.runAt;
      cron = plan.cron ?? undefined;
      s.scheduleType = plan.repeat;
    } else if (body.scheduleAt !== undefined && body.scheduleAt !== null && body.scheduleAt !== '') {
      // A repeating scan started now can be given its own time of day, in the business's time zone.
      const made = fixedCron(s.scheduleType, body.scheduleAt, body.scheduleTimezone, body.scheduleWeekday);
      if (typeof made !== 'string') throw new InputError(made.problem);
      cron = made;
    }
    // A first $5 audit (the account's first scan, a 5×5, after buying it) is run again free a week later.
    const firstAudit = s.gridSize === 5 && !(await db.gridScan.count({ where: { userId: u.id } })) &&
      Boolean(await db.paymentOrder.findFirst({ where: { userId: u.id, item: WELCOME.key, captureId: { not: null }, refundedAt: null }, select: { id: true } }));
    const freeRescanAt = firstAudit ? new Date((runAt ?? new Date()).getTime() + 7 * 86400000) : undefined;
    const scan = await createScan(u.id, s, u.id + ':' + key, undefined, pins, { cron, speed, runAt, freeRescanAt });
    await wakeWorker('new scan');
    // A customer just started a scan: if the worker has gone quiet, the admins hear about it now.
    await flushAlerts().catch(() => {});
    return Response.json(
      { scanId: scan.id, creditsCharged: scan.creditsCharged, speed: scan.speed, runAt: scan.runAt?.toISOString() ?? null },
      { status: 202 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
