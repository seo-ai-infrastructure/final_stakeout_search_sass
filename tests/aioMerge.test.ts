import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanUrl, linkKind, mapsIdOf, mergeReads, placeOf, registrableDomain, utmParams, type AioDossier, type AioPoolRow, type AioSourceEntry } from '../packages/core/aioSources';

test('link kinds: a business card’s own links apart from web pages', () => {
  assert.equal(linkKind('https://www.google.com', null), 'listing');
  assert.equal(linkKind('https://www.google.com/search?kgmid=%2Fg%2F1xcbq3y7&q=Law+Offices+of+Jeff+Martin'), 'listing');
  assert.equal(linkKind(null, '/g/1xcbq3y7'), 'listing');
  assert.equal(linkKind('https://lh3.googleusercontent.com/grass-cs/AABkmLd6=s192-w192-h144-n', '/g/1xcbq3y7'), 'card_photo');
  assert.equal(linkKind('https://www.google.com/maps/dir//1800+S+Baltimore+Ave,+Tulsa,+OK/data=!4m6!4m5!1m1!4e2'), 'card_directions');
  assert.equal(linkKind('https://www.google.com/maps/place/Truskett+Law/@36.03,-95.95,17z'), 'card_directions');
  assert.equal(linkKind('https://maps.app.goo.gl/AbCdEf'), 'card_directions');
  assert.equal(linkKind('https://www.google.com/search?q=x&ludocid=1234567890123'), 'card_directions');
  assert.equal(linkKind('tel:+19185551234'), 'card_call');
  assert.equal(linkKind('https://jeffmartinlaw.com/?utm_campaign=gmb&utm_medium=organic&utm_source=google-local'), 'card_website');
  assert.equal(linkKind('https://www.richardsonlawfirmpc.com/?utm_source=gbp&utm_medium=organic'), 'card_website');
  assert.equal(linkKind('http://www.gorospelaw.com/?utm_source=google&utm_campaign=gmblisting'), 'card_website');
  assert.equal(linkKind('https://www.bibylaw.com/', '/g/11lrpbxs5b'), 'card_website', 'a page carrying a Google business ID');
  assert.equal(linkKind('https://www.homelight.com/blog/fastest-way-to-sell-a-house/'), 'web');
  assert.equal(linkKind('https://oklahomacashbuy.com/sell?utm_source=newsletter'), 'web');
  assert.equal(linkKind('https://joshandkatebuy.com / sell-my-home / fast-for-cash'), 'web');
});

test('link details: clean address, tracking tags, Maps ID, address, coordinates only when present', () => {
  assert.equal(cleanUrl('https://jeffmartinlaw.com/?utm_campaign=gmb&utm_source=google-local&page=2#top'), 'https://jeffmartinlaw.com/?page=2');
  assert.equal(cleanUrl('https://www.google.com/url?q=https://www.zillow.com/learn/&sa=U'), 'https://www.zillow.com/learn/');
  assert.equal(cleanUrl('https://joshandkatebuy.com / sell-my-home / fast-for-cash'), 'https://joshandkatebuy.com/sell-my-home/fast-for-cash');
  assert.deepEqual(utmParams('https://www.richardsonlawfirmpc.com/?utm_source=gbp&utm_medium=organic&rwg_token=abc'), { utm_source: 'gbp', utm_medium: 'organic', extra: { rwg_token: 'abc' } });
  assert.equal(utmParams('https://www.homelight.com/'), null);
  const dir = 'https://www.google.com/maps/dir//1800+S+Baltimore+Ave+Ste+1000,+Tulsa,+OK+74119/data=!4m6!4m5!1m1!4e2!1m2!1m1!1s0x87b6ec95d60a9703:0xc970dbd168c92744?entry=s';
  assert.equal(mapsIdOf(dir), '0x87b6ec95d60a9703:0xc970dbd168c92744');
  assert.equal(mapsIdOf('https://maps.google.com/?cid=14515102637151406916'), 'cid:14515102637151406916');
  assert.deepEqual(placeOf(dir), { address: '1800 S Baltimore Ave Ste 1000, Tulsa, OK 74119', coords: null });
  assert.deepEqual(placeOf('https://www.google.com/maps/place/X/data=!3m1!4b1!4m6!3m5!8m2!3d36.0321!4d-95.9512'), { address: null, coords: { lat: 36.0321, lng: -95.9512 } });
  assert.equal(placeOf('https://www.google.com/maps/dir//0.0,0.0'), null, 'never 0,0');
  assert.equal(registrableDomain('https://attorneys.superlawyers.com/motor-vehicle-accidents/oklahoma/tulsa/'), 'superlawyers.com');
  assert.equal(registrableDomain('https://www.example.co.uk/x'), 'example.co.uk');
});

const cite = (url: string | null, extra: Partial<NonNullable<AioSourceEntry['extracted']>> = {}): AioSourceEntry => ({
  extracted: { title: null, snippet: null, url, domain: null, mid: null, coords: null, syntheticQuery: null, ...extra },
});
const row = (order: number, url: string, extra: Partial<AioPoolRow> = {}): AioPoolRow => ({
  order, url, domain: null, title: null, snippet: null, mid: null, coords: null, related: null, count: 1, inAio: 1, sentences: [], where: 'AI Overview', sections: ['AI Overview'], attrid: null, ...extra,
});
const page = (sentences: { text: string; cites: AioSourceEntry[] }[], rows: AioPoolRow[]): AioDossier => ({
  meta: { query: 'q', timestamp: 't', url: 'https://www.google.com/search?q=q', totalClaimClusters: sentences.length },
  clusters: sentences.map((x, i) => ({ clusterIndex: i + 1, uuid: 'u' + i, claimText: x.text, visibleCitation: { label: 'x', url: null, ved: null, hveid: null }, candidatePool: x.cites })),
  pool: { comments: rows.length, parsed: rows.length, entries: rows },
});

test('reads merged: sentences by their words, late citations added, nothing downgraded, all stamped initial or post_expand', () => {
  const A = 'Cash buyers can close in about a week.';
  const B = 'Listing with an agent usually gets a higher price.';
  const C = 'Local investors also buy homes as-is.';
  const first = page([{ text: A, cites: [cite('https://www.opendoor.com/sell/tulsa_ok')] }, { text: B, cites: [cite('https://www.homelight.com')] }], [
    row(1, 'https://www.opendoor.com/sell/tulsa_ok', { sentences: [1] }),
    row(2, 'https://www.homelight.com', { sentences: [2] }),
    row(3, 'https://webuyuglyhouses.com'),
  ]);
  let d = mergeReads(undefined, first, 77000);
  assert.deepEqual(d.meta.stats, { initialSentenceCount: 2, initialEntryCount: 3, expandedSeen: false, postExpandAddedSentences: 0, postExpandAddedEntries: 0 });
  // "Show more": a sentence in between, a late citation on A, and the loose page now under the new sentence.
  const second = page(
    [
      { text: A, cites: [cite('https://www.opendoor.com/sell/tulsa_ok'), cite('https://www.zillow.com/learn/', { title: 'Zillow' })] },
      { text: C, cites: [cite('https://webuyuglyhouses.com')] },
      { text: B, cites: [cite('https://www.homelight.com')] },
    ],
    [row(1, 'https://www.opendoor.com/sell/tulsa_ok', { sentences: [1] }), row(2, 'https://www.zillow.com/learn/', { sentences: [1] }), row(3, 'https://webuyuglyhouses.com', { sentences: [2] }), row(4, 'https://www.homelight.com', { sentences: [3] })],
  );
  d = mergeReads(d, second, 150000);
  assert.deepEqual(d.clusters.map((c) => [c.clusterIndex, c.claimText, c.phase]), [[1, A, 'initial'], [2, C, 'post_expand'], [3, B, 'initial']]);
  assert.deepEqual(d.clusters[0].candidatePool.map((e) => [e.extracted?.url, e.phase, e.firstSeenMs]), [['https://www.opendoor.com/sell/tulsa_ok', 'initial', 77000], ['https://www.zillow.com/learn/', 'post_expand', 150000]]);
  const ugly = d.pool!.entries.find((r) => r.url === 'https://webuyuglyhouses.com')!;
  assert.deepEqual([ugly.sentences, ugly.promotedAfterExpand, ugly.phase, ugly.firstSeenMs, ugly.lastSeenMs], [[2], true, 'initial', 77000, 150000]);
  assert.deepEqual(d.pool!.entries.find((r) => r.url === 'https://www.homelight.com')!.sentences, [3], 'sentence numbers follow the merged order');
  assert.equal(d.meta.stats?.expandedSeen, true);
  assert.equal(d.meta.stats?.postExpandAddedSentences, 1);
  // Zillow (a new citation) and nothing else new: webuyuglyhouses was already there, under no sentence.
  assert.equal(d.meta.stats?.postExpandAddedEntries, 1);
  // The tab closing after the copy: an empty read downgrades nothing.
  d = mergeReads(d, page([], []), 171000);
  assert.equal(d.clusters.length, 3);
  assert.equal(d.pool!.entries.length, 4);
  assert.deepEqual(d.meta.reads?.map((r) => r.atMs), [77000, 150000, 171000]);
});
