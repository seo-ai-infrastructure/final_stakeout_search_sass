import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { postproxy } from '@/lib/postproxy';
import { removeProfile } from '@/lib/gbpBilling';
import { pushAlert } from '@stakeout/core/alerts';
import { flushAlerts } from '@/lib/alerts';

/**
 * A customer connecting their own Google Business account. Each connection gets its own Postproxy
 * profile group (a group holds one Google Business account), so one customer's listings can never
 * be reached through another's. Which profile belongs to whom is always read back from Postproxy
 * by group, never taken from the address the browser comes back on.
 */
const MAX_ACCOUNTS = 10;
type Profile = { id: string; name?: string; platform?: string; status?: string; profile_group_id?: string };

/** Where to send the browser so the customer can sign in to Google and pick the account to connect. */
export async function startConnect(u: { id: string }, origin: string): Promise<string> {
  const mine = await db.gbpAccount.findMany({ where: { userId: u.id } });
  // A connection that was started and never finished is picked up again rather than piling up.
  let row = mine.find((a) => a.profileId === null) ?? null;
  if (!row) {
    if (mine.length >= MAX_ACCOUNTS) throw new InputError(`An account can connect up to ${MAX_ACCOUNTS} Google accounts. Email us if you need more.`);
    const g = await postproxy<{ id?: string }>('/api/profile_groups', { method: 'POST', body: { profile_group: { name: 'Stakeout customer ' + u.id + ' #' + (mine.length + 1) } } }).catch(async (e) => {
      // Our own plan with the connection service is full: the customer is told to come back, and the admins are told now.
      if (e instanceof InputError && /plan limit/i.test(e.message)) {
        await pushAlert('gbp-groups-full', { subject: 'Stakeout: a customer could not connect Google (Postproxy group limit reached)', lines: ['A customer tried to connect a Google Business account and Postproxy refused: every profile group on the plan is in use.', 'Upgrade the Postproxy plan (or free a group by disconnecting an account) so customers can connect.'], path: '/profiles' }, 3600).catch(() => {});
        await flushAlerts().catch(() => {});
        throw new InputError('We cannot connect another Google account just now: we are at capacity and have been told. Try again later today, or email sass@stakeoutsearch.com.', 503);
      }
      throw e;
    });
    if (!g.id) throw new InputError('Could not start the connection. Try again in a minute.', 502);
    row = await db.gbpAccount.create({ data: { userId: u.id, groupId: g.id } });
  }
  const r = await postproxy<{ url?: string }>('/api/profile_groups/' + encodeURIComponent(row.groupId) + '/initialize_connection', {
    method: 'POST',
    body: { platform: 'google_business', redirect_url: origin + '/api/gbp/connect/callback?a=' + row.id },
  });
  if (!r.url || !/^https:\/\//.test(r.url)) throw new InputError('Could not start the connection. Try again in a minute.', 502);
  return r.url;
}

/** Back from Google: reads which account landed in this connection's group and records it. */
export async function finishConnect(u: { id: string }, rowId: string): Promise<'connected' | 'failed' | 'taken'> {
  const row = await db.gbpAccount.findFirst({ where: { id: rowId, userId: u.id } });
  if (!row) return 'failed';
  const r = await postproxy<{ data?: Profile[] }>('/api/profiles', { query: { profile_group_id: row.groupId } });
  // Only a profile that says it is in this group counts, whatever else the list holds.
  const p = (r.data ?? []).find((x) => x.platform === 'google_business' && x.profile_group_id === row.groupId);
  if (!p) return 'failed';
  const other = await db.gbpAccount.findFirst({ where: { profileId: p.id, id: { not: row.id } }, select: { id: true } });
  if (other) return 'taken';
  await db.gbpAccount.update({ where: { id: row.id }, data: { profileId: p.id, name: p.name ?? null } });
  return 'connected';
}

/** Disconnects one of a customer's Google accounts: its listings come off their plans and Postproxy forgets the account. */
export async function disconnect(u: { id: string }, rowId: string) {
  const row = await db.gbpAccount.findFirst({ where: { id: rowId, userId: u.id } });
  if (!row) throw new InputError('Unknown account.', 404);
  if (row.profileId) await removeProfile(u.id, row.profileId);
  await postproxy('/api/profile_groups/' + encodeURIComponent(row.groupId), { method: 'DELETE' }).catch((e) => {
    // Already gone there is fine; anything else is left for a retry.
    if (!(e instanceof InputError) || !/not reachable|404/.test(e.message)) throw e;
  });
  await db.gbpAccount.delete({ where: { id: row.id } });
}
