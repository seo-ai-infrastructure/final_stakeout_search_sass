import { db } from '@stakeout/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { clientMerges } from '@stakeout/core/clients';
import { clientName } from '@stakeout/core/clientNames';
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const scans = await db.gridScan.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        keyword: true,
        targetBusiness: true,
        campaignId: true,
        status: true,
        totalPins: true,
        completedPins: true,
        failedPins: true,
        createdAt: true,
        solv: true,
        scheduleType: true,
        scheduleCron: true,
        gridSize: true,
        creditsCharged: true,
        creditsRefunded: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    // The client each scan belongs to: its business name, after this account's merges.
    const merges = await clientMerges(user.id);
    return Response.json({
      merges,
      scans: scans.map((s, i) => ({
        ...s,
        client: clientName(s.targetBusiness, merges),
        prevScanId:
          scans
            .slice(i + 1)
            .find(
              (p) =>
                p.campaignId === s.campaignId &&
                ['PARTIAL', 'COMPLETED'].includes(p.status),
            )?.id ?? null,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
