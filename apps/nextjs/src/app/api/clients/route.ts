import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { InputError } from '@stakeout/core/grid';
import { mergeClients, separateClient } from '@stakeout/core/clients';

const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');

/** Merge one client name into another ({ from, into }), for this account only. */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    const b = (await req.json()) as Record<string, unknown>;
    const from = text(b.from), into = text(b.into);
    if (!from || !into) throw new InputError('Choose the two clients to merge.');
    if (!(await mergeClients(user.id, from, into))) throw new InputError('Those are already the same client.');
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Undo a merge ({ from }): that name becomes its own client again. */
export async function DELETE(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    const from = text(((await req.json()) as Record<string, unknown>).from);
    if (!from) throw new InputError('Choose the client to separate.');
    await separateClient(user.id, from);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
