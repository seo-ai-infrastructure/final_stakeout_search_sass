import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { availableProfiles } from '@stakeout/core/fleet';

export const dynamic = 'force-dynamic';

/** Hardware profiles that at least one online, bootstrapped phone can serve. */
export async function GET() {
  try {
    await getAuthenticatedUser();
    return Response.json({ profiles: await availableProfiles() });
  } catch (e) {
    return errorResponse(e);
  }
}
