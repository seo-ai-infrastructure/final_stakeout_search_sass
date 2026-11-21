import { db } from '@stakeout/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

type Seen = { domain: string | null; kgmid: string | null; lat: number; lng: number; at: number; from: 'saved' | 'scan' };

const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const r = Math.PI / 180;
  const x = (bLng - aLng) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};

/**
 * GET /api/businesses/remembered?name=&lat=&lng= : the website and Google ID this account last
 * used for a business of this name, from its saved businesses and earlier scans, so the scan form
 * can fill them in. With several places of the same name (offices of one brand), the one nearest
 * the grid's centre wins, then the most recent. Each field comes from the nearest place that has it.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    const q = new URL(req.url).searchParams;
    const name = (q.get('name') ?? '').trim().slice(0, 200);
    if (!name) return Response.json({ domain: null, kgmid: null });
    const lat = Number(q.get('lat')), lng = Number(q.get('lng'));
    const near = Number.isFinite(lat) && Number.isFinite(lng);
    const [saved, scans] = await Promise.all([
      db.savedBusiness.findMany({
        where: { userId: user.id, name: { equals: name, mode: 'insensitive' }, OR: [{ domain: { not: null } }, { kgmid: { not: null } }] },
        select: { domain: true, kgmid: true, centerLat: true, centerLng: true, updatedAt: true },
        take: 20,
      }),
      db.gridScan.findMany({
        where: { userId: user.id, targetBusiness: { equals: name, mode: 'insensitive' }, OR: [{ targetDomain: { not: null } }, { targetKgmid: { not: null } }] },
        select: { targetDomain: true, targetKgmid: true, centerLat: true, centerLng: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    const seen: Seen[] = [
      ...saved.map((b) => ({ domain: b.domain, kgmid: b.kgmid, lat: b.centerLat, lng: b.centerLng, at: b.updatedAt.getTime(), from: 'saved' as const })),
      ...scans.map((s) => ({ domain: s.targetDomain, kgmid: s.targetKgmid, lat: s.centerLat, lng: s.centerLng, at: s.createdAt.getTime(), from: 'scan' as const })),
    ];
    // Nearest first (within a couple of km counts as the same place), then the most recent.
    const order = (s: Seen) => (near ? Math.round(km(lat, lng, s.lat, s.lng) / 2) : 0);
    seen.sort((a, b) => order(a) - order(b) || b.at - a.at);
    const domain = seen.find((s) => s.domain) ?? null;
    const kgmid = seen.find((s) => s.kgmid) ?? null;
    return Response.json({ domain: domain?.domain ?? null, kgmid: kgmid?.kgmid ?? null, from: kgmid?.from ?? domain?.from ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
