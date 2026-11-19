import { db } from '@stakeout/db';
import { redis } from '@stakeout/core/redis';
import { pushAlert } from '@stakeout/core/alerts';
import { driftAlert, findDrift } from '@stakeout/core/gbpWatch';
import type { FieldChange, GbpLocation } from '@stakeout/core/gbp';
import { postproxy } from '@/lib/postproxy';
import { readLocation } from '@/lib/gbpAdmin';
import { flushAlerts } from '@/lib/alerts';

type Place = { profile: string; location: string; name: string };
export type WatchRun = { listings: number; fresh: number; changed: number; found: number; problems: number; at: string };
const RUN_KEY = 'stakeout:gbpwatch:last';
// Through JSON, so only plain values are stored.
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const today = () => new Date().toISOString().slice(0, 10);

/** Every listing every connected Google Business account can manage. */
export async function watchedPlaces(): Promise<Place[]> {
  const all = await postproxy<{ data?: { id: string; platform: string }[] }>('/api/profiles');
  const out: Place[] = [];
  for (const p of (all.data ?? []).filter((x) => x.platform === 'google_business')) {
    const r = await postproxy<{ data?: { id: string; name: string }[] }>('/api/profiles/' + encodeURIComponent(p.id) + '/placements').catch(() => ({ data: [] }));
    for (const l of r.data ?? []) if (/^accounts\/[0-9]+\/locations\/[0-9]+$/.test(l.id)) out.push({ profile: p.id, location: l.id, name: l.name });
  }
  // A listing two accounts can manage is checked once.
  return out.filter((p, i) => out.findIndex((x) => x.location === p.location) === i);
}

/**
 * Reads one listing and compares it with its baseline. The first time, the profile as it is
 * becomes the baseline and nothing is reported. Returns the changes found now that were not
 * already open. Changes that went back by themselves are closed.
 */
export async function checkListing(p: Place): Promise<{ fresh: boolean; found: { title: string; label: string; was: string; now: string }[] }> {
  const live = await readLocation(p.profile, p.location);
  const title = live.title ?? p.name;
  const watch = await db.gbpWatch.findUnique({ where: { locationId: p.location } });
  if (!watch) {
    await db.gbpWatch.create({ data: { locationId: p.location, profileId: p.profile, title, baseline: plain(live) } });
    return { fresh: true, found: [] };
  }
  // What our own edits of the last 30 days set each field to: one of those showing up is ours.
  const edits = await db.gbpEdit.findMany({ where: { locationId: p.location, status: { not: 'FAILED' }, createdAt: { gt: new Date(Date.now() - 30 * 86400000) } }, select: { changes: true } });
  const ours: Record<string, string[]> = {};
  for (const e of edits) for (const c of (e.changes as unknown as FieldChange[]) ?? []) (ours[c.key] ??= []).push(c.to);

  const accepted = { ...((watch.accepted as Record<string, string>) ?? {}) };
  const { drift, absorbed } = findDrift(watch.baseline as unknown as GbpLocation, live, today(), accepted, ours);
  Object.assign(accepted, absorbed);
  const open = await db.gbpDrift.findMany({ where: { locationId: p.location, status: 'OPEN' } });
  const found: { title: string; label: string; was: string; now: string }[] = [];
  for (const d of drift) {
    const had = open.find((o) => o.field === d.key);
    if (had && had.now === d.now) continue;
    // It moved again before anyone decided: the open entry follows it.
    if (had) await db.gbpDrift.update({ where: { id: had.id }, data: { now: d.now, foundAt: new Date() } });
    else await db.gbpDrift.create({ data: { locationId: p.location, profileId: p.profile, title, field: d.key, label: d.label, was: d.was, now: d.now } });
    found.push({ title, label: d.label, was: d.was, now: d.now });
  }
  const gone = open.filter((o) => !drift.some((d) => d.key === o.field));
  if (gone.length) await db.gbpDrift.updateMany({ where: { id: { in: gone.map((g) => g.id) } }, data: { status: 'GONE', resolvedAt: new Date() } });
  await db.gbpWatch.update({ where: { locationId: p.location }, data: { title, profileId: p.profile, accepted, checkedAt: new Date(), problem: null } });
  return { fresh: false, found };
}

/** Checks every listing (three at a time), emails the admins what was found, and remembers how the run went. */
export async function checkAllListings(): Promise<WatchRun> {
  const places = await watchedPlaces();
  const run: WatchRun = { listings: places.length, fresh: 0, changed: 0, found: 0, problems: 0, at: new Date().toISOString() };
  const found: { title: string; label: string; was: string; now: string }[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let p = places[next++]; p; p = places[next++]) {
        try {
          const r = await checkListing(p);
          if (r.fresh) run.fresh++;
          if (r.found.length) run.changed++;
          found.push(...r.found);
        } catch (e) {
          run.problems++;
          const problem = (e instanceof Error ? e.message : 'Could not be read.').slice(0, 300);
          await db.gbpWatch.updateMany({ where: { locationId: p.location }, data: { problem, checkedAt: new Date() } }).catch(() => {});
        }
      }
    }),
  );
  run.found = found.length;
  await redis().set(RUN_KEY, JSON.stringify(run), 'EX', 30 * 86400).catch(() => {});
  const alert = driftAlert(found);
  if (alert) {
    await pushAlert('gbp-drift:' + run.at, { ...alert, path: '/admin/profiles?tab=changes' }, 60);
    await flushAlerts().catch((e) => console.error('[gbp-watch] email not sent:', (e as Error).message));
  }
  return run;
}

export const lastWatchRun = () => redis().get(RUN_KEY).then((v) => (v ? (JSON.parse(v) as WatchRun) : null)).catch(() => null);
