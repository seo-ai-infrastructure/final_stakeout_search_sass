import { db } from '@stakeout/db';
import { parseBusiness } from '@stakeout/core/businesses';
import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { googleIdField } from '@/lib/googleId';

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/businesses/:id: update a saved business (owner only). */
export async function PATCH(req: Request, c: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (raw && typeof raw.kgmid === 'string') raw.kgmid = await googleIdField(raw.kgmid);
    const data = parseBusiness(raw);
    const r = await db.savedBusiness.updateMany({ where: { id: (await c.params).id, userId: user.id }, data });
    if (!r.count) throw new InputError('Saved business not found.', 404);
    return Response.json({ business: await db.savedBusiness.findUnique({ where: { id: (await c.params).id } }) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/businesses/:id (owner only). Scans already run are kept. */
export async function DELETE(_req: Request, c: Ctx) {
  try {
    const user = await getAuthenticatedUser();
    const r = await db.savedBusiness.deleteMany({ where: { id: (await c.params).id, userId: user.id } });
    if (!r.count) throw new InputError('Saved business not found.', 404);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
