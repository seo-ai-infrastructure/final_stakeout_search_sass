import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { EXTRA_OUTLETS, isExtraOutlet, rankChoices, type ChosenOutlet, type ExtraOutlet, type ListingOutlets } from '@stakeout/core/outlets';
import { postproxy } from '@/lib/postproxy';

/**
 * A listing's other outlets (Facebook, LinkedIn). They are profiles in the same Postproxy profile
 * group as the listing's Google account; which Page of that sign-in is this listing's is kept in
 * the Kept table (scope "outlets", key "<google profile>|<location>").
 */
type Profile = { id: string; name?: string; platform?: string; status?: string; profile_group_id?: string; avatar_url?: string; expires_at?: string | null };
type Placement = { id: string | null; name?: string };

const keyOf = (t: { profile: string; location: string }) => t.profile + '|' + t.location;

export async function savedOutlets(t: { profile: string; location: string }): Promise<ListingOutlets> {
  const rows = await db.$queryRaw<{ value: string }[]>`SELECT value FROM "Kept" WHERE scope = 'outlets' AND key = ${keyOf(t)} LIMIT 1`;
  try {
    const v = JSON.parse(rows[0]?.value ?? '{}') as Record<string, unknown>;
    const out: ListingOutlets = {};
    for (const o of EXTRA_OUTLETS) {
      const c = v[o] as ChosenOutlet | undefined;
      if (c && typeof c.profile === 'string') out[o] = { profile: c.profile, placement: typeof c.placement === 'string' && c.placement ? c.placement : null, name: String(c.name ?? '') };
    }
    return out;
  } catch {
    return {};
  }
}

/** The outlets left unticked on this listing's last post ('google_business' included), so the next one starts the same way. */
export type Tick = ExtraOutlet | 'google_business';
export async function savedTicksOff(t: { profile: string; location: string }): Promise<Tick[]> {
  const rows = await db.$queryRaw<{ value: string }[]>`SELECT value FROM "Kept" WHERE scope = 'outlets' AND key = ${keyOf(t)} LIMIT 1`;
  try {
    const off = (JSON.parse(rows[0]?.value ?? '{}') as { off?: unknown }).off;
    return Array.isArray(off) ? (off.filter((x) => x === 'google_business' || isExtraOutlet(x)) as Tick[]) : [];
  } catch {
    return [];
  }
}
export async function saveTicksOff(t: { profile: string; location: string }, off: Tick[]) {
  const [saved, before] = await Promise.all([savedOutlets(t), savedTicksOff(t)]);
  if ([...off].sort().join() === [...before].sort().join()) return;
  await save(t, saved, off);
}

/**
 * Which listing a post was made for: our own record, written when the post is created. It is what
 * ties a post to its listing when the post was not sent to Google (a post with a Google copy is
 * also tied by the location written in that copy, so older posts need no record).
 */
export async function recordPostOwner(postId: string, t: { profile: string; location: string }) {
  await db.$executeRaw`INSERT INTO "Kept" (scope, key, value, "updatedAt") VALUES ('post-owner', ${postId}, ${keyOf(t)}, now()) ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`;
}
export async function isPostOwner(postId: string, t: { profile: string; location: string }) {
  const rows = await db.$queryRaw<{ value: string }[]>`SELECT value FROM "Kept" WHERE scope = 'post-owner' AND key = ${postId} LIMIT 1`;
  return rows[0]?.value === keyOf(t);
}
/** The newest posts recorded for a listing (ids). */
export async function postsOwnedBy(t: { profile: string; location: string }, limit = 60) {
  const rows = await db.$queryRaw<{ key: string }[]>`SELECT key FROM "Kept" WHERE scope = 'post-owner' AND value = ${keyOf(t)} ORDER BY "updatedAt" DESC LIMIT ${limit}`;
  return rows.map((r) => r.key);
}
export const forgetPostOwner = (postId: string) => db.$executeRaw`DELETE FROM "Kept" WHERE scope = 'post-owner' AND key = ${postId}`;

async function save(t: { profile: string; location: string }, v: ListingOutlets, off?: Tick[]) {
  const value = JSON.stringify({ ...v, off: off ?? (await savedTicksOff(t)) });
  await db.$executeRaw`INSERT INTO "Kept" (scope, key, value, "updatedAt") VALUES ('outlets', ${keyOf(t)}, ${value}, now()) ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`;
}

/** The profile group the listing's Google account is in, and every profile in that group. */
async function groupOf(googleProfile: string) {
  const all = (await postproxy<{ data?: Profile[] }>('/api/profiles')).data ?? [];
  const g = all.find((p) => p.id === googleProfile)?.profile_group_id;
  if (!g) throw new InputError('This Google account is not reachable just now. Try again in a minute.', 502);
  return { group: g, profiles: all.filter((p) => p.profile_group_id === g) };
}

export const placementsOf = async (profileId: string) =>
  ((await postproxy<{ data?: Placement[] }>('/api/profiles/' + encodeURIComponent(profileId) + '/placements')).data ?? []).map((p) => ({ id: p.id ? String(p.id) : null, name: String(p.name ?? 'Unnamed') }));

/**
 * The outlet strip for one listing: for Facebook and LinkedIn, whether an account is connected in
 * the listing's group, and which Page was chosen for this listing. Right after a sign-in, when
 * that sign-in manages exactly one Page, it is chosen without asking.
 */
export async function outletStrip(t: { profile: string; location: string }) {
  const [{ profiles }, saved] = await Promise.all([groupOf(t.profile), savedOutlets(t)]);
  // The listing's own name, to put the Page that looks like it first in a long list.
  let listing: string | null = null;
  const named = async () => (listing ??= (await placementsOf(t.profile).catch(() => [])).find((x) => x.id === t.location)?.name ?? '');
  let changed = false;
  const outlets = await Promise.all(
    EXTRA_OUTLETS.map(async (outlet) => {
      const p = profiles.find((x) => x.platform === outlet);
      let chosen = saved[outlet];
      // The sign-in was removed or replaced since the Page was chosen: the choice no longer holds.
      if (chosen && (!p || p.id !== chosen.profile)) {
        delete saved[outlet];
        chosen = undefined;
        changed = true;
      }
      let choices: { id: string | null; name: string; suggested?: boolean }[] | null = null;
      if (p && !chosen) {
        choices = await placementsOf(p.id).catch(() => null);
        if (choices && choices.length > 1) choices = rankChoices(await named(), choices);
        if (choices && choices.length === 1) {
          chosen = { profile: p.id, placement: choices[0].id, name: choices[0].name };
          saved[outlet] = chosen;
          changed = true;
          choices = null;
        }
      }
      return {
        outlet,
        connected: Boolean(p),
        account: p?.name ?? null,
        avatar: p?.avatar_url && /^https:\/\//.test(p.avatar_url) ? p.avatar_url : null,
        status: p?.status ?? null,
        expiresAt: p?.expires_at ?? null,
        chosen: chosen ? { id: chosen.placement, name: chosen.name } : null,
        /** The Pages to choose from, when one is connected and none is chosen yet. */
        choices,
      };
    }),
  );
  if (changed) await save(t, saved);
  return outlets;
}

/** A link to sign in to that outlet; the account lands in the listing's own profile group. */
export async function connectOutlet(t: { profile: string }, outlet: ExtraOutlet, back: string) {
  const { group } = await groupOf(t.profile);
  const r = await postproxy<{ url?: string }>('/api/profile_groups/' + encodeURIComponent(group) + '/initialize_connection', { method: 'POST', body: { platform: outlet, redirect_url: back } });
  if (!r.url || !/^https:\/\//.test(r.url)) throw new InputError('Could not start the connection. Try again in a minute.', 502);
  return r.url;
}

/** Records which Page (or own profile) is this listing's on that outlet. It must be one the sign-in really manages. */
export async function chooseOutlet(t: { profile: string; location: string }, outlet: ExtraOutlet, placement: string | null) {
  const { profiles } = await groupOf(t.profile);
  const p = profiles.find((x) => x.platform === outlet);
  if (!p) throw new InputError('Connect that account first.', 409);
  const pick = (await placementsOf(p.id)).find((x) => x.id === placement);
  if (!pick) throw new InputError('That Page is not one this sign-in manages.', 404);
  const saved = await savedOutlets(t);
  saved[outlet] = { profile: p.id, placement: pick.id, name: pick.name };
  await save(t, saved);
}

/** Forgets this listing's choice on that outlet (the sign-in itself stays, for the group's other listings). */
export async function forgetOutlet(t: { profile: string; location: string }, outlet: ExtraOutlet) {
  const saved = await savedOutlets(t);
  delete saved[outlet];
  await save(t, saved);
}

/** The outlets a post asked for, as chosen for this listing and still connected. Unknown names are refused. */
export async function outletsToSend(t: { profile: string; location: string }, asked: unknown): Promise<ListingOutlets> {
  const names = Array.isArray(asked) ? [...new Set(asked.map(String))] : [];
  if (!names.length) return {};
  if (!names.every(isExtraOutlet)) throw new InputError('A post can also go to: ' + EXTRA_OUTLETS.join(', ') + '.');
  const [{ profiles }, saved] = await Promise.all([groupOf(t.profile), savedOutlets(t)]);
  const out: ListingOutlets = {};
  for (const o of names as ExtraOutlet[]) {
    const c = saved[o];
    if (c && profiles.some((p) => p.id === c.profile && p.platform === o)) out[o] = c;
  }
  return out;
}
