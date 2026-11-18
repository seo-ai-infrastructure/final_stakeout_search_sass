// The map library (maplibre-gl 6) runs its tile work in a separate script that the browser loads
// by address. This copies that script, from the installed version, to public/ so the site serves it
// at /maplibre-gl-worker.mjs (see src/lib/mapWorker.ts). Runs before every build and dev start.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json'));
mkdirSync(join(here, '..', 'public'), { recursive: true });
copyFileSync(join(lib, 'dist', 'maplibre-gl-worker.mjs'), join(here, '..', 'public', 'maplibre-gl-worker.mjs'));
console.log('map worker copied to public/maplibre-gl-worker.mjs');
