import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { servicesGate, updateOrder } from '@/lib/services';

/** PATCH /api/services/orders/:id { status?, deliverableUrl? }: an admin moves an order along. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const u = await getAuthenticatedUser();
    servicesGate(u);
    await updateOrder(u, (await params).id, await req.json());
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
