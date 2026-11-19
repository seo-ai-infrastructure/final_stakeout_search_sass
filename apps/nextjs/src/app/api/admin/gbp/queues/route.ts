import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { gate } from '@/lib/gbpAccess';
import { makeQueue, nextSlot, queuesOf } from '@/lib/gbpQueues';

export const maxDuration = 60;

/**
 * GET /api/admin/gbp/queues?profile=&location=: the posting queues of the connected account this
 * listing is in, each with its weekly slots, how many posts are waiting, and when its next post would go out.
 */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const t = await gate(q.get('profile'), q.get('location'), 'manage');
    const queues = await queuesOf(t.u, t.profile);
    const next = await Promise.all(queues.map((x) => (x.enabled && x.timeslots.length ? nextSlot(x.id) : Promise.resolve(null))));
    return NextResponse.json({ queues: queues.map((x, i) => ({ ...x, nextSlot: next[i] })) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/admin/gbp/queues { profile, location, name, timezone, timeslots: [{ day, time }], jitter }: makes a queue. */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const t = await gate(b.profile, b.location, 'manage');
    return NextResponse.json({ queue: await makeQueue(t.u, t.profile, { name: b.name, timezone: b.timezone, timeslots: b.timeslots, jitter: b.jitter }) });
  } catch (e) {
    return errorResponse(e);
  }
}
