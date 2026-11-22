import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { visibilityForScan } from '@/lib/visibilityReport';

type C = { params: Promise<{ scanId: string }> };

/**
 * The data behind the visibility report (/reports/visibility.html?scan=…) for someone signed in:
 * their own scan and their other scans of the same business (an admin: any scan, with its owner's).
 */
export async function GET(_: Request, c: C) {
  try {
    const id = (await c.params).scanId;
    const me = await getAuthenticatedUser();
    return Response.json(await visibilityForScan(id, me), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
