import raw from '@/data/home-report.json';

/**
 * The homepage's sample report: Stuart's Plumbing, Lakeland FL, the 5×5 scan of Nov 25, 2026, exactly as
 * its public report shows it. Every pin carries the id of its own phone recording.
 */
export type HomePin = {
  id: string; r: number; c: number; area: string; zip: string; tract: string;
  rank: number | null; oneBox: 'won' | 'other' | null; first: string[];
  featured: boolean; card: number | null; of: number | null; more: boolean; inline: boolean; named: boolean;
  links: number | null; srcPos: number | null; listed: boolean; site: boolean;
  inc: number | null; aiFirst: string[]; sources: string[]; lsa: string[];
};
export type GridMode = 'rank' | 'ai';

export const REPORT = raw as unknown as { business: string; site: string; market: string; keyword: string; when: string; token: string; pins: HomePin[] };
export const PINS = REPORT.pins;
/** The public report these figures come from, and one pin's recording inside it. */
export const REPORT_URL = '/reports/visibility.html?share=' + REPORT.token;
export const recordingUrl = (p: HomePin) => '/api/proof/' + p.id + '?kind=video&share=' + REPORT.token;
export const pinName = (p: { r: number; c: number }) => `R${p.r + 1}·C${p.c + 1}`;
export const usd0 = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

const count = (f: (p: HomePin) => boolean) => PINS.filter(f).length;
export const STATS = {
  points: PINS.length,
  packTop3: count((p) => p.oneBox === 'won' || (p.oneBox !== 'other' && p.rank !== null && p.rank <= 3)),
  hijacks: count((p) => p.oneBox === 'other'),
  inAi: count((p) => p.featured || p.named || p.listed || p.site),
  siteCited: count((p) => p.site),
  /** Top 3 of the map pack, or upfront in the AI answer (a card in the first three, or recommended by name). */
  share: count((p) => p.oneBox === 'won' || (p.oneBox !== 'other' && p.rank !== null && p.rank <= 3) || (p.featured && (p.inline || (p.card !== null && p.card <= 3 && !p.more)))),
};
export const pct = (n: number, of: number = STATS.points) => Math.round((100 * n) / of);

/** Census household income as a tint behind a pin (the report's own warm scale). */
export function incomeTint(inc: number | null) {
  if (!inc) return 'rgba(30, 41, 59, 0.35)';
  if (inc >= 95000) return 'rgba(237, 216, 166, 0.34)';
  if (inc >= 80000) return 'rgba(199, 170, 108, 0.28)';
  if (inc >= 65000) return 'rgba(156, 127, 73, 0.22)';
  if (inc >= 50000) return 'rgba(115, 91, 56, 0.16)';
  return 'rgba(58, 45, 30, 0.16)';
}

/** How a pin is drawn in the map pack view and in the AI Overview view. */
export function pinBadge(pin: HomePin, mode: GridMode) {
  if (mode === 'rank') {
    if (pin.oneBox === 'won') return { label: '1-Box', bg: 'bg-emerald-600', border: 'border-yellow-300', text: 'text-white text-[9.5px] font-extrabold tracking-tight', shape: 'rounded-full', summary: 'Won Google’s single-business panel (1-Box)' };
    if (pin.oneBox === 'other') return { label: '1-Box', bg: 'bg-slate-800', border: 'border-amber-400', text: 'text-amber-300 text-[9.5px] font-bold tracking-tight', shape: 'rounded-full', summary: `${pin.first[0] ?? 'Another firm'} held the single-business panel (no 3-Pack)` };
    if (pin.rank === null) return { label: 'NF', bg: 'bg-rose-700', border: 'border-rose-400', text: 'text-white text-xs font-bold', shape: 'rounded-full', summary: 'Not found in the local pack' };
    if (pin.rank === 1) return { label: '1', bg: 'bg-emerald-600', border: 'border-emerald-300', text: 'text-white text-xs font-extrabold', shape: 'rounded-full', summary: 'Map pack #1' };
    if (pin.rank <= 3) return { label: String(pin.rank), bg: 'bg-emerald-700', border: 'border-emerald-400/80', text: 'text-white text-xs font-bold', shape: 'rounded-full', summary: `Map pack #${pin.rank}` };
    return { label: String(pin.rank), bg: 'bg-amber-600', border: 'border-amber-300', text: 'text-white text-xs font-bold', shape: 'rounded-full', summary: `Local results #${pin.rank} (below the top 3)` };
  }
  if (pin.featured && (pin.inline || pin.card === null)) return { label: '★', bg: 'bg-emerald-600', border: 'border-emerald-300', text: 'text-white text-xs font-extrabold', shape: 'rounded-lg', summary: 'Featured: recommended by name in the AI answer' };
  if (pin.featured && pin.card !== null) {
    const up = pin.card <= 3 && !pin.more;
    return { label: `#${pin.card}`, bg: up ? 'bg-emerald-600' : 'bg-amber-600', border: up ? 'border-emerald-300' : 'border-amber-300', text: 'text-white text-[11px] font-extrabold', shape: 'rounded-lg', summary: `Featured ${up ? 'upfront' : 'lower'}: AI card #${pin.card}${pin.of ? ` of ${pin.of}` : ''}` };
  }
  if (pin.listed) return { label: 'GBP', bg: 'bg-sky-800', border: 'border-sky-400', text: 'text-sky-100 text-[9.5px] font-bold', shape: 'rounded-lg', summary: 'Google listing cited as a source' };
  return { label: '×', bg: 'bg-slate-800', border: 'border-slate-600', text: 'text-slate-300 text-xs font-bold', shape: 'rounded-lg', summary: 'Not in the AI answer' };
}

/** The event a button elsewhere on the page sends to open a pin in the hero's report. */
export const HOME_PIN_EVENT = 'stakeout:home-pin';
export type HomePinEvent = { r: number; c: number; mode: GridMode };
