import { GOOGLE_ID_HELP } from '@stakeout/core/businessIds';
import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { resolveGoogleId } from '@/lib/googleId';

/** POST /api/google-id { input }: Google's ID for a business from a pasted Share link or ID (for the scan form). */
export async function POST(req: Request) {
  try {
    await getAuthenticatedUser();
    const body = (await req.json().catch(() => null)) as { input?: unknown } | null;
    const id = await resolveGoogleId(body?.input);
    if (!id) throw new InputError(GOOGLE_ID_HELP);
    return Response.json({ id });
  } catch (e) {
    return errorResponse(e);
  }
}
