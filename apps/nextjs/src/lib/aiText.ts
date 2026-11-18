/**
 * The worker's flat text of an AI Overview, tidied for reading. Used only when a point's full
 * evidence cannot be loaded (the rebuilt answer is better): button labels and stray bullets go,
 * a business's run-together line becomes a name with its details, and a label is joined to the
 * value on the line after it ("Phone:" + "(615) 509-5290").
 */
type AiTextBlock = { kind: 'heading' | 'business' | 'text'; text: string; meta?: string };

const NOISE = /^(call|directions|website|share|text message|reviews|services|menu|order|book|book online|get quote|message|about this result|•|·|-)$/i;
const BUSINESS = /^(.+?)\s+Rated ([0-5](?:\.\d)?) out of 5,?\s*\(?([\d.,]+K?)\)?\s*(?:user )?reviews?\.?\s*(.*)$/i;

export function tidyAiText(raw: string): AiTextBlock[] {
  const lines = raw.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter((l) => l && !NOISE.test(l) && !/ - Related results$/i.test(l));
  const out: AiTextBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const b = BUSINESS.exec(line);
    if (b) {
      const details = b[4].split('·').map((x) => x.trim()).filter(Boolean);
      out.push({ kind: 'business', text: b[1].trim(), meta: [`${b[2]} (${b[3]} reviews)`, ...details].join(' · ') });
      continue;
    }
    // A label on its own line belongs with the value under it.
    if (/^[A-Z][\w /&-]{1,30}:$/.test(line) && lines[i + 1] && !BUSINESS.test(lines[i + 1])) {
      out.push({ kind: 'text', text: `${line} ${lines[++i]}` });
      continue;
    }
    // A heading: a short line with no sentence ending, that something follows.
    const heading = line.length <= 60 && !/[.!?:,;]$/.test(line) && !/\d{3}[)\s.-]/.test(line) && !/^\d/.test(line) && i + 1 < lines.length && (out.length === 0 || out[out.length - 1].kind !== 'business' || /results$/i.test(line));
    out.push({ kind: heading ? 'heading' : 'text', text: line });
  }
  return out;
}
