/**
 * Rebuilds what a phone saw from its evidence bundle: the results page (Local Services
 * ads, the map pack, People also search for, web results), the Local Finder and the AI
 * Overview, each in Google's own order. Ads are kept, labelled and never ranked.
 * Pure: no network, no dependencies beyond node:zlib.
 */
import { gunzipSync } from 'node:zlib';

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

export type Listing = {
  name: string;
  rating: string | null;
  reviews: string | null;
  meta: string;
  quote: string | null;
  ad: boolean;
  /** Organic position within its section (ads have none). */
  pos: number | null;
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
  return {
    name: m[1].trim(),
    rating: m[3].replace(',', '.'),
    reviews: rv ? rv[1] : null,
    meta: clean(rest.replace(/^[\s·,]+/, '').replace(/\s·\s*$/, '')),
    quote: q ? q[1].trim() : null,
    organicMarker: Boolean(m[2]),
  };
}

const norm = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/\b(llc|inc|co|corp|company|ltd)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
/** Same business, tolerant of LLC/Inc/punctuation/"&". */
export const sameBusiness = (a: string, b: string) => norm(a) === norm(b) && norm(a) !== '';

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

export type WebResult = { site: string; url: string; title: string; ad: boolean };
export type ResultsPage = {
  location: string | null;
  googleLocation: string | null;
  localServicesAds: { title: string | null; listings: Listing[] };
  aiPreview: string | null;
  pack: Listing[];
  peopleAlsoSearch: string[];
  web: WebResult[];
};

/** The results page, in Google's order. Ads are detected by Google's own markers. */
export function readResultsPage(xml: string): ResultsPage {
  const L = uiLabels(xml);
  const page: ResultsPage = { location: null, googleLocation: null, localServicesAds: { title: null, listings: [] }, aiPreview: null, pack: [], peopleAlsoSearch: [], web: [] };
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
      if (label === 'Show more' || label === 'More businesses') { mode = 'top'; continue; }
      if (card) lsa.push({ ...card, ad: true });
      continue;
    }
    if (mode === 'pack') {
      if (label === 'More businesses' || label === 'More places') { mode = 'top'; continue; }
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
    if (c) items.push({ name: c.name, rating: c.rating, reviews: c.reviews, meta: c.meta, quote: c.quote, ad: !c.organicMarker });
  }
  return finish(items);
}

export type AiOverview = { paragraphs: string[]; businesses: Listing[]; related: Listing[] };
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

/** Organic position of the tracked business in a section, or null if absent. */
export const rankIn = (list: Listing[], business: string) => list.find((l) => !l.ad && sameBusiness(l.name, business))?.pos ?? null;

export type AiCopyBusiness = {
  pos: number;
  name: string;
  /** Google's own business id (Knowledge Graph MID), e.g. "/g/11z8421vy4". */
  kgmid: string;
  url: string;
  rating: string | null;
  reviews: string | null;
  category: string | null;
  lines: string[];
};
export type AiCopy = { intro: string[]; businesses: AiCopyBusiness[]; citations: { n: number; url: string }[]; verified: boolean };

const BIZ_LINE = /^(.+?) \((https:\/\/www\.google\.com\/search\?kgmid=([^&)\s]+)[^)\s]*)\)$/;
const RATING_LINE = /^([0-5](?:\.\d)?)\((\d[\d.,]*K?)\)\s*·\s*(.+)$/;

/**
 * The AI Overview as copied with its own copy button: the intro, each business with its
 * kgmid (Google's business id, so matching never depends on spelling) and the citations.
 * `checkAgainst` is text from the same run's AI Overview snapshot: the copy is only
 * verified if its businesses (or intro) appear there too, so a stale clipboard never counts.
 */
export function readAiCopy(text: string, checkAgainst: string[] = []): AiCopy {
  const intro: string[] = [], businesses: AiCopyBusiness[] = [], citations: { n: number; url: string }[] = [];
  let cur: AiCopyBusiness | null = null;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // A business starts its own line; a bullet (detail) that links a kgmid is not a new business.
    const b = line.startsWith('•') ? null : BIZ_LINE.exec(line);
    if (b && !businesses.some((x) => x.kgmid === decodeURIComponent(b[3]))) {
      cur = { pos: businesses.length + 1, name: b[1].trim(), kgmid: decodeURIComponent(b[3]), url: b[2], rating: null, reviews: null, category: null, lines: [] };
      businesses.push(cur);
      continue;
    }
    for (const m of line.matchAll(/\[(\d+)\] \(([^)\s]+)\)/g)) citations.push({ n: Number(m[1]), url: m[2] });
    const r = cur && !cur.rating ? RATING_LINE.exec(line) : null;
    if (cur && r) Object.assign(cur, { rating: r[1], reviews: r[2], category: r[3].trim() });
    else if (cur) cur.lines.push(line.replace(/^•\s*/, ''));
    else intro.push(line);
  }
  const hay = norm(checkAgainst.join(' \n '));
  const verified =
    checkAgainst.length > 0 &&
    (businesses.some((x) => hay.includes(norm(x.name))) || intro.some((l) => l.length > 12 && hay.includes(norm(l))));
  return { intro, businesses, citations, verified };
}
