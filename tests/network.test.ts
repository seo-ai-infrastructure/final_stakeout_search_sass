import test from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_LABELS, asScanNetwork, pinNetwork, placedLayout, pointPrice, scanCost } from '../packages/core/network';
import { placedPins } from '../packages/core/grid';
import { pinOutageKey } from '../packages/core/proxyWait';

const grid = (n: number) => Array.from({ length: n * n }, (_, i) => ({ rowIdx: Math.floor(i / n), colIdx: i % n }));

test('the three network options', () => {
  assert.deepEqual(Object.values(NETWORK_LABELS), ['Residential Network', 'Mobile Network', 'Mix of Both: Mobile & Residential Networks']);
  assert.equal(asScanNetwork('mix'), 'mix');
  assert.equal(asScanNetwork('mobile'), 'mobile');
  assert.equal(asScanNetwork(undefined), 'residential');
  assert.equal(asScanNetwork('isp'), 'residential');
});

test('a mix alternates like a checkerboard, so every point keeps its network on every run', () => {
  assert.equal(pinNetwork('mix', 0, 0), 'mobile');
  assert.equal(pinNetwork('mix', 0, 1), 'residential');
  assert.equal(pinNetwork('mix', 1, 0), 'residential');
  assert.equal(pinNetwork('mix', 2, 2), 'mobile');
  assert.equal(pinNetwork('mobile', 0, 1), 'mobile');
  assert.equal(pinNetwork('residential', 0, 0), 'residential');
  assert.equal(pinNetwork(null, 0, 0), 'residential');
  // 5×5: 13 mobile points (the centre among them) and 12 residential.
  assert.equal(grid(5).filter((p) => pinNetwork('mix', p.rowIdx, p.colIdx) === 'mobile').length, 13);
});

test('price: 1 credit a residential point, the mobile price a mobile point', () => {
  assert.equal(scanCost('residential', grid(5), 2), 25);
  assert.equal(scanCost('mobile', grid(5), 2), 50);
  assert.equal(scanCost('mix', grid(5), 2), 13 * 2 + 12);
  assert.equal(scanCost('mix', grid(5), 3), 13 * 3 + 12);
});

test('refunds and re-runs give back what each point cost, even after the price changes', () => {
  const pins = grid(5);
  const mix = pointPrice({ network: 'mix', creditsCharged: 38, totalPins: 25 }, pins);
  assert.equal(mix({ rowIdx: 0, colIdx: 0 }), 2);
  assert.equal(mix({ rowIdx: 0, colIdx: 1 }), 1);
  assert.equal(pinsTotal(pins, mix), 38);
  // Bought at 3 credits a mobile point: still 3 when refunded.
  assert.equal(pointPrice({ network: 'mix', creditsCharged: 51, totalPins: 25 }, pins)({ rowIdx: 2, colIdx: 2 }), 3);
  assert.equal(pointPrice({ network: 'mix', creditsCharged: 0, totalPins: 25 }, pins)({ rowIdx: 0, colIdx: 0 }), 0);
  assert.equal(pointPrice({ network: 'mobile', creditsCharged: 50, totalPins: 25 }, pins)({ rowIdx: 0, colIdx: 1 }), 2);
  assert.equal(pointPrice({ network: 'residential', creditsCharged: 25, totalPins: 25 }, pins)({ rowIdx: 0, colIdx: 0 }), 1);
});
const pinsTotal = (pins: { rowIdx: number; colIdx: number }[], f: (p: { rowIdx: number; colIdx: number }) => number) => pins.reduce((n, p) => n + f(p), 0);

test('placed points get the same rows and columns on the page as on the server', () => {
  const centre = { lat: 28.0395, lng: -81.9498 };
  const areas = [
    { lat: 28.07, lng: -81.99 }, { lat: 28.02, lng: -81.9 }, { lat: 28.1, lng: -81.95 }, { lat: 27.99, lng: -81.97 },
    { lat: 28.05, lng: -82.01 }, { lat: 28.0, lng: -81.92 }, { lat: 28.08, lng: -81.93 }, { lat: 28.03, lng: -81.98 },
  ];
  const server = placedPins(centre, areas, [3, 5, 7, 9])!;
  const page = placedLayout([centre, ...areas], [3, 5, 7, 9]);
  assert.equal(page.gridSize, server.gridSize);
  assert.deepEqual(page.cells.map((c) => [c.rowIdx, c.colIdx, c.lat, c.lng]), server.pins.map((p) => [p.rowIdx, p.colIdx, p.lat, p.lng]));
});

test('in a mix, each point’s proxy outages count towards its own network', () => {
  const scan = { proxyRegion: 'Florida', stateCode: 'FL', network: 'mix' };
  assert.equal(pinOutageKey({ rowIdx: 0, colIdx: 0, scan }), 'Florida (mobile data)');
  assert.equal(pinOutageKey({ rowIdx: 0, colIdx: 1, scan }), 'Florida');
});
