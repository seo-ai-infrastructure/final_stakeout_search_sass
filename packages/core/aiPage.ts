/**
 * The AI Overview read from the real page Google served (saved by the worker, v156+), for what its
 * copied text cannot say:
 *
 * - which business cards were above "Show more" when the page loaded. The collapsed AI Overview
 *   holds every card, clipped to a short window; Google marks everything past the window
 *   aria-hidden="true" until it is opened. A card whose name is not inside such a mark was in view.
 *   Read in page order from Google's own marks, no positions.
 * - each card's own website (its Website button) and phone (its Call button).
 * - the websites cited outside the cards.
 *
 * Also marks those parts on the saved page, so a report can outline them (CSS only: nothing runs).
 */
import { parseHtml, walkHtml, htmlText, findHtml, insideHtml, type HtmlNode } from './htmlTree';
import { siteDomain } from './businessIds';
import { isGoogleSource } from './googleSource';

export type AiPageCard = {
  name: string;
  /** Its Website button's site, as a bare domain. */
  website: string | null;
  /** Its Call button's number. */
  phone: string | null;
  /** In view before "Show more" (true), behind it (false), or not known from this page (null). */
  above: boolean | null;
};
export type AiPage = {
  /** Whether the AI Overview was open on this page; null when no "Show more" control was found. */
  expanded: boolean | null;
  cards: AiPageCard[];
  /** Websites cited outside the cards, in page order; Google's own pages left out. */
  sites: string[];
};

const CONTENT_ID = 'm-x-content';
const ACTIONS = ['call', 'directions', 'website'];
const labelOf = (n: HtmlNode) => ((n.attrs['aria-label'] ?? '').trim() || htmlText(n)).toLowerCase();
const isControl = (n: HtmlNode) => n.tag === 'a' || n.tag === 'button' || n.attrs.role === 'button' || n.attrs.role === 'link';
const actionOf = (n: HtmlNode): string | null => {
  if (n.tag === 'a' && /^tel:/i.test(n.attrs.href ?? '')) return 'call';
  if (!isControl(n)) return null;
  const l = labelOf(n);
  return ACTIONS.includes(l) ? l : null;
};
const hidden = (x: HtmlNode) => x.attrs['aria-hidden'] === 'true';

/** A link's real destination: Google's redirect links ("/url?q=…") unwrapped. */
function destination(href: string): string {
  try {
    const u = new URL(href, 'https://www.google.com/');
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === '/url') return u.searchParams.get('q') ?? u.searchParams.get('url') ?? href;
    return u.toString();
  } catch {
    return href;
  }
}
const externalSite = (href: string | undefined) => {
  if (!href || !/^https?:/i.test(destination(href))) return '';
  const d = siteDomain(destination(href));
  return d && !isGoogleSource(d) ? d : '';
};

type Located = { box: HtmlNode; control: HtmlNode | null; cards: HtmlNode[]; p0: HtmlNode | null; cites: HtmlNode[] };

function locate(root: HtmlNode): Located | null {
  const box = findHtml(root, (x) => x.attrs.id === CONTENT_ID);
  if (!box) return null;
  const control = findHtml(root, (x) => x.attrs['aria-controls'] === CONTENT_ID && 'aria-expanded' in x.attrs);
  // Cards: a list item that holds a Call, Directions or Website action and more than those words,
  // with no such card inside it (each action button is a list item of its own).
  const candidates: HtmlNode[] = [];
  for (const n of walkHtml(box)) {
    if (n.tag === '#text' || n.attrs.role !== 'listitem') continue;
    let act = false;
    for (const x of walkHtml(n))
      if (x.tag !== '#text' && actionOf(x)) {
        act = true;
        break;
      }
    const content = htmlText(n).replace(/\b(call|directions|website)\b/gi, '').trim();
    if (act && content.length > 12) candidates.push(n);
  }
  let cards = candidates.filter((c) => !candidates.some((o) => o !== c && insideHtml(o, (a) => a === c)));
  if (!cards.length) {
    // No list items: each Directions (else Website) action, up to the largest element holding only that one.
    for (const kind of ['directions', 'website']) {
      const acts = [...walkHtml(box)].filter((x) => x.tag !== '#text' && actionOf(x) === kind);
      if (!acts.length) continue;
      const count = (n: HtmlNode) => acts.filter((a) => insideHtml(a, (x) => x === n)).length;
      cards = acts.map((a) => {
        let c = a;
        while (c.parent && c.parent !== box && count(c.parent) === 1) c = c.parent;
        return c;
      });
      break;
    }
  }
  // Position 0: the opening answer, the first text of the answer before any card (headings and the
  // header left out), as the largest element holding it and no card nor heading.
  const isHeading = (x: HtmlNode) => /^h[1-6]$/.test(x.tag) || x.attrs.role === 'heading' || 'data-ignore-copy' in x.attrs;
  let p0: HtmlNode | null = null;
  for (const n of walkHtml(box)) {
    if (n.tag !== '#text') {
      if (cards.includes(n)) break;
      continue;
    }
    if (n.text.replace(/\s+/g, ' ').trim().length < 15 || !n.parent || insideHtml(n, isHeading, box) || isHeading(n.parent)) continue;
    let el = n.parent;
    const holds = (x: HtmlNode) => [...walkHtml(x)].some((y) => y !== x && y.tag !== '#text' && (cards.includes(y) || isHeading(y)));
    while (el.parent && el.parent !== box && !holds(el.parent) && !/display:\s*contents/.test(el.parent.attrs.style ?? '')) el = el.parent;
    p0 = el;
    break;
  }
  // Websites cited: every link to a site other than Google's, outside the cards' own buttons.
  const cites = [...walkHtml(box)].filter((x) => x.tag === 'a' && !actionOf(x) && externalSite(x.attrs.href) && !insideHtml(x, (a) => a.tag === 'a', box));
  return { box, control, cards, p0, cites };
}

export function readAiPage(html: string | null | undefined): AiPage | null {
  if (!html) return null;
  const at = locate(parseHtml(html));
  if (!at) return null;
  const expanded = at.control ? at.control.attrs['aria-expanded'] === 'true' : null;
  const cards: AiPageCard[] = at.cards.map((c) => {
    let nameNode: HtmlNode | null = null;
    for (const x of walkHtml(c))
      if (x.tag === '#text' && /[a-z]{2}/i.test(x.text)) {
        nameNode = x;
        break;
      }
    const name = (nameNode?.text ?? '').replace(/\s+/g, ' ').trim();
    let website: string | null = null,
      phone: string | null = null;
    for (const x of walkHtml(c)) {
      if (x.tag === '#text') continue;
      const a = actionOf(x);
      if (a === 'website' && !website) website = externalSite(x.attrs.href ?? findHtml(x, (y) => y.tag === 'a')?.attrs.href) || null;
      if (a === 'call' && !phone && /^tel:/i.test(x.attrs.href ?? '')) phone = decodeURIComponent((x.attrs.href ?? '').slice(4)).trim() || null;
    }
    if (!phone) phone = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.exec(htmlText(c))?.[0] ?? null;
    const above = expanded === false && nameNode ? !insideHtml(nameNode, hidden, at.box) : null;
    return { name, website, phone, above };
  });
  const inCard = (n: HtmlNode) => at.cards.some((c) => insideHtml(n, (a) => a === c));
  const sites: string[] = [];
  for (const a of at.cites) {
    if (inCard(a)) continue;
    const d = externalSite(a.attrs.href);
    if (d && !sites.includes(d)) sites.push(d);
  }
  return { expanded, cards: cards.filter((c) => c.name), sites };
}

/**
 * The page with its parts marked: data-sk="p0" on the opening answer, "card" on each business card,
 * "web" on each cited website, and anchors before the AI Overview. Opened at #sk-all (or #sk-p0,
 * #sk-card, #sk-web), the page outlines those parts and starts at the AI Overview; with no anchor it
 * looks exactly as it was. Unchanged when it holds no AI Overview.
 */
export function markAiPage(html: string): string {
  const at = locate(parseHtml(html));
  if (!at) return html;
  const marks: [number, string][] = [];
  if (at.p0) marks.push([at.p0.nameEnd, ' data-sk="p0"']);
  for (const c of at.cards) marks.push([c.nameEnd, ' data-sk="card"']);
  for (const a of at.cites) marks.push([a.nameEnd, ' data-sk="web"']);
  marks.push([at.box.start, '<a id="sk-all" class="sk-at"></a><a id="sk-p0" class="sk-at"></a><a id="sk-card" class="sk-at"></a><a id="sk-web" class="sk-at"></a>']);
  const style =
    '<style>.sk-at{display:block;position:relative;top:-24px;height:0;width:0;overflow:hidden}' +
    '[data-sk=p0]{--sk:#f59e0b}[data-sk=card]{--sk:#8b5cf6}[data-sk=web]{--sk:#06b6d4}' +
    'html:has(#sk-all:target) [data-sk],html:has(#sk-p0:target) [data-sk=p0],html:has(#sk-card:target) [data-sk=card],html:has(#sk-web:target) [data-sk=web]' +
    '{box-shadow:inset 0 0 0 3px var(--sk),0 0 0 2px var(--sk)!important;border-radius:10px}</style>';
  const head = /<head\b[^>]*>/i.exec(html);
  marks.push(head ? [head.index + head[0].length, style] : [0, style]);
  let out = html;
  for (const [pos, text] of marks.sort((a, b) => b[0] - a[0])) if (pos >= 0) out = out.slice(0, pos) + text + out.slice(pos);
  return out;
}

/** One point's two pages as one: the fold from the page as it loaded, buttons from either. */
export function mergeAiPages(pre: AiPage | null | undefined, post: AiPage | null | undefined): AiPage | null {
  const base = pre?.cards.length ? pre : post;
  if (!base) return null;
  const other = base === pre ? post : pre;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const cards = base.cards.map((c) => {
    const o = other?.cards.find((x) => norm(x.name) === norm(c.name));
    return { ...c, website: c.website ?? o?.website ?? null, phone: c.phone ?? o?.phone ?? null, above: pre && base === pre ? c.above : (pre?.cards.find((x) => norm(x.name) === norm(c.name))?.above ?? null) };
  });
  return { expanded: pre?.expanded ?? post?.expanded ?? null, cards, sites: (post?.sites.length ? post.sites : pre?.sites) ?? [] };
}
