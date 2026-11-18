/**
 * A page saved by Chrome as MHTML (DevTools Page.captureSnapshot: the page plus its styles and
 * images, as a multipart message) turned into one self-contained HTML file that a report can show
 * in a locked-down frame: every style and image the snapshot holds is inlined (data: URIs), and
 * every script, event handler and refresh is removed. Nothing in it reaches back to Google except
 * an image or style the snapshot did not hold. Pure: no network, no dependencies.
 */

export type MhtmlPart = { type: string; location: string; id: string; body: Buffer };

const decodeQuotedPrintable = (s: string) => {
  const soft = s.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    const c = soft.charCodeAt(i);
    if (c === 0x3d && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (c < 0x80) bytes.push(c);
    else for (const b of Buffer.from(soft[i], 'utf8')) bytes.push(b);
  }
  return Buffer.from(bytes);
};

/** The parts of an MHTML snapshot, in order (the page first). Empty when it is not one. */
export function readMhtml(mhtml: string): MhtmlPart[] {
  const text = mhtml.replace(/\r\n/g, '\n');
  const head = text.slice(0, Math.max(0, text.indexOf('\n\n')));
  const boundary = /boundary="?([^";\n]+)"?/i.exec(head)?.[1];
  if (!boundary) return [];
  const parts: MhtmlPart[] = [];
  for (const chunk of text.split('--' + boundary).slice(1)) {
    if (chunk.startsWith('--')) break;
    const split = chunk.indexOf('\n\n');
    if (split < 0) continue;
    const headers = chunk.slice(0, split).trim();
    const raw = chunk.slice(split + 2).replace(/\n$/, '');
    const h = (name: string) => new RegExp('^' + name + ':\\s*(.+)$', 'im').exec(headers)?.[1]?.trim() ?? '';
    const encoding = h('Content-Transfer-Encoding').toLowerCase();
    const body =
      encoding === 'base64' ? Buffer.from(raw.replace(/\s+/g, ''), 'base64') : encoding === 'quoted-printable' ? decodeQuotedPrintable(raw) : Buffer.from(raw, 'utf8');
    parts.push({ type: h('Content-Type').split(';')[0].trim().toLowerCase(), location: h('Content-Location'), id: h('Content-ID').replace(/^<|>$/g, ''), body });
  }
  return parts;
}

/** An opening tag, with quoted attribute values that may themselves hold ">". */
const TAG = /<[a-z][a-z0-9-]*(?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/gi;
const HANDLER = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi;
const CSS_URL = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

const unescapeAttr = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const escapeAttr = (s: string, q: string) => s.replace(/&/g, '&amp;').replace(q === '"' ? /"/g : /'/g, q === '"' ? '&quot;' : '&#39;');
/** An address as an unquoted CSS url(), with what CSS needs escaped there. */
const cssUrl = (u: string) => 'url(' + u.replace(/[()'"\\\s]/g, (c) => (/\s/.test(c) ? encodeURIComponent(c) : '\\' + c)) + ')';

/**
 * How many bytes of images the page's own tags may repeat. The first use of an image is always
 * inlined; past this, a big image used yet again keeps its address (it loads from where it was).
 */
const REPEAT_BUDGET = 8_000_000;

/** The snapshot as one self-contained, script-free HTML page; null when it holds no page. */
export function mhtmlToReplayHtml(mhtml: string, o: { repeatBudget?: number } = {}): string | null {
  const parts = readMhtml(mhtml);
  const page = parts.find((p) => p.type === 'text/html');
  return page ? replay(page.body.toString('utf8'), page.location, parts, o.repeatBudget ?? REPEAT_BUDGET) : null;
}

/**
 * A page's HTML alone (DevTools DOM.getOuterHTML) made safe to show the same way, for a capture
 * whose snapshot could not be taken: nothing runs, but images and styles it does not carry inline
 * still load from their own addresses.
 */
export function htmlToReplayHtml(html: string, pageUrl: string): string {
  return replay(html, pageUrl, [], 0);
}

function replay(source: string, base: string, parts: MhtmlPart[], repeatBudget: number): string {
  const byLocation = new Map<string, MhtmlPart>();
  for (const p of parts) {
    if (p.location) byLocation.set(p.location, p);
    if (p.id) byLocation.set('cid:' + p.id, p);
  }
  const resolve = (url: string, from = base) => {
    const u = unescapeAttr(url.trim());
    if (/^(data|cid):/i.test(u)) return u;
    try {
      return new URL(u, from || undefined).toString();
    } catch {
      return u;
    }
  };
  const find = (url: string, from?: string) => byLocation.get(resolve(url, from)) ?? byLocation.get(unescapeAttr(url.trim()));
  const dataUri = (p: MhtmlPart) => 'data:' + (p.type || 'application/octet-stream') + ';base64,' + p.body.toString('base64');

  // Each image the styles use is written once, as a custom property on the page's root, and every
  // rule and style attribute that uses it refers to that: a sprite used by a hundred rules is
  // stored once. (A base64 data URI holds no quotes, spaces or brackets: safe unquoted anywhere.)
  const vars = new Map<MhtmlPart, string>();
  const varDefs: string[] = [];
  const cssVar = (p: MhtmlPart) => {
    let v = vars.get(p);
    if (!v) {
      v = '--sk' + vars.size.toString(36);
      vars.set(p, v);
      varDefs.push(v + ':url(' + dataUri(p) + ')');
    }
    return 'var(' + v + ')';
  };
  // url(...) inside CSS, resolved against the stylesheet's own address.
  const inlineCss = (css: string, from?: string, depth = 0): string => {
    const swap = (direct: boolean) => (m: string, _q: string, url: string) => {
      const u = url.trim();
      // Already inline, or a reference inside the page itself (an SVG gradient: url(#g)).
      if (!u || /^(data:|#)/i.test(u)) return m;
      const p = find(u, from);
      if (p && !p.type.startsWith('text/')) return direct ? 'url(' + dataUri(p) + ')' : cssVar(p);
      // Not in the snapshot: its full address, so a stylesheet's own relative paths still work.
      return cssUrl(resolve(u, from));
    };
    return (
      css
        // A stylesheet the snapshot holds, imported without conditions: its rules, in its place.
        .replace(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1\s*\)?\s*;/gi, (m, _q: string, url: string) => {
          const p = depth < 3 ? find(url, from) : undefined;
          return p?.type === 'text/css' ? inlineCss(p.body.toString('utf8'), p.location, depth + 1) : m;
        })
        // A font's own description takes no var(): its file goes in directly.
        .replace(/@font-face\s*\{[^}]*\}/gi, (block) => block.replace(CSS_URL, swap(true)))
        .replace(CSS_URL, swap(false))
    );
  };
  // Images in the page's own tags: the first use of each is inlined, repeats within the budget.
  const used = new Set<MhtmlPart>();
  let repeated = 0;
  const inlineAttr = (url: string): string | null => {
    if (!url || /^data:/i.test(url)) return null;
    const p = find(url);
    if (!p || p.type.startsWith('text/')) return null;
    if (used.has(p)) {
      const size = Math.ceil(p.body.length / 3) * 4;
      if (size > 4096 && repeated + size > repeatBudget) return null;
      repeated += size;
    }
    used.add(p);
    return dataUri(p);
  };
  // srcset candidates: an address (which may hold commas, as a data URI does), then descriptors.
  const inlineSrcset = (set: string) => {
    const token = /([\s,]*)(\S+)/y;
    let out = '';
    let i = 0;
    while (i < set.length) {
      token.lastIndex = i;
      const m = token.exec(set);
      if (!m) {
        out += set.slice(i);
        break;
      }
      let url = m[2];
      const commas = /,+$/.exec(url)?.[0] ?? '';
      if (commas) url = url.slice(0, -commas.length);
      out += m[1] + (inlineAttr(url) ?? url) + commas;
      i = token.lastIndex;
      if (!commas) {
        const end = set.indexOf(',', i);
        const stop = end < 0 ? set.length : end;
        out += set.slice(i, stop);
        i = stop;
      }
    }
    return out;
  };

  let html = source;
  // Nothing runs: scripts, refreshes and frames go.
  html = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<(object|embed)\b[\s\S]*?(<\/\1\s*>|\/?>)/gi, '');
  // The page's own style blocks, then the stylesheets the snapshot holds, inlined with their images.
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_m, open: string, css: string, close: string) => open + inlineCss(css) + close);
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) return /\brel\s*=\s*["']?(preload|prefetch|modulepreload|dns-prefetch|preconnect)/i.test(tag) ? '' : tag;
    const href = /\bhref\s*=\s*(["'])([^"']*)\1/i.exec(tag)?.[2];
    const p = href ? find(href) : undefined;
    return p ? '<style>' + inlineCss(p.body.toString('utf8'), p.location.startsWith('cid:') ? base : p.location) + '</style>' : tag;
  });
  // Every tag: no event handlers, no script addresses, its images inlined.
  html = html.replace(TAG, (tag) =>
    tag
      .replace(HANDLER, '')
      .replace(/(\s(?:href|src|action|formaction|xlink:href)\s*=\s*)(["'])\s*javascript:[^"']*\2/gi, '$1$2#$2')
      .replace(/(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, (m, pre: string, dq: string | undefined, sq: string | undefined) => {
        const raw = dq ?? sq ?? '';
        if (!/url\(/i.test(raw)) return m;
        const q = dq !== undefined ? '"' : "'";
        return pre + q + escapeAttr(inlineCss(unescapeAttr(raw)), q) + q;
      })
      .replace(/(\s(?:src|poster)\s*=\s*)(["'])([^"']*)\2/gi, (m, pre: string, q: string, url: string) => {
        const d = inlineAttr(url);
        return d ? pre + q + d + q : m;
      })
      .replace(/(\ssrcset\s*=\s*)(["'])([^"']*)\2/gi, (_m, pre: string, q: string, set: string) => pre + q + inlineSrcset(set) + q),
  );
  // Read as it was: the page's own address for anything left relative, no referrer, UTF-8.
  const extra =
    '<meta charset="utf-8"><meta name="referrer" content="no-referrer">' +
    (base && /^https?:/i.test(base) ? '<base href="' + escapeAttr(base, '"') + '">' : '') +
    (varDefs.length ? '<style>:root{' + varDefs.join(';') + '}</style>' : '');
  html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (h) => h + extra) : extra + html;
  return html;
}
