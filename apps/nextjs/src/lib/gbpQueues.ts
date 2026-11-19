import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { postproxy } from '@/lib/postproxy';

/**
 * Posting queues: weekly time slots that queued posts fall into, one after another. A queue
 * belongs to the connected Google account's group at the service, so an account only ever sees
 * and fills its own.
 */
export type Queue = { id: string; name: string; description: string | null; timezone: string; enabled: boolean; jitter: number; timeslots: { day: number; time: string }[]; waiting: number };
type Raw = { id?: unknown; name?: unknown; description?: unknown; timezone?: unknown; enabled?: unknown; jitter?: unknown; timeslots?: { day?: unknown; time?: unknown }[]; posts_count?: unknown };
type Who = { id: string; role: string };

const read = (q: Raw): Queue => ({
  id: String(q.id ?? ''), name: String(q.name ?? ''), description: typeof q.description === 'string' ? q.description : null, timezone: String(q.timezone ?? 'UTC'),
  enabled: q.enabled !== false, jitter: Number(q.jitter) || 0,
  timeslots: (Array.isArray(q.timeslots) ? q.timeslots : []).map((s) => ({ day: Number(s.day), time: String(s.time ?? '') })),
  waiting: Number(q.posts_count) || 0,
});

/** The service's group a connected Google account sits in. */
export async function groupOf(u: Who, profile: string): Promise<string> {
  if (u.role !== 'ADMIN') {
    const a = await db.gbpAccount.findFirst({ where: { userId: u.id, profileId: profile }, select: { groupId: true } });
    if (!a) throw new InputError('Unknown profile.', 404);
    return a.groupId;
  }
  const all = await postproxy<{ data?: { id: string; profile_group_id?: string }[] }>('/api/profiles');
  const group = (all.data ?? []).find((p) => p.id === profile)?.profile_group_id;
  if (!group) throw new InputError('Unknown profile.', 404);
  return group;
}

export async function queuesOf(u: Who, profile: string): Promise<Queue[]> {
  const group = await groupOf(u, profile);
  const r = await postproxy<{ data?: Raw[]; queues?: Raw[] } | Raw[]>('/api/post_queues', { query: { profile_group_id: group } });
  const list = Array.isArray(r) ? r : r.data ?? r.queues ?? [];
  return list.map(read).filter((q) => q.id);
}

/** When a queue would place its next post (null when the service cannot say). */
export const nextSlot = (id: string) => postproxy<{ next_slot?: string }>('/api/post_queues/' + encodeURIComponent(id) + '/next_slot').then((r) => r.next_slot ?? null).catch(() => null);

/**
 * Makes a queue. Posts are moved a few minutes either way of each slot (`jitter`, 15 by default)
 * so a listing does not post at the very same minute every week.
 */
export async function makeQueue(u: Who, profile: string, o: { name: unknown; timezone: unknown; timeslots: unknown; jitter: unknown }): Promise<Queue> {
  const name = String(o.name ?? '').trim().slice(0, 80);
  if (!name) throw new InputError('Give the queue a name.');
  const timezone = String(o.timezone ?? '').trim();
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { throw new InputError('Give the time zone by its name, such as America/New_York.'); }
  if (!timezone) throw new InputError('Give the time zone by its name, such as America/New_York.');
  const slots = (Array.isArray(o.timeslots) ? o.timeslots : []).map((s) => ({ day: Number((s as { day?: unknown })?.day), time: String((s as { time?: unknown })?.time ?? '') }));
  if (!slots.length || slots.length > 21 || slots.some((s) => !Number.isInteger(s.day) || s.day < 0 || s.day > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)))
    throw new InputError('Give 1 to 21 weekly slots, each a day (0 Sunday to 6 Saturday) and a time (HH:MM, 24-hour).');
  const jitter = o.jitter === undefined ? 15 : Math.min(60, Math.max(0, Math.round(Number(o.jitter)) || 0));
  if ((await queuesOf(u, profile)).length >= 5) throw new InputError('This account already has five queues. Use one of them.', 409);
  const made = await postproxy<Raw>('/api/post_queues', { method: 'POST', body: { profile_group_id: await groupOf(u, profile), post_queue: { name, timezone, jitter, queue_timeslots_attributes: slots } } });
  return read(made);
}
