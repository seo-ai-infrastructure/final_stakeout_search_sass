/**
 * The AI citations checklist: every page Google's AI Overview cited across a scan's points, rolled
 * up, ranked by how much of the market's buying power it reaches, and turned into concrete jobs
 * (claim this listing, ask to be added to this list, publish this answer). Pure rules: no page is
 * fetched and nothing is saved here.
 */
import { knownSite, siteOf } from './citeSites';

/* ───────────── Addresses ───────────── */

const TRACKING = /^(utm_[a-z0-9_]+|gclid|gbraid|wbraid|fbclid|msclkid|srsltid|mc_cid|mc_eid|ref|ref_src|igshid|si|ved|usg|sa|sca_esv|_ga|_gl)$/i;

/**
 * A cited page's address with the noise taken off, so the same page counts once however Google
 * linked it: no "scroll to this text" fragment, no tracking tags, no "m." or "www.", https, and no
 * trailing slash on a path. Null when it is not a web address.
 */
export function canonicalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const t = raw.trim();
  // "mailto:", "javascript:", "sms:" and the like are not pages (a bare "site.com:8080" still is).
  if (/^[a-z][a-z0-9+.-]*:(?!\/\/)(?!\d+(\/|$))/i.test(t)) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : 'https://' + t);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|amp)\./, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  const keep = [...u.searchParams].filter(([k]) => !TRACKING.test(k)).sort((a, b) => a[0].localeCompare(b[0]));
  const path = u.pathname.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
  return 'https://' + host + path + (keep.length ? '?' + keep.map(([k, v]) => encodeURIComponent(k) + (v ? '=' + encodeURIComponent(v) : '')).join('&') : '');
}

/* ───────────── What kind of source ───────────── */

export type SourceKind = 'own' | 'directory' | 'roundup' | 'video' | 'community' | 'news' | 'reference' | 'business';
export const KIND_LABEL: Record<SourceKind, string> = {
  own: 'Your website', directory: 'Directories and review sites', roundup: '“Best of” lists', video: 'Video', community: 'Community threads',
  news: 'Local news', reference: 'Government and reference', business: 'Other businesses’ websites',
};

const VIDEO = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)$/;
const COMMUNITY = /(^|\.)(reddit\.com|quora\.com|nextdoor\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|threads\.net|linkedin\.com|pinterest\.com)$/;
const REFERENCE = /(\.gov|\.edu|\.mil)$|(^|\.)(wikipedia\.org|wikihow\.com|usa\.gov)$/;
const NEWS = /(^|\.)(patch\.com|newsbreak\.com|msn\.com|yahoo\.com|axios\.com|apnews\.com|usatoday\.com|nytimes\.com)$|news|times|tribune|herald|gazette|journal|ledger|observer|chronicle|sentinel|dispatch|courier|press\b|(^|\.)w[a-z]{3}\.com$|(^|\.)k[a-z]{3}\.com$|tv\.com$/;
const ROUNDUP_HOST = /(^|\.)(expertise\.com|threebestrated\.com|forbes\.com|usnews\.com|thisoldhouse\.com|bobvila\.com|consumeraffairs\.com|bestcompany\.com|clutch\.co|upcity\.com|yelp\.com\/search)$/;
const ROUNDUP_PATH = /(^|[/_-])(best|top|top-?\d+|\d+-best|leading|ranked|rated)([/_-]|$)|near-me|\/search\b|best-of/;

/** What a cited page is, from its address. `own`: the business's own website (a bare domain). */
export function kindOf(url: string, own?: string | null): SourceKind {
  const host = siteOf(url) ?? '';
  const mine = siteOf(own ?? '');
  if (mine && (host === mine || host.endsWith('.' + mine))) return 'own';
  let path = '';
  try { path = new URL(url).pathname.toLowerCase(); } catch { /* a bare site */ }
  if (VIDEO.test(host)) return 'video';
  if (COMMUNITY.test(host)) return 'community';
  if (REFERENCE.test(host)) return 'reference';
  if (ROUNDUP_HOST.test(host)) return 'roundup';
  const known = knownSite(host);
  // A directory's own search or "best in town" page is a list to get onto, the same as its listing.
  if (known) return 'directory';
  if (ROUNDUP_PATH.test(path)) return 'roundup';
  if (NEWS.test(host)) return 'news';
  return 'business';
}

/* ───────────── The rollup ───────────── */

export type AioPin = {
  id: string;
  rowIdx: number;
  colIdx: number;
  status: string;
  hasAiOverview?: boolean | null;
  targetCitedInAi?: boolean | null;
  aiCitations?: unknown;
  insights?: { ai?: { shown?: boolean; sources?: string[]; named?: string[]; cites?: { n: number; url: string }[] } } | null;
};
export type PageCheck = { present: boolean | null; competitors: number };
export type CitedPage = {
  /** The page (or, when only the website is known, "https://site"). */
  url: string;
  site: string;
  name: string;
  kind: SourceKind;
  /** False when Google's answer was only read as a list of websites: the exact page is not known. */
  pageKnown: boolean;
  pins: string[];
  /** Percent of the points with an AI answer that cited it, and the same weighted by buying power. */
  pinShare: number;
  powerShare: number;
  /** Its average place among the answer's numbered sources (1 = first), or null when not known. */
  avgSlot: number | null;
  /** Whether the business is on the page (null: not checked), and how many of its rivals are. */
  present: boolean | null;
  competitors: number;
  score: number;
};
/** A website with every page of it that was cited. `top`: its most valuable known page, or null when only the website is known. */
export type CitedSite = Omit<CitedPage, 'url' | 'pageKnown'> & { pages: CitedPage[]; top: string | null };
export type PinState = 'you' | 'others' | 'none' | 'pending';

const round = (n: number) => Math.round(n * 10) / 10;
const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/\b(llc|inc|co|corp|company|ltd)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const shown = (p: AioPin) => p.status === 'COMPLETED' && Boolean(p.hasAiOverview || p.insights?.ai?.shown);

/** The pages one point's AI answer cited, in order, each once: the pages when known, else the websites. */
export function citesOf(p: AioPin): { url: string; n: number | null; pageKnown: boolean }[] {
  const out: { url: string; n: number | null; pageKnown: boolean }[] = [];
  const add = (raw: unknown, n: number | null, pageKnown: boolean) => {
    const url = canonicalUrl(raw);
    if (url && !/(^|\.)google\.[a-z.]+$|(^|\.)(g\.page|goo\.gl|g\.co)$/.test(siteOf(url) ?? '') && !out.some((x) => x.url === url)) out.push({ url, n, pageKnown });
  };
  const cites = p.insights?.ai?.cites;
  if (cites?.length) for (const c of cites) add(c.url, c.n, true);
  else for (const s of [...(p.insights?.ai?.sources ?? []), ...(Array.isArray(p.aiCitations) ? p.aiCitations : [])]) add(s, null, false);
  return out;
}

/**
 * The score a cited page is ranked by, 0 to 100: mostly how much of the market's buying power its
 * points hold, then how many points cited it, how early in the answer, and how many rivals are on it.
 */
export function priorityScore(powerShare: number, pinShare: number, avgSlot: number | null, competitors: number) {
  const slot = avgSlot === null ? 50 : Math.max(0, 100 - (avgSlot - 1) * 20);
  return round(0.45 * powerShare + 0.25 * pinShare + 0.2 * slot + 0.1 * Math.min(100, competitors * 25));
}

/**
 * Everything the AI citations tab shows for one scan. `weights`: each point's share of the grid's
 * buying power (points without a Census estimate are absent, and then count equally). `checks`:
 * what a look at each page found, by address. `own`: the business's own website.
 */
export function aioRollup(pins: AioPin[], business: string, own: string | null | undefined, weights: Map<string, number> = new Map(), checks: Record<string, PageCheck> = {}) {
  const completed = pins.filter((p) => p.status === 'COMPLETED');
  const withAi = completed.filter(shown);
  const w = (id: string) => (weights.size ? weights.get(id) ?? 0 : 1);
  const totalW = withAi.reduce((n, p) => n + w(p.id), 0);
  const power = (ids: string[]) => (totalW > 0 ? (100 * ids.reduce((n, id) => n + w(id), 0)) / totalW : 0);
  const named = (p: AioPin) => Boolean(p.targetCitedInAi) || (p.insights?.ai?.named ?? []).some((n) => norm(n) === norm(business) || (norm(business).length > 5 && (norm(n).includes(norm(business)) || norm(business).includes(norm(n)) && norm(n).length > 5)));

  const by = new Map<string, { url: string; pageKnown: boolean; pins: string[]; slots: number[] }>();
  const state: Record<string, PinState> = {};
  const ownPins: string[] = [], namedPins: string[] = [];
  for (const p of pins) {
    if (p.status !== 'COMPLETED') { state[p.id] = 'pending'; continue; }
    if (!shown(p)) { state[p.id] = 'none'; continue; }
    const cites = citesOf(p);
    const ownCited = cites.some((c) => kindOf(c.url, own) === 'own');
    const isNamed = named(p);
    if (ownCited) ownPins.push(p.id);
    if (isNamed) namedPins.push(p.id);
    state[p.id] = isNamed || ownCited ? 'you' : 'others';
    for (const c of cites) {
      const row = by.get(c.url) ?? { url: c.url, pageKnown: c.pageKnown, pins: [], slots: [] };
      row.pins.push(p.id);
      if (c.n !== null) row.slots.push(c.n);
      by.set(c.url, row);
    }
  }
  const pages: CitedPage[] = [...by.values()].map((r) => {
    const site = siteOf(r.url) ?? '';
    const check = checks[r.url];
    const pinShare = withAi.length ? (100 * r.pins.length) / withAi.length : 0;
    const powerShare = power(r.pins);
    const avgSlot = r.slots.length ? round(r.slots.reduce((a, b) => a + b, 0) / r.slots.length) : null;
    return {
      url: r.url, site, name: knownSite(site)?.name ?? site, kind: kindOf(r.url, own), pageKnown: r.pageKnown, pins: r.pins,
      pinShare: round(pinShare), powerShare: round(powerShare), avgSlot, present: check?.present ?? null, competitors: check?.competitors ?? 0,
      score: priorityScore(powerShare, pinShare, avgSlot, check?.competitors ?? 0),
    };
  }).sort((a, b) => b.score - a.score || b.pins.length - a.pins.length || a.url.localeCompare(b.url));

  // The same pages by website: a job is about a site (one Yelp job, however many Yelp pages were
  // cited), and points whose answer was only read as a list of websites count towards their site.
  const bySite = new Map<string, CitedPage[]>();
  for (const p of pages) bySite.set(p.site, [...(bySite.get(p.site) ?? []), p]);
  const sites: CitedSite[] = [...bySite].map(([site, list]) => {
    const ids = [...new Set(list.flatMap((p) => p.pins))];
    const slotted = list.filter((p) => p.avgSlot !== null);
    const slotPins = slotted.reduce((n, p) => n + p.pins.length, 0);
    const avgSlot = slotPins ? round(slotted.reduce((n, p) => n + (p.avgSlot as number) * p.pins.length, 0) / slotPins) : null;
    const pinShare = withAi.length ? (100 * ids.length) / withAi.length : 0, powerShare = power(ids);
    const competitors = Math.max(0, ...list.map((p) => p.competitors));
    const known = list.filter((p) => p.pageKnown);
    return {
      site, name: list[0].name, kind: list.some((p) => p.kind === 'own') ? 'own' : list[0].kind, pins: ids, pinShare: round(pinShare), powerShare: round(powerShare), avgSlot,
      // On the site if it is on any of its cited pages; not on it only once every known page was looked at.
      present: list.some((p) => p.present === true) ? true : known.length > 0 && known.every((p) => p.present === false) ? false : null,
      competitors, score: priorityScore(powerShare, pinShare, avgSlot, competitors),
      pages: [...known, ...list.filter((p) => !p.pageKnown)], top: known[0]?.url ?? null,
    };
  }).sort((a, b) => b.score - a.score || b.pins.length - a.pins.length || a.site.localeCompare(b.site));

  const kinds = (Object.keys(KIND_LABEL) as SourceKind[]).map((kind) => {
    const rows = sites.filter((p) => p.kind === kind);
    const ids = [...new Set(rows.flatMap((r) => r.pins))];
    return { kind, label: KIND_LABEL[kind], sites: rows.length, pages: rows.reduce((n, r) => n + r.pages.filter((p) => p.pageKnown).length, 0), pins: ids.length, pinShare: withAi.length ? round((100 * ids.length) / withAi.length) : 0 };
  }).filter((k) => k.sites > 0).sort((a, b) => b.pins - a.pins);

  // The rival website cited at the most points, for "your website against the top rival's".
  const rival = [...sites.filter((x) => x.kind === 'business')].sort((a, b) => b.pins.length - a.pins.length)[0] ?? null;
  const gaps = sites.filter((p) => p.kind !== 'own' && p.kind !== 'reference' && p.present !== true);
  const top = gaps.slice(0, 6);
  const covered = [...new Set(top.flatMap((p) => p.pins))];
  const pct = (n: number) => (withAi.length ? round((100 * n) / withAi.length) : 0);
  const rivalPins = [...new Set(sites.filter((x) => x.kind === 'business').flatMap((x) => x.pins))];
  return {
    points: completed.length,
    answers: withAi.length,
    triggerRate: completed.length ? round((100 * withAi.length) / completed.length) : 0,
    /** Share of AI voice: the answers that named the business, plainly and weighted by buying power. */
    named: { pins: namedPins.length, share: pct(namedPins.length), powerShare: round(power(namedPins)) },
    ownSite: { pins: ownPins.length, share: pct(ownPins.length) },
    rival: rival ? { site: rival.site, pins: rival.pins.length, share: pct(rival.pins.length) } : null,
    /** Every other business's website taken together: the points that cited any of them. */
    rivals: { pins: rivalPins, pinShare: pct(rivalPins.length), powerShare: round(power(rivalPins)) },
    uncaptured: { pages: top.length, pinShare: pct(covered.length), powerShare: round(power(covered)) },
    weighted: weights.size > 0,
    pages,
    sites,
    kinds,
    state,
  };
}
export type AioRollup = ReturnType<typeof aioRollup>;

/* ───────────── The checklist ───────────── */

export type Playbook = 'CLAIM_LISTING' | 'ASK_TO_BE_LISTED' | 'PITCH_LOCAL_NEWS' | 'PUBLISH_VIDEO' | 'JOIN_THREAD' | 'ANSWER_ON_YOUR_SITE';
export type Tier = 'CRITICAL' | 'HIGH' | 'MEDIUM';
export type AioTask = {
  /** What the task is about: the page, or "other-business-pages" for the one task that covers them all. */
  target: string;
  playbook: Playbook;
  tier: Tier;
  score: number;
  headline: string;
  why: string;
  steps: string[];
  /** Words to copy and adapt (an email, a video outline, an answer block), when the job has some. */
  draft: string | null;
  draftLabel: string | null;
  /** The pages it concerns, and the points that cited them. */
  pages: CitedPage[];
  /** How many points, and what share of the answers and of the buying power, the job reaches. */
  pinShare: number;
  powerShare: number;
  pins: string[];
  /** Something we can do for the customer: a citation, a post through the profile tools. */
  service: 'CITATION' | 'VIDEO' | 'PROFILE' | null;
  /** Checked and found: the business is already on the page. Listed under "already yours", not as a job. */
  captured: boolean;
};

const tierOf = (score: number): Tier => (score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : 'MEDIUM');
const PLAY: Partial<Record<SourceKind, Playbook>> = { directory: 'CLAIM_LISTING', roundup: 'ASK_TO_BE_LISTED', news: 'PITCH_LOCAL_NEWS', video: 'PUBLISH_VIDEO', community: 'JOIN_THREAD' };

type Ctx = { business: string; keyword: string; place: string; answers: number; weighted: boolean };
const reach = (p: CitedSite, c: Ctx) =>
  `Cited at ${p.pins.length} of the ${c.answers} points where Google showed an AI answer` + (c.weighted ? `, which hold ${Math.round(p.powerShare)}% of the buying power among them` : '') + (p.avgSlot !== null ? `, on average as source number ${p.avgSlot}` : '') + '.';
const found = (p: CitedSite) => (p.present === false ? ` ${p.competitors > 0 ? p.competitors + ' of your top rivals are on the cited page; ' : ''}the business is not.` : p.present === null ? ' Not yet checked whether the business is on it.' : '');
const where = (c: Ctx) => (c.place ? ' in ' + c.place : '');

function taskFor(p: CitedSite, c: Ctx): AioTask | null {
  const playbook = PLAY[p.kind];
  if (!playbook) return null;
  // The job is kept under the website, so it is the same job in the next scan whatever page is cited then.
  const base = { target: p.site, playbook, tier: tierOf(p.score), score: p.score, pages: p.pages, pins: p.pins, pinShare: p.pinShare, powerShare: p.powerShare, captured: p.present === true };
  const known = knownSite(p.site);
  const page = p.top ?? p.site;
  if (playbook === 'CLAIM_LISTING')
    return {
      ...base, service: 'CITATION', draft: null, draftLabel: null,
      headline: `Get ${c.business} listed on ${p.name}`,
      why: reach(p, c) + found(p),
      steps: [
        known ? `${known.how}: ${known.url}` : `Create or claim the business’s page on ${p.name}.`,
        'Use exactly the name, address and phone number that are on the Google listing.',
        `Choose the category that matches “${c.keyword}”, and write the services out in full.`,
        p.top ? `Then check the cited page itself (${p.top}): if it is a category or “best in town” page, a complete profile with recent reviews is what gets a business onto it.` : 'Add photos, hours and a link to the website, and ask recent customers for a review there.',
      ],
    };
  if (playbook === 'ASK_TO_BE_LISTED')
    return {
      ...base, service: null, draftLabel: 'Email to the editor',
      headline: `Ask to be added to the “best of” list on ${p.name}`,
      why: reach(p, c) + found(p),
      steps: [`Open the list: ${page}`, 'Find who wrote or edits it (the byline, an “about” or “contact” page).', 'Send the email below, adapted. One short follow-up a week later is enough.', 'If they list criteria or a form to apply, use that instead.'],
      draft: `Subject: A suggestion for your ${c.keyword} list${where(c)}\n\nHi,\n\nI came across your list at ${page} while looking at who people find for ${c.keyword}${where(c)}. It is a useful page.\n\nI run ${c.business}${where(c)}. [One line of proof: years in business, licence, Google rating and number of reviews.] I think we would be a fair addition, and I am glad to send anything you need to check that: licence number, insurance, photos of recent work, customers you can call.\n\nThanks for considering it,\n[Name]\n[Phone] · [Website]`,
    };
  if (playbook === 'PITCH_LOCAL_NEWS')
    return {
      ...base, service: null, draftLabel: 'Note to the newsroom',
      headline: `Give ${p.name} a reason to mention ${c.business}`,
      why: reach(p, c) + ' Google is quoting local coverage for this search.' + found(p),
      steps: [`Read what was cited: ${page}`, 'Offer something of the same kind that is news: a seasonal tip from an expert, a free service day, a hire, a milestone.', 'Send the note below to the reporter or the news desk.'],
      draft: `Subject: Local ${c.keyword} expert available${where(c)}\n\nHi,\n\nI saw your piece at ${page}. I run ${c.business}${where(c)} and can help with a follow-up: [the timely angle, in one sentence]. I can talk on the record, share what we are seeing this season, and send photos.\n\n[Name], ${c.business}\n[Phone]`,
    };
  if (playbook === 'PUBLISH_VIDEO')
    return {
      ...base, service: 'VIDEO', draftLabel: 'Video outline',
      headline: `Publish a short video that answers “${c.keyword}”${where(c)}`,
      why: reach(p, c) + ' Google is citing a video for this search, and it is not yours.',
      steps: [`Watch the cited video: ${page}`, 'Record 60 to 90 seconds on a phone, in daylight, answering the same question for your town.', 'Use the outline below: say the town and the service aloud in the first sentence (the spoken words are what get quoted).', 'Upload it to YouTube with the title and description below, then post it on the Google listing too.'],
      draft: `Title: ${c.keyword[0].toUpperCase() + c.keyword.slice(1)}${where(c)}: what it costs and what to ask\n\n0:00  “I’m [name] from ${c.business}${where(c)}. Here is what to know about ${c.keyword}.”\n0:10  What it usually costs here, and what changes the price.\n0:35  The two questions to ask anyone you hire.\n0:55  How long it takes, and when to call the same day.\n1:15  “We’re ${c.business}${where(c)}. Call or book on our Google listing.”\n\nDescription: ${c.business} answers the common questions about ${c.keyword}${where(c)}. [Phone] · [Website] · [Address]`,
    };
  return {
    ...base, service: null, draftLabel: null,
    headline: `Add a helpful answer to the ${p.name} thread Google is quoting`,
    why: reach(p, c) + ' People asked this in public, and the answers there are what Google is reading.',
    steps: [`Open the thread: ${page}`, 'Answer the question that was asked, as the owner, in your own name. Say you own the business; hidden promotion gets removed and remembered.', 'Give something a neighbour could use without hiring you: a price range, what to check first, when it is urgent.', 'Do not post the same answer in several places.'],
    draft: null,
  };
}

/**
 * The jobs, most valuable first. One per directory, list, video, news page or thread (pages the
 * business is already on are marked `captured`), and a single job for all the other businesses'
 * pages Google quoted: the answer to those is the same, a page of one's own that says it better.
 */
export function aioTasks(r: AioRollup, c: { business: string; keyword: string; place: string }, limit = 14): AioTask[] {
  const ctx: Ctx = { ...c, answers: r.answers, weighted: r.weighted };
  const tasks = r.sites.map((p) => taskFor(p, ctx)).filter((t): t is AioTask => t !== null);
  const rivals = r.sites.filter((p) => p.kind === 'business');
  if (rivals.length) {
    // Scored as one source: together these pages reach every point that cited any of them.
    const pins = r.rivals.pins;
    const top = rivals.flatMap((x) => x.pages.filter((p) => p.pageKnown)).sort((a, b) => b.pins.length - a.pins.length).slice(0, 6);
    const slotted = rivals.filter((x) => x.avgSlot !== null);
    const score = priorityScore(r.rivals.powerShare, r.rivals.pinShare, slotted.length ? Math.min(...slotted.map((x) => x.avgSlot as number)) : null, 0);
    tasks.push({
      target: 'other-business-pages', playbook: 'ANSWER_ON_YOUR_SITE', tier: tierOf(score), score, pages: top.length ? top : rivals.slice(0, 6).flatMap((x) => x.pages.slice(0, 1)), pins, pinShare: r.rivals.pinShare, powerShare: r.rivals.powerShare, service: 'PROFILE', captured: false, draftLabel: 'Answer block for your page',
      headline: `Publish the answers Google is quoting from other businesses’ websites`,
      why: `At ${pins.length} of the ${r.answers} points, Google’s answer cited another business’s own page` + (r.ownSite.pins ? `; yours was cited at ${r.ownSite.pins}.` : ', and never yours.') + ' Those pages state plainly what the service is, what it costs and where it is offered.',
      steps: [
        'Open the pages Google cited (listed below) and note what each one states outright: prices, service area, hours, guarantees, how to book.',
        `On your own page for “${c.keyword}”, add the block below near the top, filled in with your real figures.`,
        'Put the same services and descriptions on the Google listing (Edit business → Services), so both say the same thing.',
        'A later scan shows whether your page starts being cited.',
      ],
      draft: `<section>\n  <h2>${c.keyword[0].toUpperCase() + c.keyword.slice(1)}${where(ctx)}</h2>\n  <p>${c.business} provides ${c.keyword}${where(ctx)}. [Who it is for, in one sentence.]</p>\n  <h3>What does it cost?</h3>\n  <p>Most jobs cost between $[low] and $[high]. [What moves the price.]</p>\n  <h3>How soon can you come?</h3>\n  <p>[Same day / within N days]. We serve [towns and ZIP codes].</p>\n  <h3>What is included?</h3>\n  <ul><li>[Item]</li><li>[Item]</li><li>[Guarantee or licence]</li></ul>\n</section>`,
    });
  }
  return tasks.sort((a, b) => Number(a.captured) - Number(b.captured) || b.score - a.score).slice(0, limit);
}

/** A business's name as the key its checklist is saved under, so it carries from one scan to the next. */
export const businessKey = (name: string) => norm(name).slice(0, 120);

/**
 * Whether a page's text mentions the business: its name, its phone number or its website. Names are
 * matched whole and in order, digits ignoring punctuation. Used on fetched pages only.
 */
export function mentions(text: string, who: { name: string; phone?: string | null; domain?: string | null }): boolean {
  const t = ' ' + norm(text) + ' ';
  const n = norm(who.name);
  if (n.length >= 4 && t.includes(' ' + n + ' ')) return true;
  const digits = (who.phone ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (digits.length === 10 && text.replace(/\D/g, ' ').replace(/\s+/g, '').includes(digits)) return true;
  const d = siteOf(who.domain ?? '');
  return Boolean(d) && text.toLowerCase().includes(d as string);
}
