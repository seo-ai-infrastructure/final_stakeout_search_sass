import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { availableProfiles, fleetPhones } from '@stakeout/core/fleet';

export const dynamic = 'force-dynamic';

/** Hardware profiles that at least one online, bootstrapped phone can serve. */
export async function GET() {
  try {
    await getAuthenticatedUser();
    return Response.json({ profiles: await availableProfiles(), phones: await fleetPhones() });
  } catch (e) {
    return errorResponse(e);
  }
}
