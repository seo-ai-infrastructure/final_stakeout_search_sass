import test from 'node:test';
import assert from 'node:assert/strict';
import { gridColumns, RANK_COLORS } from '../apps/nextjs/src/lib/gridColumns';

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
  assert.deepEqual([by.a.color, by.b.color, by.c.color, by.d.color], [RANK_COLORS.top, RANK_COLORS.mid, RANK_COLORS.low, RANK_COLORS.pending]);
  const ring = fc.features[0].geometry.coordinates[0];
  assert.equal(ring.length, 5);
  assert.deepEqual(ring[0], ring[4], 'closed square');
});

test('3D grid: faded points (outside the filters) go dark, and a competitor view recolours', () => {
  const fc = gridColumns(pins, shares, (p) => (p.id === 'c' ? 2 : p.rankFound), 2, (p) => p.id === 'a');
  const by = Object.fromEntries(fc.features.map((f) => [f.id, f.properties]));
  assert.equal(by.a.color, '#1e293b');
  assert.equal(by.c.color, RANK_COLORS.top);
});
