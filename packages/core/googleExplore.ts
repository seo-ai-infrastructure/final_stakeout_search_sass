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

export type ExploreRow = { key: string; /** The second thing it is broken down by, when there are two. */ key2?: string; a: number; b: number; c: number | null; d?: number | null; wasA: number | null; /** Search Console: times shown in the range before (null when it was not there). */ wasB?: number | null };

/** Search Console rows with each row's clicks in the range before (null when it was not there). */
export function gscRows(now: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[], was: { keys?: string[]; clicks?: number; impressions?: number }[]): ExploreRow[] {
  const before = new Map(was.map((r) => [r.keys?.[0] ?? '', r.clicks ?? 0]));
  const shownBefore = new Map(was.map((r) => [r.keys?.[0] ?? '', r.impressions ?? 0]));
  return now.filter((r) => r.keys?.[0]).map((r) => ({
    key: r.keys![0], a: r.clicks ?? 0, b: r.impressions ?? 0, c: typeof r.position === 'number' ? Math.round(r.position * 10) / 10 : null,
    d: typeof r.ctr === 'number' ? Math.round(r.ctr * 1000) / 10 : null, wasA: before.has(r.keys![0]) ? (before.get(r.keys![0]) as number) : null, wasB: shownBefore.has(r.keys![0]) ? (shownBefore.get(r.keys![0]) as number) : null,
  }));
}

/** Dimensions that can be paired in one breakdown (Google does not let "how it appeared" be combined). */
export const GSC_PAIRABLE: GscDimension[] = ['query', 'page', 'device', 'country', 'date'];
/** Search Console rows by two dimensions at once (searches by page, pages by device…). Every filter holds. */
export function gscPairRequest(range: Range, f: GscFilters, dims: [GscDimension, GscDimension], rowLimit = 250) {
  const filters = gscFilters(f);
  return {
    startDate: range.from, endDate: range.to, type: f.type && f.type in GSC_TYPES ? f.type : 'web', dimensions: dims, rowLimit,
    ...(filters.length ? { dimensionFilterGroups: [{ groupType: 'and', filters }] } : {}),
  };
}
/** Rows by two dimensions, each with its clicks and times shown in the range before. */
export function gscPairRows(now: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[], was: { keys?: string[]; clicks?: number; impressions?: number }[]): ExploreRow[] {
  const id = (r: { keys?: string[] }) => (r.keys?.[0] ?? '') + '\u0001' + (r.keys?.[1] ?? '');
  const before = new Map(was.map((r) => [id(r), r]));
  return now.filter((r) => r.keys?.[0] && r.keys?.[1]).map((r) => ({
    key: r.keys![0], key2: r.keys![1], a: r.clicks ?? 0, b: r.impressions ?? 0, c: typeof r.position === 'number' ? Math.round(r.position * 10) / 10 : null,
    d: typeof r.ctr === 'number' ? Math.round(r.ctr * 1000) / 10 : null, wasA: before.has(id(r)) ? before.get(id(r))!.clicks ?? 0 : null, wasB: before.has(id(r)) ? before.get(id(r))!.impressions ?? 0 : null,
  }));
}

/* ───────────── Analytics ───────────── */

export const GA_DIMENSIONS = {
  landingPagePlusQueryString: 'Landing pages', sessionSourceMedium: 'Where visits came from', sessionDefaultChannelGroup: 'Channels',
  deviceCategory: 'Devices', city: 'Cities', sessionCampaignName: 'Campaigns', date: 'Days',
} as const;
export type GaDimension = keyof typeof GA_DIMENSIONS;
/** Ready-made "came from" filters. AI assistants: visits sent by a chat assistant's own site or app. */
export const GA_SOURCES = { all: 'All visits', listing: 'The Google listing (tagged link)', google: 'Google search', ai: 'AI assistants' } as const;
export type GaSource = keyof typeof GA_SOURCES;
export const AI_SOURCE_PATTERN = 'chatgpt|openai|perplexity|gemini|bard\\.google|copilot|claude\\.ai|anthropic|deepseek|grok|meta\\.ai|you\\.com|phind|poe\\.com|mistral';
export const LISTING_CAMPAIGN = 'gbp_listing';
export type GaFilters = { page?: string; device?: string; source?: string; /** The listing's website: with `scope` "page", only visits that landed on that page. */ website?: string; scope?: string; /** Only visits tagged with this campaign (utm_campaign), exactly. */ campaign?: string };

/** The tags agencies put on a listing's website link, whichever of campaign, source or medium they put them in. */
export const LISTING_TAGS = [LISTING_CAMPAIGN, 'gmb', 'gbp', 'google_my_business', 'google-business-profile'];
/** Values too common to mark a visit as coming from the listing on their own. */
const COMMON_TAGS = new Set(['google', 'organic', 'cpc', 'referral', 'direct', '(none)', '(direct)', 'search', 'local', 'maps', 'social', 'email', 'website']);
const reEsc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * What marks a visit as coming from this listing: the tags on its own website link (utm_campaign,
 * and utm_source or utm_medium when they are not everyday values), plus the usual ones.
 */
export function listingTags(website?: string): { campaign: string[]; source: string[]; medium: string[] } {
  const own = { campaign: '', source: '', medium: '' };
  try {
    const q = new URL(website ?? '').searchParams;
    own.campaign = clean(q.get('utm_campaign'), 100).toLowerCase(); own.source = clean(q.get('utm_source'), 100).toLowerCase(); own.medium = clean(q.get('utm_medium'), 100).toLowerCase();
  } catch { /* no website: the usual tags only */ }
  const with_ = (v: string, strict: boolean) => [...new Set([...LISTING_TAGS, ...(v && (!strict || !COMMON_TAGS.has(v)) ? [v] : [])])];
  return { campaign: with_(own.campaign, false), source: with_(own.source, true), medium: with_(own.medium, true) };
}
/** The path a visit landed on, as a pattern that takes it with or without the last slash. '' for no page. */
export function landingRegex(website?: string): string {
  try {
    const path = new URL(website ?? '').pathname.replace(/\/+$/, '');
    return '^' + reEsc(path) + '/?$';
  } catch {
    return '';
  }
}

const stringIs = (fieldName: string, matchType: string, value: string) => ({ filter: { fieldName, stringFilter: { matchType, value, caseSensitive: false } } });

export function gaFilters(f: GaFilters) {
  const all: unknown[] = [];
  const page = clean(f.page, 500), device = String(f.device ?? '').toLowerCase();
  if (page) all.push(stringIs('landingPagePlusQueryString', 'CONTAINS', page.replace(/^https?:\/\/[^/]+/, '') || '/'));
  if (['desktop', 'mobile', 'tablet'].includes(device)) all.push(stringIs('deviceCategory', 'EXACT', device));
  if (f.scope === 'page' && landingRegex(f.website)) all.push(stringIs('landingPage', 'FULL_REGEXP', landingRegex(f.website)));
  if (f.source === 'listing') {
    const t = listingTags(f.website), any = (list: string[]) => '^(' + list.map(reEsc).join('|') + ')$';
    all.push({ orGroup: { expressions: [stringIs('sessionCampaignName', 'FULL_REGEXP', any(t.campaign)), stringIs('sessionSource', 'FULL_REGEXP', any(t.source)), stringIs('sessionMedium', 'FULL_REGEXP', any(t.medium))] } });
  }
  if (clean(f.campaign, 200)) all.push(stringIs('sessionCampaignName', 'EXACT', clean(f.campaign, 200)));
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

/** Analytics rows by two dimensions at once (landing pages by campaign, sources by device…). */
export function gaPairBreakdown(range: Range, f: GaFilters, dims: [GaDimension, GaDimension], limit = 250) {
  const filters = gaFilters(f);
  return {
    dateRanges: [{ startDate: range.from, endDate: range.to }],
    metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }],
    dimensions: dims.map((name) => ({ name })), limit, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
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

/** Events Analytics sends by itself for every visit: counted as conversions only when a property is set up wrongly. */
export const NOISE_EVENTS = ['page_view', 'session_start', 'first_visit', 'user_engagement', 'scroll', 'click', 'file_download'];
export const isNoiseEvent = (name: string) => NOISE_EVENTS.includes(name.toLowerCase());
/** An event that is a lead whatever the property calls key: a form sent, a booking, a chat, a quote request. */
export const isLeadEvent = (name: string) => !isNoiseEvent(name) && /(^|[^a-z])(generate lead|lead|form submit|form submission|submit form|contact|book|booking|appointment|schedule|chat|quote|estimate)([^a-z]|$)/i.test(name.replace(/[_-]+/g, ' '));
/**
 * How many real leads one event stands for: none for the automatic ones, every time it happened
 * for a call or a named lead event, and otherwise as often as the property counted it as key.
 */
export const leadCount = (e: { name: string; count: number; keyEvents: number }) => (isNoiseEvent(e.name) ? 0 : isCallEvent(e.name) || isLeadEvent(e.name) ? e.count : e.keyEvents);

export type EventRow = { name: string; count: number; keyEvents: number; wasCount: number | null; call: boolean; /** One of the automatic events, left out of leads. */ noise: boolean; leads: number };

/**
 * The events worth showing: every key event, and every call or lead event whether or not the site
 * has marked it as key (most sites never do). `calls` and `leads` are counted for each range.
 * `audit`: what is wrong with the property's setup, if anything.
 */
export function gaEventRows(now: GaRow[], was: GaRow[]) {
  const read = (r: GaRow) => ({ name: r.dimensionValues?.[0]?.value ?? '', count: num(r, 0), keyEvents: num(r, 1) });
  const before = new Map(was.map(read).map((r) => [r.name, r.count]));
  const all = now.map(read).filter((r) => r.name);
  const rows: EventRow[] = all.map((r) => ({ ...r, wasCount: before.has(r.name) ? (before.get(r.name) as number) : null, call: isCallEvent(r.name), noise: isNoiseEvent(r.name), leads: leadCount(r) })).filter((r) => r.keyEvents > 0 || r.call || r.leads > 0);
  const sum = (list: { name: string; count: number; keyEvents: number }[]) => list.reduce((n, r) => n + leadCount(r), 0);
  return {
    rows, calls: rows.filter((r) => r.call).reduce((n, r) => n + r.count, 0), callsBefore: was.map(read).filter((r) => isCallEvent(r.name)).reduce((n, r) => n + r.count, 0),
    leads: sum(all), leadsBefore: sum(was.map(read)),
    audit: { noisy: all.filter((r) => isNoiseEvent(r.name) && r.keyEvents > 0).map((r) => r.name), callsNotKey: all.filter((r) => isCallEvent(r.name) && r.count > 0 && r.keyEvents === 0).map((r) => r.name) },
  };
}

/** Events broken down by something else too (a day, a source, a town): the last dimension is the event's name. */
export function gaCrossRequest(range: Range, f: GaFilters, dimensions: string[], limit = 5000) {
  const filters = gaFilters(f);
  return {
    dateRanges: [{ startDate: range.from, endDate: range.to }],
    dimensions: [...dimensions, 'eventName'].map((name) => ({ name })),
    metrics: [{ name: 'eventCount' }, { name: 'keyEvents' }],
    limit,
    ...(filters.length ? { dimensionFilter: filters.length === 1 ? filters[0] : { andGroup: { expressions: filters } } } : {}),
  };
}
/** Leads and calls for each value of what the events were broken down by (joined with " / " when by two things). */
export function leadsBy(rows: GaRow[] | undefined): Map<string, { leads: number; calls: number }> {
  const out = new Map<string, { leads: number; calls: number }>();
  for (const r of rows ?? []) {
    const dims = (r.dimensionValues ?? []).map((d) => d.value ?? '');
    const name = dims.pop() ?? '';
    let key = dims.join(' / ');
    if (dims.length === 1 && /^\d{8}$/.test(key)) key = key.slice(0, 4) + '-' + key.slice(4, 6) + '-' + key.slice(6);
    const e = { name, count: num(r, 0), keyEvents: num(r, 1) };
    const x = out.get(key) ?? { leads: 0, calls: 0 };
    x.leads += leadCount(e);
    if (isCallEvent(name)) x.calls += e.count;
    out.set(key, x);
  }
  return out;
}
/** Visits by two things at once (a town and its state), most first. */
export function gaPairRequest(range: Range, f: GaFilters, dimensions: [string, string], limit = 10) {
  const filters = gaFilters(f);
  return {
    dateRanges: [{ startDate: range.from, endDate: range.to }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit,
    ...(filters.length ? { dimensionFilter: filters.length === 1 ? filters[0] : { andGroup: { expressions: filters } } } : {}),
  };
}

/** Analytics rows by two dimensions, each with its visits in the range before. A day reads as a date. */
export function gaPairRows(now: GaRow[], was: GaRow[], dims: [GaDimension, GaDimension]): ExploreRow[] {
  const val = (r: GaRow, i: number) => { const v = r.dimensionValues?.[i]?.value ?? ''; return dims[i] === 'date' && /^\d{8}$/.test(v) ? v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6) : v || '(not set)'; };
  const id = (r: GaRow) => val(r, 0) + '\u0001' + val(r, 1);
  const before = new Map(was.map((r) => [id(r), num(r, 0)]));
  return now.map((r) => ({ key: val(r, 0), key2: val(r, 1), a: num(r, 0), b: num(r, 1), c: num(r, 2), wasA: dims.includes('date') ? null : before.has(id(r)) ? (before.get(id(r)) as number) : null }));
}
