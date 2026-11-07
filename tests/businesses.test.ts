import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBusiness } from '../packages/core/businesses';

const base = { name: '  McIntyre   Painting ', centerLat: 36.1999, centerLng: -86.5251, keywords: ['exterior painting contractors near me', 'Exterior Painting Contractors Near Me', ' painters near me ', ''] };

test('businesses: names and keywords are cleaned and de-duplicated', () => {
  const b = parseBusiness(base);
  assert.equal(b.name, 'McIntyre Painting');
  assert.deepEqual(b.keywords, ['exterior painting contractors near me', 'painters near me']);
  assert.equal(b.targetType, 'mobile_chrome');
  assert.equal(b.gridSize, 7);
  assert.equal(b.ispMode, 'any');
  assert.deepEqual(b.isps, []);
});

test('businesses: missing name, centre or keywords are refused clearly', () => {
  assert.throws(() => parseBusiness({ ...base, name: ' ' }), /business name/);
  assert.throws(() => parseBusiness({ ...base, centerLat: 'x' }), /grid centre/);
  assert.throws(() => parseBusiness({ ...base, keywords: [] }), /keyword/);
});

test('businesses: out-of-range settings fall back to safe defaults', () => {
  const b = parseBusiness({ ...base, gridSize: 8, spacingKm: 99, targetType: 'x', scheduleType: 'hourly', ispMode: 'single', isps: ['Comcast'] });
  assert.equal(b.gridSize, 7);
  assert.equal(b.spacingKm, 10);
  assert.equal(b.targetType, 'mobile_chrome');
  assert.equal(b.scheduleType, 'once');
  assert.deepEqual(b.isps, ['Comcast']);
});
