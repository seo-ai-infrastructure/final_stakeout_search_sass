import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { untarGz, readResultsPage, readLocalFinder, rankIn, sameBusiness, parseCard } from '../packages/core/serpEvidence';

const fx = (f: string) => readFileSync(new URL('./fixtures/' + f, import.meta.url));

test('evidence: a real bundle unpacks to its video and both snapshots', () => {
  const files = untarGz(fx('mini-bundle.tar.gz'));
  const names = [...files.keys()];
  for (const f of ['video.mp4', 'serp.xml', 'final.xml']) assert.ok(names.some((n) => n.endsWith('/' + f)), f);
  const serp = [...files].find(([n]) => n.endsWith('/serp.xml'))![1].toString('utf8');
  assert.equal(serp, fx('real-r3c2-serp.xml').toString('utf8'));
});

test('evidence: the real results page, in Google order, ads labelled and unranked', () => {
  const p = readResultsPage(fx('real-r3c2-serp.xml').toString('utf8'));
  assert.equal(p.location, 'Mt. Juliet, TN');
  assert.equal(p.googleLocation, 'Mt. Juliet, Tennessee - From your device');
  assert.equal(p.localServicesAds.title, 'Painters | Mt. Juliet');
  assert.deepEqual(p.localServicesAds.listings.map((l) => [l.name, l.ad]), [['Those Guys Painting Co', true], ['PaintPro LLC', true], ['A1 Painting LLC', true]]);
  assert.deepEqual(p.pack.map((l) => [l.name, l.ad, l.pos]), [
    ["Hunter's Painting", true, null],
    ['Steve And Son Painting', false, 1],
    ['McIntyre Painting', false, 2],
    ['Mount Juliet Painting', false, 3],
  ]);
  const mc = p.pack.find((l) => l.name === 'McIntyre Painting')!;
  assert.equal(mc.rating, '5.0'); assert.equal(mc.reviews, '53'); assert.match(mc.quote ?? '', /quality of the/);
  assert.equal(p.peopleAlsoSearch.length, 6);
  assert.equal(p.web[0].site, 'CertaPro Painters');
  assert.ok(p.web.some((w) => w.ad && /Nashville Painting Company/.test(w.title)), 'sponsored web result');
  assert.equal(rankIn(p.pack, 'McIntyre Painting'), 2);
});

test('evidence: the real Local Finder keeps an advertiser that also ranks organically', () => {
  const f = readLocalFinder(fx('real-r3c2-finder.xml').toString('utf8'));
  assert.equal(f.filter((l) => l.ad).length, 4);
  assert.equal(f.filter((l) => !l.ad).length, 10);
  assert.deepEqual(f.filter((l) => l.ad).map((l) => l.name), ['Those Guys Painting Co', "Hunter's Painting", 'A1 Painting LLC', 'Nashville Painting Company']);
  assert.equal(rankIn(f, 'McIntyre Painting'), 2);
  assert.equal(rankIn(f, 'Those Guys Painting Co'), 5, 'the organic copy is kept, not deduped against its ad');
});

test('evidence: business names match across LLC, Inc, & and punctuation', () => {
  assert.ok(sameBusiness('Painters Tennessee, LLC', 'painters tennessee'));
  assert.ok(sameBusiness('Steinger, Greene & Feiner', 'Steinger Greene and Feiner'));
  assert.ok(!sameBusiness('McIntyre Painting', 'Mount Juliet Painting'));
  assert.equal(parseCard('Plain text without a rating'), null);
});

test('evidence: the copied AI Overview yields businesses with Google ids, in order', async () => {
  const { readAiCopy } = await import('../packages/core/serpEvidence');
  const text = fx('real-aio-copy.txt').toString('utf8');
  const a = readAiCopy(text, ['24/7 emergency plumbers serving Mt. Juliet, Tennessee:', 'Great Plumber of Mt. Juliet']);
  assert.equal(a.verified, true);
  assert.deepEqual(a.businesses.map((b) => [b.pos, b.name, b.kgmid]), [
    [1, 'Great Plumber of Mt. Juliet', '/g/11z8421vy4'],
    [2, 'Metro State Plumbing Services', '/g/11l2k9n227'],
    [3, 'Mt. Juliet Plumbing And Leak Detection', '/g/11jj4sc8cf'],
    [4, 'Roto-Rooter', '/g/11bbwnlg3g'],
    [5, 'Lee Company', '/g/1q5grk4dl'],
  ]);
  const lee = a.businesses[4];
  assert.deepEqual([lee.rating, lee.reviews, lee.category], ['4.8', '1.3K', 'HVAC contractor']);
  assert.ok(a.businesses[3].lines.some((l) => /\$55 Off/.test(l)), 'offers kept');
  assert.equal(a.citations.length, 4);
  assert.deepEqual(a.intro, ['24/7 emergency plumbers serving Mt. Juliet, Tennessee:']);
});

test('evidence: a stale clipboard (not in this run’s AI Overview) is never verified', async () => {
  const { readAiCopy } = await import('../packages/core/serpEvidence');
  const a = readAiCopy(fx('real-aio-copy.txt').toString('utf8'), ['Best exterior painters in Mt. Juliet', 'McIntyre Painting']);
  assert.equal(a.verified, false);
  assert.equal(readAiCopy(fx('real-aio-copy.txt').toString('utf8')).verified, false, 'no snapshot to check against');
});

test('evidence: a results page whose AI Overview lists businesses is not a Local Finder', async () => {
  const { isLocalFinder, readLocalFinder, readAiOverview } = await import('../packages/core/serpEvidence');
  const page = fx('real-aio-list-no-finder.xml').toString('utf8');
  assert.equal(isLocalFinder(page), false);
  assert.deepEqual(readLocalFinder(page), [], 'nothing is read as Finder listings');
  const names = readAiOverview(page)!.businesses.map((b) => b.name);
  assert.ok(names.includes('Great Plumber of Mt.Juliet'));
  for (const ad of ['SteadyFlo Plumbing & Septic', 'Busy Bee Plumbing Heating & Air Conditioning', 'Robbins Plumbing and Drain Cleaning LLC'])
    assert.ok(!names.includes(ad), ad + ' is a Local Services Ad after the AI Overview, not an AI business');
  assert.equal(isLocalFinder(fx('real-r3c2-finder.xml').toString('utf8')), true, 'the real Local Finder still is one');
});

test('evidence: the AI Overview ends at its footer; ads after it are not in its list', async () => {
  const { readAiOverview } = await import('../packages/core/serpEvidence');
  const ai = readAiOverview(fx('real-aio-expanded-related.xml').toString('utf8'))!;
  // Every card inside the AI Overview counts, in order; "Related results" buttons close groups.
  assert.deepEqual(ai.businesses.map((b) => [b.pos, b.name]), [
    [1, 'Great Plumber of Mt.Juliet'],
    [2, 'Southern Skye Plumbing'],
    [3, 'Music City Plumbing And Solutions'],
    [4, 'Mr. Rooter Plumbing of Mt. Juliet'],
    [5, 'Mid-Tn Plumbing'],
    [6, 'Lee Company'],
    [7, 'Roto-Rooter Plumbing & Water Cleanup'],
  ]);
  assert.deepEqual(ai.related, []);
});

test('evidence: real AI Overview with no map pack: all 6 cards in order, across "Related results" buttons', async () => {
  const { readAiOverview, isLocalFinder } = await import('../packages/core/serpEvidence');
  const x = fx('real-uidump-aio-no-map-pack.xml').toString('utf8');
  assert.equal(isLocalFinder(x), false);
  assert.ok(!/text="More businesses"/.test(x), 'no map pack, so no More businesses');
  assert.deepEqual(readAiOverview(x)!.businesses.map((b) => b.name), [
    'Great Plumber of Mt. Juliet', 'Mt. Juliet Plumbing And Leak Detection', 'Southern Skye Plumbing',
    'Lee Company', 'Mid-TN Plumbing', 'Mr. Rooter Plumbing of Mt. Juliet',
  ]);
});

test('evidence: real map-pack page: the 3-pack in order, its ad labelled, Google location from the device', async () => {
  const { readResultsPage, isLocalFinder } = await import('../packages/core/serpEvidence');
  const x = fx('real-uidump-mappack-noaio.xml').toString('utf8');
  const page = readResultsPage(x);
  assert.equal(isLocalFinder(x), false);
  assert.equal(page.googleLocation, 'Mt. Juliet, Tennessee - From your device');
  assert.deepEqual(page.pack.map((b) => (b.ad ? 'ad: ' : b.pos + ': ') + b.name), [
    'ad: Nashville Painting Company', '1: Steve And Son Painting', '2: McIntyre Painting', '3: Mount Juliet Painting',
  ]);
});
