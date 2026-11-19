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
 * The word in a business's name that marks a search as being for that business by name, or '' when
 * none stands out. A name is brand plus trade plus place ("Denver Botox: GATTONI Medical Aesthetics",
 * "Ranger Guard of Tampa Bay"), and customers search the trade and the place too. So the place
 * (`place`: the listing's city and state) is set aside, and of the name words left, the brand is
 * the one found in the fewest of the listing's searches, provided it is in some and in no more than
 * 15% of them: a word in more than that is the trade ("botox"), not the brand.
 */
export function brandWord(businessName: string, keywords: string[], place = ''): string {
  const split = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const places = new Set(split(place));
  const words = [...new Set(split(businessName).filter((w) => w.length > 3 && !GENERIC.has(w) && !places.has(w)))];
  const sets = keywords.map((k) => new Set(split(k)));
  let best = '';
  let fewest = Infinity;
  for (const w of words) {
    const n = sets.filter((x) => x.has(w)).length;
    if (n > 0 && n < fewest && n <= Math.max(1, sets.length * 0.15)) {
      best = w;
      fewest = n;
    }
  }
  return best;
}

/**
 * Whether a search is worth scanning as a local keyword: searches for the business by name and job
 * hunting say nothing about how it ranks for customers looking for the service.
 */
export function scannable(keyword: string, brand: string): boolean {
  const k = keyword.toLowerCase();
  if (/\b(jobs?|hiring|careers?|salary|class|training|phone number)\b/.test(k)) return false;
  return !brand || !k.split(/[^a-z0-9]+/).includes(brand);
}
const GENERIC = new Set(['plumbing', 'plumber', 'plumbers', 'roofing', 'pressure', 'washing', 'cleaning', 'service', 'services', 'security', 'guard', 'attorney', 'attorneys', 'injury', 'accident', 'personal', 'criminal', 'defense', 'lawyer', 'dental', 'painting', 'garage', 'floors', 'drain', 'exteriors', 'premium', 'rentals', 'house', 'bail', 'bonds', 'medical', 'botox', 'city', 'county', 'south', 'north', 'east', 'west', 'beach']);

/* ───────────── The Search insights tab: day-by-day numbers and keyword trends ───────────── */

/** Everything Google counts for a listing each day. The first three are what a listing is for. */
export const DAILY = [
  { key: 'calls', label: 'Calls', from: ['call_clicks'] },
  { key: 'websiteClicks', label: 'Website clicks', from: ['website_clicks'] },
  { key: 'directions', label: 'Direction requests', from: ['business_direction_requests', 'direction_requests'] },
  { key: 'views', label: 'Views', from: ['views'] },
  { key: 'conversations', label: 'Messages', from: ['business_conversations', 'conversations'] },
  { key: 'bookings', label: 'Bookings', from: ['business_bookings', 'bookings'] },
  { key: 'foodOrders', label: 'Food orders', from: ['business_food_orders'] },
  { key: 'menuClicks', label: 'Menu clicks', from: ['business_food_menu_clicks'] },
  { key: 'mobileSearch', label: 'Search, on a phone', from: ['business_impressions_mobile_search'] },
  { key: 'mobileMaps', label: 'Maps, on a phone', from: ['business_impressions_mobile_maps'] },
  { key: 'desktopSearch', label: 'Search, on a computer', from: ['business_impressions_desktop_search'] },
  { key: 'desktopMaps', label: 'Maps, on a computer', from: ['business_impressions_desktop_maps'] },
] as const;
export type DailyKey = (typeof DAILY)[number]['key'];
export type Day = { date: string } & Record<DailyKey, number>;
export const SURFACES: DailyKey[] = ['mobileSearch', 'mobileMaps', 'desktopSearch', 'desktopMaps'];
export const ACTIONS: DailyKey[] = ['calls', 'websiteClicks', 'directions', 'conversations', 'bookings', 'foodOrders'];

const zero = (date: string): Day => ({ date, ...(Object.fromEntries(DAILY.map((m) => [m.key, 0])) as Record<DailyKey, number>) });

/**
 * A listing's daily records for one range (`from` to `to`, inclusive) and the same number of days
 * before it. Every day of the range is present (zero when Google sent nothing), so a chart has no
 * holes. `known`: the things Google reported at all. `daysWithData`: so a range Google has only
 * half of is not read as a drop. Views is the four places added up when it is not given.
 */
export function dailySeries(records: Row[], from: string, to: string) {
  const start = Date.parse(from + 'T00:00:00Z'), end = Date.parse(to + 'T00:00:00Z');
  const n = Math.round((end - start) / 86400000) + 1;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const days: Day[] = Array.from({ length: n }, (_, i) => zero(iso(start + i * 86400000)));
  const totals = zero(''), before = zero('');
  const known = new Set<DailyKey>();
  let daysWithData = 0, daysBefore = 0;
  for (const r of records) {
    const t = Date.parse(String(r.date ?? '') + 'T00:00:00Z');
    if (!Number.isFinite(t)) continue;
    const i = Math.round((t - start) / 86400000);
    if (i < -n || i >= n) continue;
    const got: Partial<Record<DailyKey, number>> = {};
    for (const m of DAILY) { const v = read(r, m.from); if (v !== null) got[m.key] = v; }
    if (got.views === undefined) { const parts = SURFACES.map((k) => got[k]).filter((x): x is number => x !== undefined); if (parts.length) got.views = parts.reduce((a, b) => a + b, 0); }
    if (!Object.keys(got).length) continue;
    if (i >= 0) daysWithData++; else daysBefore++;
    for (const [k, v] of Object.entries(got) as [DailyKey, number][]) {
      known.add(k);
      if (i >= 0) { days[i][k] += v; totals[k] += v; } else before[k] += v;
    }
  }
  const { date: _a, ...t } = totals, { date: _b, ...b } = before;
  return { days, totals: t as Record<DailyKey, number>, before: b as Record<DailyKey, number>, known: DAILY.map((m) => m.key).filter((k) => known.has(k)), daysWithData, daysBefore, length: n };
}

/** Days added up into weeks (each labelled by its first day) once a range is too long to read day by day. */
export function byWeek<T extends { date: string }>(days: T[], keys: (keyof T)[]): T[] {
  const out: T[] = [];
  days.forEach((d, i) => {
    if (i % 7 === 0) out.push({ ...d });
    else for (const k of keys) (out[out.length - 1][k] as number) += d[k] as number;
  });
  return out;
}

export type KeywordTrend = { keyword: string; total: number; exact: boolean; latest: number | null; latestText: string; previous: number | null; previousText: string; gain: number | null; months: number; byMonth: (number | null)[] };

/**
 * Each search that showed the listing, month by month across the months returned (oldest first).
 * `latest` and `previous` are the last two months (null: not shown that month, or Google only
 * said "fewer than N", which `latestText` keeps as "<N"). `gain` is latest minus previous when
 * both are real counts, and the whole latest count when the search is new this month.
 */
export function keywordTrends(months: Month[]): { rows: KeywordTrend[]; months: string[] } {
  // A month Google has nothing for yet (the one still running) is left out, so the newest column is the newest month with figures.
  const order = [...months].filter((m) => (m.keywords ?? []).length > 0).sort((a, b) => a.month.localeCompare(b.month));
  const by = new Map<string, KeywordTrend>();
  const said = (k: { impressions: number | null; impressions_threshold?: number | null }) => (k.impressions !== null ? String(k.impressions) : '<' + (k.impressions_threshold ?? 15));
  order.forEach((m, i) => {
    for (const k of m.keywords ?? []) {
      const key = k.keyword.trim().toLowerCase();
      if (!key) continue;
      const row = by.get(key) ?? { keyword: key, total: 0, exact: false, latest: null, latestText: '', previous: null, previousText: '', gain: null, months: 0, byMonth: order.map(() => null) };
      row.months++;
      if (k.impressions !== null) { row.total += k.impressions; row.exact = true; row.byMonth[i] = k.impressions; }
      if (i === order.length - 1) { row.latest = k.impressions; row.latestText = said(k); }
      if (i === order.length - 2) { row.previous = k.impressions; row.previousText = said(k); }
      by.set(key, row);
    }
  });
  const rows = [...by.values()].map((r) => ({ ...r, gain: r.latest === null ? null : order.length < 2 ? null : r.latest - (r.previous ?? 0) }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.total - a.total || b.months - a.months || a.keyword.localeCompare(b.keyword));
  return { rows, months: order.map((m) => m.month) };
}

/** The searches that grew most in the latest month against the one before (at least `min` more times shown). */
export const risingKeywords = (rows: KeywordTrend[], min = 5, limit = 25) =>
  rows.filter((r) => r.gain !== null && r.gain >= min).sort((a, b) => (b.gain as number) - (a.gain as number) || b.total - a.total).slice(0, limit);

/** The months (YYYY-MM) a date range touches, capped at the 12 Google gives in one request (the latest 12). */
export function monthsOf(from: string, to: string, keep = 12): { from: string; to: string } {
  const a = from.slice(0, 7), b = to.slice(0, 7);
  const [y, m] = b.split('-').map(Number);
  const floor = new Date(Date.UTC(y, m - keep, 1)).toISOString().slice(0, 7);
  return { from: a < floor ? floor : a, to: b };
}

/* ───────────── More to read from the same numbers ───────────── */

/**
 * How people found the listing: by searching for what it does (discovery) or by searching for it
 * by name (branded). Job hunting and the like is set aside as "other". `shown` adds up the months
 * Google gave a real count for; `terms` counts the searches themselves, which is what there is to
 * go on when a listing is small and Google only says "fewer than 15".
 */
export function brandSplit(rows: KeywordTrend[], brand: string) {
  const part = () => ({ terms: 0, shown: 0 });
  const out = { discovery: part(), branded: part(), other: part() };
  for (const r of rows) {
    const named = Boolean(brand) && r.keyword.split(/[^a-z0-9]+/).includes(brand);
    const p = named ? out.branded : scannable(r.keyword, brand) ? out.discovery : out.other;
    p.terms++;
    p.shown += r.total;
  }
  // Counts are worth showing once they cover a fair share of the searches; otherwise the terms are counted.
  const counted = rows.filter((r) => r.exact).length;
  return { ...out, by: (rows.length > 0 && counted >= rows.length * 0.3 && out.discovery.shown + out.branded.shown > 0 ? 'shown' : 'terms') as 'shown' | 'terms', known: Boolean(brand) };
}

/** One measure's average for each day of the week, Sunday first, across the days given. */
export function byWeekday(days: Day[], key: DailyKey): number[] {
  const sum = [0, 0, 0, 0, 0, 0, 0], n = [0, 0, 0, 0, 0, 0, 0];
  for (const d of days) {
    const w = new Date(d.date + 'T12:00:00Z').getUTCDay();
    sum[w] += d[key];
    n[w]++;
  }
  return sum.map((s, i) => (n[i] ? Math.round((s / n[i]) * 10) / 10 : 0));
}

/**
 * Actions (calls, website clicks, directions, messages, bookings, orders) per 100 views, week by
 * week: a single day has too few of either to read. A week with no views has no rate (null).
 */
export function rateByWeek(days: Day[]): { date: string; value: number | null }[] {
  return byWeek(days, DAILY.map((m) => m.key)).map((w) => {
    const acts = ACTIONS.reduce((s, k) => s + w[k], 0);
    return { date: w.date, value: w.views > 0 ? Math.round((acts / w.views) * 1000) / 10 : null };
  });
}

export type ListingTotals = { location: string; views: number; calls: number; websiteClicks: number; directions: number; actions: number; rate: number | null; recordedAt: string | null };

/**
 * Every listing of a connected account from its newest 30-day totals (Postproxy's `latest_stats`),
 * busiest first. `actions` is everything a customer did from the listing; `rate` is actions per 100 views.
 */
export function listingTotals(latest: unknown): ListingTotals[] {
  const rows: ListingTotals[] = [];
  for (const x of Array.isArray(latest) ? latest : []) {
    const r = (x && typeof x === 'object' ? x : {}) as { placement_id?: unknown; recorded_at?: unknown; stats?: unknown };
    const s = (r.stats && typeof r.stats === 'object' ? r.stats : {}) as Record<string, unknown>;
    if (typeof r.placement_id !== 'string') continue;
    const n = (...keys: string[]) => keys.reduce((t, k) => t + (typeof s[k] === 'number' && Number.isFinite(s[k]) ? (s[k] as number) : 0), 0);
    const surfaces = n('business_impressions_desktop_search', 'business_impressions_mobile_search', 'business_impressions_desktop_maps', 'business_impressions_mobile_maps');
    const views = n('views') || surfaces;
    const calls = n('call_clicks'), websiteClicks = n('website_clicks'), directions = n('business_direction_requests', 'direction_requests');
    const actions = calls + websiteClicks + directions + n('business_conversations', 'business_bookings', 'business_food_orders');
    rows.push({ location: r.placement_id, views, calls, websiteClicks, directions, actions, rate: views > 0 ? Math.round((actions / views) * 1000) / 10 : null, recordedAt: typeof r.recorded_at === 'string' ? r.recorded_at : null });
  }
  return rows.sort((a, b) => b.actions - a.actions || b.views - a.views);
}
