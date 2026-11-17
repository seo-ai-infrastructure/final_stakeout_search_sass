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
  assert.deepEqual([by.a.color, by.b.color, by.c.color, by.d.color], [COLUMN_COLORS.top, COLUMN_COLORS.eight, COLUMN_COLORS.low, COLUMN_COLORS.pending]);
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

test('rank colours: #1–3 Gucci green, a step each for #4 to #8, #9–20 red, 20+ the darkest red', async () => {
  const { rankColor, rankTextColor, rankKey, RANK_SCALE, RANK_KEYS } = await import('../apps/nextjs/src/lib/gridColumns');
  const c = (r: number | null) => rankColor('COMPLETED', r);
  assert.deepEqual([1, 2, 3].map(c), Array(3).fill('#2a6600'));
  assert.deepEqual([4, 5, 6, 7, 8].map(c), ['#c6b100', '#f7c701', '#e59c00', '#d26e00', '#c03f00']);
  assert.deepEqual([9, 10, 15, 20].map(c), Array(4).fill('#af0a00'));
  assert.deepEqual([21, null, 0].map(c), Array(3).fill('#7f1d1d'), 'beyond 20, or not found');
  assert.equal(rankColor('PENDING', 1), RANK_COLORS.pending);
  assert.equal(rankColor('FAILED', null), RANK_COLORS.pending, 'a failed point is not shown as "not found"');
  const used = Object.values(RANK_COLORS);
  assert.equal(new Set(used).size, used.length, 'every band has its own colour');
  // The legend: the bands in order, each with the colour its ranks get, and the key a legend filters by.
  assert.deepEqual(RANK_SCALE.map(([l]) => l), ['#1–3', '#4', '#5', '#6', '#7', '#8', '#9–20', '20+ / not found']);
  const sample = [2, 4, 5, 6, 7, 8, 12, null];
  assert.deepEqual(RANK_SCALE.map(([, col]) => col), sample.map(c));
  assert.deepEqual(sample.map((r) => rankKey('COMPLETED', r)), [...RANK_KEYS]);
  assert.equal(rankKey('RUNNING', 3), null);
  // Readable labels: dark on the yellows and oranges (#4–7), white on the green and the reds.
  assert.deepEqual([4, 5, 6, 7].map((r) => rankTextColor(c(r))), Array(4).fill('#0f172a'));
  assert.deepEqual([1, 8, 9, null].map((r) => rankTextColor(c(r))), Array(4).fill('#ffffff'));
  assert.equal(rankTextColor(RANK_COLORS.pending), '#ffffff');
  // Colours used elsewhere keep the label colour they had.
  assert.deepEqual(['#a855f7', '#0d9488', '#7c3aed', '#e11d48', '#0e7490'].map(rankTextColor), Array(5).fill('#ffffff'));
  assert.deepEqual(['#fb923c', '#10b981', '#34d399'].map(rankTextColor), Array(3).fill('#0f172a'));
});

test('3D columns: the same bands as the pins, in brighter shades, with readable labels', async () => {
  const { columnColor, rankKey, rankTextColor, COLUMN_SCALE, RANK_SCALE } = await import('../apps/nextjs/src/lib/gridColumns');
  const bandOfCol = (c: string) => Object.entries(COLUMN_COLORS).find(([, v]) => v === c)![0];
  for (const r of [1, 3, 4, 5, 6, 7, 8, 9, 20, 21, null]) assert.equal(bandOfCol(columnColor('COMPLETED', r)), rankKey('COMPLETED', r), 'rank ' + r);
  assert.equal(columnColor('PENDING', 1), COLUMN_COLORS.pending);
  assert.deepEqual(COLUMN_SCALE.map(([l]) => l), RANK_SCALE.map(([l]) => l), 'the legend has the same bands in the same order');
  assert.equal(new Set(Object.values(COLUMN_COLORS)).size, Object.keys(COLUMN_COLORS).length, 'every band is its own colour');
  // Dark numbers on the light columns, white on the dark ones.
  assert.deepEqual([COLUMN_COLORS.top, COLUMN_COLORS.four, COLUMN_COLORS.five, COLUMN_COLORS.six, COLUMN_COLORS.seven].map(rankTextColor), Array(5).fill('#0f172a'));
  assert.deepEqual([COLUMN_COLORS.eight, COLUMN_COLORS.low, COLUMN_COLORS.none, COLUMN_COLORS.pending].map(rankTextColor), Array(4).fill('#ffffff'));
});
