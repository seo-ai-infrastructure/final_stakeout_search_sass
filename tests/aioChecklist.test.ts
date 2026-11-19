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
  assert.deepEqual(r.named, { pins: 1, share: 33.3, powerShare: 33.3 });
  assert.deepEqual(r.ownSite, { pins: 1, share: 33.3 });
  assert.deepEqual(r.rival, { site: 'rotorooter.com', pins: 2, share: 66.7 });
  const yelp = r.pages.find((p) => p.url === 'https://yelp.com/search?cflt=plumbing')!;
  assert.deepEqual([yelp.pins, yelp.pinShare, yelp.avgSlot, yelp.kind, yelp.name], [['a', 'b'], 66.7, 1.5, 'directory', 'Yelp']);
  // The same site read only as a website (no page) is its own row, and says so.
  assert.equal(r.pages.find((p) => p.url === 'https://yelp.com/')!.pageKnown, false);
  assert.deepEqual(r.kinds.map((k) => [k.kind, k.pins]), [['directory', 3], ['business', 2], ['own', 1], ['community', 1]]);
  assert.equal(r.weighted, false);
});

test('buying power decides the order when the Census weights are known', () => {
  const weights = new Map([['a', 10], ['b', 10], ['c', 80]]);
  const r = aioRollup(pins, 'Acme Plumbing', 'acmeplumbing.com', weights);
  assert.equal(r.weighted, true);
  // Reddit was cited at one point, but that point holds 80% of the buying power.
  const reddit = r.pages.find((p) => p.site === 'reddit.com')!, roto = r.pages.find((p) => p.site === 'rotorooter.com')!;
  assert.deepEqual([reddit.powerShare, roto.powerShare], [80, 20]);
  assert.ok(reddit.score > roto.score);
  assert.equal(r.named.powerShare, 10);
  assert.equal(priorityScore(100, 100, 1, 4), 100);
  assert.equal(priorityScore(0, 0, 6, 0), 0);
  assert.equal(priorityScore(50, 50, null, 0), 45);
});

test('the checklist: a job per page worth acting on, one job for all rival pages, captured pages last', () => {
  const checks = { 'https://yelp.com/search?cflt=plumbing': { present: false, competitors: 3 }, 'https://reddit.com/': { present: true, competitors: 0 } };
  const r = aioRollup(pins, 'Acme Plumbing', 'acmeplumbing.com', new Map(), checks);
  const tasks = aioTasks(r, { business: 'Acme Plumbing', keyword: 'plumber', place: 'Lakeland, FL' });
  assert.deepEqual(tasks.map((t) => [t.playbook, t.captured]), [['CLAIM_LISTING', false], ['ANSWER_ON_YOUR_SITE', false], ['CLAIM_LISTING', false], ['JOIN_THREAD', true]]);
  const first = tasks[0];
  assert.equal(first.headline, 'Get Acme Plumbing listed on Yelp');
  assert.match(first.why, /Cited at 2 of the 3 points/);
  assert.match(first.why, /3 of your top rivals are on the page; the business is not\./);
  assert.equal(first.service, 'CITATION');
  const site = tasks[1];
  assert.equal(site.target, 'other-business-pages');
  assert.match(site.why, /yours was cited at 1/);
  assert.match(site.draft!, /Plumber in Lakeland, FL/);
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
