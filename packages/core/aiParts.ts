/**
 * An AI Overview in three parts, read from its copied text (the template's copy button):
 *
 * 1. Position 0: the opening answer, its first paragraph. The businesses it links (a brand linked
 *    to its Google profile, usually with its phone number) and the websites it cites.
 * 2. Business cards: the AI Overview's own local pack, one card per business (name, rating, Call,
 *    Directions, Website), in order, each with its Google ID and the websites it cites.
 * 3. Websites cited anywhere else in the answer.
 *
 * Google itself (the profiles, Maps, Search, its viewer and redirect links) is never a cited
 * website. A business linked anywhere else (a comparison table, a closing list) is kept apart as a
 * mention: it is none of the three parts.
 */
import { readAiCopy } from './serpEvidence';
import { isGoogleSource } from './googleSource';
import { kgmidOf, siteDomain } from './businessIds';

export { kgmidOf, siteDomain, sameSite } from './businessIds';

export type AiBrand = { name: string; kgmid: string; phone: string | null };
export type AiParts = {
  p0: { text: string; brands: AiBrand[]; sites: string[] };
  cards: { name: string; kgmid: string; sites: string[] }[];
  other: string[];
  mentions: { name: string; kgmid: string }[];
};

const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const LINK = / \((https:\/\/www\.google\.com\/search\?kgmid=([^&)\s]+)[^)\s]*)\)/g;
const CARD_START = /^.+? \(https:\/\/www\.google\.com\/search\?kgmid=[^)\s]+\)$/;
const CONNECTOR = /^(?:or|and|call|contact|try|visit|reach out to|reach|hire|consider|choose|like|including|include|such as|from|with|by|via|through|is|are|the)\s+/i;

/** The websites a line cites ("[1] (https://…), [2] (…)"), Google's own links left out. */
function citedSites(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/\[\d+\] \(([^)\s]+)\)/g)) {
    const d = siteDomain(/^https?:\/\//i.test(m[1]) ? m[1] : '');
    if (d && !isGoogleSource(d) && !out.includes(d)) out.push(d);
  }
  return out;
}

/** The businesses a line links to their Google profile, in order, with the phone given beside each. */
function linkedBrands(line: string, known: Map<string, string>): AiBrand[] {
  const out: AiBrand[] = [];
  let from = 0;
  for (const m of line.matchAll(LINK)) {
    const kgmid = kgmidOf(m[1]);
    // The name is the text just before its link, after the previous link: its last clause, without
    // the words that lead into it ("call", "or", "contact").
    let name = line.slice(from, m.index).split(/[,;:]\s+|(?<!\b[A-Z][a-z]?)\.\s+(?=[A-Z0-9])/).pop() ?? '';
    name = name.replace(/^[\s•▪◦*–-]+/, '');
    for (let prev = ''; prev !== name; ) (prev = name), (name = name.replace(CONNECTOR, ''));
    let phone: string | null = null;
    // The link can hold the phone itself: "Stuart's Plumbing at (863) 877-3108".
    const inName = new RegExp('^(.*?)\\s+(?:at|on|:|-|–|—)\\s*(' + PHONE.source + ')\\s*$', 'i').exec(name);
    if (inName) [name, phone] = [inName[1], inName[2]];
    const after = new RegExp('^\\s*(?:at|on|:|-|–|—|,)?\\s*(' + PHONE.source + ')').exec(line.slice((m.index ?? 0) + m[0].length));
    if (!phone && after) phone = after[1];
    name = known.get(kgmid) ?? name.trim().replace(/[.,;:]+$/, '');
    if (name.length > 80 || name.split(/\s+/).length > 10) name = name.split(/\s+/).slice(-6).join(' ');
    if (name && !out.some((b) => (kgmid && b.kgmid === kgmid) || b.name === name)) out.push({ name, kgmid, phone });
    from = (m.index ?? 0) + m[0].length;
  }
  return out;
}

/** The three parts of one copied AI Overview; null when there is no copied text to read. */
export function readAiParts(text: string | null | undefined): AiParts | null {
  const raw = (text ?? '').replace(/\r/g, '');
  if (!raw.trim()) return null;
  const copy = readAiCopy(raw);
  const known = new Map<string, string>();
  for (const b of copy.businesses) {
    const id = kgmidOf(b.kgmid);
    if (id && !known.has(id)) known.set(id, b.name);
  }
  // Position 0: the first paragraph, up to the first blank line or the first business card.
  const p0Lines: string[] = [];
  for (const line of raw.split('\n').map((l) => l.trim())) {
    if (!line) {
      if (p0Lines.length) break;
      continue;
    }
    if (CARD_START.test(line) || line.startsWith('•')) break;
    p0Lines.push(line);
  }
  const p0Text = p0Lines.join(' ');
  const p0Sites = p0Lines.flatMap(citedSites).filter((d, i, a) => a.indexOf(d) === i);
  const cards = copy.businesses.map((b) => ({
    name: b.name,
    kgmid: kgmidOf(b.kgmid),
    sites: [b.category ?? '', ...b.lines].flatMap(citedSites).filter((d, i, a) => a.indexOf(d) === i),
  }));
  // Everything that is neither the opening answer nor a card: closing text, tables, checklists.
  // A site cited here counts here even when the opening answer or a card cites it too.
  const rest = [...copy.intro.slice(p0Lines.length), ...copy.outro];
  const other = rest.flatMap(citedSites).filter((d, i, a) => a.indexOf(d) === i);
  const p0Brands = linkedBrands(p0Text, known);
  const mentions = rest
    .flatMap((l) => linkedBrands(l, known))
    .filter((b, i, a) => a.findIndex((x) => (b.kgmid && x.kgmid === b.kgmid) || x.name === b.name) === i)
    .filter((b) => !p0Brands.some((x) => (b.kgmid && x.kgmid === b.kgmid) || x.name === b.name) && !cards.some((c) => (b.kgmid && c.kgmid === b.kgmid) || c.name === b.name))
    .map(({ name, kgmid }) => ({ name, kgmid }));
  return { p0: { text: p0Text.slice(0, 600), brands: p0Brands, sites: p0Sites }, cards, other, mentions };
}
