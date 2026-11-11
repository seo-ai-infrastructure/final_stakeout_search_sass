import { test } from 'node:test';
import assert from 'node:assert/strict';

test('re-run ISP: a proxy failure in "Mix of ISPs" moves to the next ISP; other cases keep theirs', async () => {
  const { rerunIsp } = await import('../packages/core/rerun');
  const mix = ['Spectrum Business', 'Spectrum', 'Tillman Fiberco', 'Frontier Communications'];
  const gate = 'PROXY_GATE_REJECTED LIST_CITY_ISP:10064:NOT_RESIDENTIAL_AS53366';
  assert.equal(rerunIsp('Tillman Fiberco', 'mix', mix, gate), 'Frontier Communications');
  assert.equal(rerunIsp('Frontier Communications', 'mix', mix, gate), 'Spectrum Business', 'wraps around');
  assert.equal(rerunIsp('Tillman Fiberco', 'mix', ['Tillman Fiberco'], gate), '', 'no other ISP: any ISP');
  assert.equal(rerunIsp('Tillman Fiberco', 'one', mix, gate), 'Tillman Fiberco', '"One ISP" keeps the chosen ISP');
  assert.equal(rerunIsp('Tillman Fiberco', 'mix', mix, 'LOCATION_UNVERIFIED'), 'Tillman Fiberco', 'other failures keep theirs');
  assert.equal(rerunIsp(null, 'mix', mix, gate), 'Spectrum Business');
});
