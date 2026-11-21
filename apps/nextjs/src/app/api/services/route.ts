import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { stripeConfigured } from '@/lib/stripe';
import { SERVICES, clientsFor, ordersFor, servicesGate, startService } from '@/lib/services';

export const maxDuration = 60;

/** GET /api/services: the services, the account's clients and its paid orders (admins: everyone's). */
export async function GET() {
  try {
    const u = await getAuthenticatedUser();
    servicesGate(u);
    const [clients, orders] = await Promise.all([clientsFor(u), ordersFor(u)]);
    return Response.json({ ready: stripeConfigured(), services: Object.values(SERVICES), clients, orders, admin: u.role === 'ADMIN' });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/services { service, client, intake }: Stripe's checkout for the order ({ url }). */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    servicesGate(u);
    return Response.json(await startService(u, await req.json(), new URL(req.url).origin));
  } catch (e) {
    return errorResponse(e);
  }
}
