/**
 * A business's exact identity beside its name: Google's ID for it ("/g/11cs6bzst7", the kgmid in
 * Google's links) and its website. Two offices with the same name have different IDs. No imports:
 * the scan form checks what is typed with the same rules the server applies.
 */

/** Google's id for a business ("/g/11cs6bzst7"), from an id, a Google link holding kgmid=, or nothing usable. */
export function kgmidOf(input: string | null | undefined): string {
  let s = (input ?? '').trim();
  const fromUrl = /[?&]kgmid=([^&#\s]+)/.exec(s);
  if (fromUrl) s = fromUrl[1];
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep as typed */
  }
  const m = /^\/([gm])\/([a-z0-9_]{4,})$/i.exec(s.trim());
  return m ? '/' + m[1].toLowerCase() + '/' + m[2] : '';
}

/** A website as a bare domain ("mcintyrepainting.com"), from a URL, a domain, or nothing usable. */
export function siteDomain(input: string | null | undefined): string {
  const s = (input ?? '').trim().toLowerCase();
  if (!s || /\s/.test(s)) return '';
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(s) ? s : 'https://' + s).hostname.replace(/^www\./, '').replace(/^m\./, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : '';
  } catch {
    return '';
  }
}

/** Whether a cited website is a business's own: the same domain, or a page on it ("lakeland.rotorooter.com"). */
export const sameSite = (cited: string, own: string) => {
  const a = siteDomain(cited),
    b = siteDomain(own);
  return Boolean(a && b) && (a === b || a.endsWith('.' + b));
};
