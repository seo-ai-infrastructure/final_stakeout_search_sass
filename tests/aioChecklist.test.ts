import test from 'node:test';
import assert from 'node:assert/strict';
import { aioRollup, aioTasks, businessKey, canonicalUrl, citesOf, kindOf, mentions, priorityScore, type AioPin } from '../packages/core/aioChecklist';

test('a cited address is cleaned so the same page counts once', () => {
  assert.equal(canonicalUrl('https://m.yelp.com/search?cflt=plumbing&find_loc=Lakeland%2C+FL&utm_source=x&srsltid=abc#:~:text=best'), 'https://yelp.com/search?cflt=plumbing&find_loc=Lakeland%2C%20FL');
  assert.equal(canonicalUrl('http://WWW.AcmePlumbing.com/services/'), 'https://acmeplumbing.com/services');
  assert.equal(canonicalUrl('acmeplumbing.com'), 'https://acmeplumbing.com/');
  assert.equal(canonicalUrl('https://www.youtube.com/watch?v=abc123&si=tracking'), 'https://youtube.com/watch?v=abc123');
  for (const bad of ['', 'Roto-Rooter', 'mailto:a@b.com', null, 'javascript:alert(1)']) assert.equal(canonicalUrl(bad), null);
});

test('what kind of source a page is', () => {
  const own = 'acmeplumbing.com';
  const k = (u: string) => kindOf(u, own);
  assert.equal(k('https://acmeplumbing.com/water-heaters'), 'own');
  assert.equal(k('https://yelp.com/biz/roto'), 'directory');
  assert.equal(k('https://bbb.org/us/fl/lakeland'), 'directory');
  assert.equal(k('https://youtube.com/watch?v=1'), 'video');
  assert.equal(k('https://reddit.com/r/lakeland/comments/1'), 'community');
  assert.equal(k('https://expertise.com/fl/lakeland/plumbing'), 'roundup');
  assert.equal(k('https://lakelandmom.com/best-plumbers-in-lakeland'), 'roundup');
  assert.equal(k('https://theledger.com/story/plumbers'), 'news');
  assert.equal(k('https://myfloridalicense.gov/x'), 'reference');
  assert.equal(k('https://rotorooter.com/lakeland'), 'business');
  // Without knowing the business's website, its own page is just another business's.
  assert.equal(kindOf('https://acmeplumbing.com/', null), 'business');
});

const pin = (id: string, row: number, col: number, over: Partial<AioPin> = {}): AioPin => ({ id, rowIdx: row, colIdx: col, status: 'COMPLETED', hasAiOverview: true, ...over });
const cites = (...urls: string[]) => ({ ai: { shown: true, cites: urls.map((url, i) => ({ n: i + 1, url })) } });
const pins: AioPin[] = [
  pin('a', 0, 0, { insights: cites('https://yelp.com/search?cflt=plumbing', 'https://rotorooter.com/lakeland', 'https://acmeplumbing.com/') }),
  pin('b', 0, 1, { insights: cites('https://rotorooter.com/lakeland', 'https://m.yelp.com/search?cflt=plumbing&utm_source=g'), targetCitedInAi: true }),
  pin('c', 1, 0, { insights: { ai: { shown: true, sources: ['m.yelp.com', 'reddit.com'], named: ['Roto-Rooter'] } } }),
  pin('d', 1, 1, { hasAiOverview: false }),
  pin('e', 2, 0, { status: 'PENDING', hasAiOverview: null }),
];

test('one point’s citations: the pages when known, the websites otherwise, never Google', () => {
  assert.deepEqual(citesOf(pins[0]).map((c) => [c.url, c.n, c.pageKnown]), [['https://yelp.com/search?cflt=plumbing', 1, true], ['https://rotorooter.com/lakeland', 2, true], ['https://acmeplumbing.com/', 3, true]]);
  assert.deepEqual(citesOf(pins[2]).map((c) => [c.url, c.pageKnown]), [['https://yelp.com/', false], ['https://reddit.com/', false]]);
  assert.deepEqual(citesOf(pin('x', 0, 0, { aiCitations: ['google.com', 'maps.google.com', 'www.bbb.org', 'bbb.org'] })).map((c) => c.url), ['https://bbb.org/']);
});

test('the rollup: who was cited where, the business’s share of the answers, and each point’s state', () => {
  const r = aioRollup(pins, 'Acme Plumbing', 'acmeplumbing.com');
  assert.deepEqual([r.points, r.answers, r.triggerRate], [4, 3, 75]);
  assert.deepEqual(r.state, { a: 'you', b: 'you', c: 'others', d: 'none', e: 'pending' });
  assert.deepEqual(r.named, { pins: 1, share: 33.3, powerShare: 33.3, ids: ['b'] });
  assert.deepEqual(r.ownSite, { pins: 1, share: 33.3, ids: ['a'], possible: [] });
  assert.deepEqual(r.rival, { site: 'rotorooter.com', pins: 2, share: 66.7 });
  const yelpPage = r.pages.find((p) => p.url === 'https://yelp.com/search?cflt=plumbing')!;
  assert.deepEqual([yelpPage.pins, yelpPage.pinShare, yelpPage.avgSlot, yelpPage.kind, yelpPage.name], [['a', 'b'], 66.7, 1.5, 'directory', 'Yelp']);
  // One row per website: the Yelp page and the point that only named Yelp count together.
  const yelp = r.sites.find((x) => x.site === 'yelp.com')!;
  assert.deepEqual([yelp.pins, yelp.pinShare, yelp.avgSlot, yelp.top, yelp.pages.map((p) => p.pageKnown)], [['a', 'b', 'c'], 100, 1.5, 'https://yelp.com/search?cflt=plumbing', [true, false]]);
  assert.equal(r.sites[0].site, 'yelp.com');
  assert.deepEqual(r.kinds.map((k) => [k.kind, k.pins, k.sites]), [['directory', 3, 1], ['business', 2, 1], ['own', 1, 1], ['community', 1, 1]]);
  assert.deepEqual(r.rivals, { pins: ['a', 'b'], pinShare: 66.7, powerShare: 66.7 });
  assert.equal(r.weighted, false);
});

test('buying power decides the order when the Census weights are known', () => {
  const weights = new Map([['a', 10], ['b', 10], ['c', 80]]);
  const r = aioRollup(pins, 'Acme Plumbing', 'acmeplumbing.com', weights);
  assert.equal(r.weighted, true);
  // Reddit was cited at one point, but that point holds 80% of the buying power.
  const reddit = r.sites.find((p) => p.site === 'reddit.com')!, roto = r.sites.find((p) => p.site === 'rotorooter.com')!;
  assert.deepEqual([reddit.powerShare, roto.powerShare], [80, 20]);
  assert.ok(reddit.score > roto.score);
  assert.equal(r.named.powerShare, 10);
  assert.equal(priorityScore(100, 100, 1, 4), 100);
  assert.equal(priorityScore(0, 0, 6, 0), 0);
  assert.equal(priorityScore(50, 50, null, 0), 45);
});

test('the checklist: a job per website worth acting on, one job for all rival pages, captured ones last', () => {
  const checks = { 'https://yelp.com/search?cflt=plumbing': { present: false, competitors: 3 }, 'https://reddit.com/': { present: true, competitors: 0 } };
  const r = aioRollup(pins, 'Acme Plumbing', 'acmeplumbing.com', new Map(), checks);
  const tasks = aioTasks(r, { business: 'Acme Plumbing', keyword: 'plumber', place: 'Lakeland, FL' });
  assert.deepEqual(tasks.map((t) => [t.playbook, t.target, t.captured]), [['CLAIM_LISTING', 'yelp.com', false], ['ANSWER_ON_YOUR_SITE', 'other-business-pages', false], ['JOIN_THREAD', 'reddit.com', true]]);
  const first = tasks[0];
  assert.equal(first.headline, 'Get Acme Plumbing listed on Yelp');
  assert.match(first.why, /Cited at 3 of the 3 points/);
  assert.match(first.why, /3 of your top rivals are on the cited page; the business is not\./);
  assert.equal(first.service, 'CITATION');
  assert.equal(first.pages.length, 2);
  // Every rival page together is one source: scored on all the points any of them reached.
  const site = tasks[1];
  assert.deepEqual([site.pins, site.pinShare], [['a', 'b'], 66.7]);
  assert.match(site.why, /At 2 of the 3 points.*yours was cited at 1/);
  assert.match(site.draft!, /Plumber in Lakeland, FL/);
  assert.equal(site.score, 64.7);
  // The business's own pages and government pages are never jobs.
  assert.ok(!tasks.some((t) => t.pages.some((p) => p.kind === 'own' || p.kind === 'reference')));
  assert.equal(aioTasks(aioRollup([], 'X', null), { business: 'X', keyword: 'k', place: '' }).length, 0);
});

test('whether a page mentions the business', () => {
  const who = { name: 'Acme Plumbing LLC', phone: '(863) 555-0100', domain: 'acmeplumbing.com' };
  assert.equal(mentions('The best: Roto-Rooter, ACME Plumbing, and Benjamin Franklin.', who), true);
  assert.equal(mentions('Call 863.555.0100 today', who), true);
  assert.equal(mentions('Visit www.acmeplumbing.com/contact', who), true);
  assert.equal(mentions('Acme Roofing and Plumbing Pros', who), false);
  assert.equal(mentions('', who), false);
  assert.equal(businessKey('Acme Plumbing, LLC'), 'acme plumbing');
});
