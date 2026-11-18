import test from 'node:test';
import assert from 'node:assert/strict';
import { aiVisibility, type AiVisPin } from '../packages/core/aiVisibility';
import type { AiParts } from '../packages/core/aiParts';
import { partsAt, partLook, partCounts, PART_COLORS } from '../apps/nextjs/src/lib/aiPartsMap';

const parts = (o: Partial<AiParts> & { brands?: AiParts['p0']['brands'] }): AiParts => ({
  p0: { text: 'Opening answer', brands: o.brands ?? [], sites: [] },
  cards: o.cards ?? [],
  other: o.other ?? [],
  mentions: [],
});
const pin = (id: string, p: AiParts | null | undefined, shown = true): AiVisPin & { hasAiOverview: boolean } => ({
  id,
  status: 'COMPLETED',
  rankFound: null,
  topCompetitors: [],
  hasAiOverview: shown,
  insights: { v: 1, ai: { shown, ...(p === undefined ? {} : { parts: p }) } },
});
const card = (name: string, kgmid: string, sites: string[] = []) => ({ name, kgmid, sites });
const FOX = card('Richard C Fox Plumbing', '/g/11dxl5n6mc');
const TOM = card('1-Tom-Plumber Lakeland', '/g/11lf92nyhd');

// a: named second in the opening answer, card 2 behind "Show more", its website cited second.
// b: card 1, above the fold.  c: its website cited only.  d: an AI Overview without it.
// e: no AI Overview.  f: an AI Overview not read in parts.
const a = pin('a', parts({ brands: [{ name: TOM.name, kgmid: TOM.kgmid, phone: null }, { name: FOX.name, kgmid: FOX.kgmid, phone: null }], cards: [TOM, FOX], other: ['1tomplumber.com', 'richardfoxplumbing.com'] }));
(a.insights!.ai as { page?: unknown }).page = { expanded: false, sites: [], cards: [{ name: TOM.name, website: null, phone: null, above: true }, { name: FOX.name, website: 'richardfoxplumbing.com', phone: null, above: false }] };
const pins = [
  a,
  pin('b', parts({ cards: [FOX, TOM] })),
  pin('c', parts({ cards: [TOM], other: ['richardfoxplumbing.com'] })),
  pin('d', parts({ cards: [TOM] })),
  pin('e', null, false),
  pin('f', undefined),
];
const vis = aiVisibility(pins, { name: 'Richard C Fox Plumbing' });

test('each point says what the business holds: its place in the opening answer, its card and fold, its website’s place', () => {
  assert.deepEqual(vis.you.at.a, { p0: 2, card: 2, above: false, web: 2 });
  assert.deepEqual(vis.you.at.b, { p0: null, card: 1, above: null, web: null });
  assert.deepEqual(vis.you.at.c, { p0: null, card: null, above: null, web: 1 });
  assert.equal(vis.you.at.d, undefined);
  assert.deepEqual(partsAt(pins[4], vis, vis.you), { state: 'noai' });
  assert.deepEqual(partsAt(pins[5], vis, vis.you), { state: 'unread' });
});

test('all parts: the card shows with a gold ring for Position 0; P0, web and no otherwise', () => {
  const look = (id: string) => partLook(partsAt(pins.find((p) => p.id === id)!, vis, vis.you), null);
  // A card and Position 0 at once: the card's slot, darker and dashed behind "Show more", in a gold ring.
  assert.deepEqual([look('a').text, look('a').fill, look('a').dashed, look('a').halo, look('a').dim], ['#2', PART_COLORS.cardBehind, true, true, false]);
  assert.deepEqual([look('b').text, look('b').fill, look('b').dashed, look('b').halo], ['#1', PART_COLORS.card, false, false]);
  assert.deepEqual([look('c').text, look('c').fill], ['web', PART_COLORS.web]);
  assert.deepEqual([look('d').text, look('d').fill, look('d').halo], ['no', PART_COLORS.none, false]);
  assert.deepEqual([look('e').text, look('e').quiet], ['–', true]);
  assert.equal(look('f').text, '?');
  assert.match(look('a').title, /named #2 in the opening answer · business card #2, behind “Show more” · its website cited \(#2/);
});

test('filtered to one part: the points holding it show that part, every other point stays, dimmed', () => {
  const look = (id: string, f: 'p0' | 'card' | 'web') => partLook(partsAt(pins.find((p) => p.id === id)!, vis, vis.you), f);
  assert.deepEqual([look('a', 'p0').text, look('a', 'p0').fill, look('a', 'p0').halo, look('a', 'p0').dim], ['P0·2', PART_COLORS.p0, true, false]);
  assert.deepEqual([look('b', 'p0').text, look('b', 'p0').dim], ['#1', true], 'kept in its own look, dimmed');
  assert.deepEqual([look('a', 'web').text, look('c', 'web').text, look('b', 'web').dim], ['#2', '#1', true]);
  assert.deepEqual([look('a', 'card').text, look('c', 'card').dim, look('e', 'card').dim, look('f', 'card').dim], ['#2', true, true, true]);
});

test('the pills count points holding each part, of the points the report counts', () => {
  const c = partCounts(pins, vis, vis.you);
  assert.deepEqual(c, { points: 5, any: 3, p0: 1, card: 2, behind: 1, web: 2, none: 1, noai: 1, unread: 1 });
  // Pins still running are left out; with no reading at all every AI Overview is unread.
  assert.equal(partCounts([{ ...pins[0], status: 'PENDING' }], vis, vis.you).any, 0);
  assert.deepEqual(partsAt(pins[0], null, null), { state: 'unread' });
});
