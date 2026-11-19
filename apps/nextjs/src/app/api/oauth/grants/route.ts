import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isAgent } from '@/lib/acting';
import { listGrants, revokeGrant } from '@/lib/oauth';

/** Connected apps are seen and removed by a person signed in on the site, never by an agent. */
async function person() {
  if (isAgent()) throw new InputError('Not available to agents.', 403);
  return getAuthenticatedUser();
}

/** GET /api/oauth/grants: the apps this account has approved to act for it. */
export async function GET() {
  try {
    return Response.json({ apps: await listGrants((await person()).id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/oauth/grants?id=: disconnects an app at once. It has to be approved again to come back. */
export async function DELETE(req: Request) {
  try {
    if (!(await revokeGrant((await person()).id, String(new URL(req.url).searchParams.get('id') ?? '')))) throw new InputError('Unknown app.', 404);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
