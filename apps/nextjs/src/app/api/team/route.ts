import { getAuthenticatedUser, teamSession, assertAccountOwner } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { limit } from '@/lib/limits';
import { addMember, listTeam, removeMember, resendInvite } from '@/lib/team';

export const dynamic = 'force-dynamic';

/**
 * GET /api/team: the account's team and seats. A team member sees whose account they work in and
 * who else is on it, read only.
 */
export async function GET() {
  try {
    const u = await getAuthenticatedUser();
    const t = await teamSession();
    return Response.json({ ...(await listTeam(u.id)), you: t && !t.paused ? { member: true, email: t.member.email } : { member: false, email: u.email }, paused: Boolean(t?.paused) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/team (the owner only)
 *   { add: email }      adds someone: they get an email to choose a password and sign in
 *   { remove: id }      takes them off at once
 *   { resend: id }      a fresh invitation link for someone who has not signed in yet
 */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    await assertAccountOwner();
    const b = (await req.json()) as { add?: unknown; remove?: unknown; resend?: unknown };
    if (b.add !== undefined) {
      await limit('team-add', u.id, 30, 86400);
      return Response.json(await addMember(u, b.add));
    }
    if (b.remove !== undefined) return Response.json(await removeMember(u.id, b.remove));
    if (b.resend !== undefined) {
      await limit('team-resend', u.id, 20, 86400);
      return Response.json(await resendInvite(u, b.resend));
    }
    return Response.json({ error: 'Unknown request.' }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
