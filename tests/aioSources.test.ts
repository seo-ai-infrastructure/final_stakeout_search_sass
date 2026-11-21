import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIO_PROBE_JS, AIO_SOURCES_JS, isResultsPage, siteOf, summarizeAioSources, type AioDossier } from '../packages/core/aioSources';

const entry = (url: string | null, domain: string | null = null) => ({
  extracted: { title: 't', snippet: 's', url, domain, mid: null, coords: null, syntheticQuery: null },
});

const dossier: AioDossier = {
  meta: { query: 'emergency plumber lakeland', timestamp: '2026-11-21T00:00:00Z', url: 'https://www.google.com/search?q=x', totalClaimClusters: 3, markers: { buttons: 3, suuid: 9, comments: 7 } },
  clusters: [
    {
      clusterIndex: 1,
      uuid: 'a',
      claimText: 'Plumbers in Lakeland charge about $100 an hour.',
      visibleCitation: { label: 'Stuart’s Plumbing', url: 'https://www.google.com/url?q=https://www.stuartsplumbing.com/rates&sa=U', ved: null, hveid: null },
      candidatePool: [entry('https://www.stuartsplumbing.com/rates'), entry('https://www.angi.com/x'), entry('https://www.angi.com/y')],
    },
    {
      clusterIndex: 2,
      uuid: 'b',
      claimText: 'Many offer 24/7 emergency service.',
      visibleCitation: { label: 'Angi', url: 'https://www.angi.com/x', ved: null, hveid: null },
      candidatePool: [entry('https://www.angi.com/x'), entry(null, 'www.StuartsPlumbing.com'), { parseError: 'bad json' }],
    },
    { clusterIndex: 3, uuid: 'c', claimText: 'Prices vary.', visibleCitation: { label: 'Google', url: null, ved: null, hveid: null }, candidatePool: [] },
  ],
};

test('aio sources: counts sentences, entries, addresses and sites, most-listed first', () => {
  const s = summarizeAioSources(dossier, 'stuartsplumbing.com');
  assert.equal(s.sentences, 3);
  assert.equal(s.entries, 5, 'an entry that failed to parse is not a source');
  assert.equal(s.urls, 3, 'the same address under two sentences counts once');
  assert.equal(s.sites, 2);
  assert.deepEqual(s.topSites, [
    { site: 'angi.com', entries: 3 },
    { site: 'stuartsplumbing.com', entries: 2 },
  ]);
  assert.deepEqual(s.markers, { buttons: 3, suuid: 9, comments: 7 });
});

test('aio sources: where the tracked site is the visible citation, and where it is only listed', () => {
  const s = summarizeAioSources(dossier, 'https://www.StuartsPlumbing.com/');
  assert.deepEqual(s.target, { site: 'stuartsplumbing.com', cited: [1], listed: [1, 2] }, "Google's /url wrapper is unwrapped; a bare site name counts");
  assert.equal(summarizeAioSources(dossier, null).target, null);
  assert.deepEqual(summarizeAioSources(dossier, 'other.com').target, { site: 'other.com', cited: [], listed: [] });
});

test('aio sources: only this search’s results page, never the full list of businesses', () => {
  assert.ok(isResultsPage('https://www.google.com/search?q=emergency+plumber+lakeland&sca_esv=1', 'Emergency  plumber Lakeland'));
  assert.ok(!isResultsPage('https://www.google.com/search?q=emergency+plumber+lakeland', 'roofer lakeland'), 'another search');
  assert.ok(!isResultsPage('https://www.google.com/search?q=emergency+plumber+lakeland&tbm=lcl', 'emergency plumber lakeland'), 'the Local Finder');
  assert.ok(!isResultsPage('https://www.google.com/maps/search/plumber', 'plumber'));
  assert.ok(!isResultsPage('https://evil.example/search?q=plumber', 'plumber'));
  assert.ok(isResultsPage('https://www.google.co.uk/search?q=plumber'));
  assert.equal(siteOf('https://WWW.Example.com/a'), 'example.com');
  assert.equal(siteOf('localhost'), null);
});

test('aio sources: the page scripts are single expressions that return JSON text', () => {
  for (const js of [AIO_PROBE_JS, AIO_SOURCES_JS]) {
    assert.ok(js.startsWith('(() => {') && js.endsWith('})()'));
    assert.doesNotThrow(() => new Function('return ' + js), 'parses as JavaScript');
  }
  assert.match(AIO_SOURCES_JS, /0x7Fn/, 'varints are masked with 0x7F');
});
