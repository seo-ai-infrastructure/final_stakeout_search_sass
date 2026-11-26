/**
 * Rebuilds what a phone saw from its evidence bundle: the results page (Local Services
 * ads, the map pack, People also search for, web results), the Local Finder and the AI
 * Overview, each in Google's own order. Ads are kept, labelled and never ranked.
 * Pure: no network, no dependencies beyond node:zlib.
 */
import { gunzipSync } from 'node:zlib';
import { businessKey } from './locations';
import { googleIdsIn } from './businessIds';

/** Files in a .tar.gz evidence bundle, by path. */
export function untarGz(gz: Uint8Array): Map<string, Buffer> {
  const buf = gunzipSync(gz);
  const out = new Map<string, Buffer>();
  const str = (a: number, b: number) => buf.toString('utf8', a, b).replace(/\0[\s\S]*$/, '');
  for (let off = 0; off + 512 <= buf.length; ) {
    const name = str(off, off + 100);
    if (!name) break;
    const size = parseInt(str(off + 124, off + 136).trim() || '0', 8) || 0;
    const type = str(off + 156, off + 157);
    const prefix = str(off + 345, off + 500);
    off += 512;
    if (type === '' || type === '0') out.set(prefix ? prefix + '/' + name : name, buf.subarray(off, off + size));
    off += Math.ceil(size / 512) * 512;
  }
  return out;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m,
  );
const clean = (s: string) => s.replace(/[\u2066-\u2069]/g, '').replace(/[\u00a0\s]+/g, ' ').trim();

/** Labelled UI elements in page order (consecutive repeats dropped). */
export function uiLabels(xml: string): { cls: string; label: string }[] {
  const out: { cls: string; label: string }[] = [];
  const re = /<node\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const a = m[1];
    // Values holding a double quote (e.g. a review snippet) are written single-quoted.
    const attr = (k: string) => {
      const x = new RegExp('\\s' + k + '=(?:"([^"]*)"|\'([^\']*)\')').exec(a);
      return x ? (x[1] ?? x[2] ?? '') : '';
    };
    const label = clean(decode(attr('content-desc') || attr('text')));
    if (!label || label.length < 2 || label === out[out.length - 1]?.label) continue;
    out.push({ cls: attr('class').split('.').pop() ?? '', label });
  }
  return out;
}

type Listing = {
  name: string;
  rating: string | null;
  reviews: string | null;
  meta: string;
  quote: string | null;
  ad: boolean;
  /** Organic position within its section (ads have none). */
  pos: number | null;
  /** Distance from the phone as Google showed it ("0.4 mi"); none for businesses that hide their address. */
  distance?: string | null;
};

const CARD = /^(.*?)\s+(About this result\s+)?Rated ([0-5](?:[.,]\d)?) out of 5,?\s*([\s\S]*)$/;
/** A business card's accessibility label, split into its parts. */
export function parseCard(label: string): (Omit<Listing, 'ad' | 'pos'> & { organicMarker: boolean }) | null {
  const m = CARD.exec(label);
  if (!m || !m[1] || m[1].length > 120) return null;
  let rest = m[4];
  const rv = /(\d[\d,.]*K?) (?:user )?reviews?(?: for [^·]*)?/.exec(rest) ?? /^\((\d[\d,.]*K?)\)/.exec(rest);
  if (rv) rest = rest.replace(rv[0], '');
  const q = /["“]([^"”]{3,})["”]/.exec(rest);
  if (q) rest = rest.replace(q[0], '');
  const meta = clean(rest.replace(/^[\s·,]+/, '').replace(/\s·\s*$/, ''));
  const d = /(?:^|·)\s*(\d+(?:[.,]\d+)?) ?(mi|ft|km)\b/.exec(meta);
  return {
    name: m[1].trim(),
    rating: m[3].replace(',', '.'),
    reviews: rv ? rv[1] : null,
    meta,
    quote: q ? q[1].trim() : null,
    organicMarker: Boolean(m[2]),
    distance: d ? `${d[1].replace(',', '.')} ${d[2]}` : null,
  };
}

const norm = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/\b(llc|inc|co|corp|company|ltd)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
/** Same business, tolerant of LLC/Inc/punctuation/"&", however the ending is written ("L.L.C.", "P.C."). */
export const sameBusiness = (a: string, b: string) => (norm(a) === norm(b) && norm(a) !== '') || (businessKey(a) === businessKey(b) && businessKey(a) !== '');

/**
 * Whether a business an AI answer names is the tracked one. With the scan's Google ID, an entry
 * that links a Google listing is the business only if it links that one (two offices with the same
 * name have different IDs); an entry named without a link, or any entry on a scan without an ID, is
 * matched by name.
 */
export function isAiTarget(b: { name: string; kgmid?: string | null }, target: string, targetKgmid?: string | null): boolean {
  if (targetKgmid && b.kgmid) return b.kgmid === targetKgmid;
  return sameBusiness(b.name, target);
}

/**
 * The name an AI answer's business is kept under on a scan with a Google ID: the tracked business's
 * own name when the entry links its listing (so every report reads it as the business however
 * Google wrote the name), "<name> (another listing)" when it has the same name but links a
 * different listing, and Google's own name otherwise. Without IDs, always Google's own name.
 */
export function aiNameFor(b: { name: string; kgmid?: string | null }, target: string, targetKgmid?: string | null): string {
  if (!targetKgmid || !b.kgmid) return b.name;
  if (b.kgmid === targetKgmid) return target;
  return sameBusiness(b.name, target) ? b.name + ' (another listing)' : b.name;
}

const isCardContainer = (cls: string) => cls === 'View' || cls === 'Button';
/** Numbers organic listings in order; duplicates are removed within ads and within organic, never across. */
function finish(items: Omit<Listing, 'pos'>[]): Listing[] {
  const seen = { ad: new Set<string>(), organic: new Set<string>() };
  let n = 0;
  const out: Listing[] = [];
  for (const it of items) {
    const group = it.ad ? seen.ad : seen.organic, k = norm(it.name);
    if (group.has(k)) continue;
    group.add(k);
    out.push({ ...it, pos: it.ad ? null : ++n });
  }
  return out;
}

type WebResult = { site: string; url: string; title: string; ad: boolean };
type ResultsPage = {
  location: string | null;
  googleLocation: string | null;
  localServicesAds: { title: string | null; listings: Listing[] };
  aiPreview: string | null;
  pack: Listing[];
  /** The map pack's link to the full list (the Local Finder): "More businesses", "More places" or "See more on Google". */
  packMore: string | null;
  peopleAlsoSearch: string[];
  web: WebResult[];
};

/** The results page, in Google's order. Ads are detected by Google's own markers. */
export function readResultsPage(xml: string): ResultsPage {
  const L = uiLabels(xml);
  const page: ResultsPage = { location: null, googleLocation: null, localServicesAds: { title: null, listings: [] }, aiPreview: null, pack: [], packMore: null, peopleAlsoSearch: [], web: [] };
  const lsa: Omit<Listing, 'pos'>[] = [], pack: Omit<Listing, 'pos'>[] = [];
  let mode: 'top' | 'lsa' | 'aio' | 'pack' | 'pasf' | 'web' | 'end' = 'top';
  let nextIsAd = false, aio: string[] = [];
  for (let i = 0; i < L.length; i++) {
    const { cls, label } = L[i];
    if (/ - (From your device|Based on your|From your IP address)/i.test(label)) page.googleLocation ??= label;
    if (label === 'Choose area' && i > 0 && !page.location) page.location = L[i - 1].label;
    if (mode === 'end') continue;
    if (/^Sponsored (?!Result)(.+?)(?: Why this ad\?)?$/.test(label) && mode !== 'pack' && mode !== 'web') {
      mode = 'lsa';
      page.localServicesAds.title = label.replace(/^Sponsored\s+/, '').replace(/\s*Why this ad\?$/, '');
      continue;
    }
    if (label === 'AI Overview') { mode = 'aio'; continue; }
    if (label === 'Businesses' || label === 'Places') { mode = 'pack'; nextIsAd = false; continue; }
    if (label === 'People also search for') { mode = 'pasf'; continue; }
    if (label === 'Web results') { mode = 'web'; nextIsAd = false; continue; }
    if (label === 'Page Navigation' || label === 'Footer Links') { mode = 'end'; continue; }
    if (label === 'Sponsored' || label === 'Sponsored Result') { nextIsAd = true; continue; }
    const card = isCardContainer(cls) ? parseCard(label) : null;
    if (mode === 'aio') {
      if (/^Show more|^Ads$|^Businesses$/.test(label)) mode = 'top';
      else if (cls === 'TextView' || cls === 'View') aio.push(label);
      continue;
    }
    if (mode === 'lsa') {
      if (label === 'Show more' || label === 'More businesses' || label === 'See more on Google') { mode = 'top'; continue; }
      if (card) lsa.push({ ...card, ad: true });
      continue;
    }
    if (mode === 'pack') {
      // The pack ends at its link to the full list: "More businesses", or "See more on Google" since Nov 2026.
      if (label === 'More businesses' || label === 'More places' || label === 'See more on Google') { page.packMore ??= label; mode = 'top'; continue; }
      if (card) { pack.push({ ...card, ad: nextIsAd }); nextIsAd = false; }
      continue;
    }
    if (mode === 'pasf') {
      if (cls === 'View' && !card && page.peopleAlsoSearch.length < 8) page.peopleAlsoSearch.push(label);
      continue;
    }
    if (mode === 'web') {
      const w = /^(.+?) (https?:\/\/\S+) (.+)$/.exec(label);
      if (w && cls === 'View') { page.web.push({ site: w[1], url: w[2].replace(/^https?:\/\//, ''), title: w[3], ad: nextIsAd }); nextIsAd = false; }
      else if (card && nextIsAd) {
        page.web.push({ site: 'Sponsored result', url: '', title: [card.name, card.rating && card.rating + ' ★' + (card.reviews ? ' (' + card.reviews + ')' : ''), card.meta].filter(Boolean).join(' · '), ad: true });
        nextIsAd = false;
      }
    }
  }
  page.aiPreview = aio.length ? aio.join('\n').slice(0, 4000) : null;
  page.localServicesAds.listings = finish(lsa);
  page.pack = finish(pack);
  return page;
}

/**
 * The words a Google results page was searched for, from Chrome's title for it ("<words> - Google
 * Search", the same on the Local Finder). Null when the snapshot has no such title (the Maps app,
 * a page that never loaded): then nothing is concluded from it.
 */
export function searchedQuery(xml: string | null | undefined): string | null {
  if (!xml) return null;
  for (const { cls, label } of uiLabels(xml)) {
    if (cls !== 'WebView') continue;
    const m = /^(.+?) - Google Search$/.exec(label);
    if (m) return m[1];
  }
  return null;
}

const words = (s: string) =>
  s.normalize('NFKC').toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[^\p{L}\p{N}']+/gu, ' ').trim();

/** Whether two searches are the same words (letter case, spacing and punctuation aside). */
export function sameQuery(a: string, b: string): boolean {
  return words(a) === words(b);
}

/**
 * The search a page was for when it was not this keyword (a warm-up search left on screen, a
 * related search opened by mistake); null when it was the keyword, or when the page does not say.
 * A spelling correction still counts as the keyword's search: Google keeps the keyword on the page
 * ("Search instead for <keyword>").
 */
export function otherSearch(xml: string | null | undefined, keyword: string): string | null {
  const q = searchedQuery(xml);
  if (q === null || sameQuery(q, keyword)) return null;
  const kw = words(keyword);
  const kept = uiLabels(xml!).some(({ label }) => {
    const l = words(label);
    return l === kw || (/^(Showing results for|Search instead for|Including results for|Did you mean)\b/i.test(label) && l.endsWith(' ' + kw));
  });
  return kept ? null : q;
}

/** The Local Finder list, in Google's order: ads (labelled, unranked) and organic listings. */
/**
 * True only for the Local Finder: its "Places" tab is the selected one (enabled="false"),
 * as in the real snapshots. A results page (even one listing businesses in its AI Overview)
 * is never a Local Finder.
 */
export function isLocalFinder(xml: string): boolean {
  for (const m of xml.matchAll(/<node\b[^>]*>/g))
    if (/content-desc="Places"/.test(m[0]) && /enabled="false"/.test(m[0])) return true;
  return false;
}

export function readLocalFinder(xml: string): Listing[] {
  if (!isLocalFinder(xml)) return [];
  const items: Omit<Listing, 'pos'>[] = [];
  for (const { cls, label } of uiLabels(xml)) {
    if (!isCardContainer(cls)) continue;
    const c = parseCard(label);
    // In the Local Finder every organic card carries "About this result"; ads never do.
    if (c) items.push({ name: c.name, rating: c.rating, reviews: c.reviews, meta: c.meta, quote: c.quote, ad: !c.organicMarker, distance: c.distance });
  }
  return finish(items);
}

type AiOverview = { paragraphs: string[]; businesses: Listing[]; related: Listing[] };
/** The expanded AI Overview: its text and the businesses it names, in order. */
export function readAiOverview(xml: string): AiOverview | null {
  const L = uiLabels(xml);
  const start = L.findIndex((x) => x.label === 'AI Overview');
  if (start < 0) return null;
  const paragraphs: string[] = [], biz: Omit<Listing, 'pos'>[] = [], related: Omit<Listing, 'pos'>[] = [];
  for (const { cls, label } of L.slice(start + 1)) {
    // The AI Overview ends at its own footer (Copy text / Good response / More options for
    // response), at its collapsed "Show more AI Overview" button, or, failing those, at the
    // next ads block or "People also ask". Anything after it (e.g. Local Services Ads) is not AI.
    if (/^(Show less|Web results|People also search for|Page Navigation|Footer Links|Copy text|Good response|Bad response|Show more AI Overview|People also ask)$/.test(label)) break;
    if (/^More options for response/.test(label) || /^Sponsored/.test(label)) break;
    // "Related results" is a Button that closes each group of cards (seen on two real pages);
    // it does not start a separate list, so every card in the AI Overview counts, in order.
    if (label === 'Related results') continue;
    const c = isCardContainer(cls) ? parseCard(label) : null;
    if (c) biz.push({ name: c.name, rating: c.rating, reviews: c.reviews, meta: c.meta, quote: c.quote, ad: false });
    else if (cls === 'TextView' && label.length > 2 && paragraphs.length < 80) paragraphs.push(label);
  }
  return { paragraphs, businesses: finish(biz), related: finish(related) };
}

/** Every labelled element with its box on the screen (bounds="[x1,y1][x2,y2]"), in page order. */
export function uiBoxes(xml: string): { cls: string; label: string; box: [number, number, number, number] | null }[] {
  const out: { cls: string; label: string; box: [number, number, number, number] | null }[] = [];
  const re = /<node\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const a = m[1];
    const attr = (k: string) => {
      const x = new RegExp('\\s' + k + '=(?:"([^"]*)"|\'([^\']*)\')').exec(a);
      return x ? (x[1] ?? x[2] ?? '') : '';
    };
    const label = clean(decode(attr('content-desc') || attr('text')));
    if (!label || label.length < 2) continue;
    const b = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(attr('bounds'));
    out.push({ cls: attr('class').split('.').pop() ?? '', label, box: b ? [+b[1], +b[2], +b[3], +b[4]] : null });
  }
  return out;
}

/**
 * Whether a snapshot's AI Overview was folded (it ends at its "Show more AI Overview" button) and
 * the business cards it holds. A folded overview keeps only what it shows in the page: the cards
 * above the button (the rest arrive when it opens, as two snapshots of one search showed: 2 cards
 * folded, 7 opened). One Google shows whole has no such button. Boxes cannot tell either way:
 * Chrome gives every element off the screen an empty box. Null when it holds no AI Overview.
 */
export function aiOverviewFold(xml: string | null | undefined): { folded: boolean; cards: string[] } | null {
  if (!xml) return null;
  const ai = readAiOverview(xml);
  if (!ai) return null;
  const L = uiLabels(xml);
  const start = L.findIndex((x) => x.label === 'AI Overview');
  const end = L.slice(start + 1).find((x) => /^(Show less|Web results|People also search for|Page Navigation|Footer Links|Copy text|Good response|Bad response|Show more AI Overview|People also ask)$/.test(x.label) || /^More options for response/.test(x.label) || /^Sponsored/.test(x.label));
  return { folded: end?.label === 'Show more AI Overview', cards: ai.businesses.map((b) => b.name) };
}

/** The names of the cards an AI Overview showed before "Show more", from a snapshot taken before it was opened (all of them when it was not folded); null when the snapshot holds no AI Overview. */
export function cardsBeforeExpansion(xml: string | null | undefined): string[] | null {
  return aiOverviewFold(xml)?.cards ?? null;
}

/** Organic position of the tracked business in a section, or null if absent. */
export const rankIn =(list: Listing[], business: string) => list.find((l) => !l.ad && sameBusiness(l.name, business))?.pos ?? null;

type AiCopyBusiness = {
  pos: number;
  name: string;
  /** Google's own business id (Knowledge Graph MID), e.g. "/g/11z8421vy4". */
  /** Google's id for the business, or '' when the answer names it without linking a Google listing. */
  kgmid: string;
  url: string;
  rating: string | null;
  reviews: string | null;
  category: string | null;
  lines: string[];
};
/** One piece of the copied answer, in the order Google wrote it. `business` is an index into `businesses`. */
type AiCopyBlock = { kind: 'heading' | 'text' | 'bullet'; text: string } | { kind: 'business'; business: number };
type AiCopy = {
  intro: string[];
  businesses: AiCopyBusiness[];
  citations: { n: number; url: string }[];
  verified: boolean;
  /** Text after the business list: closing sections such as "How to verify a licence". */
  outro: string[];
  /** The whole answer in order (headings, paragraphs, bullets and businesses), to rebuild it as shown. */
  blocks: AiCopyBlock[];
  /** The ads the copy ends with (from "Sponsored", glued to the next word: "SponsoredYou might consider…"): never businesses, citations or answer text. */
  sponsored: string[];
};

const BIZ_LINE = /^(.+?) \((https:\/\/www\.google\.com\/search\?kgmid=([^&)\s]+)[^)\s]*)\)$/;
const RATING_LINE = /^([0-5](?:\.\d)?)\((\d[\d.,]*K?)\)\s*·\s*(.+)$/;

/**
 * The AI Overview as copied with its own copy button: the intro, each business with its
 * kgmid (Google's business id, so matching never depends on spelling) and the citations.
 * `checkAgainst` is text from the same run's AI Overview snapshot: the copy is only
 * verified if its businesses (or intro) appear there too, so a stale clipboard never counts.
 */
export function readAiCopy(text: string, checkAgainst: string[] = []): AiCopy {
  const intro: string[] = [], outro: string[] = [], businesses: AiCopyBusiness[] = [], citations: { n: number; url: string }[] = [];
  const blocks: AiCopyBlock[] = [];
  let cur: AiCopyBusiness | null = null;
  // The copy separates sections with a blank line, and lists a business's details directly under
  // its name. So a blank line ends the business above it: what follows is a new section, not
  // more of that business's details.
  let blank = true;
  // A business block is its name, a few plain lines (rating, hours, offers), then bulleted
  // details. A plain line after the bullets have begun is therefore the next business: one the
  // answer names without linking a Google listing (so it has no kgmid).
  let bulleted = false;
  const rawLines = text.replace(/\r/g, '').split('\n');
  const sponsored: string[] = [];
  for (let li = 0; li < rawLines.length; li++) {
    const raw = rawLines[li];
    const line = raw.trim();
    if (!line) {
      blank = true;
      continue;
    }
    // The copy ends with the AI Overview's ads ("SponsoredYou might consider these options:", then
    // each ad's advertiser, headline and site). They are not the answer: nothing after is read as it.
    if (/^Sponsored(?![a-z])/.test(line)) {
      for (const rest of [line.replace(/^Sponsored/, ''), ...rawLines.slice(li + 1)]) if (rest.trim()) sponsored.push(rest.trim());
      break;
    }
    const afterBlank = blank;
    blank = false;
    // A written section that lists businesses as bullets: "• Name" (with or without a Google
    // link) and its details as indented bullets under it. The business is the outer bullet.
    // (Seen 2026-11-20: such a section came before the answer's business cards, and the tracked
    // business, named first, was missed because only the cards were read.)
    const nextRaw = rawLines[li + 1] ?? '';
    if (/^•\s+\S/.test(raw) && /^[\t ]+[•◦]/.test(nextRaw)) {
      const linked = /\((https:\/\/www\.google\.com\/search\?kgmid=([^&)\s]+)[^)\s]*)\)/.exec(line);
      const name = line.replace(/^•\s*/, '').replace(/\s*\(https?:\/\/[^)\s]*\)/g, '').replace(/,?\s*\[\d+\]/g, '').trim();
      const id = linked ? decodeURIComponent(linked[2]) : '';
      const known = businesses.some((x) => (id && x.kgmid === id) || norm(x.name) === norm(name));
      if (name && name.length <= 90 && !/[:?!]$/.test(name) && !known) {
        cur = { pos: businesses.length + 1, name, kgmid: id, url: linked?.[1] ?? '', rating: null, reviews: null, category: null, lines: [] };
        businesses.push(cur);
        blocks.push({ kind: 'business', business: businesses.length - 1 });
        bulleted = false;
        continue;
      }
    }
    // A business starts its own line; a bullet (detail) that links a kgmid is not a new business.
    const b = line.startsWith('•') ? null : BIZ_LINE.exec(line);
    if (b && !businesses.some((x) => x.kgmid === decodeURIComponent(b[3]))) {
      cur = { pos: businesses.length + 1, name: b[1].trim(), kgmid: decodeURIComponent(b[3]), url: b[2], rating: null, reviews: null, category: null, lines: [] };
      businesses.push(cur);
      blocks.push({ kind: 'business', business: businesses.length - 1 });
      bulleted = false;
      continue;
    }
    for (const m of line.matchAll(/\[(\d+)\] \(([^)\s]+)\)/g)) citations.push({ n: Number(m[1]), url: m[2] });
    if (cur && afterBlank) cur = null;
    const isBullet = line.startsWith('•');
    const plainName = line.replace(/,?\s*\[\d+\]\s*\([^)]*\)/g, '').trim();
    if (cur && bulleted && !isBullet && plainName.length <= 80 && !/[.:?!]$/.test(plainName) && !businesses.some((x) => norm(x.name) === norm(plainName))) {
      cur = { pos: businesses.length + 1, name: plainName, kgmid: '', url: '', rating: null, reviews: null, category: null, lines: [] };
      businesses.push(cur);
      blocks.push({ kind: 'business', business: businesses.length - 1 });
      bulleted = false;
      continue;
    }
    if (cur && isBullet) bulleted = true;
    const r = cur && !cur.rating ? RATING_LINE.exec(line) : null;
    if (cur && r) Object.assign(cur, { rating: r[1], reviews: r[2], category: r[3].trim() });
    // An unlinked business has no rating line: its first plain line is what it is ("HVAC contractor").
    else if (cur && !cur.kgmid && !cur.category && !isBullet && !cur.lines.length) cur.category = line;
    else if (cur) cur.lines.push(line.replace(/^•\s*/, ''));
    else {
      (businesses.length ? outro : intro).push(line);
      const bullet = line.startsWith('•');
      // A heading: a short line on its own, with no sentence ending and no citation.
      const heading = !bullet && afterBlank && line.length <= 90 && !/[.:?!]$/.test(line) && !/\[\d+\] \(/.test(line);
      blocks.push({ kind: bullet ? 'bullet' : heading ? 'heading' : 'text', text: line.replace(/^•\s*/, '') });
    }
  }
  const hay = norm(checkAgainst.join(' \n '));
  const verified =
    checkAgainst.length > 0 &&
    (businesses.some((x) => hay.includes(norm(x.name))) || intro.some((l) => l.length > 12 && hay.includes(norm(l))));
  return { intro, businesses, citations, verified, outro, blocks, sponsored };
}

/**
 * "Position zero": the AI answer names the business in its opening sentences, before any list
 * (often as a link on the brand or its phone number). True when the opening paragraph of Google's
 * copied answer contains the business's name, or the first part of it ("Brandon J. Broderick" of
 * "Brandon J. Broderick, Personal Injury Attorney at Law").
 */
export function aiNamesFirst(copy: string | null | undefined, business: string, targetKgmid?: string | null): boolean {
  if (!copy) return false;
  const opening = copy.replace(/\r/g, '').split(/\n\s*\n/)[0] ?? '';
  // An answer that starts straight with a business block has no opening sentence.
  if (BIZ_LINE.test(opening.split('\n')[0].trim()) || /^•/.test(opening.trim())) return false;
  // The opening links the business's own Google listing: named first, however the name is written.
  if (targetKgmid && googleIdsIn(opening).includes(targetKgmid)) return true;
  const flat = (t: string) => t.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  const hay = ' ' + flat(opening) + ' ';
  const full = flat(business), short = flat(business.split(/[,|–—-]| - /)[0] ?? '');
  return (full.length >= 4 && hay.includes(' ' + full + ' ')) || (short.split(' ').length >= 2 && short.length >= 8 && hay.includes(' ' + short + ' '));
}

/**
 * Google's location line for one search: from the final snapshot when it has one, otherwise from
 * the results page of the same search (the Local Finder snapshot sometimes lacks the line).
 */
export function searchLocationLine(fromFinal: string | null | undefined, serpXml: string | null | undefined): string | null {
  if (fromFinal) return fromFinal;
  return serpXml ? readResultsPage(serpXml).googleLocation : null;
}

/** One result card from the native Google Maps app, rebuilt from its list snapshots. */
type MapsCard = {
  name: string;
  /** Paid placement: "Sponsored" (Local Services Ads also say "Google Verified"). */
  ad: boolean;
  adKind: 'local_services' | 'sponsored' | null;
  /** Organic position (ads have none). */
  pos: number | null;
  /** Position in the list counting ads, from the top. */
  listPos: number;
  rating: string | null;
  reviews: string | null;
  /** Detail lines as shown: "Painter · 12+ years in business", "Open · Closes 7 PM · Serves Mt. Juliet". */
  lines: string[];
  quote: string | null;
  distance: string | null;
};

const xmlText = (v: string) =>
  v.replace(/[\u00a0\u2009\u202f]/g, ' ').replace(/&#10;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const nodeAttr = (tag: string, k: string) => xmlText((new RegExp(`\\s${k}="([^"]*)"`).exec(tag) ?? [])[1] ?? '');

/** Is this snapshot the native Maps results list? */
export function isMapsList(xml: string | null | undefined) {
  return Boolean(xml && /resource-id="[^"]*search_list_layout"/.test(xml));
}

/** The cards on one Maps screen: each child of the results list, its title and its texts in order. */
function mapsScreen(xml: string) {
  const cards: { name: string | null; texts: string[] }[] = [];
  let depth = 0,
    listDepth = -1,
    cur: { name: string | null; texts: string[] } | null = null;
  for (const m of xml.matchAll(/<node\b[^>]*?(\/?)>|<\/node>/g)) {
    if (m[0] === '</node>') {
      if (listDepth >= 0 && depth === listDepth) (listDepth = -1), (cur = null);
      depth--;
      continue;
    }
    const d = depth + 1,
      tag = m[0],
      rid = nodeAttr(tag, 'resource-id').split('/').pop();
    if (listDepth < 0 && rid === 'search_list_layout') listDepth = d;
    else if (listDepth >= 0 && d === listDepth + 1) cards.push((cur = { name: null, texts: [] }));
    if (listDepth >= 0 && d > listDepth && cur) {
      const text = nodeAttr(tag, 'text').trim();
      if (rid === 'title' && text && !cur.name) cur.name = text;
      else if (text) cur.texts.push(text);
    }
    if (m[1] !== '/') depth = d;
  }
  return cards;
}

/**
 * The Maps results list, rebuilt from every snapshot of one search in order. Native Maps
 * snapshots hold only what is on screen, so a card's details are merged from every screen it
 * was seen on; cards whose name was never on screen are left out.
 */
export function readMapsList(screens: (string | null | undefined)[]): MapsCard[] {
  const out: MapsCard[] = [];
  // The last screen each card was seen on, to tell a card continuing from the previous screen
  // from a second card with the same name.
  const lastSeen = new Map<MapsCard, number>();
  let screenNo = -1;
  for (const xml of screens) {
    if (!isMapsList(xml)) continue;
    screenNo++;
    let nth = -1;
    for (const c of mapsScreen(xml!)) {
      if (!c.name) continue;
      nth++;
      // A business can be on the list twice: its sponsored card, and its own listing lower down.
      // Those are two cards, and the listing counts in the ranking. A card is joined to an earlier
      // one of the same kind; a card with no "Sponsored" label is joined to an AD of that name only
      // when it is that ad scrolling off the top (first on this screen, the ad on the screen before).
      const sponsored = c.texts.some((t) => /^sponsored$/i.test(t));
      const same = out.filter((x) => sameBusiness(x.name, c.name!));
      const ad = same.find((x) => x.ad),
        listing = same.find((x) => !x.ad);
      let card: MapsCard | undefined = sponsored ? ad : (listing ?? (ad && nth === 0 && screenNo - (lastSeen.get(ad) ?? -9) <= 1 ? ad : undefined));
      if (!card) {
        card = { name: c.name, ad: false, adKind: null, pos: null, listPos: out.length + 1, rating: null, reviews: null, lines: [], quote: null, distance: null };
        out.push(card);
      }
      const lines: string[] = [];
      for (const t of c.texts) {
        if (/^sponsored$/i.test(t)) card.ad = true;
        else if (/^google verified$/i.test(t)) card.adKind = 'local_services';
        else if (/^[0-5][.,]\d stars?/i.test(t)) {
          const r = /^([0-5][.,]\d) stars?(?: \(([\d.,]+K?)\))?/i.exec(t)!;
          card.rating ??= r[1].replace(',', '.');
          card.reviews ??= r[2] ?? null;
        } else if (/^["“].*["”]$/.test(t)) card.quote ??= t.replace(/^["“]|["”]$/g, '');
        else if (/^\s*·/.test(t) && lines.length) lines[lines.length - 1] += ' ' + t.trim();
        else lines.push(t.trim());
      }
      lastSeen.set(card, screenNo);
      for (const l of lines) if (!card.lines.includes(l)) card.lines.push(l);
      const d = /(?:^|·)\s*(\d+(?:\.\d+)?) ?(mi|ft|km)\b/.exec(card.lines.join(' · '));
      if (d) card.distance ??= `${d[1]} ${d[2]}`;
    }
  }
  let organic = 0;
  for (const c of out) {
    if (c.ad) c.adKind ??= 'sponsored';
    else c.pos = ++organic;
  }
  return out;
}

type AiSource = { title: string; site: string; date: string | null; snippet: string };
type AiLayout = { answer: { kind: 'p' | 'h'; text: string }[]; sources: AiSource[] };

const AI_END = /^(Show less|Web results|People also search for|People also ask|Page Navigation|Footer Links|Copy text|Good response|Bad response|Show more AI Overview|Ads)$/;
const joinText = (a: string, b: string) => (!a ? b : /^[,.;:!?)%]/.test(b) ? a + b : a + ' ' + b);

/**
 * An AI Overview as Google lays it out: the answer (its fragments joined back into sentences, with
 * headings kept apart), then the source cards. Each source card is a title link, the source's
 * name, an "About this result" button, sometimes a date, then a snippet. Null when the snapshot
 * has no AI Overview, no source cards, or lists businesses (those are read by readAiOverview).
 */
export function readAiOverviewLayout(xml: string | null | undefined): AiLayout | null {
  if (!xml) return null;
  const L = uiLabels(xml);
  const start = L.findIndex((x) => x.label === 'AI Overview');
  if (start < 0) return null;
  const span: string[] = [];
  for (const { label } of L.slice(start + 1)) {
    const t = label.trim();
    if (AI_END.test(t) || /^More options for response/.test(t) || /^Sponsored/.test(t)) break;
    if (t) span.push(t);
  }
  const marks = span.map((t, i) => (t === 'About this result' ? i : -1)).filter((i) => i >= 2 && span[i - 1] !== 'About this result');
  // An overview that lists businesses (a map and business cards) keeps its numbered-list display.
  if (!marks.length || readAiOverview(xml)?.businesses.length) return null;
  const sources: AiSource[] = marks.map((m, k) => {
    const end = k + 1 < marks.length ? marks[k + 1] - 2 : span.length;
    const body = span.slice(m + 1, end).filter((t) => t !== 'About this result');
    const dated = body.length > 1 && /^[A-Z][a-z]{2,8}\.? \d{1,2}, \d{4}\s*—?$/.test(body[0]);
    const snippet = body.slice(dated ? 1 : 0).reduce(joinText, '');
    return { title: span[m - 2], site: span[m - 1], date: dated ? body[0].replace(/\s*—$/, '') : null, snippet: snippet.length > 420 ? snippet.slice(0, 419).trimEnd() + '…' : snippet };
  });
  const answer: AiLayout['answer'] = [];
  let cur = '';
  for (const t of span.slice(0, marks[0] - 2)) {
    // A short line with no closing punctuation, after a finished sentence, is a heading.
    const heading = /[.:!?]$/.test(cur) && t.length < 80 && /^[A-Z0-9]/.test(t) && !/[.,:;!?]$/.test(t) && !/^[,.;:!?)]/.test(t);
    if (heading) {
      answer.push({ kind: 'p', text: cur }, { kind: 'h', text: t });
      cur = '';
    } else cur = joinText(cur, t);
  }
  if (cur) answer.push({ kind: 'p', text: cur });
  return { answer, sources };
}

/**
 * The ranking when no Local Finder was opened. First the results page's own map pack (the
 * "Businesses" block: three listings, or four in Google's newer layout, whose link reads "See
 * more on Google" instead of "More businesses"); failing that, the businesses an AI Overview
 * listed. Ads are never counted. A business outside the pack is "not in the pack", not "#5".
 */
type SoloPanel = { name: string; rating: string | null; reviews: string | null; category: string | null };

/**
 * A results page where Google answers a local search with ONE business: a panel with the
 * business's name, rating, photos and actions, and no map pack. Two things mark it, and either is
 * enough:
 *  - its own tab strip, whose last tab reads "About . <business name>";
 *  - its header: the name, "Rated X out of 5,", "N reviews", then "More options for <name>". Google
 *    also shows the panel without tabs (they become filter chips at the top of the page), so the
 *    header has to stand on its own.
 * Cards in a map pack, the Local Finder or an AI Overview have neither.
 */
export function readSoloPanel(xml: string | null | undefined): SoloPanel | null {
  if (!xml) return null;
  const L = uiLabels(xml);
  const rated = /^Rated [0-5](?:[.,]\d)? out of 5/, count = /^[\d.,]+[KM]? reviews?$/i;
  let name: string | null = null,
    head: string[] = [];
  const tabs = L.findIndex((x, i) => /^About \. .+/.test(x.label) && L.slice(Math.max(0, i - 14), i).some((y) => y.label === 'Overview') && L.slice(Math.max(0, i - 14), i).some((y) => y.label === 'Reviews'));
  if (tabs >= 0) {
    name = L[tabs].label.replace(/^About \. /, '').trim();
    head = L.slice(Math.max(0, tabs - 45), tabs).map((x) => x.label);
  } else {
    // No tabs: "More options for <name>", with that same name and its rating in the few labels above it.
    for (let i = 0; i < L.length && !name; i++) {
      const m = /^More options for (.+)$/.exec(L[i].label);
      if (!m || /^response\b/i.test(m[1])) continue;
      const above = L.slice(Math.max(0, i - 8), i).map((x) => x.label);
      const at = above.lastIndexOf(m[1].trim());
      if (at < 0 || !above.slice(at + 1).some((l) => rated.test(l)) || !above.slice(at + 1).some((l) => count.test(l))) continue;
      name = m[1].trim();
      head = above.slice(at);
    }
  }
  if (!name) return null;
  // The header: "Rated 5.0 out of 5," · "19 reviews" · "(" "19" ")" "‧" category "‧" Open.
  const r = [...head].reverse().find((l) => rated.test(l));
  const rv = [...head].reverse().find((l) => count.test(l));
  // The category is the first real word after the review count ("(", "19", ")" and the dots are skipped).
  const after = rv ? head.slice(head.lastIndexOf(rv) + 1).filter((l) => l.length > 2 && !/^[\d.,()]+[KM]?$/.test(l)) : [];
  const category = after[0] && !/^(Open|Closed|Opens|Closes|More options)\b/.test(after[0]) ? after[0] : null;
  return { name, rating: r ? (/Rated ([0-5](?:[.,]\d)?)/.exec(r) ?? [])[1] ?? null : null, reviews: rv ? rv.replace(/ reviews?$/i, '') : null, category };
}

export function rankWithoutFinder(
  pages: (string | null | undefined)[],
  aiSnapshots: (string | null | undefined)[],
  target: string,
  /** The AI answer as Google's own "Copy text" gave it: names every business in order, cards or not. */
  aiCopy?: string | null,
  /** The scan's Google ID for the business: the copied answer's entries are matched by it first. */
  targetKgmid?: string | null,
): { rank: number | null; list: string[]; from: 'map_pack' | 'single_business' | 'ai_overview_list' | 'none' } {
  const names = (ls: Listing[] | undefined) => (ls ?? []).filter((y) => !y.ad).map((y) => y.name);
  const pack = pages.filter((x): x is string => !!x).map((x) => names(readResultsPage(x)?.pack)).find((l) => l.length) ?? [];
  // No pack: a single-business panel is Google's local answer for this spot, and comes before an AI Overview's list.
  const solo = pack.length ? null : (pages.map((x) => readSoloPanel(x)).find(Boolean) ?? null);
  if (solo) return { rank: sameBusiness(solo.name, target) ? 1 : null, list: [solo.name], from: 'single_business' };
  const cards = pack.length ? [] : (aiSnapshots.filter((x): x is string => !!x).map((x) => names(readAiOverview(x)?.businesses)).find((l) => l.length) ?? []);
  // The screen snapshot only shows business cards. The copied answer also has businesses the
  // answer wrote out in a section of its own, so it is the fuller list whenever it has one.
  // Each copied entry links its Google listing: kept under the business's own name when it is the
  // scan's (see aiNameFor), so the name match below finds it however Google wrote it.
  const copied = pack.length || !aiCopy ? [] : readAiCopy(aiCopy).businesses.map((b) => aiNameFor(b, target, targetKgmid));
  const ai = copied.length >= cards.length ? copied : cards;
  const list = pack.length ? pack : ai;
  const i = list.findIndex((n) => sameBusiness(n, target));
  return { rank: i >= 0 ? i + 1 : null, list, from: pack.length ? 'map_pack' : ai.length ? 'ai_overview_list' : 'none' };
}
