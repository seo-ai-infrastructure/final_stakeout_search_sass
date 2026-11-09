import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWebResults } from '../apps/worker/src/xmlParser';

const page = (inner: string) => `<?xml version="1.0"?><hierarchy rotation="0">${inner}</hierarchy>`;
const node = (text: string, cls = 'android.widget.TextView') =>
  `<node index="0" text="${text}" resource-id="" class="${cls}" package="com.android.chrome" content-desc="" bounds="[0,0][100,100]" />`;

test('a real results page with no local listings is "no local results", not an error', () => {
  const r = parseWebResults(page(node('How much does interior painting cost?') + node('Mt. Juliet, Tennessee - From your device', 'android.widget.Button')), [], [], 'McIntyre Painting');
  assert.deepEqual(r.orderedBusinesses, []);
  assert.equal(r.targetRank, null);
  assert.equal(r.locationFromIp, false);
});

test('an unrecognisable page (no Google location line) is still rejected', () => {
  assert.throws(() => parseWebResults(page(node('Something went wrong')), [], [], 'McIntyre Painting'), /UNRECOGNIZED_RESULT_LAYOUT/);
});

test('the location line: "From your device" wins over an AI Overview sentence that comes first', () => {
  const r = parseWebResults(page(
    node('Based on your location, here are typical exterior painting costs in Wilson County.') +
    node('Mt. Juliet, Tennessee - From your device', 'android.widget.Button')), [], [], 'McIntyre Painting');
  assert.equal(r.locationSource, 'Mt. Juliet, Tennessee - From your device');
  assert.equal(r.locationFromIp, false);
});

test('the location line: with no device line, the IP line is still reported (and refused)', () => {
  const r = parseWebResults(page(node('Mt. Juliet, Tennessee - Based on your IP address', 'android.widget.Button')), [], [], 'McIntyre Painting');
  assert.equal(r.locationFromIp, true);
});
