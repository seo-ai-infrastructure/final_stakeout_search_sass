/**
 * Clients on the Scans page are simply the business names on an account's scans. Names that
 * differ only by capitals or spacing are the same client; an account can also merge two
 * differently written names ("Payne Air" into "Payne Air Conditioning & Heating").
 * No imports: used by the website and by tests.
 */
export const clientKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** `merges` maps a name's key to the name it was merged into. Follows a chain, never a loop. */
export function clientName(name: string, merges: Record<string, string>): string {
  let out = name.trim().replace(/\s+/g, ' ');
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const key = clientKey(out);
    const next = merges[key];
    if (!next || seen.has(key)) break;
    seen.add(key);
    out = next;
  }
  return out;
}

/** Adds "from is the same client as into". Returns null when that would be pointless or a loop. */
export function addMerge(merges: Record<string, string>, from: string, into: string): Record<string, string> | null {
  const a = clientKey(from), target = clientName(into, merges);
  if (!a || !target.trim() || a === clientKey(target)) return null;
  return { ...merges, [a]: target };
}
