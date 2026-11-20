/**
 * How much data one point used on the phone, and which apps used it. Pure reading of what the
 * phone prints; the worker runs the commands (apps/worker/src/mobile.ts).
 *
 * The total is the phone's own network card counter (/sys/class/net/<card>/statistics), read
 * before and after the point. The split by app is Android's own per-app accounting (dumpsys
 * netstats), read after asking it to write its pending numbers down (a "poll").
 */

/** "wlan0 123 456" lines (card, bytes in, bytes out) → bytes per card. */
export function parseIfaceBytes(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of String(text ?? '').split('\n')) {
    const m = line.trim().match(/^([\w.-]+)\s+(\d+)\s+(\d+)$/);
    if (m) out[m[1]] = Number(m[2]) + Number(m[3]);
  }
  return out;
}

/** The card the phone's traffic goes through: Wi-Fi, then wired, then whichever real card moved the most. */
export function pickIface(before: Record<string, number>, after: Record<string, number>): string | null {
  for (const name of ['wlan0', 'eth0']) if (name in before && name in after) return name;
  const real = Object.keys(after).filter((n) => n in before && !/^(lo|dummy|tun|ip6?_?tnl|sit|ifb|ip_vti|ip6_vti|ip6gre|gre)/.test(n));
  real.sort((a, b) => after[b] - before[b] - (after[a] - before[a]));
  return real[0] ?? null;
}

/**
 * Bytes per app id (uid) from `dumpsys netstats` (the "UID stats" part only: the parts before it
 * count the same bytes per network, and "UID tag stats" counts them a second time per tag).
 */
export function parseUidBytes(text: string): Record<string, number> {
  const lines = String(text ?? '').split('\n');
  const hasSection = lines.some((l) => /^UID stats:/i.test(l.trim()) && !/^\s/.test(l));
  const out: Record<string, number> = {};
  let inside = !hasSection;
  let uid: string | null = null;
  for (const line of lines) {
    if (hasSection && /^\S.*stats:\s*$/i.test(line)) {
      inside = /^UID stats:/i.test(line);
      uid = null;
      continue;
    }
    if (!inside) continue;
    const who = line.match(/\buid=(-?\d+)\b/);
    if (who) {
      const tag = line.match(/\btag=(0x[0-9a-f]+|\d+)/i)?.[1];
      // Tagged rows repeat bytes already counted on the untagged row.
      uid = Number(who[1]) >= 0 && (!tag || Number(tag) === 0) ? who[1] : null;
      continue;
    }
    if (!uid) continue;
    const rb = line.match(/\brb=(\d+)/), tb = line.match(/\btb=(\d+)/);
    if (rb || tb) out[uid] = (out[uid] ?? 0) + Number(rb?.[1] ?? 0) + Number(tb?.[1] ?? 0);
  }
  return out;
}

/** `pm list packages -U` ("package:com.x uid:10123") → app id → package name(s). */
export function parseUidPackages(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of String(text ?? '').split('\n')) {
    const m = line.trim().match(/^package:(\S+)\s+uid:(\d+)/);
    if (!m) continue;
    out[m[2]] = out[m[2]] ? (out[m[2]].split('+').length < 3 ? out[m[2]] + '+' + m[1] : out[m[2]]) : m[1];
  }
  return out;
}

const SYSTEM_UIDS: Record<string, string> = { '0': 'system (root)', '1000': 'android system', '1051': 'dns', '1073': 'network stack', '2000': 'adb shell' };
export const uidName = (uid: string, names: Record<string, string>) => names[uid] ?? SYSTEM_UIDS[uid] ?? 'uid ' + uid;

export type DataUse = {
  /** Megabytes through the phone's network card during the point (null when it could not be read). */
  totalMb: number | null;
  iface: string | null;
  /** The apps that used the most, largest first. */
  apps: { app: string; mb: number }[];
  /** Megabytes the per-app list accounts for (all apps, not just the ones listed). */
  appsMb: number | null;
};

const mb = (bytes: number) => Math.round((bytes / 1048576) * 100) / 100;

/** What was used between two readings. A counter that went backwards (a restart) counts as nothing. */
export function dataUsed(
  before: { ifaces: Record<string, number>; uids: Record<string, number> },
  after: { ifaces: Record<string, number>; uids: Record<string, number> },
  names: Record<string, string> = {},
  top = 6,
): DataUse {
  const iface = pickIface(before.ifaces, after.ifaces);
  const total = iface ? after.ifaces[iface] - before.ifaces[iface] : null;
  const haveUids = Object.keys(before.uids).length > 0 && Object.keys(after.uids).length > 0;
  const deltas = haveUids
    ? Object.keys(after.uids)
        .map((uid) => ({ uid, bytes: after.uids[uid] - (before.uids[uid] ?? 0) }))
        .filter((x) => x.bytes > 0)
        .sort((a, b) => b.bytes - a.bytes)
    : [];
  return {
    totalMb: total == null || total < 0 ? null : mb(total),
    iface,
    apps: deltas.slice(0, top).filter((x) => x.bytes >= 10240).map((x) => ({ app: uidName(x.uid, names), mb: mb(x.bytes) })),
    appsMb: haveUids ? mb(deltas.reduce((n, x) => n + x.bytes, 0)) : null,
  };
}

/** One log line: "31.2 MB on wlan0 · com.android.chrome 18.4, com.google.android.gms 9.1". */
export function dataLine(u: DataUse): string {
  const total = u.totalMb == null ? 'total not read' : u.totalMb + ' MB on ' + u.iface;
  const apps = u.apps.length ? u.apps.map((a) => a.app + ' ' + a.mb).join(', ') : u.appsMb == null ? 'per-app not read' : 'no app above 0.01 MB';
  return total + ' · ' + apps + (u.appsMb != null ? ' · all apps ' + u.appsMb + ' MB' : '');
}
