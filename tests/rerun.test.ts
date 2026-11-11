import { test } from 'node:test';
import assert from 'node:assert/strict';

test('re-run ISP: a proxy failure in "Mix of ISPs" moves to the next ISP; other cases keep theirs', async () => {
  const { rerunIsp } = await import('../packages/core/rerun');
  const mix = ['Spectrum Business', 'Spectrum', 'Tillman Fiberco', 'Frontier Communications'];
  const gate = 'PROXY_GATE_REJECTED LIST_CITY_ISP:10064:NOT_RESIDENTIAL_AS53366';
  assert.equal(rerunIsp('Tillman Fiberco', 'mix', mix, gate), 'Frontier Communications');
  assert.equal(rerunIsp('Frontier Communications', 'mix', mix, gate), 'Spectrum Business', 'wraps around');
  assert.equal(rerunIsp('Tillman Fiberco', 'mix', ['Tillman Fiberco'], gate), '', 'no other ISP: any ISP');
  assert.equal(rerunIsp('Tillman Fiberco', 'single', mix, gate), 'Tillman Fiberco', 'a single chosen ISP is kept');
  assert.equal(rerunIsp('Tillman Fiberco', 'mix', mix, 'LOCATION_UNVERIFIED'), 'Tillman Fiberco', 'other failures keep theirs');
  assert.equal(rerunIsp(null, 'mix', mix, gate), 'Spectrum Business');
});

test('ISPs that cannot pass the residential check are never offered or accepted', async () => {
  const { ispOffered, parseSpec } = await import('../packages/core/grid');
  assert.equal(ispOffered('Tillman Fiberco'), false);
  assert.equal(ispOffered('  tillman fiberco '), false, 'whatever the case or spacing');
  assert.equal(ispOffered('Spectrum'), true);
  const base = { keyword: 'plumber', targetBusiness: 'x', centerLat: 28.04, centerLng: -81.95, gridSize: 3, spacingKm: 1.60934, scheduleType: 'once', targetType: 'mobile_chrome' };
  assert.throws(() => parseSpec({ ...base, ispMode: 'mix', isps: ['Spectrum', 'Tillman Fiberco'] }), /not available/);
  assert.deepEqual(parseSpec({ ...base, ispMode: 'mix', isps: ['Spectrum', 'Frontier Communications'] }).isps, ['Spectrum', 'Frontier Communications']);
});
