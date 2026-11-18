/**
 * A Google Business Profile's performance, read through Postproxy: what Google counted for the
 * listing over the last 30 days against the 30 before, and the searches that showed it.
 */

export const METRICS = [
  { key: 'views', label: 'Views on Search and Maps', from: ['views'] },
  { key: 'calls', label: 'Calls', from: ['call_clicks'] },
  { key: 'websiteClicks', label: 'Website clicks', from: ['website_clicks'] },
  { key: 'directions', label: 'Direction requests', from: ['business_direction_requests', 'direction_requests'] },
  { key: 'conversations', label: 'Messages', from: ['business_conversations', 'conversations'] },
  { key: 'bookings', label: 'Bookings', from: ['business_bookings', 'bookings'] },
] as const;
export type MetricKey = (typeof METRICS)[number]['key'];
export type Totals = Record<MetricKey, number>;

const IMPRESSIONS = ['business_impressions_desktop_search', 'business_impressions_desktop_maps', 'business_impressions_mobile_search', 'business_impressions_mobile_maps'];

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** One day's (or one snapshot's) numbers, wherever the service put them: on the record, or under platform_stats or stats. */
function read(rec: Row, names: readonly string[]): number | null {
  for (const where of [rec, rec.platform_stats, rec.stats] as (Row | undefined)[])
    if (where && typeof where === 'object') for (const n of names) if (num(where[n]) !== null) return num(where[n]);
  return null;
}

function metricsOf(rec: Row): Partial<Totals> {
  const out: Partial<Totals> = {};
  for (const m of METRICS) {
    let v = read(rec, m.from);
    // Views is the four impression counts added up when it is not given as one number.
    if (v === null && m.key === 'views') {
      const parts = IMPRESSIONS.map((n) => read(rec, [n])).filter((x): x is number => x !== null);
      if (parts.length) v = parts.reduce((a, b) => a + b, 0);
    }
    if (v !== null) out[m.key] = v;
  }
  return out;
}

const empty = (): Totals => ({ views: 0, calls: 0, websiteClicks: 0, directions: 0, conversations: 0, bookings: 0 });

/**
 * Daily records added up into two periods: the `days` up to and including `to`, and the `days`
 * before that. `known` lists the metrics that appeared in the data at all; `daysWithData` is how
 * many days of the recent period had a record, so a half-empty month is not read as a drop.
 */
export function comparePeriods(records: Row[], to: string, days = 30) {
  const end = Date.parse(to + 'T00:00:00Z');
  const recent = empty();
  const before = empty();
  const known = new Set<MetricKey>();
  let daysWithData = 0;
  let daysBefore = 0;
  for (const r of records) {
    const t = Date.parse(String(r.date ?? '') + 'T00:00:00Z');
    if (!Number.isFinite(t)) continue;
    const ago = Math.round((end - t) / 86400000);
    if (ago < 0 || ago >= days * 2) continue;
    const m = metricsOf(r);
    if (!Object.keys(m).length) continue;
    const into = ago < days ? recent : before;
    if (ago < days) daysWithData++;
    else daysBefore++;
    for (const [k, v] of Object.entries(m) as [MetricKey, number][]) {
      into[k] += v;
      known.add(k);
    }
  }
  return { recent, before, known: METRICS.map((m) => m.key).filter((k) => known.has(k)), daysWithData, daysBefore, days };
}

/** The newest snapshot of trailing 30-day totals, for when no daily records exist yet. */
export function latestSnapshot(records: Row[]) {
  const last = [...records].sort((a, b) => String(a.recorded_at ?? '').localeCompare(String(b.recorded_at ?? ''))).pop();
  if (!last) return null;
  const m = metricsOf(last);
  if (!Object.keys(m).length) return null;
  return { totals: { ...empty(), ...m }, known: METRICS.map((x) => x.key).filter((k) => k in m), recordedAt: String(last.recorded_at ?? '') };
}

/** Percent change from `before` to `now`, or null when there is nothing to compare with. */
export function change(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

type Month = { month: string; keywords: { keyword: string; impressions: number | null; impressions_threshold: number | null }[] };
export type KeywordRow = { keyword: string; latest: string; total: number; exact: boolean; months: number };

/**
 * The searches that showed the listing, across the months returned, best first. Google gives no
 * exact count for a low-volume search, only "fewer than N": those count as zero in the total, are
 * shown as "<N", and sort below every search with a real count.
 */
export function topKeywords(months: Month[]): { rows: KeywordRow[]; months: string[] } {
  const by = new Map<string, KeywordRow & { lastMonth: string }>();
  const order = [...months].sort((a, b) => a.month.localeCompare(b.month));
  for (const m of order)
    for (const k of m.keywords ?? []) {
      const key = k.keyword.trim().toLowerCase();
      if (!key) continue;
      const row = by.get(key) ?? { keyword: key, latest: '', total: 0, exact: false, months: 0, lastMonth: '' };
      row.months++;
      if (k.impressions !== null) {
        row.total += k.impressions;
        row.exact = true;
      }
      row.latest = k.impressions !== null ? String(k.impressions) : '<' + (k.impressions_threshold ?? 15);
      row.lastMonth = m.month;
      by.set(key, row);
    }
  const rows = [...by.values()]
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.total - a.total || b.months - a.months || a.keyword.localeCompare(b.keyword))
    .map(({ lastMonth: _lastMonth, ...r }) => r);
  return { rows, months: order.map((m) => m.month) };
}

/**
 * Whether a search is worth scanning as a local keyword: the business's own name, job hunting and
 * one-word searches say nothing about how it ranks for customers looking for the service.
 */
export function scannable(keyword: string, businessName: string): boolean {
  const k = keyword.toLowerCase();
  if (k.split(/\s+/).length < 2) return false;
  if (/\b(jobs?|hiring|careers?|salary|class|training|phone number)\b/.test(k)) return false;
  // The brand is taken to be the first distinctive word of the name ("Ranger" in "Ranger Guard of Tampa Bay"):
  // later words are usually the trade or the city, which customers also search for.
  const brand = businessName.toLowerCase().split(/[^a-z0-9]+/).find((w) => w.length > 3 && !GENERIC.has(w));
  return !brand || !k.split(/[^a-z0-9]+/).includes(brand);
}
const GENERIC = new Set(['plumbing', 'plumber', 'plumbers', 'roofing', 'pressure', 'washing', 'cleaning', 'service', 'services', 'security', 'guard', 'attorney', 'attorneys', 'injury', 'accident', 'personal', 'criminal', 'defense', 'lawyer', 'dental', 'painting', 'garage', 'floors', 'drain', 'exteriors', 'premium', 'rentals', 'house', 'bail', 'bonds', 'medical', 'botox', 'city', 'county', 'south', 'north', 'east', 'west', 'beach']);
