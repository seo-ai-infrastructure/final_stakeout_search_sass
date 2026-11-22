/** The same keyword set drives the setup count, estimate, saved setup, and launch. */
export function scanKeywords(selected: readonly string[], input = ''): string[] {
  const seen = new Set<string>();
  return [...selected, ...input.split(/[\n,;]+/)]
    .map((value) => value.trim().replace(/\s+/g, ' '))
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
