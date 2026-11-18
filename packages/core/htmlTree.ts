/**
 * A small, forgiving HTML reader: elements in page order with their attributes, children and text,
 * and where each opening tag sits in the source (so a marker can be added to it later). Made for
 * pages Chrome serialised itself (every element closed): scripts, styles and comments are skipped,
 * void elements need no closing tag, and a stray closing tag is ignored. No imports.
 */

export type HtmlNode = {
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
  parent: HtmlNode | null;
  /** For a text node ("#text"): its text, entities decoded. */
  text: string;
  /** Where the opening tag starts and where its name ends (just after "<div"), in the source. */
  start: number;
  nameEnd: number;
};

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const TOKEN = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
/** HTML entities as characters. */
export const decodeEntities = (s: string) =>
  s.indexOf('&') < 0
    ? s
    : s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
        if (e[0] === '#') {
          const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
        }
        return NAMED[e.toLowerCase()] ?? m;
      });

const node = (tag: string, parent: HtmlNode | null, start = -1, nameEnd = -1): HtmlNode => ({ tag, attrs: {}, children: [], parent, text: '', start, nameEnd });

export function parseHtml(html: string): HtmlNode {
  const root = node('#root', null);
  let cur = root;
  let last = 0;
  const addText = (from: number, to: number) => {
    if (to <= from || RAW.has(cur.tag)) return;
    const t = node('#text', cur);
    t.text = decodeEntities(html.slice(from, to));
    cur.children.push(t);
  };
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(html); m; m = TOKEN.exec(html)) {
    addText(last, m.index);
    last = TOKEN.lastIndex;
    if (m[1]) {
      // A closing tag: back to the element it closes, if one is open.
      const tag = m[1].toLowerCase();
      for (let c: HtmlNode | null = cur; c && c !== root; c = c.parent)
        if (c.tag === tag) {
          cur = c.parent ?? root;
          break;
        }
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const el = node(tag, cur, m.index, m.index + 1 + m[2].length);
      for (const a of (m[3] ?? '').matchAll(ATTR)) el.attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
      cur.children.push(el);
      if (RAW.has(tag) && !m[4]) {
        // Its contents are not markup: straight to its closing tag.
        const closing = new RegExp('</' + tag + '\\s*>', 'gi');
        closing.lastIndex = last;
        const cm = closing.exec(html);
        const close = cm ? cm.index : -1;
        const end = cm ? closing.lastIndex : html.length;
        if (tag === 'title' || tag === 'textarea') {
          const t = node('#text', el);
          t.text = decodeEntities(html.slice(last, close < 0 ? html.length : close));
          el.children.push(t);
        }
        last = end;
        TOKEN.lastIndex = end;
      } else if (!VOID.has(tag) && !m[4]) cur = el;
    }
  }
  addText(last, html.length);
  return root;
}

/** Every node under (and including) n, in page order. */
export function* walkHtml(n: HtmlNode): Generator<HtmlNode> {
  const stack = [n];
  while (stack.length) {
    const x = stack.pop()!;
    yield x;
    for (let i = x.children.length - 1; i >= 0; i--) stack.push(x.children[i]);
  }
}

/** A node's text, spaces collapsed. */
export function htmlText(n: HtmlNode): string {
  let s = '';
  for (const x of walkHtml(n)) if (x.tag === '#text') s += x.text;
  return s.replace(/\s+/g, ' ').trim();
}

export function findHtml(n: HtmlNode, test: (x: HtmlNode) => boolean): HtmlNode | null {
  for (const x of walkHtml(n)) if (x.tag !== '#text' && test(x)) return x;
  return null;
}

/** Whether n sits inside an element matching test (n itself not counted), up to (not past) `within`. */
export function insideHtml(n: HtmlNode, test: (x: HtmlNode) => boolean, within?: HtmlNode | null): boolean {
  for (let a = n.parent; a && a !== within; a = a.parent) if (test(a)) return true;
  return false;
}
