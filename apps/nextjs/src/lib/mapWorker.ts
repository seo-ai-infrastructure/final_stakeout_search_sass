/**
 * Tells the map library where its worker script is: a copy the build puts in public/
 * (scripts/copy-map-worker.mjs). The library's own guess at that address does not survive bundling.
 * Import this file once in every component that makes a map.
 */
import { setWorkerUrl } from 'maplibre-gl';

export const MAP_WORKER_URL = '/maplibre-gl-worker.mjs';
if (typeof window !== 'undefined') setWorkerUrl(MAP_WORKER_URL);
