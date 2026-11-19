/**
 * Where a free account is shown that a scan (or a listing plan) would answer a question its own
 * numbers raise. Each is a plain rule over figures the account can already see.
 */

export type MobileQuery = { query: string; clicks: number; impressions: number; position: number | null };
export type FlaggedQuery = MobileQuery & { ctr: number };

/** On phones over 28 days: shown at least this often, in the first eight results, and clicked less than this percent of the time. */
export const LOW_CTR = { impressions: 250, ctr: 2.5, position: 8 };

const words = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** The website's own name as one word: "www.stuart-plumbing.com" gives "stuartplumbing". */
export const hostLabel = (host: string) => (host.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/.]/)[0] ?? '').replace(/[^a-z0-9]/g, '');

/** A search for the business by name: it spells out the website's name, or carries the brand word. */
export function brandedQuery(query: string, host: string, brand = ''): boolean {
  const label = hostLabel(host);
  if (label.length >= 4 && words(query).join('').includes(label)) return true;
  return Boolean(brand) && words(query).includes(brand.toLowerCase());
}

/**
 * The searches worth looking at on a real phone: people see the page near the top and do not click,
 * which usually means a map pack, an AI answer or ads sit above it. When none meets the rule, the
 * three most-shown searches that name a place or "near me" (or, failing those, the three most shown).
 */
export function lowMobileCtr(rows: MobileQuery[], host: string, brand = ''): { rows: FlaggedQuery[]; fallback: boolean } {
  const open = rows.filter((r) => r.query && r.impressions > 0 && !brandedQuery(r.query, host, brand)).map((r) => ({ ...r, ctr: Math.round((r.clicks / r.impressions) * 1000) / 10 }));
  const flagged = open.filter((r) => r.impressions >= LOW_CTR.impressions && r.ctr < LOW_CTR.ctr && r.position !== null && r.position <= LOW_CTR.position).sort((a, b) => b.impressions - a.impressions);
  if (flagged.length) return { rows: flagged.slice(0, 25), fallback: false };
  const byShown = [...open].sort((a, b) => b.impressions - a.impressions);
  const local = byShown.filter((r) => /\bnear\b|\bnearby\b|\bin\s+[a-z]/.test(r.query.toLowerCase()));
  return { rows: (local.length ? local : byShown).slice(0, 3), fallback: true };
}

export type DeviceRow = { device: string; impressions: number; position: number | null };

/**
 * Whether phones deserve their own look: most of the times shown are on a phone (65% or more), or
 * the page sits at least 2.5 places lower on phones than on computers. Null when neither.
 */
export function deviceFlag(devices: DeviceRow[]): { mobileShare: number; gap: number | null; why: 'share' | 'position' } | null {
  const of = (name: string) => devices.find((d) => d.device.toUpperCase() === name);
  const mobile = of('MOBILE'), desktop = of('DESKTOP');
  const total = devices.reduce((n, d) => n + d.impressions, 0);
  if (!mobile || !total) return null;
  const mobileShare = Math.round((mobile.impressions / total) * 100);
  const gap = mobile.position !== null && desktop && desktop.position !== null ? Math.round((mobile.position - desktop.position) * 10) / 10 : null;
  if (gap !== null && gap >= 2.5) return { mobileShare, gap, why: 'position' };
  if (mobileShare >= 65) return { mobileShare, gap, why: 'share' };
  return null;
}

/**
 * After a finished 5×5 scan: how many of its points the business missed the top three on (or, with
 * AI Overviews tracked, was left out of the AI answer on). Worth raising from four points up.
 */
export function scanBridge(scan: { status: string; totalPins: number; trackAiOverviews: boolean }, pins: { status: string; rankFound: number | null; hasAiOverview: boolean; targetCitedInAi: boolean }[]): { weak: number; total: number; why: 'rank' | 'ai' } | null {
  if (scan.status !== 'COMPLETED' || scan.totalPins !== 25) return null;
  const done = pins.filter((p) => p.status === 'COMPLETED');
  const low = done.filter((p) => p.rankFound === null || p.rankFound > 3).length;
  const left = scan.trackAiOverviews ? done.filter((p) => p.hasAiOverview && !p.targetCitedInAi).length : 0;
  if (low >= 4) return { weak: low, total: scan.totalPins, why: 'rank' };
  if (left >= 4) return { weak: left, total: scan.totalPins, why: 'ai' };
  return null;
}
