import { InputError } from '@stakeout/core/grid';
import { getAuthenticatedUser } from '@/lib/auth';
import { postproxy, gbpPath } from '@/lib/postproxy';
import type { GbpLocation } from '@stakeout/core/gbp';

/** Google profile editing is for admins only. */
export async function gbpAdmin() {
  const u = await getAuthenticatedUser();
  if (u.role !== 'ADMIN') throw new InputError('Admins only.', 403);
  return u;
}

/** A profile id and a location path from a request, checked for shape before they go into a URL. */
export function target(profile: unknown, location: unknown) {
  const p = String(profile ?? '');
  const l = String(location ?? '');
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(p)) throw new InputError('Unknown profile.');
  if (!/^accounts\/[0-9]+\/locations\/[0-9]+$/.test(l)) throw new InputError('Unknown location.');
  return { profile: p, location: l };
}

/** The location as Google has it right now. */
export const readLocation = (profile: string, location: string) =>
  postproxy<GbpLocation>(gbpPath(profile, 'location'), { query: { location_id: location } });
