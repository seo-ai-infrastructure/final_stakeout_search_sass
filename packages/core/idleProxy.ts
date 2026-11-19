/**
 * Idle proxies: while no point is waiting, each phone is bound to its own proxy from one DuoPlus
 * proxy group (IDLE_PROXY_GROUP), so an idle phone's background traffic stops using paid
 * residential or mobile data. One proxy, one IP, per phone, and the same one every time. A
 * phone's next point binds its own search proxy again before anything is checked or searched.
 * Pure rules here; the worker does the binding (apps/worker/src/idleProxy.ts).
 */

/** Redis: which idle proxy each phone has (hash imageId → proxy id), and which one it is bound to now. */
export const IDLE_MAP_KEY = 'stakeout:idleproxies';
export const idleBoundKey = (imageId: string) => 'stakeout:idlebound:' + imageId;

/** The proxies of one DuoPlus proxy group, from proxy/list rows ({ id, group_ids: [...] }). */
export function groupProxyIds(rows: unknown[], group: string): string[] {
  const ids = rows
    .filter((r): r is { id: unknown; group_ids?: unknown } => Boolean(r) && typeof r === 'object' && 'id' in (r as object))
    .filter((r) => Array.isArray(r.group_ids) && r.group_ids.map(String).includes(group))
    .map((r) => String(r.id));
  return [...new Set(ids)].sort();
}

/**
 * One idle proxy per phone, kept stable: a phone keeps the proxy it had while that proxy is still
 * in the group and no other phone has it; the rest are handed out in order. A proxy that is some
 * phone's own search record is never handed out (the worker rewrites those for every point).
 * Phones left over when there are more phones than proxies get none, and stay as they are.
 */
export function assignIdleProxies(phones: string[], proxyIds: string[], previous: Record<string, string>, reserved: Set<string>) {
  const usable = proxyIds.filter((id) => !reserved.has(id));
  const free = new Set(usable);
  const map: Record<string, string> = {};
  for (const phone of phones) {
    const had = previous[phone];
    if (had && free.has(had)) {
      map[phone] = had;
      free.delete(had);
    }
  }
  const rest = usable.filter((id) => free.has(id));
  const without: string[] = [];
  for (const phone of phones) {
    if (map[phone]) continue;
    const next = rest.shift();
    if (next) map[phone] = next;
    else without.push(phone);
  }
  return { map, without };
}

/** One phone, as the idle check sees it. Times are epoch milliseconds (0 = not set). */
export type IdlePhone = {
  imageId: string;
  /** A point (or an idle switch) holds the phone right now. */
  locked: boolean;
  /** Its last point's evidence is still being pulled from it. */
  busy: boolean;
  /** Since when it has been free (first seen without a lock). */
  freeSince: number;
  /** When its rest between searches ends. */
  restEndsAt: number;
  /** It has an idle proxy and is not on it yet. */
  wantsIdle: boolean;
  /** DuoPlus refused its idle proxy: not asked again before this. */
  refusedUntil: number;
};

/**
 * The phones to move to their idle proxy now. A phone moves on its own, as soon as it has been
 * free for `afterMs`, whatever the rest of the fleet is doing: a paid proxy carries a search and
 * nothing else. One exception keeps busy scans fast: while points are waiting, a phone whose rest
 * is over (or ends within `soonMs`) is about to be given a point, so it is left alone, unless it
 * has been free for `unusedMs` (no waiting point can use it: wrong model, or held back).
 */
export function dueForIdle(phones: IdlePhone[], now: number, afterMs: number, runnable: number, soonMs = 45000, unusedMs = 180000): string[] {
  return phones
    .filter((p) => p.wantsIdle && !p.locked && !p.busy && p.freeSince > 0 && now - p.freeSince >= afterMs && p.refusedUntil <= now)
    .filter((p) => runnable <= 0 || p.restEndsAt - now > soonMs || now - p.freeSince >= unusedMs)
    .map((p) => p.imageId);
}

/**
 * The paid proxy lists that can be deleted now: unused for `keepMs` (a scan started straight after
 * another finds its lists ready) and not needed by any open scan. A list is needed while a scan is
 * open in its state, or when it was used since the oldest open scan began (every list a new scan
 * uses is touched when the scan is created, and again by each point that searches through it:
 * this covers the next state over, for a grid on a state line). With no scan open, only the time counts.
 */
export function listsToRelease<T extends { region: string; lastUsedAt: Date }>(
  lists: T[],
  open: { regions: Set<string>; oldestAt: Date | null },
  now: number,
  keepMs: number,
): T[] {
  const marginMs = 10 * 60000; // lists are prepared just before the scan is saved
  return lists.filter((l) => {
    const used = l.lastUsedAt.getTime();
    if (now - used < keepMs) return false;
    if (open.regions.has(l.region)) return false;
    return !open.oldestAt || used < open.oldestAt.getTime() - marginMs;
  });
}
