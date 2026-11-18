import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAiParts, kgmidOf, siteDomain, sameSite } from '../packages/core/aiParts';

const fx = (f: string) => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
const link = (id: string, q = '') => '(https://www.google.com/search?kgmid=' + encodeURIComponent(id) + (q ? '&q=' + q : '') + ')';

test("a business's Google ID and website, as typed or pasted", () => {
  assert.equal(kgmidOf('/g/11cs6bzst7'), '/g/11cs6bzst7');
  assert.equal(kgmidOf('https://www.google.com/search?kgmid=%2Fg%2F11cs6bzst7&q=McIntyre+Painting'), '/g/11cs6bzst7');
  assert.equal(kgmidOf('%2Fg%2F1tl4dvfz'), '/g/1tl4dvfz');
  assert.equal(kgmidOf(' /G/11sj_1g57_ '), '/g/11sj_1g57_');
  assert.equal(kgmidOf('FAILED_OR_SKIPPED'), '', "Google's placeholder for a business it could not tie to a listing");
  assert.equal(kgmidOf('McIntyre Painting'), '');
  assert.equal(kgmidOf(null), '');
  assert.equal(siteDomain('https://www.McIntyrePaintingTN.com/about'), 'mcintyrepaintingtn.com');
  assert.equal(siteDomain('mcintyrepaintingtn.com'), 'mcintyrepaintingtn.com');
  assert.equal(siteDomain('m.yelp.com'), 'yelp.com');
  assert.equal(siteDomain('not a site'), '');
  assert.equal(siteDomain(''), '');
  assert.equal(sameSite('lakeland.rotorooter.com', 'https://www.rotorooter.com/'), true);
  assert.equal(sameSite('rotorooter.com.evil.example', 'rotorooter.com'), false);
  assert.equal(sameSite('notrotorooter.com', 'rotorooter.com'), false);
});

test('Position 0: the brands the opening answer links, with their phones, in order (Lakeland, 16 Nov)', () => {
  const text = [
    "For immediate 24/7 emergency plumbing in Lakeland, FL, call Stuart's Plumbing " + link('/g/1tl4dvfz') + ' at (863) 877-3108, Benjamin Franklin Plumbing ' + link('/g/11sj_1g57_') +
      ' at (863) 322-0012, or 1-Tom-Plumber Lakeland ' + link('/g/11lf92nyhd') + ' at (863) 225-1411. [1] (https://www.google.com/searchviewer/10?svid=X), [2] (https://www.google.com/searchviewer/10?svid=Y)',
    '',
    'Quick Comparison (Open 24 Hours in Lakeland)',
    '',
    'Plumber\tRating\tAddress',
    'Roto-Rooter Plumbing & Drain Services ' + link('/g/1yh9tpsm4') + '\t4.7/5 (1,044 reviews)\t2306 Old Combee Rd #101',
    '',
    'Additional 24/7 Lakeland & Nearby Options',
    '',
    'AP Drain Service LLC Plumbing And Septic ' + link('/g/11pdftymfq', 'AP+Drain+Service+LLC+Plumbing+And+Septic'),
    '5.0(67) · Plumber',
    'Open · 4856 S Dossey Rd · 4.3 mi',
    'Rated 5.0/5 (67 reviews); open 24 hours. [1] (https://www.google.com/searchviewer/10?svid=Z)',
    'Start 2 Finish Plumbing (https://www.google.com/search?kgmid=FAILED_OR_SKIPPED&q=Start+2+Finish+Plumbing)',
    'Available 24 hours via Plumbing Repair Services or by calling (863) 845-1313. [1] (https://www.plumberlakelandfl.com/plumbing-repair)',
    '',
    'Before help arrives, see the checklist. [1] (https://www.example-guide.com/checklist)',
  ].join('\n');
  const p = readAiParts(text)!;
  assert.deepEqual(p.p0.brands, [
    { name: "Stuart's Plumbing", kgmid: '/g/1tl4dvfz', phone: '(863) 877-3108' },
    { name: 'Benjamin Franklin Plumbing', kgmid: '/g/11sj_1g57_', phone: '(863) 322-0012' },
    { name: '1-Tom-Plumber Lakeland', kgmid: '/g/11lf92nyhd', phone: '(863) 225-1411' },
  ]);
  assert.deepEqual(p.p0.sites, [], "Google's own viewer links are never a cited website");
  assert.deepEqual(
    p.cards.map((c) => [c.name, c.kgmid, c.sites]),
    [
      ['AP Drain Service LLC Plumbing And Septic', '/g/11pdftymfq', []],
      ['Start 2 Finish Plumbing', '', ['plumberlakelandfl.com']],
    ],
  );
  // Named only in a comparison table: none of the three parts, kept as a mention.
  assert.deepEqual(p.mentions, [{ name: 'Roto-Rooter Plumbing & Drain Services', kgmid: '/g/1yh9tpsm4' }]);
  assert.deepEqual(p.other, ['example-guide.com']);
});

test('Position 0: a brand linked with its phone inside the link, and a website cited in the opening answer', () => {
  const text =
    "For 24/7 service in Lakeland, FL, contact Stuart's Plumbing at (863) 877-3108 " + link('/g/1tl4dvfz') + ' or Roto-Rooter Plumbing & Drain Services ' + link('/g/1yh9tpsm4') +
    ' at (863) 940-4270. [1] (https://www.rotorooter.com/lakeland/), [2] (https://www.google.com/maps/place/x)';
  const p = readAiParts(text)!;
  assert.deepEqual(p.p0.brands, [
    { name: "Stuart's Plumbing", kgmid: '/g/1tl4dvfz', phone: '(863) 877-3108' },
    { name: 'Roto-Rooter Plumbing & Drain Services', kgmid: '/g/1yh9tpsm4', phone: '(863) 940-4270' },
  ]);
  assert.deepEqual(p.p0.sites, ['rotorooter.com']);
  assert.deepEqual([p.cards, p.other, p.mentions], [[], [], []]);
});

test('real copies: an opening answer citing a website, cards with their own sites, closing citations', () => {
  const hvac = readAiParts(fx('real-aio-copy-hvac-2026-11-13.txt'))!;
  assert.deepEqual(hvac.p0.brands, []);
  assert.deepEqual(hvac.p0.sites, ['homequotr.com']);
  assert.equal(hvac.cards.length, 5);
  assert.ok(hvac.other.includes('hvacpro.ai'));
  const plumbers = readAiParts(fx('real-aio-copy-2026-11-09.txt'))!;
  assert.match(plumbers.p0.text, /^Here are top-rated 24\/7 emergency plumbers/);
  assert.deepEqual(plumbers.p0.brands, []);
  const lee = plumbers.cards.find((c) => c.name === 'Lee Company')!;
  assert.deepEqual([lee.kgmid, lee.sites], ['/g/1q5grk4dl', ['leecompany.com']]);
  // An answer that opens straight with a card has no opening answer at all.
  const cardsOnly = readAiParts(fx('real-aio-copy.txt').split('\n').slice(1).join('\n'))!;
  assert.equal(cardsOnly.p0.text, '');
  assert.equal(cardsOnly.cards[0].name, 'Great Plumber of Mt. Juliet');
  assert.equal(readAiParts(''), null);
  assert.equal(readAiParts(null), null);
});
