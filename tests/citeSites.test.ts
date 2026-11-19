import test from 'node:test';
import assert from 'node:assert/strict';
import { getListed, knownSite, siteOf, KNOWN_SITES } from '../packages/core/citeSites';

test('a cited address is read as a bare site', () => {
  assert.equal(siteOf('www.plumbinglakeland.com'), 'plumbinglakeland.com');
  assert.equal(siteOf('https://m.Yelp.com/biz/acme?x=1'), 'yelp.com');
  assert.equal(siteOf('biz.yelp.com:443/path'), 'biz.yelp.com');
  for (const bad of ['', 'Roto-Rooter', 'localhost', null, 42]) assert.equal(siteOf(bad), null);
});

test('pages under a known site belong to it; look-alikes do not', () => {
  assert.equal(knownSite('yelp.com')?.name, 'Yelp');
  assert.equal(knownSite('biz.yelp.com')?.name, 'Yelp');
  assert.equal(knownSite('notyelp.com'), null);
  assert.equal(knownSite('maps.apple.com')?.name, 'Apple Maps');
  // Every known site has somewhere to start, over https, and is listed once.
  for (const s of KNOWN_SITES) assert.match(s.url, /^https:\/\//, s.domain);
  assert.equal(new Set(KNOWN_SITES.map((s) => s.domain)).size, KNOWN_SITES.length);
});

test('the checklist counts each answer once per site and sets the business’s own site apart', () => {
  const pins = [
    { hasAiOverview: true, aiCitations: ['yelp.com', 'www.yelp.com', 'rotorooter.com', 'www.acmeplumbing.com'] },
    { hasAiOverview: true, aiCitations: ['m.yelp.com', 'bbb.org', 'rotorooter.com', 'google.com', 'maps.google.com'] },
    { hasAiOverview: true, aiCitations: ['reddit.com', 'bestplumbers.example'] },
    { hasAiOverview: true, aiCitations: [] },
    { hasAiOverview: true, aiCitations: ['google.com'] },
    { hasAiOverview: false, aiCitations: ['angi.com'] },
    { hasAiOverview: true, aiCitations: null },
  ];
  const r = getListed(pins, 'https://acmeplumbing.com/contact');
  assert.equal(r.answers, 3);
  assert.deepEqual(r.act.map((s) => [s.name, s.answers, s.share]), [['Yelp', 2, 67], ['Better Business Bureau', 1, 33], ['Reddit', 1, 33]]);
  assert.deepEqual(r.others.map((s) => [s.site, s.answers]), [['rotorooter.com', 2], ['bestplumbers.example', 1]]);
  assert.equal(r.ownAnswers, 1);
  // Without the website, nothing is called the business's own.
  const noSite = getListed(pins);
  assert.equal(noSite.ownAnswers, null);
  assert.ok(noSite.others.some((s) => s.site === 'acmeplumbing.com'));
  assert.deepEqual(getListed([]), { answers: 0, act: [], others: [], ownAnswers: null });
});
