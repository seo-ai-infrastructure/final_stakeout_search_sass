import test from 'node:test';
import assert from 'node:assert/strict';
import { autoLevelAt, describeArea, fillColor, fillOpacity, legend, levelZoomRange, PALETTE } from '../apps/nextjs/src/lib/censusLayer';

test('Census legend: six labelled steps per metric, older homes darkest', () => {
  assert.deepEqual(legend('income').map((i) => i.label), ['Under $40k', '$40k–$60k', '$60k–$80k', '$80k–$100k', '$100k–$150k', '$150k+']);
  assert.deepEqual(legend('owners').map((i) => i.label), ['Under 30%', '30%–45%', '45%–60%', '60%–75%', '75%–90%', '90%+']);
  const built = legend('built');
  assert.deepEqual(built.map((i) => i.label), ['Before 1950', '1950–1969', '1970–1989', '1990–2004', '2005–2014', '2015 or later']);
  assert.equal(built[0].color, PALETTE[PALETTE.length - 1]);
});

test('Census colours: a step on the value, and areas without an estimate stay clear', () => {
  const e = fillColor('income') as unknown[];
  assert.deepEqual(e.slice(0, 2), ['case', ['has', 'inc']]);
  assert.deepEqual((e[2] as unknown[]).slice(0, 4), ['step', ['to-number', ['get', 'inc']], PALETTE[0], 40000]);
  assert.equal(e[3], 'rgba(0,0,0,0)');
  assert.deepEqual(fillOpacity('income'), ['case', ['==', ['get', 'rel'], 0], 0.2, 0.5]);
  assert.equal(fillOpacity('owners'), 0.5);
});

test('Census detail: auto picks ZIPs, then tracts, then block groups as you zoom in', () => {
  assert.equal(autoLevelAt(9), 'zcta');
  assert.equal(autoLevelAt(11), 'tract');
  assert.equal(autoLevelAt(13), 'bg');
  assert.deepEqual(levelZoomRange('auto', 'tract'), [10, 12]);
  assert.deepEqual(levelZoomRange('bg', 'bg'), [0, 24]);
  assert.equal(levelZoomRange('bg', 'zcta'), null);
});

test('Census area details: estimates with margins of error, homeowner counts, missing values said plainly', () => {
  const a = describeArea('tract', { id: '12105010402', nm: 'Census Tract 104.02, Polk County', inc: 61148, inc_m: 14629, own: 428, occ: 1247, own_pct: 34.3, yb: 1955, yb_m: 3, rel: 2 });
  assert.equal(a.name, 'Census Tract 104.02, Polk County');
  assert.deepEqual(a.rows.map((r) => r.value), ['$61,148 ± $14,629', '34.3% (428 of 1,247 homes)', 'No estimate', '1955 ± 3']);
  assert.equal(a.uncertain, false);
  assert.equal(describeArea('bg', { id: 'x', inc: 50000, rel: 0 }).uncertain, true);
});

test('market colours: six equal groups of the areas around the grid, rounded to clean values', async () => {
  const { quantileBreaks, legend, fillColor } = await import('../apps/nextjs/src/lib/censusLayer');
  const incomes = Array.from({ length: 60 }, (_, i) => 80000 + i * 1500); // $80k..$168.5k
  const b = quantileBreaks('income', incomes)!;
  assert.equal(b.length, 5);
  assert.ok(b.every((x, i) => x % 1000 === 0 && (i === 0 || x > b[i - 1])));
  assert.deepEqual(legend('income', b).map((i) => i.label)[0], `Under $${b[0] / 1000}k`);
  assert.equal(((fillColor('income', b) as unknown[])[2] as unknown[])[3], b[0]);
  assert.equal(quantileBreaks('income', [100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000]), null, 'no spread: fall back to national steps');
  assert.equal(quantileBreaks('owners', [50, 60]), null, 'too few areas');
});
