import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/scans — the latest scans across every account, each with its failed points (where,
 * on which phone, and why), so an admin checks quality here and not in the worker's logs.
 * ?days=N (default 7, at most 60) sets how far back; at most 300 scans are returned, newest first.
 */
export async function GET(req: Request) {
  try {
    if ((await getAuthenticatedUser()).role !== 'ADMIN') throw new InputError('Admins only.', 403);
    const days = Math.min(60, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 7));
    const since = new Date(Date.now() - days * 86400000);
    const scans = await db.gridScan.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true, keyword: true, targetBusiness: true, targetType: true, city: true, stateCode: true, gridSize: true, status: true,
        totalPins: true, completedPins: true, failedPins: true, solv: true, creditsCharged: true, creditsRefunded: true,
        createdAt: true, dispatchedAt: true, completedAt: true, user: { select: { email: true } },
      },
    });
    const ids = scans.map((s) => s.id);
    const [failed, phones] = await Promise.all([
      db.gridPin.findMany({
        where: { scanId: { in: ids }, status: 'FAILED' },
        orderBy: [{ rowIdx: 'asc' }, { colIdx: 'asc' }],
        select: { id: true, scanId: true, rowIdx: true, colIdx: true, city: true, lastError: true, assignedDeviceId: true, isRefunded: true, updatedAt: true },
      }),
      db.devicePool.findMany({ select: { imageId: true, hardwareModel: true } }),
    ]);
    const model = new Map(phones.map((p) => [p.imageId, p.hardwareModel]));
    const byScan = new Map<string, typeof failed>();
    for (const p of failed) byScan.set(p.scanId, [...(byScan.get(p.scanId) ?? []), p]);
    return Response.json({
      days,
      scans: scans.map(({ user, ...s }) => ({
        ...s,
        account: user.email,
        failed: (byScan.get(s.id) ?? []).map((p) => ({
          id: p.id, row: p.rowIdx, col: p.colIdx, city: p.city, error: p.lastError ?? '', refunded: p.isRefunded, at: p.updatedAt,
          phone: p.assignedDeviceId, phoneModel: p.assignedDeviceId ? (model.get(p.assignedDeviceId) ?? null) : null,
        })),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
