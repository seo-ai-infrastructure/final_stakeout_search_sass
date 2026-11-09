import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { inGeometry, lookupCensus } from '../packages/core/censusLookup';

// Synthetic lookup files from a local run of tools/census/build.py (Mt. Juliet, TN): tracts
// 47189030100 (west) and 47189030200 (east), two block groups each, ZIP 37122 over both.
const files: Record<string, string> = {
  'census/acs2024/lookup/bg/47.fgb': 'tests/fixtures/census/bg-47.fgb',
  'census/acs2024/lookup/tract/47.fgb': 'tests/fixtures/census/tract-47.fgb',
  'census/acs2024/lookup/zcta.fgb': 'tests/fixtures/census/zcta.fgb',
};

/** Serves the fixtures with HTTP byte ranges, as R2 does. */
async function rangeServer() {
  const server = http.createServer((req, res) => {
    const path = files[decodeURIComponent((req.url ?? '').slice(1))];
    if (!path) return res.writeHead(404).end();
    const body = readFileSync(path);
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (!m) return res.writeHead(200, { 'Content-Length': body.length }).end(body);
    const start = Number(m[1]), end = Math.min(m[2] ? Number(m[2]) : body.length - 1, body.length - 1);
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
    res.end(body.subarray(start, end + 1));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return { url: (key: string) => Promise.resolve(`http://127.0.0.1:${port}/${encodeURIComponent(key)}`), close: () => server.close() };
}

test('point in polygon: inside, outside, and inside a hole', () => {
  const square = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
  assert.equal(inGeometry(2, 2, square), true);
  assert.equal(inGeometry(5, 5, square), false);
  assert.equal(inGeometry(12, 2, square), false);
  assert.equal(inGeometry(12, 2, { type: 'MultiPolygon', coordinates: [square.coordinates, [[[11, 1], [13, 1], [13, 3], [11, 3], [11, 1]]]] }), true);
});

test('census lookup: each point gets its block group, tract and ZIP from byte-range reads', async () => {
  const s = await rangeServer();
  try {
    const { byPin, failedFiles } = await lookupCensus(
      [
        { id: 'west', lat: 36.2, lng: -86.55, stateCode: 'TN' },
        { id: 'east', lat: 36.2, lng: -86.49, stateCode: 'tn' },
        { id: 'away', lat: 36.5, lng: -86.0, stateCode: 'TN' },
        { id: 'abroad', lat: 51.5, lng: -0.1, stateCode: 'XX' },
      ],
      'acs2024',
      s.url,
    );
    assert.deepEqual(failedFiles, []);
    const west = byPin.get('west')!;
    assert.equal(west.v, 'acs2024');
    assert.equal(west.bg?.id, '471890301001');
    assert.equal(west.tract?.id, '47189030100');
    assert.equal(west.zcta?.id, '37122');
    assert.equal(west.tract?.inc, 61148);
    assert.equal(west.tract?.own_pct, 34.3);
    const east = byPin.get('east')!;
    assert.equal(east.bg?.id, '471890302002');
    assert.equal(east.bg?.rel, 0, 'the very uncertain block group is flagged');
    assert.equal(east.tract?.inc, 98000);
    assert.deepEqual(byPin.get('away'), { v: 'acs2024' }, 'outside every area: nothing is guessed');
    assert.deepEqual(byPin.get('abroad'), { v: 'acs2024' });
  } finally {
    s.close();
  }
});

test('census lookup: a missing file is reported, never fatal', async () => {
  const s = await rangeServer();
  try {
    const { byPin, failedFiles } = await lookupCensus([{ id: 'p', lat: 36.2, lng: -86.55, stateCode: 'TN' }], 'acs2030', s.url);
    assert.equal(failedFiles.length, 3);
    assert.deepEqual(byPin.get('p'), { v: 'acs2030' });
  } finally {
    s.close();
  }
});
