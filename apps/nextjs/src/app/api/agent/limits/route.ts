import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isAgent } from '@/lib/acting';
import { agentBudget, setAgentCap } from '@/lib/agentLimits';

/** The limit is read and set by a person signed in on the site, never by an agent holding a key. */
async function person() {
  if (isAgent()) throw new InputError('Not available to agents.', 403);
  return getAuthenticatedUser();
}

/** GET /api/agent/limits: how many scan credits this account's agents may spend this month, and how many they have. */
export async function GET() {
  try {
    return Response.json(await agentBudget((await person()).id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/agent/limits { cap }: sets the monthly limit. 0 stops agents starting scans. */
export async function POST(req: Request) {
  try {
    const u = await person();
    await setAgentCap(u.id, ((await req.json().catch(() => ({}))) as { cap?: unknown }).cap);
    return Response.json(await agentBudget(u.id));
  } catch (e) {
    return errorResponse(e);
  }
}
