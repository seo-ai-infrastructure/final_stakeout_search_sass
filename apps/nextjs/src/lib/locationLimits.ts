import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { ACCOUNT_PLANS, ACCOUNT_PLAN_ORDER, type AccountPlan } from '@stakeout/core/gbpPlans';
import { distinctPlaces, samePlace, type ScanPlace } from '@stakeout/core/locations';
import { planMonth } from './gbpBilling';

/**
 * Tracked locations on a plan: the distinct businesses scanned in the current billing month (a
 * yearly plan's month), plus every business with a repeating scan that is on. A new business is
 * refused once the plan's cap is reached; businesses already tracked can always be scanned again,
 * and repeating scans keep running whatever the count (so an account over its cap after moving to
 * a smaller plan keeps what it had). Accounts without a plan have no cap.
 */
export async function locationUse(userId: string, now = new Date()) {
  const m = await planMonth(userId, now);
  if (!m) return null;
  const cap = ACCOUNT_PLANS[m.plan].locations;
  const from = m.monthFrom ? new Date(m.monthFrom * 1000) : new Date(now.getTime() - 30 * 86400000);
  const rows = await db.gridScan.findMany({
    where: { userId, OR: [{ createdAt: { gte: from } }, { scheduleCron: { not: null }, NOT: { scheduleCron: { startsWith: 'PAUSED:' } } }] },
    select: { targetBusiness: true, targetKgmid: true, targetPlaceId: true, centerLat: true, centerLng: true },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  });
  const places = distinctPlaces(rows.map((r) => ({ business: r.targetBusiness, googleId: r.targetPlaceId || r.targetKgmid, lat: r.centerLat, lng: r.centerLng })));
  return { plan: m.plan, cap, used: places.length, places, from };
}

/** The next plan up with room for more tracked businesses. */
const roomier = (plan: AccountPlan): AccountPlan | null => ACCOUNT_PLAN_ORDER.slice(ACCOUNT_PLAN_ORDER.indexOf(plan) + 1).find((p) => { const c = ACCOUNT_PLANS[p].locations; const mine = ACCOUNT_PLANS[plan].locations; return c === null || (mine !== null && c > mine); }) ?? null;

/** Refuses a scan of a new business when the plan's tracked locations for the month are used up. */
export async function assertLocationRoom(userId: string, scan: ScanPlace) {
  const use = await locationUse(userId);
  if (!use || use.cap === null) return;
  if (use.places.some((p) => samePlace(p, scan))) return;
  if (use.used < use.cap) return;
  const name = ACCOUNT_PLANS[use.plan].name, up = roomier(use.plan);
  const more = up ? ` Move up to ${ACCOUNT_PLANS[up].name} to track ${ACCOUNT_PLANS[up].locations === null ? 'as many as you like' : ACCOUNT_PLANS[up].locations}.` : '';
  throw new InputError(`Your ${name} plan tracks up to ${use.cap} businesses a month, and this month’s ${use.cap} are in use. You can scan any of them again.${more}`, 402);
}
