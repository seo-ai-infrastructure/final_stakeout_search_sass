import test from 'node:test';
import assert from 'node:assert/strict';
import { gridColumns, RANK_COLORS, COLUMN_COLORS } from '../apps/nextjs/src/lib/gridColumns';

const pins = [
  { id: 'a', lat: 36.2, lng: -86.5, status: 'COMPLETED', rankFound: 1 },
  { id: 'b', lat: 36.2, lng: -86.48, status: 'COMPLETED', rankFound: 8 },
  { id: 'c', lat: 36.22, lng: -86.5, status: 'COMPLETED', rankFound: 15 },
  { id: 'd', lat: 36.22, lng: -86.48, status: 'PENDING', rankFound: null },
];
const shares = new Map([['a', 0.1], ['b', 0.5], ['c', 0.4]]);

test('3D grid: the most valuable point is the tallest column, coloured by the rank there', () => {
  const fc = gridColumns(pins, shares, (p) => p.rankFound, 2);
  const by = Object.fromEntries(fc.features.map((f) => [f.id, f.properties]));
  assert.ok(by.b.h > by.c.h && by.c.h > by.a.h && by.a.h > by.d.h);
  assert.equal(by.b.h, 700, 'tallest = 35% of the grid span: a 2x2 grid at 2 km spacing spans 2 km');
  assert.deepEqual([by.a.color, by.b.color, by.c.color, by.d.color], [COLUMN_COLORS.top, COLUMN_COLORS.late, COLUMN_COLORS.low, COLUMN_COLORS.pending]);
  const ring = fc.features[0].geometry.coordinates[0];
  assert.equal(ring.length, 5);
  assert.deepEqual(ring[0], ring[4], 'closed square');
});

test('3D grid: faded points (outside the filters) go dark, and a competitor view recolours', () => {
  const fc = gridColumns(pins, shares, (p) => (p.id === 'c' ? 2 : p.rankFound), 2, (p) => p.id === 'a');
  const by = Object.fromEntries(fc.features.map((f) => [f.id, f.properties]));
  assert.equal(by.a.color, '#1e293b');
  assert.equal(by.c.color, COLUMN_COLORS.top);
});

test('rank colours: #4 light green, #5-7 yellow, red only for 20+ or not found', async () => {
  const { rankColor, rankTextColor, RANK_SCALE } = await import('../apps/nextjs/src/lib/gridColumns');
  const c = (r: number | null) => rankColor('COMPLETED', r);
  assert.deepEqual([1, 2, 3].map(c), Array(3).fill(RANK_COLORS.top));
  assert.equal(c(4), RANK_COLORS.four);
  assert.deepEqual([5, 6, 7].map(c), Array(3).fill(RANK_COLORS.mid));
  assert.deepEqual([8, 9, 10].map(c), Array(3).fill(RANK_COLORS.late));
  assert.deepEqual([11, 20].map(c), Array(2).fill(RANK_COLORS.low));
  assert.deepEqual([21, null, 0].map(c), Array(3).fill(RANK_COLORS.none), 'beyond 20, or not found');
  assert.equal(rankColor('PENDING', 1), RANK_COLORS.pending);
  assert.equal(rankColor('FAILED', null), RANK_COLORS.pending, 'a failed point is not shown as "not found"');
  const used = Object.values(RANK_COLORS);
  assert.equal(new Set(used).size, used.length, 'every band has its own colour');
  assert.equal(used.filter((x) => x === RANK_COLORS.none).length, 1, 'red is used by nothing else');
  assert.deepEqual([RANK_COLORS.four, RANK_COLORS.mid, RANK_COLORS.late].map(rankTextColor), ['#0f172a', '#0f172a', '#0f172a']);
  assert.deepEqual([RANK_COLORS.top, RANK_COLORS.low, RANK_COLORS.none, RANK_COLORS.pending].map(rankTextColor), Array(4).fill('#ffffff'));
  assert.equal(RANK_SCALE.length, 6);
});

test('3D columns: the same six bands as the pins, in brighter shades, with readable labels', async () => {
  const { columnColor, rankColor, rankTextColor, COLUMN_SCALE, RANK_SCALE } = await import('../apps/nextjs/src/lib/gridColumns');
  const bandOfFlat = (c: string) => Object.entries(RANK_COLORS).find(([, v]) => v === c)![0];
  const bandOfCol = (c: string) => Object.entries(COLUMN_COLORS).find(([, v]) => v === c)![0];
  for (const r of [1, 3, 4, 5, 7, 8, 10, 11, 20, 21, null]) assert.equal(bandOfCol(columnColor('COMPLETED', r)), bandOfFlat(rankColor('COMPLETED', r)), 'rank ' + r);
  assert.equal(columnColor('PENDING', 1), COLUMN_COLORS.pending);
  assert.deepEqual(COLUMN_SCALE.map(([l]) => l), RANK_SCALE.map(([l]) => l), 'the legend has the same bands in the same order');
  assert.equal(new Set(Object.values(COLUMN_COLORS)).size, 7, 'every band is its own colour');
  // Dark numbers on the light columns, white on the dark ones.
  assert.deepEqual([COLUMN_COLORS.top, COLUMN_COLORS.four, COLUMN_COLORS.mid, COLUMN_COLORS.late].map(rankTextColor), Array(4).fill('#0f172a'));
  assert.deepEqual([COLUMN_COLORS.low, COLUMN_COLORS.none, COLUMN_COLORS.pending].map(rankTextColor), Array(3).fill('#ffffff'));
});
