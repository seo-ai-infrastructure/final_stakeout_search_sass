import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isAgent } from '@/lib/acting';
import { createKey, listKeys, revokeKey } from '@/lib/apiKeys';
import { AGENT_CLOSED, agentOpen } from '@/lib/gbpAccess';

/** Keys are managed by a person signed in on the site, never by an agent holding one. */
async function person() {
  if (isAgent()) throw new InputError('Not available to agents.', 403);
  return getAuthenticatedUser();
}

/** GET /api/keys: this account's keys for AI agents (never the keys themselves). */
export async function GET() {
  try {
    return Response.json({ keys: await listKeys((await person()).id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/keys { name }: makes a key and shows it once. */
export async function POST(req: Request) {
  try {
    const u = await person();
    // A key is only worth having with agent access: without it, none is made.
    if (!(await agentOpen(u))) throw new InputError(AGENT_CLOSED, 402);
    const b = (await req.json().catch(() => ({}))) as { name?: unknown };
    return Response.json(await createKey(u.id, b.name));
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/keys?id=: revokes a key at once. */
export async function DELETE(req: Request) {
  try {
    await revokeKey((await person()).id, String(new URL(req.url).searchParams.get('id') ?? ''));
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
