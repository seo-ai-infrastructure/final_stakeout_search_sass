/**
 * Google's ID for a business ("/g/11c5wk8bxd", the kgmid in Google's own links). Google's AI
 * answers link every business they name to its Google listing, not to its website, so the ID is
 * how a scan finds its business in an answer however the name is written there, and tells apart
 * two offices with the same name. No imports: the scan form checks what is pasted with the same
 * rules the server applies.
 */

const norm = (prefix: string, rest: string) => '/' + prefix.toLowerCase() + '/' + rest.toLowerCase();

/**
 * The ID in what was pasted: the ID itself ("/g/11c5wk8bxd", with or without the first slash), a
 * Google link holding it (kgmid=…, which Google Search's Share link opens to), or a Google Maps
 * place link (its data holds the ID after "!16s"). Empty when there is none.
 */
export function googleIdOf(input: unknown): string {
  if (typeof input !== 'string') return '';
  const s = input.trim();
  if (!s || s.length > 4000) return '';
  const plain = /^\/?([gm])\/([0-9a-z_]{4,40})$/i.exec(s);
  if (plain) return norm(plain[1], plain[2]);
  const k = /[?&#]kgmid=(?:%2F|\/)([gm])(?:%2F|\/)([0-9a-z_]{4,40})(?![0-9a-z_])/i.exec(s);
  if (k) return norm(k[1], k[2]);
  const m = /!16s(?:%2F|\/)([gm])(?:%2F|\/)([0-9a-z_]{4,40})(?![0-9a-z_])/i.exec(s);
  if (m) return norm(m[1], m[2]);
  return '';
}

/**
 * IDs written anywhere in a page or link text (kgmid=… or a Maps "!16s" field), each once, in
 * order: for a page a short link opens on, when it names the full link instead of redirecting.
 */
export function googleIdsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:kgmid(?:=|%3D)|!16s)(?:%2F|\\?\/|\\u002f)([gm])(?:%2F|\\?\/|\\u002f)([0-9a-z_]{4,40})(?![0-9a-z_])/gi)) {
    const id = norm(m[1], m[2]);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * A Google short link that opens a business (the Share links of Google Maps and Google Search),
 * as an https address the server can follow to read the ID. Null for anything else.
 */
export function googleShortLink(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s || /\s/.test(s) || s.length > 300) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  const ok =
    (host === 'maps.app.goo.gl' && path.length > 1) ||
    (host === 'g.co' && /^\/kgs\/\w+/.test(path)) ||
    (host === 'goo.gl' && /^\/maps\/\w+/.test(path)) ||
    (host === 'share.google' && path.length > 1) ||
    (host === 'g.page' && path.length > 1);
  return ok ? 'https://' + host + path + u.search : null;
}

/** Hosts a short link may lead through while it is followed (Google's own, https only). */
export const isGoogleHost = (host: string) =>
  /^(?:[a-z0-9-]+\.)*google\.[a-z]{2,3}(?:\.[a-z]{2})?$/i.test(host) || /^(?:maps\.app\.)?goo\.gl$/i.test(host) || /^(?:g\.co|share\.google|g\.page)$/i.test(host);

/** What to tell someone whose paste holds no ID. */
export const GOOGLE_ID_HELP =
  'That doesn’t hold Google’s ID for the business. Paste the link from the Share button on the business in Google Maps or Google Search, or the ID itself (it looks like /g/11c5wk8bxd).';
