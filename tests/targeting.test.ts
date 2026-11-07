import test from 'node:test';
import assert from 'node:assert/strict';
import {
  targetingLadder,
  targetedLogin,
  targetableIspCodes,
  parseIdMap,
  citySuffix,
  regionMatchesState,
  cityMatches,
} from '../packages/core/proxySeller';
import {
  deviceMatchesProfile,
  profilesForDevice,
  phoneModels,
} from '../packages/core/hardware';

const pin = { zip: '33801', city: 'Lakeland', stateCode: 'FL' };
const env = {
  PROXY_ISP_IDS_JSON: '{"Charter Communications":"51811","Bad":"x1"}',
  PROXY_STATE_IDS_JSON: '{"FL":"1906"}',
};

test('ISP rungs come first and use the documented suffix order', () => {
  const ladder = targetingLadder(pin, 'Charter Communications', env);
  assert.deepEqual(
    ladder.map((r) => [r.rung, r.suffix, r.ispApplied]),
    [
      ['ZIP_ISP', '_c_US_isp_51811_zip_33801', true],
      ['CITY_ISP', '_c_US_city_Lakeland_isp_51811', true],
      ['STATE_ISP', '_c_US_sd_1906_isp_51811', true],
      ['ZIP', '_c_US_zip_33801', false],
      ['CITY', '_c_US_city_Lakeland', false],
      ['STATE', '_c_US_sd_1906', false],
    ],
  );
});

test('Any ISP or an unmapped ISP never claims an ISP rule', () => {
  for (const isp of ['ANY', 'Verizon Communications'])
    assert.ok(targetingLadder(pin, isp, env).every((r) => !r.ispApplied));
  assert.deepEqual(targetableIspCodes(env), ['ANY', 'Charter Communications']);
  assert.deepEqual(parseIdMap(env.PROXY_ISP_IDS_JSON), { 'Charter Communications': '51811' });
  assert.throws(() => parseIdMap('{not json'), /INVALID_JSON/);
});

test('logins carry a pinned session and safe city names', () => {
  assert.equal(
    targetedLogin('base', '_c_US_city_New-York', 'ab12cd34'),
    'base_c_US_city_New-York_s_ab12cd34_ttl_30m',
  );
  assert.throws(() => targetedLogin('base', '', 'bad id!'), /SESSION/);
  assert.equal(citySuffix("Coeur d'Alene"), 'Coeur-dAlene');
  assert.equal(citySuffix('San José'), 'San-Jose');
});

test('exit location checks accept names or codes', () => {
  assert.ok(regionMatchesState('Florida', 'FL'));
  assert.ok(regionMatchesState('FL', 'fl'));
  assert.ok(!regionMatchesState('Georgia', 'FL'));
  assert.ok(!regionMatchesState('', 'FL'));
  assert.ok(cityMatches('Saint Petersburg', 'St Petersburg'));
});

test('hardware is matched to the requested profile only', () => {
  assert.ok(deviceMatchesProfile({ hardwareModel: 'SM-S918U' }, 'Galaxy S23 Ultra', {}));
  assert.ok(deviceMatchesProfile({ hardwareModel: ' pixel 5 ' }, 'Pixel 5', {}));
  assert.ok(!deviceMatchesProfile({ hardwareModel: 'Pixel 5' }, 'Galaxy S23 Ultra', {}));
  assert.ok(!deviceMatchesProfile({ hardwareModel: null }, 'Pixel 5', {}));
  // Scans run on any free phone.
  assert.ok(deviceMatchesProfile({ hardwareModel: 'Pixel 5' }, 'Any', {}));
  assert.ok(deviceMatchesProfile({ hardwareModel: null }, 'Any', {}));
  assert.ok(
    deviceMatchesProfile({ hardwareModel: 'SM-S918N' }, 'Galaxy S23 Ultra', {
      HARDWARE_MODEL_ALIASES_JSON: '{"Galaxy S23 Ultra":["SM-S918N"]}',
    }),
  );
  assert.deepEqual(profilesForDevice({ hardwareModel: 'SM-S926U' }, {}), [
    { brand: 'Samsung', model: 'Galaxy S24+' },
  ]);
  // Every selectable profile has at least one accepted Android model.
  for (const models of Object.values(phoneModels))
    for (const m of models)
      assert.ok(profilesForDevice({ hardwareModel: m }, {}).some((p) => p.model === m));
});
