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
