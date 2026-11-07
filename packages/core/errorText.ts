/** Error text that is safe to log: API keys in URL paths, URL passwords and long tokens are masked. */
export function safeErrorText(e: unknown): string {
  const raw = e instanceof Error ? e.name + ': ' + e.message : String(e);
  return raw
    .replace(/(\/api\/v\d+\/)[^/\s]+/gi, '$1***')
    .replace(/(:\/\/[^:/\s]+:)[^@\s]+@/g, '$1***@')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '***')
    .slice(0, 500);
}

/** The machine code at the start of an internal error message, e.g. "PROXY_SELLER_ERROR". */
export function errorCode(e: unknown): string | null {
  const m = e instanceof Error ? /^([A-Z][A-Z0-9_]{3,})\b/.exec(e.message) : null;
  return m ? m[1] : null;
}
