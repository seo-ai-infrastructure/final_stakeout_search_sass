import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPinInsights, toCount, toMiles } from '../packages/core/pinInsights';

const read = (f: string) => readFileSync('tests/fixtures/' + f, 'utf8');

test('units: distances become miles, review counts become numbers', () => {
  assert.equal(toMiles('0.4 mi'), 0.4);
  assert.equal(toMiles('2640 ft'), 0.5);
  assert.equal(toMiles('1.6 km'), 0.99);
  assert.equal(toMiles(null), null);
  assert.equal(toCount('6.5K'), 6500);
  assert.equal(toCount('1,234'), 1234);
  assert.equal(toCount('85'), 85);
});

test('insights from a real Local Finder: your position and distance, and the ads shown above you', () => {
  const i = buildPinInsights({ serp: null, finder: read('real-lf-2026-11-09.xml'), target: 'Southern Skye Plumbing' });
  assert.deepEqual(i.you, { pos: 2, miles: 0.4 });
  assert.equal(i.adsAboveYou, 4, "Michael's, SteadyFlo, Airstream and Pioneer come before Southern Skye");
  assert.equal(i.finder.filter((l) => !l.ad).length, 10);
  assert.equal(i.ads.filter((a) => a.where === 'finder').length, 7);
  const great = i.finder.find((l) => l.name === 'Great Plumber of Mt.Juliet')!;
  assert.equal(great.miles, null, 'service-area business: no distance');
  assert.ok(great.rating! >= 4 && great.reviews! > 0);
  const nobody = buildPinInsights({ serp: null, finder: read('real-lf-2026-11-09.xml'), target: 'McIntyre Painting' });
  assert.deepEqual([nobody.you.pos, nobody.adsAboveYou], [null, null]);
});

test('insights from a real results page: the sponsored map-pack card is an advertiser', () => {
  const i = buildPinInsights({ serp: read('real-pack-2026-11-09.xml'), finder: null, target: 'Great Plumber of Mt.Juliet' });
  assert.ok(i.ads.some((a) => a.where === 'results' && /Pioneer/.test(a.name)));
  assert.equal(i.finder.length, 0);
});

test("insights from Google's own copied AI Overview: cited websites in order, and the businesses it named", () => {
  const i = buildPinInsights({ serp: null, finder: null, aiCopy: read('real-aio-copy-2026-11-09.txt'), target: 'x' });
  assert.equal(i.ai.shown, true);
  assert.ok(i.ai.named.length >= 3);
  assert.ok(i.ai.sources.length >= 1 && i.ai.sources.every((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)), JSON.stringify(i.ai.sources));
  assert.equal(new Set(i.ai.sources).size, i.ai.sources.length, 'each website once');
});

test('AI Overview "shown" only when a snapshot really holds one (not because an aio_ file exists)', () => {
  const none = buildPinInsights({ serp: null, finder: null, aiExpanded: read('real-uidump-mappack-noaio.xml'), target: 'x' });
  assert.equal(none.ai.shown, false, 'a map-pack page with no AI Overview');
  const some = buildPinInsights({ serp: null, finder: null, aiExpanded: read('real-aio-list-no-finder.xml'), target: 'x' });
  assert.equal(some.ai.shown, true);
});

test('AI sources come from the snapshot when nothing was copied: only inside the AI Overview, never from the ads after it', async () => {
  const { aiSourcesFromSnapshot } = await import('../packages/core/pinInsights');
  const node = (text: string, cls = 'android.widget.TextView') => `<node index="0" text="${text}" resource-id="" class="${cls}" package="com.android.chrome" content-desc="" bounds="[0,0][100,100]" />`;
  const xml = `<?xml version="1.0"?><hierarchy rotation="0">${[
    node('Sponsored'), node('adsite.com'),
    node('AI Overview'),
    node('Emergency plumbing services in Lakeland typically start around $300.'),
    node('Angie&apos;s List'), node('proplumberlakeland.com'), node('https://www.rotorooter.com/lakeland/'), node('proplumberlakeland.com'),
    node('Show more AI Overview', 'android.widget.Button'),
    node('Ads'), node('another-ad.com'),
  ].join('')}</hierarchy>`;
  assert.deepEqual(aiSourcesFromSnapshot(xml), ['proplumberlakeland.com', 'rotorooter.com']);
  assert.deepEqual(aiSourcesFromSnapshot(null), []);
  const i = buildPinInsights({ serp: xml, finder: null, target: 'x' });
  assert.deepEqual(i.ai.sources, ['proplumberlakeland.com', 'rotorooter.com'], 'insights use them without a copy');
});

test('AI sources from a real informational AI Overview (11 Nov, Lakeland): every source card, in order, names and domains', async () => {
  const { aiSourcesFromSnapshot } = await import('../packages/core/pinInsights');
  const serp = read('real-aio-sources-2026-11-11.xml');
  assert.deepEqual(aiSourcesFromSnapshot(serp), [
    "Angie's List", 'Facebook', 'Housecall Pro', 'proplumberlakeland.com', 'Paul Bunyan Plumbing & Drains',
    'ACS Home Services', 'Roto-Rooter', 'plumbinglakeland.com', 'rotorooter.com',
  ]);
  const i = buildPinInsights({ serp, finder: null, target: "Stuart's Plumbing" });
  assert.equal(i.ai.shown, true);
  assert.equal(i.ai.sources.length, 9);
});

test('AI Overview layout from a real page: the answer as one sentence, then nine source cards', async () => {
  const { readAiOverviewLayout } = await import('../packages/core/serpEvidence');
  const a = readAiOverviewLayout(read('real-aio-sources-2026-11-11.xml'))!;
  assert.deepEqual(a.answer, [{ kind: 'p', text: 'Emergency plumbing services in Lakeland, FL typically start around $300 for basic emergency dispatches, with total costs varying depending on the time of day, hourly labor rates, and dispatch or service call fees.' }]);
  assert.equal(a.sources.length, 9);
  assert.deepEqual([a.sources[0].title, a.sources[0].site, a.sources[0].date], ['How Much Does an Emergency Plumber Cost? [2026 Data] | Angi', "Angie's List", null]);
  assert.match(a.sources[0].snippet, /^The timing of your emergency/);
  assert.deepEqual([a.sources[2].site, a.sources[2].date], ['Housecall Pro', 'Jun 5, 2026']);
  assert.match(a.sources[2].snippet, /^Plumbers typically charge \$75/);
  assert.equal(a.sources[8].site, 'rotorooter.com');
  assert.equal(readAiOverviewLayout(read('real-uidump-mappack-noaio.xml')), null, 'no AI Overview');
  assert.equal(readAiOverviewLayout(read('real-aio-list-no-finder.xml')), null, 'a business-list overview has no source cards');
});

test('no Local Finder: the results page map pack gives the rank (real page, 12 Nov, four-business pack with "See more on Google")', async () => {
  const { rankWithoutFinder, isLocalFinder } = await import('../packages/core/serpEvidence');
  const page = read('real-pack4-see-more-2026-11-12.xml');
  assert.equal(isLocalFinder(page), false);
  const r = rankWithoutFinder([page, page], [page], "Stuart's Plumbing");
  assert.deepEqual(r, { rank: 4, list: ['1-Tom-Plumber Lakeland', '1 Time Plumbing', 'Nest Plumbing LLC', "Stuart's Plumbing"], from: 'map_pack' });
  assert.equal(rankWithoutFinder([page], [page], 'Roto-Rooter Plumbing & Drain Services').rank, null, 'a business only under "Related websites" is not in the pack');
  const ai = read('real-aio-list-no-finder.xml');
  assert.equal(rankWithoutFinder([ai], [ai], 'x').from, 'ai_overview_list', 'a page with no pack still falls back to the AI Overview list');
  assert.deepEqual(rankWithoutFinder([null], [null], 'x'), { rank: null, list: [], from: 'none' });
});

test('the map pack ends at "See more on Google": nothing after it is read as a pack listing', async () => {
  const { readResultsPage } = await import('../packages/core/serpEvidence');
  const page = read('real-pack4-see-more-2026-11-12.xml');
  assert.deepEqual(readResultsPage(page)!.pack.map((l) => l.name), ['1-Tom-Plumber Lakeland', '1 Time Plumbing', 'Nest Plumbing LLC', "Stuart's Plumbing"]);
  // Even if Google later renders the "Related websites" entries as the same kind of card, they stay out of the pack.
  const asCards = page.replace(/class="android\.view\.View"([^>]*content-desc="(?:Roto-Rooter|Before You Dig|Vanguard Plumbing)[^"]*")/g, 'class="android.widget.Button"$1')
    .replace(/(text="(?:Roto-Rooter|Before You Dig|Vanguard Plumbing)[^"]*"[^>]*)class="android\.view\.View"/g, '$1class="android.widget.Button"');
  assert.equal(readResultsPage(asCards)!.pack.length, 4);
});

test('Maps list: an advertiser\'s own listing is a separate card and counts in the ranking (real scan, 13 Nov)', async () => {
  const { untarGz, readMapsList, sameBusiness } = await import('../packages/core/serpEvidence');
  const { readFileSync: rf } = await import('node:fs');
  const files = untarGz(rf('tests/fixtures/real-maps-ad-and-listing-2026-11-13.tar.gz'));
  const num = (p: string) => (/dump_(\d+)/.exec(p) ? Number(/dump_(\d+)/.exec(p)![1]) : 999);
  const screens = [...files].filter(([p]) => p.endsWith('.xml')).sort((a, b) => num(a[0]) - num(b[0])).map(([, d]) => d.toString('utf8'));
  assert.equal(screens.length, 14);
  const cards = readMapsList(screens);
  // Benjamin Franklin Plumbing has a sponsored card near the top AND its own listing at #3.
  const bf = cards.filter((c) => sameBusiness(c.name, 'Benjamin Franklin Plumbing'));
  assert.deepEqual(bf.map((c) => [c.ad, c.pos]), [[true, null], [false, 3]]);
  const organic = cards.filter((c) => !c.ad);
  assert.equal(organic.length, 12);
  assert.equal(organic.find((c) => sameBusiness(c.name, "Stuart's Plumbing"))!.pos, 8, 'the rank the worker saved');
  assert.deepEqual(cards.filter((c) => c.ad).map((c) => c.name), ['Frank Gay Services', 'Benjamin Franklin Plumbing', 'Expedited Home Services', 'Vanguard Plumbing']);
  // The stored insights agree, and are marked as read with this merge.
  const ins = buildPinInsights({ mapsScreens: screens, target: "Stuart's Plumbing" } as never);
  assert.deepEqual([ins.you.pos, ins.m, ins.adsAboveYou], [8, 2, 4]);
});

test('the full business list from a fallback pass reads the same as any other (real page, 13 Nov)', async () => {
  const { isLocalFinder, readLocalFinder, sameBusiness } = await import('../packages/core/serpEvidence');
  const { parseWebResults } = await import('../apps/worker/src/xmlParser');
  // Taken by the recorder's own pass (the template's last snapshot was missing), at the foot of the page.
  const page = read('real-places-page-2026-11-13.xml');
  assert.equal(isLocalFinder(page), true);
  const organic = readLocalFinder(page).filter((x) => !x.ad);
  assert.deepEqual(organic.map((x) => x.pos), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(organic.slice(0, 3).map((x) => x.name), ['Nest Plumbing LLC', 'All Pro Plumbing & Air', "Stuart's Plumbing"]);
  // Stuart's Plumbing is there twice: a sponsored card, and its own listing at #3. Only the listing ranks.
  assert.deepEqual(readLocalFinder(page).filter((x) => sameBusiness(x.name, "Stuart's Plumbing")).map((x) => [x.ad, x.pos]), [[true, null], [false, 3]]);
  // The worker's ranking and the evidence view read the same list from it.
  const w = parseWebResults(page, [], [], "Stuart's Plumbing");
  assert.equal(w.targetRank, 3);
  assert.deepEqual(w.orderedBusinesses, organic.map((x) => x.name));
  assert.equal(buildPinInsights({ serp: null, finder: page, target: "Stuart's Plumbing" }).you.pos, 3);
});

test('the recorder keeps the location flag and the results page whichever evidence it ends up using', async () => {
  const { OBSERVE_SH } = await import('../packages/core/observer');
  assert.equal((OBSERVE_SH.match(/location_refreshed=1/g) || []).length, 1);
  assert.ok(OBSERVE_SH.indexOf('location_refreshed=1') < OBSERVE_SH.indexOf('evidence=template'), 'recorded before the evidence is chosen');
  assert.ok(OBSERVE_SH.indexOf('location_refreshed=1') < OBSERVE_SH.indexOf('evidence=observer_pass'));
  assert.ok(OBSERVE_SH.includes('serp_page.xml') && /mv "?\\?"?\$D\/serp_page\.xml/.test(OBSERVE_SH.replace(/\\"/g, '"')), 'the fallback keeps the template\'s results page');
  assert.ok(!/input swipe \$X \$\(\(H\*30\/100\)\) \$X \$\(\(H\*80\/100\)\)/.test(OBSERVE_SH), 'no drag down at the top of the page: that is pull-to-refresh');
});
