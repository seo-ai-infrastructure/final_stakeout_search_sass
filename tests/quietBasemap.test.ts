import test from 'node:test';
import assert from 'node:assert/strict';
import { quietBasemap, liftAboveShading, shadeStrength, BASE_GROUND, PALETTES } from '../apps/nextjs/src/lib/censusLayer';

test('the report base map steps back: dark ground, thin grey roads, no casings or paths, light labels', () => {
  const paint: Record<string, Record<string, unknown>> = {}, layout: Record<string, Record<string, unknown>> = {};
  const layers = [
    { id: 'background', type: 'background' },
    { id: 'water', type: 'fill', 'source-layer': 'water' },
    { id: 'landuse_residential', type: 'fill', 'source-layer': 'landuse' },
    { id: 'highway_path', type: 'line', 'source-layer': 'transportation' },
    { id: 'highway_minor', type: 'line', 'source-layer': 'transportation' },
    { id: 'highway_major_casing', type: 'line', 'source-layer': 'transportation' },
    { id: 'highway_major_inner', type: 'line', 'source-layer': 'transportation' },
    { id: 'highway_motorway_inner', type: 'line', 'source-layer': 'transportation' },
    { id: 'railway', type: 'line', 'source-layer': 'transportation' },
    { id: 'boundary_state', type: 'line', 'source-layer': 'boundary' },
    { id: 'place_suburb', type: 'symbol', 'source-layer': 'place' },
    { id: 'odd_layer', type: 'raster' },
  ];
  const m = {
    getStyle: () => ({ layers }),
    setLayoutProperty: (id: string, p: string, v: unknown) => ((layout[id] ??= {})[p] = v),
    setPaintProperty: (id: string, p: string, v: unknown) => {
      // a style that rejects one property must not stop the rest
      if (id === 'place_suburb' && p === 'text-opacity') throw new Error('unsupported');
      (paint[id] ??= {})[p] = v;
    },
  };
  quietBasemap(m);
  assert.equal(paint.background['background-color'], BASE_GROUND);
  assert.deepEqual([paint.water['fill-color'], paint.water['fill-outline-color']], ['#050811', '#1b2a44'], 'water is darker than the ground, with a shoreline');
  assert.equal(paint.landuse_residential['fill-opacity'], 0.2);
  for (const hidden of ['highway_path', 'highway_major_casing', 'railway']) assert.equal(layout[hidden]?.visibility, 'none', hidden);
  assert.deepEqual([paint.highway_major_inner['line-color'], paint.highway_major_inner['line-opacity']], ['#334155', 0.55]);
  assert.deepEqual([paint.highway_motorway_inner['line-color'], paint.highway_motorway_inner['line-opacity']], ['#3b4a61', 0.8], 'motorways are the strongest roads');
  assert.equal(paint.highway_minor['line-opacity'], 0.28, 'minor roads stay, fainter');
  assert.equal(layout.highway_minor, undefined, 'and are not hidden');
  assert.equal(paint.boundary_state['line-opacity'], 0.3);
  assert.deepEqual([paint.place_suburb['text-color'], paint.place_suburb['text-halo-color'], paint.place_suburb['text-halo-width']], ['#cbd5e1', BASE_GROUND, 1.6], 'labels are set even though one property was refused');
  assert.equal(paint.odd_layer, undefined);
});

test('neighborhood shading is readable in Pack rank and fades in AI place and Ads above', () => {
  assert.deepEqual([shadeStrength('rank', false), shadeStrength('ai', false), shadeStrength('ads', false)], [0.4, 0.2, 0.2]);
  assert.ok(shadeStrength('rank', false) > shadeStrength('ai', false));
  assert.equal(shadeStrength('rank', true), 0.3, 'dimmer still behind 3D columns');
});

test('lakes and roads are lifted above the neighborhood shading, and stay below the labels', () => {
  const moved: [string, string | undefined][] = [];
  const layers = [
    { id: 'background', type: 'background' },
    { id: 'water', type: 'fill', 'source-layer': 'water' },
    { id: 'park', type: 'fill', 'source-layer': 'park' },
    { id: 'waterway', type: 'line', 'source-layer': 'waterway' },
    { id: 'highway_major_inner', type: 'line', 'source-layer': 'transportation' },
    { id: 'boundary', type: 'line', 'source-layer': 'boundary' },
    { id: 'stuck', type: 'line', 'source-layer': 'transportation' },
    { id: 'place_suburb', type: 'symbol', 'source-layer': 'place' },
  ];
  liftAboveShading({ getStyle: () => ({ layers }), moveLayer: (id, before) => { if (id === 'stuck') throw new Error('cannot move'); moved.push([id, before]); } }, 'place_suburb');
  assert.deepEqual(moved, [['water', 'place_suburb'], ['waterway', 'place_suburb'], ['highway_major_inner', 'place_suburb']], 'in their original order, each just under the first label layer; a layer that cannot move is skipped');
});

test('the income shading is one blue hue that only gets lighter, in steps wide enough to tell apart', () => {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const light = PALETTES.income.map((h) => { const [r, g, b] = rgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; });
  for (let i = 1; i < light.length; i++) assert.ok(light[i] - light[i - 1] >= 12, `band ${i + 1} is clearly lighter than band ${i} (${light[i - 1].toFixed(0)} to ${light[i].toFixed(0)})`);
  // blue throughout: the blue channel leads in every band (no royal-blue or teal detour)
  for (const h of PALETTES.income) { const [r, g, b] = rgb(h); assert.ok(b > g && g > r, h); }
});
