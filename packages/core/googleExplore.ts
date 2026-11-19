/**
 * Exploring a client's website in Search Console and Analytics: a date range against the one
 * before it, one thing to break the numbers down by, and filters (a page, a search, a device, where
 * the visit came from). Pure rules: the dates, and the requests Google's two reporting APIs take.
 */

export type Range = { from: string; to: string };
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

export const PRESETS: { days: number; label: string }[] = [
  { days: 7, label: 'Last 7 days' }, { days: 28, label: 'Last 28 days' }, { days: 90, label: 'Last 3 months' },
  { days: 180, label: 'Last 6 months' }, { days: 365, label: 'Last 12 months' },
];

/**
 * The range to read and the one of the same length just before it. `days` counts back from
 * `lag` days ago (Search Console runs about three days behind; Analytics one). Any number of days
 * from 1 to 480 is taken; anything else is 28. A custom
 * from/to wins over `days`. Search Console keeps 16 months, so nothing older is asked for.
 */
/** How far back "the same days last year" is: 52 weeks. */
export const YEAR = 364;

export function exploreRange(o: { days?: unknown; from?: unknown; to?: unknown; compare?: unknown }, today: Date, lag: number, keptMonths = 16): { recent: Range; before: Range; days: number; compare: 'previous' | 'year' } | string {
  const end = Date.parse(iso(today.getTime()) + 'T00:00:00Z') - lag * DAY;
  let from: number, to: number;
  if (isDate(o.from) && isDate(o.to)) {
    from = Date.parse(o.from + 'T00:00:00Z'); to = Date.parse(o.to + 'T00:00:00Z');
    if (to < from) return 'The end date is before the start date.';
    if (to > Date.parse(iso(today.getTime()) + 'T00:00:00Z')) return 'The end date is in the future.';
  } else if (o.from || o.to) return 'Set both dates, as YYYY-MM-DD.';
  else {
    const asked = Math.round(Number(o.days));
    // Asked for more than Google keeps: as far back as it goes.
    const days = asked > keptMonths * 30 ? keptMonths * 30 : asked >= 1 ? asked : 28;
    to = end; from = end - (days - 1) * DAY;
  }
  if (from < Date.parse(iso(today.getTime()) + 'T00:00:00Z') - keptMonths * 31 * DAY) return `Google keeps ${keptMonths} months of data: choose a later start date.`;
  const days = Math.round((to - from) / DAY) + 1;
  // Against the same days a year earlier: 52 weeks back, so each day lines up with the same day of the week.
  if (o.compare === 'year') return { recent: { from: iso(from), to: iso(to) }, before: { from: iso(from - YEAR * DAY), to: iso(to - YEAR * DAY) }, days, compare: 'year' };
  return { recent: { from: iso(from), to: iso(to) }, before: { from: iso(from - days * DAY), to: iso(from - DAY) }, days, compare: 'previous' };
}

const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* ───────────── Search Console ───────────── */

export const GSC_DIMENSIONS = { query: 'Searches', page: 'Pages', device: 'Devices', country: 'Countries', searchAppearance: 'How it appeared', date: 'Days' } as const;
export type GscDimension = keyof typeof GSC_DIMENSIONS;
export const GSC_TYPES = { web: 'Web search', image: 'Images', video: 'Videos', news: 'News', discover: 'Discover' } as const;
export const DEVICES = ['DESKTOP', 'MOBILE', 'TABLET'] as const;
export type GscFilters = { query?: string; queryMode?: string; page?: string; device?: string; appearance?: string; type?: string };

/** The filters as Search Console takes them (all must hold). Unknown or empty ones are dropped. */
export function gscFilters(f: GscFilters) {
  const filters: { dimension: string; operator: string; expression: string }[] = [];
  const q = clean(f.query), page = clean(f.page, 500), appearance = clean(f.appearance, 60);
  if (q) filters.push({ dimension: 'query', operator: f.queryMode === 'exact' ? 'equals' : f.queryMode === 'without' ? 'notContains' : 'contains', expression: q.toLowerCase() });
  // A full address matches that page however Google filed it (http or https, www or not, with or without the last slash).
  if (page) filters.push(/^https?:\/\//.test(page) && pageRegex(page) ? { dimension: 'page', operator: 'includingRegex', expression: pageRegex(page) } : { dimension: 'page', operator: 'contains', expression: page });
  if (DEVICES.includes(String(f.device).toUpperCase() as (typeof DEVICES)[number])) filters.push({ dimension: 'device', operator: 'equals', expression: String(f.device).toUpperCase() });
  if (/^[A-Z_]+$/.test(appearance)) filters.push({ dimension: 'searchAppearance', operator: 'equals', expression: appearance });
  return filters;
}

/**
 * One Search Console request: the totals for a range (no dimension), or its rows by one dimension.
 * Google does not allow "how it appeared" to be combined with another breakdown, which is why it
 * is a filter everywhere else.
 */
export function gscRequest(range: Range, f: GscFilters, dimension: GscDimension | null, rowLimit = 250) {
  const filters = gscFilters(f).filter((x) => x.dimension !== dimension);
  const type = f.type && f.type in GSC_TYPES ? f.type : 'web';
  return {
    startDate: range.from,
    endDate: range.to,
    type,
    ...(dimension ? { dimensions: [dimension], rowLimit } : {}),
    ...(filters.length ? { dimensionFilterGroups: [{ groupType: 'and', filters }] } : {}),
  };
}

export type ExploreRow = { key: string; a: number; b: number; c: number | null; d?: number | null; wasA: number | null; /** Search Console: times shown in the range before (null when it was not there). */ wasB?: number | null };

/** Search Console rows with each row's clicks in the range before (null when it was not there). */
export function gscRows(now: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[], was: { keys?: string[]; clicks?: number; impressions?: number }[]): ExploreRow[] {
  const before = new Map(was.map((r) => [r.keys?.[0] ?? '', r.clicks ?? 0]));
  const shownBefore = new Map(was.map((r) => [r.keys?.[0] ?? '', r.impressions ?? 0]));
  return now.filter((r) => r.keys?.[0]).map((r) => ({
    key: r.keys![0], a: r.clicks ?? 0, b: r.impressions ?? 0, c: typeof r.position === 'number' ? Math.round(r.position * 10) / 10 : null,
    d: typeof r.ctr === 'number' ? Math.round(r.ctr * 1000) / 10 : null, wasA: before.has(r.keys![0]) ? (before.get(r.keys![0]) as number) : null, wasB: shownBefore.has(r.keys![0]) ? (shownBefore.get(r.keys![0]) as number) : null,
  }));
}

/* ───────────── Analytics ───────────── */

export const GA_DIMENSIONS = {
  landingPagePlusQueryString: 'Landing pages', sessionSourceMedium: 'Where visits came from', sessionDefaultChannelGroup: 'Channels',
  deviceCategory: 'Devices', city: 'Cities', date: 'Days',
} as const;
export type GaDimension = keyof typeof GA_DIMENSIONS;
/** Ready-made "came from" filters. AI assistants: visits sent by a chat assistant's own site or app. */
export const GA_SOURCES = { all: 'All visits', listing: 'The Google listing (tagged link)', google: 'Google search', ai: 'AI assistants' } as const;
export type GaSource = keyof typeof GA_SOURCES;
export const AI_SOURCE_PATTERN = 'chatgpt|openai|perplexity|gemini|bard\\.google|copilot|claude\\.ai|anthropic|deepseek|grok|meta\\.ai|you\\.com|phind|poe\\.com|mistral';
export const LISTING_CAMPAIGN = 'gbp_listing';
export type GaFilters = { page?: string; device?: string; source?: string };

const stringIs = (fieldName: string, matchType: string, value: string) => ({ filter: { fieldName, stringFilter: { matchType, value, caseSensitive: false } } });

export function gaFilters(f: GaFilters) {
  const all: unknown[] = [];
  const page = clean(f.page, 500), device = String(f.device ?? '').toLowerCase();
  if (page) all.push(stringIs('landingPagePlusQueryString', 'CONTAINS', page.replace(/^https?:\/\/[^/]+/, '') || '/'));
  if (['desktop', 'mobile', 'tablet'].includes(device)) all.push(stringIs('deviceCategory', 'EXACT', device));
  if (f.source === 'listing') all.push(stringIs('sessionCampaignName', 'EXACT', LISTING_CAMPAIGN));
  if (f.source === 'google') all.push(stringIs('sessionSourceMedium', 'EXACT', 'google / organic'));
  if (f.source === 'ai') all.push(stringIs('sessionSource', 'PARTIAL_REGEXP', AI_SOURCE_PATTERN));
  return all;
}

/** One Analytics report: totals for a range (no dimension), or rows by one dimension, most visits first. */
export function gaRequest(range: Range, f: GaFilters, dimension: GaDimension | null, limit = 250) {
  const filters = gaFilters(f);
  return {
    dateRanges: [{ startDate: range.from, endDate: range.to }],
    metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }],
    ...(dimension ? { dimensions: [{ name: dimension }], limit, orderBys: [dimension === 'date' ? { dimension: { dimensionName: 'date' } } : { metric: { metricName: 'sessions' }, desc: true }] } : {}),
    ...(filters.length ? { dimensionFilter: filters.length === 1 ? filters[0] : { andGroup: { expressions: filters } } } : {}),
  };
}

type GaRow = { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] };
const num = (r: GaRow | undefined, i: number) => Number(r?.metricValues?.[i]?.value ?? 0) || 0;
export const gaTotals = (rows: GaRow[] | undefined) => ({ a: num(rows?.[0], 0), b: num(rows?.[0], 1), c: num(rows?.[0], 2) });

/** Analytics rows (visits, engaged visits, key events) with each row's visits in the range before. A day reads as a date. */
export function gaRows(now: GaRow[], was: GaRow[], dimension: GaDimension): ExploreRow[] {
  const name = (r: GaRow) => { const v = r.dimensionValues?.[0]?.value ?? ''; return dimension === 'date' && /^\d{8}$/.test(v) ? v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6) : v; };
  const before = new Map(was.map((r) => [name(r), num(r, 0)]));
  return now.map((r) => ({ key: name(r) || '(not set)', a: num(r, 0), b: num(r, 1), c: num(r, 2), wasA: dimension === 'date' ? null : before.has(name(r)) ? (before.get(name(r)) as number) : null }));
}

/* ───────────── Overviews (the Search insights tab) ───────────── */

/** A page address as Search Console knows it: no tracking tags, no fragment. Empty when it is not a web address. */
export function pageOf(url: string): string {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.origin + u.pathname : '';
  } catch {
    return '';
  }
}

/** A page's address as one comparable string: no http/https, no www, no tracking tags, no last slash. */
export function pageKey(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase().replace(/^www\./, '') + u.pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}
/** Whether two addresses are the same page, however each was written. */
export const samePage = (a: string, b: string) => Boolean(pageKey(a)) && pageKey(a) === pageKey(b);
/** A pattern for Search Console that matches a page under http or https, with or without www and the last slash. '' when the address cannot be read. */
export function pageRegex(url: string): string {
  const k = pageKey(url);
  if (!k) return '';
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cut = k.indexOf('/');
  return '^https?://(www\\.)?' + esc(cut < 0 ? k : k.slice(0, cut)) + esc(cut < 0 ? '' : k.slice(cut)) + '/?$';
}

/** Searches, most clicked first; among equals the most shown, then the best placed, so a page with no clicks still leads with what it is seen for. */
export const topSearches = (rows: ExploreRow[]) => [...rows].sort((x, y) => y.a - x.a || y.b - x.b || (x.c ?? 999) - (y.c ?? 999) || x.key.localeCompare(y.key));

/** How many places a position moved: positive is up the page (a smaller number). Null with nothing to compare. */
export const spots = (now: number | null | undefined, was: number | null | undefined) => (typeof now === 'number' && typeof was === 'number' ? Math.round((was - now) * 10) / 10 : null);

export type Rising = ExploreRow & { gain: number; fresh: boolean };

/**
 * The searches on the way up. By clicks gained when any search gained two or more; otherwise (a
 * page that gets few clicks, as a listing's page often does) by how many more times it was shown.
 */
export function risingSearches(rows: ExploreRow[], limit = 25): { rows: Rising[]; by: 'clicks' | 'shown' } {
  const byClicks = risingRows(rows, 2, limit);
  if (byClicks.length) return { rows: byClicks, by: 'clicks' };
  const shown = rows
    .map((r) => ({ ...r, gain: r.b - (r.wasB ?? 0), fresh: r.wasB === null || r.wasB === undefined }))
    .filter((r) => r.gain > 0)
    .sort((x, y) => y.gain - x.gain || y.b - x.b || x.key.localeCompare(y.key))
    .slice(0, limit);
  return { rows: shown, by: 'shown' };
}

export type Competing = { page: string; share: number; shown: number };
/**
 * Searches where another page of the same website takes a fair share of the times shown (a fifth
 * or more): the two pages are competing for it. For each such search, the strongest other page.
 */
export function competingPages(rows: { query: string; page: string; impressions: number }[], own: string, min = 0.2): Record<string, Competing> {
  const by = new Map<string, { total: number; others: Map<string, number> }>();
  for (const r of rows) {
    if (!r.query || !r.page || !(r.impressions > 0)) continue;
    const q = by.get(r.query) ?? { total: 0, others: new Map<string, number>() };
    q.total += r.impressions;
    if (!samePage(r.page, own)) q.others.set(r.page, (q.others.get(r.page) ?? 0) + r.impressions);
    by.set(r.query, q);
  }
  const out: Record<string, Competing> = {};
  for (const [query, q] of by) {
    const top = [...q.others].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] / q.total >= min) out[query] = { page: top[0], share: Math.round((top[1] / q.total) * 100), shown: top[1] };
  }
  return out;
}

export type Inspection = { indexed: boolean; state: string; canonical: 'match' | 'differs' | 'unknown'; googleCanonical: string | null; lastCrawl: string | null; crawledAs: 'phone' | 'computer' | null; rich: string[]; link: string | null };
/** What Google's URL inspection says about a page, cut down to one line's worth. */
export function readInspection(j: unknown, url: string): Inspection | null {
  const r = (j as { inspectionResult?: Record<string, unknown> })?.inspectionResult;
  const ix = (r?.indexStatusResult ?? null) as Record<string, unknown> | null;
  if (!r || !ix) return null;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const google = str(ix.googleCanonical);
  const items = ((r.richResultsResult as { detectedItems?: { richResultType?: unknown }[] } | undefined)?.detectedItems ?? []).map((x) => str(x.richResultType)).filter((x): x is string => x !== null);
  return {
    indexed: ix.verdict === 'PASS',
    state: str(ix.coverageState) ?? (ix.verdict === 'PASS' ? 'Indexed' : 'Not indexed'),
    canonical: google ? (samePage(google, url) ? 'match' : 'differs') : 'unknown',
    googleCanonical: google,
    lastCrawl: str(ix.lastCrawlTime),
    crawledAs: ix.crawledAs === 'MOBILE' ? 'phone' : ix.crawledAs === 'DESKTOP' ? 'computer' : null,
    rich: [...new Set(items)],
    link: str(r.inspectionResultLink),
  };
}

/**
 * The rows that gained most on their first figure (clicks, or visits) against the range before:
 * biggest gain first. A row that was not there before is `fresh`, and counts its whole figure as
 * gain. Rows that gained less than `min` are left out, so one extra click is not "rising".
 */
export function risingRows(rows: ExploreRow[], min = 2, limit = 25): Rising[] {
  return rows
    .map((r) => ({ ...r, gain: r.a - (r.wasA ?? 0), fresh: r.wasA === null }))
    .filter((r) => r.gain >= min)
    .sort((x, y) => y.gain - x.gain || y.a - x.a || x.key.localeCompare(y.key))
    .slice(0, limit);
}

/** An event that is a phone call: a tap on a phone link, or a call-tracking event, whatever the site named it. */
export const isCallEvent = (name: string) => /(^|[^a-z])(call|calls|phone|tel|click_to_call|clicktocall)([^a-z]|$)/i.test(name.replace(/_/g, ' ')) || /click.?to.?call|phone.?call|tel.?click|call.?click/i.test(name);

/** Analytics: every event by name with how often it happened and how many of those count as key events. */
export function gaEventsRequest(range: Range, f: GaFilters, limit = 200) {
  const filters = gaFilters(f);
  return {
    dateRanges: [{ startDate: range.from, endDate: range.to }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'keyEvents' }],
    orderBys: [{ metric: { metricName: 'keyEvents' }, desc: true }, { metric: { metricName: 'eventCount' }, desc: true }],
    limit,
    ...(filters.length ? { dimensionFilter: filters.length === 1 ? filters[0] : { andGroup: { expressions: filters } } } : {}),
  };
}

export type EventRow = { name: string; count: number; keyEvents: number; wasCount: number | null; call: boolean };

/**
 * The events worth showing: every key event, and every call event whether or not the site has
 * marked it as key (most sites never do). `calls` is the number of call events in each range.
 */
export function gaEventRows(now: GaRow[], was: GaRow[]): { rows: EventRow[]; calls: number; callsBefore: number } {
  const read = (r: GaRow) => ({ name: r.dimensionValues?.[0]?.value ?? '', count: num(r, 0), keyEvents: num(r, 1) });
  const before = new Map(was.map(read).map((r) => [r.name, r.count]));
  const rows = now.map(read).filter((r) => r.name).map((r) => ({ ...r, wasCount: before.has(r.name) ? (before.get(r.name) as number) : null, call: isCallEvent(r.name) })).filter((r) => r.keyEvents > 0 || r.call);
  return { rows, calls: rows.filter((r) => r.call).reduce((n, r) => n + r.count, 0), callsBefore: was.map(read).filter((r) => isCallEvent(r.name)).reduce((n, r) => n + r.count, 0) };
}
