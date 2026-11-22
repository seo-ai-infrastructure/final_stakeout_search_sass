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

test("evidence: the map pack's link to its full list is recorded (a run that never opened it is retried)", () => {
  assert.equal(readResultsPage(fx('real-r3c2-serp.xml').toString('utf8')).packMore, 'More businesses');
  assert.equal(readResultsPage(fx('real-pack4-see-more-2026-11-12.xml').toString('utf8')).packMore, 'See more on Google');
  assert.equal(readResultsPage(fx('real-aio-list-no-finder.xml').toString('utf8')).packMore, null); // no pack: nothing to open
});

test('evidence: the words each page was searched for (a warm-up page is never taken for the keyword)', async () => {
  const { searchedQuery, sameQuery, otherSearch } = await import('../packages/core/serpEvidence');
  assert.equal(searchedQuery(fx('real-r3c2-serp.xml').toString('utf8')), 'exterior painting contractors near me');
  assert.equal(searchedQuery(fx('real-r3c2-finder.xml').toString('utf8')), 'exterior painting contractors near me'); // the Local Finder too
  assert.equal(searchedQuery(fx('real-maps-results-top-2026-11-10.xml').toString('utf8')), null); // the Maps app: nothing concluded
  assert.equal(searchedQuery(null), null);
  // A run whose keyword was never typed is still on its warm-up search (15 Nov, pl5Iw):
  const warm = '<hierarchy><node class="android.webkit.WebView" text="things to do today - Google Search" content-desc="" /></hierarchy>';
  assert.equal(searchedQuery(warm), 'things to do today');
  assert.equal(sameQuery('things to do today', 'emergency plumber near me'), false);
  assert.equal(sameQuery('emergency plumber', 'emergency plumber near me'), false);
  assert.equal(sameQuery('Emergency  plumber near me ', 'emergency plumber near me'), true);
  assert.equal(sameQuery('joe\u2019s plumbing', "Joe's Plumbing"), true);
  assert.equal(sameQuery('24/7 plumber', '24 7 plumber'), true);
  // What the worker refuses: a page for another search. Real pages for the keyword pass.
  assert.equal(otherSearch(warm, 'emergency plumber near me'), 'things to do today');
  assert.equal(otherSearch(fx('real-r3c2-serp.xml').toString('utf8'), 'Exterior painting contractors near me'), null);
  assert.equal(otherSearch(fx('real-maps-results-top-2026-11-10.xml').toString('utf8'), 'emergency plumber'), null);
  const related = '<hierarchy><node class="android.webkit.WebView" text="emergency plumber near me open now - Google Search" content-desc="" /></hierarchy>';
  assert.equal(otherSearch(related, 'emergency plumber near me'), 'emergency plumber near me open now');
  // A spelling correction is still the keyword's own search:
  const fixed = '<hierarchy><node class="android.webkit.WebView" text="plumbers near me - Google Search" content-desc="" />' +
    '<node class="android.view.View" text="Search instead for plumers near me" content-desc="" /></hierarchy>';
  assert.equal(otherSearch(fixed, 'plumers near me'), null);
  const fixedSplit = '<hierarchy><node class="android.webkit.WebView" text="plumbers near me - Google Search" content-desc="" />' +
    '<node class="android.view.View" text="Search instead for" content-desc="" /><node class="android.view.View" text="plumers near me" content-desc="" /></hierarchy>';
  assert.equal(otherSearch(fixedSplit, 'plumers near me'), null);
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

test('real Local Finder (9 Nov): 10 organic in Google order, 7 ads labelled, worker agrees', async () => {
  const { isLocalFinder, readLocalFinder } = await import('../packages/core/serpEvidence');
  const { parseWebResults } = await import('../apps/worker/src/xmlParser');
  const x = fx('real-lf-2026-11-09.xml').toString('utf8');
  const organic = [
    'Great Plumber of Mt.Juliet', 'Southern Skye Plumbing', 'Music City Plumbing And Solutions', 'Metro State Plumbing services',
    'Mt. Juliet Plumbing And Leak Detection', 'P&G Service Company', "Arvin's Plumbing", 'Covert Plumbing', 'Southern Sun Plumbing',
    'Rapid Response Plumbing, Heating & Cooling',
  ];
  assert.equal(isLocalFinder(x), true);
  const lf = readLocalFinder(x);
  assert.deepEqual(lf.filter((l) => !l.ad).map((l) => l.name), organic);
  assert.equal(lf.filter((l) => l.ad).length, 7);
  assert.deepEqual(parseWebResults(x, [], [], 'Covert Plumbing').orderedBusinesses, organic);
  assert.equal(parseWebResults(x, [], [], 'Covert Plumbing').targetRank, 8);
});

test('real map pack (9 Nov): the same top 3 as the Local Finder, its ad labelled', async () => {
  const { readResultsPage, isLocalFinder } = await import('../packages/core/serpEvidence');
  const x = fx('real-pack-2026-11-09.xml').toString('utf8');
  assert.equal(isLocalFinder(x), false);
  assert.deepEqual(readResultsPage(x).pack.map((b) => (b.ad ? 'ad: ' : b.pos + ': ') + b.name), [
    'ad: Pioneer Heating, Cooling, Electrical & Plumbing', '1: Great Plumber of Mt.Juliet', '2: Southern Skye Plumbing', '3: Music City Plumbing And Solutions',
  ]);
});

test('real AI Overview without a map pack (9 Nov): 8 businesses in order, McIntyre Painting first', async () => {
  const { readAiOverview, isLocalFinder, sameBusiness } = await import('../packages/core/serpEvidence');
  const x = fx('real-aio-2026-11-09.xml').toString('utf8');
  assert.equal(isLocalFinder(x), false);
  const names = readAiOverview(x)!.businesses.map((b) => b.name);
  assert.deepEqual(names, [
    'McIntyre Painting', 'Paint EZ of Nashville', 'Pointer Painting', 'Those Guys Painting Co',
    'EastNashville CB LLC', 'Fresh Coat Painters of East Nashville', 'Cumberland Painting', 'The Ville Painting Co, LLC',
  ]);
  assert.equal(names.findIndex((n) => sameBusiness(n, 'McIntyre Painting')) + 1, 1, 'the AI-list rank the worker would store');
});

test("real AI Overview: Google's own copy and the snapshot list the same 6 businesses in the same order", async () => {
  const { readAiCopy, readAiOverview, uiLabels } = await import('../packages/core/serpEvidence');
  const snap = fx('real-uidump-aio-no-map-pack.xml').toString('utf8');
  const copy = readAiCopy(fx('real-aio-copy-2026-11-09.txt').toString('utf8'), uiLabels(snap).map((l) => l.label));
  assert.equal(copy.verified, true);
  assert.deepEqual(copy.businesses.map((b) => b.name), readAiOverview(snap)!.businesses.map((b) => b.name));
  assert.deepEqual(copy.businesses.map((b) => b.kgmid), ['/g/11z8421vy4', '/g/11jj4sc8cf', '/g/11vbjvks67', '/g/1q5grk4dl', '/g/11nnp_f2z4', '/g/11qqtb5hl0']);
  assert.ok(copy.citations.some((c) => c.url === 'https://midtnplumbing.net/'), 'cited websites are kept');
});

test('first screen: a folded AI Overview holds only the cards it shows; one shown whole holds them all', async () => {
  const { aiOverviewFold, cardsBeforeExpansion } = await import('../packages/core/serpEvidence');
  // The same search, folded (2 cards above "Show more AI Overview") and opened (7 cards).
  const folded = fx('real-aio-list-no-finder.xml').toString('utf8');
  const opened = fx('real-aio-expanded-related.xml').toString('utf8');
  assert.deepEqual(aiOverviewFold(folded), { folded: true, cards: ['Great Plumber of Mt.Juliet', 'Southern Skye Plumbing'] });
  assert.equal(aiOverviewFold(opened)?.folded, false);
  assert.equal(aiOverviewFold(opened)?.cards.length, 7);
  // Google showed this one whole (8 cards, then its footer): every card was on view without "Show more".
  const whole = fx('real-aio-2026-11-09.xml').toString('utf8');
  assert.deepEqual([aiOverviewFold(whole)?.folded, cardsBeforeExpansion(whole)?.length], [false, 8]);
  assert.equal(cardsBeforeExpansion(fx('real-uidump-mappack-noaio.xml').toString('utf8')), null, 'no AI Overview: unknown');
  assert.equal(cardsBeforeExpansion(null), null);
});
