/** Stored files (R2): what a key is, and a stored address as its key. No imports. */

/** What a key is: a point's video, bundle, record, or one of its saved page files. */
export function kindOf(key: string): string {
  if (/\.mhtml\.gz$/.test(key)) return 'page snapshot (.mhtml.gz)';
  if (/\.dom\.html\.gz$/.test(key)) return 'page HTML (.dom.html.gz)';
  if (/\/page_\w+\.html$/.test(key)) return 'page shown (.html)';
  if (/\.(mp4|webm)$/.test(key)) return 'video';
  if (/\.tar\.gz$/.test(key)) return 'evidence bundle';
  if (/\.json$/.test(key)) return 'record (.json)';
  return 'other';
}

/** A stored address as its key ("https://…/scans/…" or the key itself). */
export const keyOf = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v) return null;
  if (!v.startsWith('https://')) return v;
  try {
    return decodeURIComponent(new URL(v).pathname.slice(1));
  } catch {
    return null;
  }
};

