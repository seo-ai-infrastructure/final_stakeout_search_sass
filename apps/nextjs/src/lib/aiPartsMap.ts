/**
 * The map's AI parts view: what the business holds in each point's AI Overview, and how that
 * point's pin looks.
 *
 * All parts: the pin shows its business card's slot (purple; darker and dashed when the card sat
 * behind "Show more"), else P0 when the opening answer names it (amber), else "web" when its
 * website is cited (cyan), else "no". A gold ring wherever the opening answer names it, whatever
 * the pin shows, so a card and Position 0 read together.
 *
 * Filtered to one part, the points holding it show that part (its place in the opening answer, its
 * card's slot, its website's place among the business websites cited) and every other point stays
 * on the map, dimmed, so the whole grid is still there to count against.
 */
import type { AiVisibility, AiVisRow } from '@stakeout/core/aiVisibility';

export type PartFilter = 'p0' | 'card' | 'web';

/** One point: no AI Overview, an AI Overview not read in parts (outside the count), or what the business holds in it. */
export type PartsAt =
  | { state: 'noai' }
  | { state: 'unread' }
  | { state: 'read'; p0: number | null; card: number | null; above: boolean | null; web: number | null };

type PinLike = { id: string; status: string; hasAiOverview: boolean; insights?: { ai?: { shown: boolean } | null } | null };

export const PART_COLORS = {
  p0: '#f59e0b',
  card: '#8b5cf6',
  cardBehind: '#6d28d9',
  web: '#06b6d4',
  none: '#4c1d95',
  noai: '#0f172a',
  unread: '#334155',
} as const;

/** The gold ring on a pin whose opening answer names the business. */
export const P0_HALO = '0 0 0 4px rgba(250,204,21,0.55), 0 0 14px 4px rgba(250,204,21,0.45)';

export const PART_FILTERS: { key: PartFilter | null; label: string; dot: string }[] = [
  { key: null, label: 'All', dot: '#c4b5fd' },
  { key: 'p0', label: 'Position 0', dot: PART_COLORS.p0 },
  { key: 'card', label: 'Business card', dot: PART_COLORS.card },
  { key: 'web', label: 'Website cited', dot: PART_COLORS.web },
];

/** The same points as the report's AI Overview section counts: no AI Overview, not read in parts, or read. */
export function partsAt(p: PinLike, vis: Pick<AiVisibility, 'unreadPins'> | null, row: Pick<AiVisRow, 'at'> | null): PartsAt {
  const ai = p.insights?.ai;
  const shown = ai ? ai.shown : Boolean(p.hasAiOverview);
  if (!shown) return { state: 'noai' };
  if (!vis || vis.unreadPins.includes(p.id)) return { state: 'unread' };
  const at = row?.at[p.id];
  return { state: 'read', p0: at?.p0 ?? null, card: at?.card ?? null, above: at?.above ?? null, web: at?.web ?? null };
}

export type PartLook = { fill: string; text: string; halo: boolean; dashed: boolean; quiet: boolean; dim: boolean; title: string };

export function partLook(a: PartsAt, filter: PartFilter | null): PartLook {
  if (a.state === 'noai') return { fill: PART_COLORS.noai, text: '–', halo: false, dashed: false, quiet: true, dim: filter != null, title: 'No AI Overview' };
  if (a.state === 'unread') return { fill: PART_COLORS.unread, text: '?', halo: false, dashed: false, quiet: false, dim: filter != null, title: 'AI Overview not read in parts (left out of the count)' };
  const halo = a.p0 != null;
  const dim = filter != null && a[filter] == null;
  // The part the pin shows: the one filtered to, else its card, else Position 0, else its website.
  const show: PartFilter | null = filter && a[filter] != null ? filter : a.card != null ? 'card' : a.p0 != null ? 'p0' : a.web != null ? 'web' : null;
  const said: string[] = [];
  if (a.p0 != null) said.push(a.p0 === 1 ? 'named first in the opening answer' : `named #${a.p0} in the opening answer`);
  if (a.card != null) said.push(`business card #${a.card}` + (a.above === false ? ', behind “Show more”' : a.above === true ? ', in view before “Show more”' : ''));
  if (a.web != null) said.push(a.web === 1 ? 'its website cited first' : `its website cited (#${a.web} of the business websites)`);
  const title = said.length ? said.join(' · ') : 'The AI Overview leaves it out';
  if (show === 'card') return { fill: a.above === false ? PART_COLORS.cardBehind : PART_COLORS.card, text: '#' + a.card, halo, dashed: a.above === false, quiet: false, dim, title };
  if (show === 'p0') return { fill: PART_COLORS.p0, text: filter === 'p0' && a.p0 !== 1 ? 'P0·' + a.p0 : 'P0', halo, dashed: false, quiet: false, dim, title };
  if (show === 'web') return { fill: PART_COLORS.web, text: filter === 'web' ? '#' + a.web : 'web', halo, dashed: false, quiet: false, dim, title };
  return { fill: PART_COLORS.none, text: 'no', halo: false, dashed: false, quiet: false, dim, title };
}

/** The pills' counts: completed points holding each part, and the points counted (N, as in the report). */
export function partCounts(pins: PinLike[], vis: Pick<AiVisibility, 'unreadPins' | 'points'> | null, row: Pick<AiVisRow, 'at'> | null) {
  const c = { points: vis?.points ?? 0, any: 0, p0: 0, card: 0, behind: 0, web: 0, none: 0, noai: 0, unread: 0 };
  for (const p of pins) {
    if (p.status !== 'COMPLETED') continue;
    const a = partsAt(p, vis, row);
    if (a.state !== 'read') {
      c[a.state]++;
      continue;
    }
    if (a.p0 != null || a.card != null || a.web != null) c.any++;
    else c.none++;
    if (a.p0 != null) c.p0++;
    if (a.card != null) c.card++;
    if (a.card != null && a.above === false) c.behind++;
    if (a.web != null) c.web++;
  }
  return c;
}
