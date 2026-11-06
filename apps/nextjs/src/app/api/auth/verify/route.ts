import { db } from '@stakeout/db';
import { consumeToken } from '@/lib/emailTokens';
import { completeVerification } from '@/lib/verification';

export const dynamic = 'force-dynamic';

function redirect(req: Request, path: string) {
  return Response.redirect(new URL(path, req.url), 303);
}

/** Landing point for links in verification and teaser emails. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  try {
    const t = await consumeToken(token);
    if (!t) return redirect(req, '/login?verify=expired');
    if (t.purpose === 'VERIFY_EMAIL' && t.userId) {
      await completeVerification(t.userId);
      return redirect(req, '/scans?verified=1');
    }
    if (t.purpose === 'TEASER' && t.scanId) {
      // The teaser was held until its owner proved the inbox; release it to the dispatcher.
      await db.gridScan.updateMany({
        where: { id: t.scanId, status: 'AWAITING_EMAIL' },
        data: { status: 'QUEUED' },
      });
      const scan = await db.gridScan.findUnique({
        where: { id: t.scanId },
        select: { shareToken: true },
      });
      if (scan?.shareToken) return redirect(req, '/share/' + scan.shareToken);
    }
    return redirect(req, '/login?verify=expired');
  } catch {
    return redirect(req, '/login?verify=error');
  }
}
