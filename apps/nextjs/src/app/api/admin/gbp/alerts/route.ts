import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { gbpAdmin } from '@/lib/gbpAdmin';
import { alertsStatus, turnAlertsOn } from '@/lib/reviewAlerts';

/** GET /api/admin/gbp/alerts (admins only): whether instant review alerts are switched on. */
export async function GET(req: Request) {
  try {
    await gbpAdmin();
    return NextResponse.json(await alertsStatus(new URL(req.url).origin));
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/admin/gbp/alerts (admins only): switches them on (registers this site with Postproxy). */
export async function POST(req: Request) {
  try {
    await gbpAdmin();
    return NextResponse.json(await turnAlertsOn(new URL(req.url).origin));
  } catch (e) {
    return errorResponse(e);
  }
}
