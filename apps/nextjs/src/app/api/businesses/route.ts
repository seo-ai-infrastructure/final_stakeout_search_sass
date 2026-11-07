import { db } from '@stakeout/db';
import { parseBusiness } from '@stakeout/core/businesses';
import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

/** GET /api/businesses: the signed-in user's saved businesses, newest first. */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const businesses = await db.savedBusiness.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } });
    return Response.json({ businesses });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/businesses: save a business with its keywords and scan defaults. */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    const data = parseBusiness(await req.json().catch(() => null));
    if ((await db.savedBusiness.count({ where: { userId: user.id } })) >= 500)
      throw new InputError('You have 500 saved businesses; delete one to add another.');
    const business = await db.savedBusiness.create({ data: { ...data, userId: user.id } });
    return Response.json({ business }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
