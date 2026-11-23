import { errorResponse } from '@/lib/api';
import { briefByToken } from '@/lib/briefStore';

export const dynamic = 'force-dynamic';

/** A compiled brief behind its share link (/reports/brief.html?b=…): read-only, never a paid look-up. */
export async function GET(_: Request, c: { params: Promise<{ token: string }> }) {
  try {
    return Response.json(await briefByToken((await c.params).token), { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
  } catch (e) {
    return errorResponse(e);
  }
}
