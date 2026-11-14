import test from 'node:test';
import assert from 'node:assert/strict';
import { quietBasemap, shadeStrength, BASE_GROUND } from '../apps/nextjs/src/lib/censusLayer';

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
  assert.equal(paint.water['fill-color'], '#081424');
  assert.equal(paint.landuse_residential['fill-opacity'], 0.2);
  for (const hidden of ['highway_path', 'highway_major_casing', 'railway']) assert.equal(layout[hidden]?.visibility, 'none', hidden);
  for (const road of ['highway_major_inner', 'highway_motorway_inner']) assert.deepEqual([paint[road]['line-color'], paint[road]['line-opacity']], ['#334155', 0.6], road);
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
