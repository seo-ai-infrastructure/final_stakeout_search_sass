import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ispLabel } from '../apps/nextjs/src/lib/ispLabel';

test('the ISP on a receipt: the chosen name, or the observed provider tidied up (real records)', () => {
  const charter = 'AS33363 Charter Communications, Inc · Charter Communications · Spectrum · AS33363 Charter Communications, Inc';
  assert.equal(ispLabel({ ispRequested: 'Spectrum', ispMatched: true, ispObserved: charter }), 'Spectrum');
  assert.equal(ispLabel({ ispRequested: 'ANY', ispObserved: charter }), 'Charter Communications');
  assert.equal(ispLabel({ ispRequested: 'ANY', ispObserved: 'AS7922 Comcast Cable Communications, LLC · Comcast Cable Communications, LLC · Comcast Cable Communications, Inc. · AS7922 Comcast Cable Communications, LLC' }), 'Comcast Cable Communications');
  assert.equal(ispLabel({ ispRequested: 'ANY', ispObserved: 'AS4181 TDS TELECOM · TDS TELECOM · TDS TELECOM · AS4181 TDS TELECOM' }), 'TDS Telecom');
  assert.equal(ispLabel({ ispRequested: 'ANY', ispObserved: 'AS5650 Verizon Business · Frontier Communications Corporation · Frontier Communications Solutions' }), 'Frontier Communications');
  assert.equal(ispLabel({ ispRequested: 'ANY', org: 'AS5650 Verizon Business' }), 'Verizon Business', 'falls back to the network owner');
  assert.equal(ispLabel({ ispRequested: 'Comcast Cable', ispMatched: false, ispObserved: charter }), 'Charter Communications', 'a mismatch shows what was really used');
  const frontier = 'AS5650 Verizon Business · Frontier Communications Corporation · Frontier Communications Solutions · AS5650 Verizon Business';
  assert.equal(ispLabel({ ispRequested: 'Frontier Communications', ispMatched: true, ispObserved: frontier }), 'Frontier Communications');
  assert.equal(ispLabel({ ispRequested: 'ANY', ispObserved: frontier }), 'Frontier Communications', 'not Verizon: that is only the registry owner of the address block');
  assert.equal(ispLabel({ ispRequested: 'ANY', org: 'AS33363 Charter Communications, Inc' }), 'Charter Communications');
  assert.equal(ispLabel({ ispRequested: 'ANY' }), null);
  assert.equal(ispLabel(null), null);
});
