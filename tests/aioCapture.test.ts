import test from 'node:test';
import assert from 'node:assert/strict';
import { googleIdOfLink, isSourceViewer, mergeReads, type AioDossier, type AioPoolRow, type AioSourceEntry } from '../packages/core/aioSources';
import { buildAioCapture, captureDigest, entityRoster, readCopiedAnswer, type WatcherFacts } from '../packages/core/aioCapture';

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
  capture_version: 'v280',
  resolved_via_warmup_tab: true,
  warmup_tab_listed_url: 'https://www.google.com/search?q=metronome',
  reads_succeeded: 30,
  reads_missed: 2,
  first_read_ms: 79000,
  last_valid_read_ms: 171000,
  stop_reason: 'template_finished',
};
/** A source viewer link as Google writes it: the svid is a small protobuf holding the business's ID. */
const viewer = (id: string) =>
  'https://www.google.com/searchviewer/10?svid=' +
  Buffer.from(String.fromCharCode(0x08, 0x26, 0x12, id.length) + id + String.fromCharCode(0x18, 0x01), 'latin1').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const kg = (id: string, q: string) => `https://www.google.com/search?kgmid=${encodeURIComponent(id)}&q=${encodeURIComponent(q)}`;

test('the Google business ID behind a source viewer link (its svid) or a search link (its kgmid)', () => {
  assert.equal(googleIdOfLink(viewer('/g/1tmy5ksy')), '/g/1tmy5ksy');
  assert.equal(googleIdOfLink(viewer('/g/11_r9_v37')), '/g/11_r9_v37');
  assert.equal(googleIdOfLink(kg('/g/11b75pyyph', 'Top Dollar Home Offer')), '/g/11b75pyyph');
  assert.equal(googleIdOfLink('https://www.google.com/searchviewer/10?svid=not-a-protobuf'), null);
  assert.equal(googleIdOfLink('https://www.bibylaw.com/?svid=' + viewer('/g/1x').split('svid=')[1]), null, 'only Google links');
  assert.equal(isSourceViewer(viewer('/g/1tmy5ksy')), true);
  assert.equal(isSourceViewer('https://www.google.com/search?q=x'), false);
});

// car accident lawyer tulsa, 2026-11-21 (trimmed to four firms): cards with their buttons, a closing
// line naming Super Lawyers, a second Biby listing and ASH LAW, the sources row (listing cards that
// carry their business's ID in the viewer link), and the Sponsored block.
const JM = '/g/1xcbq3y7', GO = '/g/1tmy5ksy', GM = '/g/1tvq4n10', BB = '/g/11f5mhtzdr', BB2 = '/g/11lrpbxs5b', WA = '/g/12jvys7lz';
const SL = 'https://attorneys.superlawyers.com/motor-vehicle-accidents/oklahoma/tulsa/';
const ASH = 'https://ash.law/car-accident-lawyer-tulsa-ok/';
const localPage = () =>
  page(
    [
      { text: 'CallDirectionsWebsiteVeteran-owned personal injury firm offering 24/7 availability.', cites: [cite('https://www.google.com', { title: 'Law Offices of Jeff Martin', mid: JM })] },
      { text: 'CallDirectionsWebsiteLocal practice with over 15 years of experience handling crashes.', cites: [cite(viewer(JM)), cite('https://www.google.com', { title: 'Gorospe Law Group', mid: GO })] },
      { text: 'CallDirectionsWebsiteAuto injury practice available 24/7, advocating for crash victims.', cites: [cite(viewer(JM))] },
      { text: 'CallDirectionsWebsiteAuto and commercial crash firm offering 24/7 availability.', cites: [cite('https://bibylaw.com'), cite('https://bibylaw.com', { title: 'Tulsa Injury Attorney - Biby Law Firm' }), cite(viewer(JM))] },
      {
        text: 'Most car accident attorneys offer free initial consultations. You can also browse firm details through Super Lawyers, Biby Law Firm, and ASH LAW.',
        cites: [cite('https://attorneys.superlawyers.com', { title: 'Best Tulsa, OK Car Accident Attorneys - Super Lawyers' }), cite('https://bibylaw.com'), cite('https://ash.law', { title: 'Car Accident Lawyer Tulsa OK' })],
      },
    ],
    [
      row(1, 'https://lh3.googleusercontent.com/grass-cs/AAA=s192-w192-h144-n', { mid: JM }),
      row(2, 'https://www.google.com/maps/dir//1800+S+Baltimore+Ave+Ste+1000,+Tulsa,+OK+74119/data=!4m6!4m5!1m1!4e2!1m2!1m1!1s0x87b6ec95d60a9703:0xc970dbd168c92744?entry=s'),
      row(3, 'https://jeffmartinlaw.com/?utm_campaign=gmb&utm_medium=organic&utm_source=google-local'),
      row(4, 'https://lh3.googleusercontent.com/grass-cs/BBB=s108-w108-h144-n-', { mid: GO }),
      row(5, 'https://www.google.com/maps/dir//1825+E+15th+St,+Tulsa,+OK+74104/data=!4m6!4m5!1m1!4e2!1m2!1m1!1s0x87b6ec9461fa8099:0x5b3334fe62682728?entry=s'),
      row(6, 'http://www.gorospelaw.com/'),
      row(7, 'https://lh3.googleusercontent.com/grass-cs/CCC=s192-w192-h144', { mid: GM }),
      row(8, 'https://www.google.com/maps/dir//4137+S+Harvard+Ave,+Tulsa,+OK+74135/data=!4m6!4m5!1m1!4e2!1m2!1m1!1s0x87b6eb63fddf81e3:0xc6872a4bd426cda7?entry=s'),
      row(9, 'https://www.gravesmclain.com/?utm_source=google&utm_medium=organic&utm_campaign=GBP_Tulsa'),
      row(10, 'https://lh3.googleusercontent.com/grass-cs/DDD=s192-w192-h144', { mid: BB }),
      row(11, 'https://www.google.com/maps/dir//9810+E+42nd+St+%23211,+Tulsa,+OK+74146/data=!4m6!4m5!1m1!4e2!1m2!1m1!1s0x87b6ed87232a587f:0xf3dda111732192e4?entry=s'),
      row(12, 'https://www.bibylaw.com/'),
      row(13, viewer(JM), { sentences: [2, 3, 4], count: 4, inAio: 4 }),
      row(14, viewer(GO)),
      row(15, viewer(GM)),
      row(16, viewer(BB)),
      row(17, viewer(WA)),
      row(18, viewer(BB2)),
      row(19, SL),
      row(20, ASH),
      row(21, 'https://info.gorospelaw.com / car-accident / lawyer'),
      row(22, 'https://www.frasierlaw.com/'),
      row(23, 'https://www.parrishdevaughn.com/'),
    ],
  );
const localCopy = [
  '[Rich media excluded from paste]',
  '',
  `Law Offices of Jeff Martin (${kg(JM, 'Law Offices of Jeff Martin')})`,
  '4.7(890) · Personal injury attorney',
  'Open · Maple Ridge · 1.6 mi',
  `Veteran-owned personal injury firm offering 24/7 availability. [1] (${viewer(JM)}), [2] (${viewer(JM)})`,
  '',
  `Gorospe Law Group (${kg(GO, 'Gorospe Law Group')})`,
  `Local practice with over 15 years of experience handling crashes. [1] (${viewer(GO)}), [2] (${viewer(JM)})`,
  '',
  `Graves McLain Injury Lawyers (${kg(GM, 'Graves McLain Injury Lawyers')})`,
  `Auto injury practice available 24/7, advocating for crash victims. [1] (${viewer(JM)})`,
  '',
  `Biby Law Firm Injury and Accident Lawyers (${kg(BB, 'Biby Law Firm Injury and Accident Lawyers')})`,
  `Auto and commercial crash firm offering 24/7 availability. [1] (https://www.bibylaw.com/), [2] (${viewer(JM)})`,
  `Most car accident attorneys offer free initial consultations. You can also browse firm details through Super Lawyers, Biby Law Firm (${kg(BB2, 'Biby Law Firm')}), and ASH LAW. [1] (${SL}), [2] (${ASH}), [3] (https://www.bibylaw.com/)`,
  'SponsoredYou might consider these options:',
  'Gorospe Law Group',
  'Since 1984 - Available by Phone 24/7',
  'Frasier Law',
  'Car Crash Legal Representation - Request A Free Consultation',
  'Parrish DeVaughn PLLC',
  'Let Us Fight To Get You What You Truly Deserve.',
].join('\n');

test('the copied answer: cards, each citing sentence with its pages and named businesses, the Sponsored block', () => {
  const c = readCopiedAnswer(localCopy);
  assert.deepEqual(c.cards.map((x) => [x.pos, x.name, x.id]), [[1, 'Law Offices of Jeff Martin', JM], [2, 'Gorospe Law Group', GO], [3, 'Graves McLain Injury Lawyers', GM], [4, 'Biby Law Firm Injury and Accident Lawyers', BB]]);
  assert.equal(c.sentences.length, 5);
  assert.deepEqual(c.sentences[4].mentions, [{ name: 'Biby Law Firm', id: BB2 }]);
  assert.equal(c.sentences[4].text, 'Most car accident attorneys offer free initial consultations. You can also browse firm details through Super Lawyers, Biby Law Firm, and ASH LAW.');
  assert.deepEqual(c.sentences[4].urls, [SL, ASH, 'https://www.bibylaw.com/']);
  assert.deepEqual(c.sponsored.slice(0, 2), ['You might consider these options:', 'Gorospe Law Group']);
});

test('local overview: one record per firm by ID and website; the sources row is not cards; ads apart; cited pages not "unreferenced"', () => {
  const d = mergeReads(undefined, localPage(), 116000);
  const c = buildAioCapture(d, { keyword: 'car accident lawyer tulsa', targetBusinessId: BB2, mapPackRank: 3, copy: localCopy, telemetry: facts });
  assert.equal(c.telemetry.copy_used, true);
  assert.equal(c.overview_mode, 'local_entity_cards');
  // Four cards, each with its own photo, Directions and Website; nothing else became a card.
  assert.deepEqual(
    entityRoster(c).map((r) => [r.card_position, r.business_name, r.business_id, r.other_business_ids, r.street_address, r.gbp_website_domain, r.advertised, r.sources_row_position]),
    [
      [1, 'Law Offices of Jeff Martin', JM, [], '1800 S Baltimore Ave Ste 1000, Tulsa, OK 74119', 'jeffmartinlaw.com', false, 1],
      [2, 'Gorospe Law Group', GO, [], '1825 E 15th St, Tulsa, OK 74104', 'gorospelaw.com', true, 2],
      [3, 'Graves McLain Injury Lawyers', GM, [], '4137 S Harvard Ave, Tulsa, OK 74135', 'gravesmclain.com', false, 3],
      // The "Biby Law Firm" the closing line names is another listing on the same website: the same firm.
      [4, 'Biby Law Firm Injury and Accident Lawyers', BB, [BB2], '9810 E 42nd St #211, Tulsa, OK 74146', 'bibylaw.com', false, 4],
    ],
  );
  assert.equal(c.card_action_links.length, 12);
  assert.ok(c.card_action_links.every((l) => l.card_position !== null));
  // Citations as Google's copy lists them: listing chips by the ID their viewer link carries, pages by full address.
  assert.deepEqual(
    c.sentence_citations.map((x) => [x.sentence_index, x.citation_position, x.target_type, x.business_id ?? x.registrable_domain]),
    [
      [1, 1, 'gbp_listing', JM], [1, 2, 'gbp_listing', JM],
      [2, 1, 'gbp_listing', GO], [2, 2, 'gbp_listing', JM],
      [3, 1, 'gbp_listing', JM],
      [4, 1, 'external_web', 'bibylaw.com'], [4, 2, 'gbp_listing', JM],
      [5, 1, 'external_web', 'superlawyers.com'], [5, 2, 'external_web', 'ash.law'], [5, 3, 'external_web', 'bibylaw.com'],
    ],
  );
  // A page's title is kept with its site's home page; it joins the full address the copy cites.
  assert.equal(c.sentence_citations.find((x) => x.clean_url === SL)?.page_title, 'Best Tulsa, OK Car Accident Attorneys - Super Lawyers');
  assert.deepEqual(c.counts, {
    sentences_count: 5,
    cited_web_pages_count: 3,
    cited_gbp_listings_count: 2,
    named_businesses_count: 4,
    unreferenced_web_sources_count: 0,
    card_action_links_count: 12,
    sources_row_listings_count: 6,
    sources_only_businesses_count: 1,
    ads_count: 3,
  });
  assert.deepEqual(c.ads.map((a) => [a.registrable_domain, a.business_key]), [['gorospelaw.com', GO], ['frasierlaw.com', 'site:frasierlaw.com'], ['parrishdevaughn.com', 'site:parrishdevaughn.com']]);
  assert.deepEqual(c.listing_sources.map((s) => [s.business_id, s.in_answer]), [[JM, true], [GO, true], [GM, true], [BB, true], [WA, false], [BB2, true]]);
  assert.deepEqual(c.named_sites, [{ sentence_index: 5, registrable_domain: 'superlawyers.com' }, { sentence_index: 5, registrable_domain: 'ash.law' }, { sentence_index: 5, registrable_domain: 'bibylaw.com' }]);
  // The tracked business by its second listing's ID: the same firm as card 4, named in the closing line, its site cited.
  assert.deepEqual(
    [c.target_match, c.target_named_in_aio, c.target_named_in_aio_cards, c.target_named_in_aio_text, c.target_cited_in_aio, c.target_in_sources_row, c.target_advertised],
    ['id', true, true, true, true, true, false],
  );
  const g = captureDigest(c);
  assert.deepEqual(g.sources_only, [{ ids: [WA], name: null, position: 5 }]);
  assert.equal(g.unplaced_card_links, null);
});

test('local overview: the tracked business by its website alone; an ad for it marks it advertised', () => {
  const d = mergeReads(undefined, localPage(), 116000);
  const c = buildAioCapture(d, { keyword: 'car accident lawyer tulsa', targetDomain: 'https://www.gorospelaw.com', copy: localCopy, telemetry: facts });
  assert.deepEqual([c.target_match, c.target_named_in_aio_cards, c.target_named_in_aio_text, c.target_cited_in_aio, c.target_advertised], ['domain', true, false, true, true]);
});

// sell my house fast, 2026-11-21 (trimmed): a written answer with no business cards that names three
// local cash buyers (each linked to its listing in the copy) and cites their sites; the page keeps
// most sources twice; one cited video sits outside its sentence on the page; three ads.
const TD = '/g/11b75pyyph', OC = '/g/11sz1jwg88', SH = '/g/11xf7jnn6t';
const ZL = 'https://www.zillow.com/learn/sell-my-house-fast/';
const ODT = 'https://www.opendoor.com/sell/tulsa_ok';
const OCB = 'https://oklahomacashbuy.com/sell-my-house-fast-tulsa';
const YTQ = 'https://www.youtube.com/watch?v=QnrJgxFb7mI&t=23';
const YT3 = 'https://www.youtube.com/watch?v=3Ued22DNfmM&t=18';
const textPage = () =>
  page(
    [
      {
        text: 'To sell a house fast in Tulsa, you can choose between a direct cash sale, an iBuyer offer, or a quick listing.',
        cites: [cite(ZL), cite('https://www.zillow.com', { title: 'How to Sell a House Fast | Zillow' }), cite('https://topdollarhomeoffer.com', { title: 'Sell My House Fast Tulsa | We Buy Houses for Cash' }), cite('https://www.youtube.com', { title: 'Want to Sell Fast? How to Sell Your House in Just 1 Week' })],
      },
      {
        text: 'Local Cash Buyers: Buy homes as-is with no repairs. Local Tulsa options include Top Dollar Home Offer, Oklahoma Cash Buy, and Sell House Tulsa.',
        cites: [cite(ODT), cite('https://www.opendoor.com', { title: 'Sell your house fast in Tulsa Ok for cash - Opendoor' }), cite('https://topdollarhomeoffer.com'), cite(OCB), cite('https://www.sellhousetulsa.com')],
      },
      {
        text: 'iBuyers: Platforms like Opendoor and Offerpad offer fast cash or flexible closing timelines.',
        cites: [cite('https://www.opendoor.com'), cite('https://www.opendoor.com', { title: 'Opendoor | Sell your home the minute you’re ready.' }), cite('https://www.offerpad.com', { title: 'Offerpad | Get a Cash Offer for Your Home Today.' })],
      },
      {
        text: 'Quick Traditional Sale: Best if your home is move-in ready and you want to maximize price.',
        cites: [cite(YTQ), cite('https://www.youtube.com', { title: 'Top 5 Tips to Sell Your House FASTER and for More MONEY' })],
      },
    ],
    [
      row(1, ZL, { sentences: [1] }),
      row(2, 'https://topdollarhomeoffer.com', { sentences: [1, 2], title: 'Sell My House Fast Tulsa | We Buy Houses for Cash' }),
      row(3, ODT, { sentences: [2] }),
      row(4, YTQ, { sentences: [4] }),
      row(5, YT3),
      row(6, 'https://joshandkatebuy.com / sell-my-home / fast-for-cash'),
      row(7, 'https://www.marketunity.us'),
      row(8, 'https://dawnpropertybuyers.com / fast-cash-offer / your-home'),
    ],
  );
const textCopy = [
  `To sell a house fast in Tulsa, you can choose between a direct cash sale, an iBuyer offer, or a quick listing. [1] (${ZL}), [2] (https://topdollarhomeoffer.com/), [3] (${YTQ})`,
  '',
  'Fastest Options',
  `• Local Cash Buyers: Buy homes as-is with no repairs. Local Tulsa options include Top Dollar Home Offer (${kg(TD, 'Top Dollar Home Offer')}), Oklahoma Cash Buy (${kg(OC, 'Oklahoma Cash Buy')}), and Sell House Tulsa (${kg(SH, 'Sell House Tulsa')}). [1] (${ODT}), [2] (https://topdollarhomeoffer.com/), [3] (${OCB}), [4] (https://www.sellhousetulsa.com/)`,
  '• iBuyers: Platforms like Opendoor and Offerpad offer fast cash or flexible closing timelines. [1] (https://www.opendoor.com/), [2] (https://www.offerpad.com/)',
  `• Quick Traditional Sale: Best if your home is move-in ready and you want to maximize price. [1] (${YT3}), [2] (${YTQ})`,
  '',
  "SponsoredIf you're considering a direct cash sale, here are local cash buyers to explore:",
  'joshandkatebuy.com',
  'The #1 Cash House Offers - Sell As Is No Fees.',
  'marketunity.us',
  'We Pay Cash Directly - Sell As-Is',
  'dawnpropertybuyers.com',
  "We'll Buy Your Home Today",
].join('\n');

test('written answer: businesses named in the text by their Google IDs, joined to the sites cited beside them; the tracked one named and cited', () => {
  const d = mergeReads(undefined, textPage(), 112000);
  const c = buildAioCapture(d, { keyword: 'sell my house fast', targetBusinessId: TD, copy: textCopy, telemetry: facts });
  assert.equal(c.telemetry.copy_used, true);
  assert.equal(c.overview_mode, 'web_synthesis');
  assert.equal(c.card_action_links.length, 0);
  assert.deepEqual(
    c.businesses.filter((b) => b.in_answer).map((b) => [b.business_ids, b.domains, b.business_name, b.named_in_sentences, b.cited_in_sentences]),
    [
      [[TD], ['topdollarhomeoffer.com'], 'Top Dollar Home Offer', [2], [1, 2]],
      [[OC], ['oklahomacashbuy.com'], 'Oklahoma Cash Buy', [2], [2]],
      [[SH], ['sellhousetulsa.com'], 'Sell House Tulsa', [2], [2]],
    ],
  );
  assert.deepEqual(
    [c.target_match, c.target_named_in_aio, c.target_named_in_aio_cards, c.target_named_in_aio_text, c.target_cited_in_aio],
    ['id', true, false, true, true],
  );
  // Nine different pages: each source once, however many forms the page kept it in; the video the
  // page held outside its sentence is the one the copy cites under "Quick Traditional Sale".
  assert.equal(c.counts.cited_web_pages_count, 9);
  assert.deepEqual(c.unreferenced_web_sources, []);
  assert.deepEqual(c.ads.map((a) => a.registrable_domain), ['joshandkatebuy.com', 'marketunity.us', 'dawnpropertybuyers.com']);
  assert.equal(c.counts.named_businesses_count, 3);
  assert.deepEqual(
    c.named_sites.map((s) => [s.sentence_index, s.registrable_domain]),
    [[2, 'topdollarhomeoffer.com'], [2, 'oklahomacashbuy.com'], [2, 'sellhousetulsa.com'], [3, 'opendoor.com'], [3, 'offerpad.com']],
  );
  assert.equal(c.sentence_citations.find((x) => x.sentence_index === 2 && x.clean_url === ODT)?.page_title, 'Sell your house fast in Tulsa Ok for cash - Opendoor');
  assert.equal(c.sentence_citations.find((x) => x.sentence_index === 3 && x.clean_url === 'https://www.opendoor.com/')?.page_title, 'Opendoor | Sell your home the minute you’re ready.');
  // By website alone, the same answer; with neither saved, nothing to match.
  const byDomain = buildAioCapture(d, { keyword: 'sell my house fast', targetDomain: 'topdollarhomeoffer.com', copy: textCopy, telemetry: facts });
  assert.deepEqual([byDomain.target_match, byDomain.target_named_in_aio_text, byDomain.target_cited_in_aio], ['domain', true, true]);
  const none = buildAioCapture(d, { keyword: 'sell my house fast', copy: textCopy, telemetry: facts });
  assert.deepEqual([none.target_match, none.target_named_in_aio, none.target_cited_in_aio], [null, false, false]);
});

test('without the copy: the page read alone, each source once; ads still apart by how their addresses are written', () => {
  const d = mergeReads(undefined, textPage(), 112000);
  const c = buildAioCapture(d, { keyword: 'sell my house fast', targetDomain: 'topdollarhomeoffer.com', telemetry: facts });
  assert.equal(c.telemetry.copy_used, false);
  assert.deepEqual(
    c.sentence_citations.filter((x) => x.sentence_index === 1).map((x) => [x.clean_url, x.page_title]),
    [[ZL, 'How to Sell a House Fast | Zillow'], ['https://topdollarhomeoffer.com/', 'Sell My House Fast Tulsa | We Buy Houses for Cash'], ['https://www.youtube.com/', 'Want to Sell Fast? How to Sell Your House in Just 1 Week']],
  );
  assert.deepEqual(c.ads.map((a) => a.registrable_domain), ['joshandkatebuy.com', 'marketunity.us', 'dawnpropertybuyers.com']);
  // Cited, though no name in the text can be read without the copy.
  assert.deepEqual([c.target_match, c.target_cited_in_aio, c.target_named_in_aio], [null, true, false]);
  assert.equal(c.counts.named_businesses_count, 0);
});

test('a copy from another search (a stale clipboard) is not used', () => {
  const d = mergeReads(undefined, textPage(), 112000);
  const c = buildAioCapture(d, { keyword: 'sell my house fast', copy: localCopy, telemetry: facts });
  assert.equal(c.telemetry.copy_used, false);
  assert.equal(c.counts.named_businesses_count, 0);
});

test('expansion is counted from the first read that shows the answer, not from one that caught it loading', () => {
  const A = 'Cash buyers can close in about a week.';
  const B = 'Listing with an agent usually gets a higher price.';
  const C = 'Local investors also buy homes as-is.';
  let d = mergeReads(undefined, page([], [row(1, 'https://www.zillow.com/learn/')]), 111500);
  d = mergeReads(d, page([{ text: A, cites: [cite('https://www.opendoor.com/sell/tulsa_ok')] }, { text: B, cites: [cite('https://www.homelight.com/')] }], [row(1, 'https://www.zillow.com/learn/')]), 116300);
  assert.deepEqual(d.meta.stats, { initialSentenceCount: 2, initialEntryCount: 3, expandedSeen: false, postExpandAddedSentences: 0, postExpandAddedEntries: 0 });
  assert.ok(d.clusters.every((c) => c.phase === 'initial'));
  d = mergeReads(d, page([{ text: A, cites: [] }, { text: C, cites: [] }, { text: B, cites: [] }], []), 150000);
  assert.equal(d.meta.stats?.expandedSeen, true);
  assert.equal(d.meta.stats?.postExpandAddedSentences, 1);
});
