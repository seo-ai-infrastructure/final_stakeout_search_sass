import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeReads, type AioDossier, type AioPoolRow, type AioSourceEntry } from '../packages/core/aioSources';
import { buildAioCapture, captureDigest, entityRoster, type WatcherFacts } from '../packages/core/aioCapture';

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
const facts: WatcherFacts = {
  capture_version: 'v279',
  resolved_via_warmup_tab: true,
  warmup_tab_listed_url: 'https://www.google.com/search?q=metronome',
  reads_succeeded: 30,
  reads_missed: 2,
  first_read_ms: 79000,
  last_valid_read_ms: 171000,
  stop_reason: 'template_finished',
};

test('local overview: each card’s photo, Directions and website joined to one firm; other pages apart; listings apart from websites', () => {
  const d = mergeReads(
    undefined,
    page(
      [
        { text: 'Law Offices of Jeff Martin offers around-the-clock help.', cites: [cite(null), cite('https://www.google.com', { title: 'Law Offices of Jeff Martin' })] },
        { text: 'Super Lawyers lists more Tulsa firms.', cites: [cite('https://attorneys.superlawyers.com/motor-vehicle-accidents/oklahoma/tulsa/', { title: 'Super Lawyers' })] },
      ],
      [
        row(1, 'https://www.google.com', { sentences: [1], title: 'Law Offices of Jeff Martin' }),
        row(2, 'https://lh3.googleusercontent.com/grass-cs/AAA=s192-w192-h144-n', { mid: '/g/1xcbq3y7' }),
        row(3, 'https://www.google.com/maps/dir//1800+S+Baltimore+Ave+Ste+1000,+Tulsa,+OK+74119/data=!4m6!4m5!1m1!4e2!1m2!1m1!1s0x87b6ec95d60a9703:0xc970dbd168c92744?entry=s'),
        row(4, 'https://jeffmartinlaw.com/?utm_campaign=gmb&utm_medium=organic&utm_source=google-local'),
        row(5, 'https://lh3.googleusercontent.com/grass-cs/BBB=s108-w108-h144-n-', { mid: '/g/1tmy5ksy' }),
        row(6, 'https://www.google.com/maps/dir//1825+E+15th+St,+Tulsa,+OK+74104/data=!4m6!4m5!1m1!4e2!1m2!1m1!1s0x87b6ec9461fa8099:0x5b3334fe62682728?entry=s'),
        row(7, 'http://www.gorospelaw.com/'),
        row(8, 'https://www.landsouthhomes.com'),
        row(9, 'https://attorneys.superlawyers.com/motor-vehicle-accidents/oklahoma/tulsa/', { sentences: [2] }),
      ],
    ),
    79000,
  );
  const names = new Map([['/g/1xcbq3y7', 'Law Offices of Jeff Martin'], ['/g/1tmy5ksy', 'Gorospe Law Group']]);
  const c = buildAioCapture(d, { keyword: 'car accident lawyer tulsa', targetDomain: 'lacourselaw.com', targetBusinessId: '/g/1tjt2fyl', mapPackRank: 3, names, telemetry: facts });

  // Sentence citations: Jeff Martin's listing (its ID from the copied answer) and one web page.
  assert.deepEqual(
    c.sentence_citations.map((x) => [x.sentence_index, x.citation_position, x.target_type, x.business_name, x.business_id, x.registrable_domain]),
    [[1, 1, 'gbp_listing', 'Law Offices of Jeff Martin', '/g/1xcbq3y7', 'google.com'], [2, 1, 'external_web', null, null, 'superlawyers.com']],
  );
  // Card links: every link carries its card's position, ID, Maps ID and address (Gorospe's website, untagged, follows its Directions).
  assert.deepEqual(
    c.card_action_links.map((l) => [l.card_position, l.action_type, l.business_name, l.business_id, l.maps_id, l.street_address, l.coordinates]),
    [
      [1, 'photo', 'Law Offices of Jeff Martin', '/g/1xcbq3y7', '0x87b6ec95d60a9703:0xc970dbd168c92744', '1800 S Baltimore Ave Ste 1000, Tulsa, OK 74119', null],
      [1, 'directions', 'Law Offices of Jeff Martin', '/g/1xcbq3y7', '0x87b6ec95d60a9703:0xc970dbd168c92744', '1800 S Baltimore Ave Ste 1000, Tulsa, OK 74119', null],
      [1, 'website', 'Law Offices of Jeff Martin', '/g/1xcbq3y7', '0x87b6ec95d60a9703:0xc970dbd168c92744', '1800 S Baltimore Ave Ste 1000, Tulsa, OK 74119', null],
      [2, 'photo', 'Gorospe Law Group', '/g/1tmy5ksy', '0x87b6ec9461fa8099:0x5b3334fe62682728', '1825 E 15th St, Tulsa, OK 74104', null],
      [2, 'directions', 'Gorospe Law Group', '/g/1tmy5ksy', '0x87b6ec9461fa8099:0x5b3334fe62682728', '1825 E 15th St, Tulsa, OK 74104', null],
      [2, 'website', 'Gorospe Law Group', '/g/1tmy5ksy', '0x87b6ec9461fa8099:0x5b3334fe62682728', '1825 E 15th St, Tulsa, OK 74104', null],
    ],
  );
  const jm = c.card_action_links[2];
  assert.deepEqual([jm.clean_url, jm.registrable_domain, jm.utm_params], ['https://jeffmartinlaw.com/', 'jeffmartinlaw.com', { utm_campaign: 'gmb', utm_medium: 'organic', utm_source: 'google-local' }]);
  assert.deepEqual(c.unreferenced_web_sources.map((u) => [u.registrable_domain, u.clean_url, u.first_seen_phase, u.first_seen_elapsed_ms]), [['landsouthhomes.com', 'https://www.landsouthhomes.com/', 'initial', 79000]]);
  assert.deepEqual(c.counts, { sentences_count: 2, cited_web_pages_count: 1, cited_gbp_listings_count: 1, named_businesses_count: 2, unreferenced_web_sources_count: 1, card_action_links_count: 6 });
  assert.equal(c.overview_mode, 'local_entity_cards');
  assert.deepEqual([c.target_cited_in_aio, c.target_named_in_aio_cards, c.map_pack_rank], [false, false, 3]);
  assert.deepEqual([c.telemetry.stop_reason, c.telemetry.resolved_via_warmup_tab, c.telemetry.expanded_seen], ['template_finished', true, false]);
  assert.match(c.sentences[0].sentence_hash, /^[0-9a-f]{14}$/);

  // One row per firm, as v_aio_local_entity_roster.
  assert.deepEqual(
    entityRoster(c).map((r) => [r.card_position, r.business_name, r.business_id, r.street_address, r.gbp_website_domain, r.utm_source, r.utm_campaign]),
    [[1, 'Law Offices of Jeff Martin', '/g/1xcbq3y7', '1800 S Baltimore Ave Ste 1000, Tulsa, OK 74119', 'jeffmartinlaw.com', 'google-local', 'gmb'], [2, 'Gorospe Law Group', '/g/1tmy5ksy', '1825 E 15th St, Tulsa, OK 74104', 'gorospelaw.com', null, null]],
  );
  const g = captureDigest(c);
  assert.deepEqual([g.overview_mode, g.target_cited_in_aio, g.target_named_in_aio_cards, g.telemetry.stop_reason, g.telemetry.expanded_seen, g.roster.length], ['local_entity_cards', false, false, 'template_finished', false, 2]);
  assert.deepEqual(g.cited_sites, [{ site: 'superlawyers.com', citations: 1 }]);
});

test('web overview: the business’s own site cited; the pages under no sentence are unreferenced web sources, no card links', () => {
  const d = mergeReads(
    undefined,
    page(
      [
        { text: 'Cash home buyers in Tulsa can close in days.', cites: [cite('https://topdollarhomeoffer.com', { title: 'Sell My House Fast Tulsa' }), cite('https://www.zillow.com/learn/sell-my-house-fast/')] },
        { text: 'iBuyers like Opendoor make instant offers.', cites: [cite('https://www.opendoor.com/sell/tulsa_ok')] },
      ],
      [
        row(1, 'https://topdollarhomeoffer.com', { sentences: [1] }),
        row(2, 'https://www.zillow.com/learn/sell-my-house-fast/', { sentences: [1] }),
        row(3, 'https://www.opendoor.com/sell/tulsa_ok', { sentences: [2] }),
        row(4, 'https://www.homelight.com/blog/fastest-way-to-sell-a-house/'),
        row(5, 'https://oklahomacashbuy.com/sell-my-house-fast-tulsa'),
        row(6, 'https://www.landsouthhomes.com'),
        row(7, 'https://joshandkatebuy.com / sell-my-home / fast-for-cash'),
        row(8, 'https://www.webuyuglyhouses.com'),
      ],
    ),
    77000,
  );
  const c = buildAioCapture(d, { keyword: 'sell my house fast', targetDomain: 'topdollarhomeoffer.com', targetBusinessId: null, mapPackRank: null, telemetry: facts });
  assert.equal(c.overview_mode, 'web_synthesis');
  assert.equal(c.target_cited_in_aio, true);
  assert.equal(c.card_action_links.length, 0);
  assert.deepEqual(c.unreferenced_web_sources.map((u) => u.registrable_domain), ['homelight.com', 'oklahomacashbuy.com', 'landsouthhomes.com', 'joshandkatebuy.com', 'webuyuglyhouses.com']);
  assert.ok(c.sentence_citations.every((x) => x.target_type === 'external_web'));
  assert.equal(c.counts.cited_web_pages_count, 3);
  assert.equal(c.counts.named_businesses_count, 0);
});
