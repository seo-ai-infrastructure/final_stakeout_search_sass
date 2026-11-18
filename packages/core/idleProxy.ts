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
