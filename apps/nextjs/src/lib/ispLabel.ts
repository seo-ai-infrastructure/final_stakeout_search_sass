/**
 * One clean internet-provider name for a point's receipt.
 *
 * The ISP chosen for the scan is shown when the search really ran on it. Otherwise (any ISP, or
 * the chosen one was not what the connection turned out to be) the provider's own name from the
 * IP lookup: registry entries ("AS5650 Verizon Business") are skipped, because an address block
 * can still be registered to a previous owner (Frontier's are, to Verizon), and company suffixes
 * are trimmed. The exit's city and IP are deliberately not part of this.
 */
export function ispLabel(
  m: { ispRequested?: unknown; ispMatched?: unknown; ispObserved?: unknown; org?: unknown } | null | undefined,
): string | null {
  if (!m) return null;
  const requested = String(m.ispRequested ?? '').trim();
  if (requested && requested.toUpperCase() !== 'ANY' && m.ispMatched !== false) return requested;
  const parts = String(m.ispObserved ?? '').split('·').map((s) => s.trim()).filter(Boolean);
  const named = parts.find((p) => !/^AS\d+\b/i.test(p));
  const raw = named ?? String(m.org ?? parts[0] ?? '').replace(/^AS\d+\s+/i, '');
  const tidy = raw
    .replace(/[,\s]+(LLC|L\.L\.C\.|Inc\.?|Incorporated|Corporation|Corp\.?|Co\.?|Ltd\.?)$/i, '')
    .replace(/\s+IP Services$/i, '')
    .trim()
    // "TDS TELECOM" reads better as "TDS Telecom": lower the long all-capital words, keep short ones (TDS, AT&T).
    .replace(/\b[A-Z]{5,}\b/g, (w) => w[0] + w.slice(1).toLowerCase());
  return tidy || null;
}
