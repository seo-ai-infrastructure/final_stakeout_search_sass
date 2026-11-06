import type { FillExtrusionLayerSpecification, ExpressionSpecification } from 'maplibre-gl';

export type MapViewMode = '2d' | '3d';
export const BUILDING_SOURCE_ID = 'demo-building-source';
export const BUILDING_LAYER_ID = 'demo-3d-buildings';
export const GRID_BOUNDS: [[number, number], [number, number]] = [[-82.011, 27.9855], [-81.8886, 28.0935]];
export const BUILDING_ZOOM = 15.8;
export const BUILDING_PITCH = 55;
export const BUILDING_BEARING = -25;

export const buildingHeight: ExpressionSpecification = ['max', 0, ['to-number', ['get', 'render_height'], 0]];
export const buildingBase: ExpressionSpecification = ['min', buildingHeight, ['max', 0, ['to-number', ['get', 'render_min_height'], 0]]];

/** Use provider-supplied approximate heights; never invent height for a missing footprint attribute. */
export function buildingLayer(source = BUILDING_SOURCE_ID): FillExtrusionLayerSpecification {
  return {
    id: BUILDING_LAYER_ID,
    type: 'fill-extrusion',
    source,
    'source-layer': 'building',
    minzoom: 13,
    filter: ['all', ['!', ['in', ['to-string', ['get', 'hide_3d']], ['literal', ['true', '1']]]], ['>', buildingHeight, 0]],
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], buildingHeight, 0, '#879496', 12, '#b8c4bd', 45, '#e0e4d4', 100, '#f0efdf'],
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, buildingHeight],
      'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, buildingBase],
      'fill-extrusion-opacity': 0.92,
      'fill-extrusion-vertical-gradient': true,
    },
  };
}

export function neighborhoodCamera(center: [number, number]) {
  return { center, zoom: BUILDING_ZOOM, pitch: BUILDING_PITCH, bearing: BUILDING_BEARING };
}
