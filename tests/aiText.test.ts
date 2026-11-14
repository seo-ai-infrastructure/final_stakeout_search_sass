import test from 'node:test';
import assert from 'node:assert/strict';
import { tidyAiText } from '../apps/nextjs/src/lib/aiText';

test('the raw AI Overview text is tidied: no button labels, businesses with their details, labels joined to values', () => {
  // From a live report (McIntyre Painting, 14 Nov 2026).
  const raw = [
    'Top-rated residential and commercial painting companies serving Tennessee include local specialists with strong customer reviews and service guarantees:',
    'Top-Rated Local Painters',
    'McIntyre Painting Rated 5.0 out of 5, 53 reviews. ·Painter Closed ·Mt. Juliet, TN ·3.6 mi',
    'Call', 'Directions', 'Website', '•',
    'Location:', '230 Midway Drive, Mt. Juliet, TN',
    'Phone:', '(615) 509-5290',
    'Highlights:', 'Licensed contractor serving Wilson County, East Nashville, and Sumner County.',
    'Related results',
    'Painters Tennessee, LLC Rated 5.0 out of 5, 44 reviews. ·Painter Open ·Lebanon, TN ·7.2 mi',
    '2973 Mallard Dr, Lebanon, TN', '(615) 260-2326',
    'Family-owned, licensed, bonded, and insured Middle Tennessee contractor.',
    'Nash Painting - Related results',
    'Five Star Painting of Hendersonville Rated 4.9 out of 5, 136 reviews. ·Painter Open',
    '(615) 205-0732',
  ].join('\n');
  const out = tidyAiText(raw);
  const text = out.map((b) => b.text);
  for (const junk of ['Call', 'Directions', 'Website', '•', 'Nash Painting - Related results']) assert.ok(!text.includes(junk), junk + ' is removed');
  assert.deepEqual(out[0].kind, 'text');
  assert.deepEqual(out[1], { kind: 'heading', text: 'Top-Rated Local Painters' });
  assert.deepEqual(out[2], { kind: 'business', text: 'McIntyre Painting', meta: '5.0 (53 reviews) · Painter Closed · Mt. Juliet, TN · 3.6 mi' });
  assert.deepEqual(out.slice(3, 6).map((b) => b.text), ['Location: 230 Midway Drive, Mt. Juliet, TN', 'Phone: (615) 509-5290', 'Highlights: Licensed contractor serving Wilson County, East Nashville, and Sumner County.']);
  assert.deepEqual(out[6], { kind: 'heading', text: 'Related results' });
  assert.deepEqual(out.filter((b) => b.kind === 'business').map((b) => b.text), ['McIntyre Painting', 'Painters Tennessee, LLC', 'Five Star Painting of Hendersonville']);
  // an address or phone number under a business is detail text, never a heading
  assert.deepEqual(out.filter((b) => /Mallard|260-2326|205-0732/.test(b.text)).map((b) => b.kind), ['text', 'text', 'text']);
  assert.deepEqual(tidyAiText(''), []);
});
