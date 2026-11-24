import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { createEmbed, embedFor, embedsOn, revokeEmbed } from '@/lib/embeds';

export const dynamic = 'force-dynamic';

/** GET /api/embeds?scanId=: the live embed of that scan's report (or null), and whether the plan makes new ones. */
export async function GET(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    const scanId = new URL(req.url).searchParams.get('scanId') ?? '';
    const { embed } = await embedFor(u.id, scanId);
    return Response.json({ embed, allowed: await embedsOn(u.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/embeds { scanId }: turns the report's live embed on (Agency and up). */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    const b = (await req.json()) as { scanId?: unknown };
    if (typeof b.scanId !== 'string') throw new InputError('Which scan?');
    return Response.json({ embed: await createEmbed(u.id, b.scanId), allowed: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/embeds?token=: turns an embed off. */
export async function DELETE(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    await revokeEmbed(u.id, new URL(req.url).searchParams.get('token') ?? '');
    return Response.json({ embed: null });
  } catch (e) {
    return errorResponse(e);
  }
}
