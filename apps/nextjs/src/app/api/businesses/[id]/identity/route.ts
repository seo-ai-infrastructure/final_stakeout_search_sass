import { db } from '@stakeout/db';
import { parseIdentity } from '@stakeout/core/businesses';
import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { googleIdField } from '@/lib/googleId';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/businesses/:id/identity { domain, kgmid } (owner only): only the saved business's
 * website and Google ID, so the scan form can keep them up to date as scans are launched without
 * touching its keywords, centre or other defaults.
 */
export async function PATCH(req: Request, c: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    const raw = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (typeof raw.kgmid === 'string') raw.kgmid = await googleIdField(raw.kgmid);
    const data = parseIdentity(raw);
    const id = (await c.params).id;
    const r = await db.savedBusiness.updateMany({ where: { id, userId: user.id }, data });
    if (!r.count) throw new InputError('Saved business not found.', 404);
    return Response.json({ business: await db.savedBusiness.findUnique({ where: { id } }) });
  } catch (e) {
    return errorResponse(e);
  }
}
