import { db } from '@stakeout/db';
import { sameBusiness, siteDomain } from '@stakeout/core/businessSite';
import { readLocation } from '@/lib/gbpAdmin';

/**
 * The website of a business an account scans, when the scan itself was not given one. Looked for
 * in what the account already has, at no cost: an earlier scan of the same business that had one,
 * then a Google listing of theirs with the same name.
 */
export async function siteFromScans(userId: string, business: string): Promise<string | null> {
  const rows = await db.gridScan.findMany({ where: { userId, targetDomain: { not: null }, targetBusiness: { equals: business, mode: 'insensitive' } }, orderBy: { createdAt: 'desc' }, take: 1, select: { targetDomain: true } });
  if (rows[0]?.targetDomain) return rows[0].targetDomain;
  // The same business typed a little differently ("Stuarts Plumbing" and "Stuart's Plumbing").
  const near = await db.gridScan.findMany({ where: { userId, targetDomain: { not: null } }, orderBy: { createdAt: 'desc' }, take: 200, select: { targetBusiness: true, targetDomain: true }, distinct: ['targetBusiness'] });
  return near.find((r) => sameBusiness(r.targetBusiness, business))?.targetDomain ?? null;
}

/** From a listing the account has on a plan whose name is this business's: the website Google shows for it. */
async function siteFromListing(userId: string, business: string): Promise<string | null> {
  const plans: { profileId: string; locationId: string; title: string | null }[] = await db.gbpPlan.findMany({ where: { userId, status: { in: ['ACTIVE', 'ENDING'] } }, select: { profileId: true, locationId: true, title: true }, take: 100 });
  const hit = plans.find((p) => p.title && sameBusiness(p.title, business));
  if (!hit) return null;
  return siteDomain((await readLocation(hit.profileId, hit.locationId)).websiteUri);
}

/** Never stops a scan from starting: a lookup that fails just leaves the website unset. */
export async function knownSite(userId: string, business: string): Promise<string | null> {
  return (await siteFromScans(userId, business).catch(() => null)) ?? (await siteFromListing(userId, business).catch(() => null));
}
