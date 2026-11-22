import test from 'node:test';
import assert from 'node:assert/strict';
import { googleIdOfLink, isSourceViewer, mergeReads, type AioDossier, type AioPoolRow, type AioSourceEntry } from '../packages/core/aioSources';
import { aiPresence, buildAioCapture, captureDigest, entityRoster, noPageRead, NOT_WATCHED, readCopiedAnswer, type WatcherFacts } from '../packages/core/aioCapture';

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
  // Each card's description is the first citing line under its name; the closing line is no card's.
  assert.deepEqual(c.sentences.map((x) => x.card), [1, 2, 3, 4, null]);
});

test('local overview: featured by card (placement kept), listings cited as sources, websites only from card buttons, a linked name in a "browse" line is named only', () => {
  const d = mergeReads(undefined, localPage(), 116000);
  // The first screen showed three cards; Biby's came only after "Show more".
  const shownBeforeExpansion = ['Law Offices of Jeff Martin', 'Gorospe Law Group', 'Graves McLain Injury Lawy…'];
  const c = buildAioCapture(d, { keyword: 'car accident lawyer tulsa', targetBusinessId: BB, targetDomain: 'bibylaw.com', mapPackRank: 3, copy: localCopy, overviewOnScreen: true, shownBeforeExpansion, telemetry: facts });
  assert.equal(c.capture_status, 'parsed');
  assert.equal(c.telemetry.copy_used, true);
  assert.equal(c.overview_mode, 'local_entity_cards');
  // Four cards, each with its own photo, Directions and Website; nothing else became a card.
  assert.deepEqual(
    entityRoster(c).map((r) => [r.card_position, r.business_name, r.business_id, r.after_expansion, r.same_website_as, r.street_address, r.gbp_website_domain, r.advertised, r.sources_row_position]),
    [
      [1, 'Law Offices of Jeff Martin', JM, false, [], '1800 S Baltimore Ave Ste 1000, Tulsa, OK 74119', 'jeffmartinlaw.com', false, 1],
      [2, 'Gorospe Law Group', GO, false, [], '1825 E 15th St, Tulsa, OK 74104', 'gorospelaw.com', true, 2],
      [3, 'Graves McLain Injury Lawyers', GM, false, [], '4137 S Harvard Ave, Tulsa, OK 74135', 'gravesmclain.com', false, 3],
      [4, 'Biby Law Firm Injury and Accident Lawyers', BB, true, [], '9810 E 42nd St #211, Tulsa, OK 74146', 'bibylaw.com', false, 4],
    ],
  );
  assert.equal(c.card_action_links.length, 12);
  assert.ok(c.card_action_links.every((l) => l.card_position !== null));
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
  assert.equal(c.sentence_citations.find((x) => x.clean_url === SL)?.page_title, 'Best Tulsa, OK Car Accident Attorneys - Super Lawyers');
  const biz = (k: string) => c.businesses.find((b) => b.business_key === k)!;
  const roles = (k: string) => {
    const b = biz(k);
    return [b.featured_placement, b.named_in_sentences, b.listing_cited_in_sentences, b.listing_cited_links, b.website_cited_in_sentences, b.website_cited_unverified_in_sentences];
  };
  // Jeff Martin: featured once (its card); its listing cited as a source by eleven links under four sentences.
  assert.deepEqual(roles(JM), [{ kind: 'card', card_position: 1, card_count: 4, after_expansion: false }, [], [1, 2, 3, 4], 5, [], []]);
  assert.deepEqual(roles(GO), [{ kind: 'card', card_position: 2, card_count: 4, after_expansion: false }, [], [2], 1, [], []]);
  // Biby's card: its website (its card's Website button) cited in its own description and again in the closing line.
  assert.deepEqual(roles(BB), [{ kind: 'card', card_position: 4, card_count: 4, after_expansion: true }, [], [], 0, [4, 5], []]);
  // Biby's other listing: linked in a line that points elsewhere ("browse … through"): named, not
  // featured, and no website (sharing a sentence with bibylaw.com does not make it its own).
  assert.deepEqual(roles(BB2), [null, [5], [], 0, [], []]);
  assert.deepEqual([biz(BB2).featured, biz(BB2).linked_in_sentences, biz(BB2).recommended_in_sentences, biz(BB2).domain, biz(BB2).same_website_as], [false, [5], [], null, []]);
  // ASH LAW: named in the closing line's words, its site cited there; no card. Super Lawyers is a directory: a source.
  assert.deepEqual([biz('site:ash.law').business_name, biz('site:ash.law').kind, ...roles('site:ash.law')], ['ASH LAW', 'site', null, [5], [], 0, [5], []]);
  assert.equal(c.businesses.some((b) => b.domain === 'superlawyers.com'), false);
  assert.deepEqual(
    c.site_citations.map((x) => [x.sentence_index, x.registrable_domain, x.credited_to, x.unverified_to]),
    [[4, 'bibylaw.com', [BB], []], [5, 'superlawyers.com', [], []], [5, 'ash.law', ['site:ash.law'], []], [5, 'bibylaw.com', [BB], []]],
  );
  assert.deepEqual(c.counts, {
    sentences_count: 5,
    cited_web_pages_count: 3,
    websites_cited_count: 3,
    cited_gbp_listings_count: 2,
    card_businesses_count: 4,
    featured_businesses_count: 4,
    named_businesses_count: 6,
    unreferenced_web_sources_count: 0,
    card_action_links_count: 12,
    sources_row_listings_count: 6,
    sources_only_businesses_count: 1,
    ads_count: 3,
  });
  // Ads by where they sit: Gorospe keeps its card and is marked advertised.
  assert.deepEqual(c.ads.map((a) => [a.registrable_domain, a.business_key]), [['gorospelaw.com', GO], ['frasierlaw.com', 'site:frasierlaw.com'], ['parrishdevaughn.com', 'site:parrishdevaughn.com']]);
  assert.deepEqual([biz('site:frasierlaw.com').business_name, biz('site:parrishdevaughn.com').business_name], ['Frasier Law', 'Parrish DeVaughn PLLC']);
  assert.deepEqual(c.listing_sources.map((s) => [s.business_id, s.in_answer]), [[JM, true], [GO, true], [GM, true], [BB, true], [WA, false], [BB2, true]]);
  // The tracked business by its card's ID: featured at card #4, after "Show more"; its website cited twice.
  assert.deepEqual(
    [c.target_identity, c.target_featured_in_aio, c.target_featured_placement, c.target_listing_cited_as_source, c.target_website_cited, c.target_named_in_prose, c.target_in_sources_row, c.target_advertised],
    ['listing', true, { kind: 'card', card_position: 4, card_count: 4, after_expansion: true }, false, 'verified', false, true, false],
  );
  assert.deepEqual(c.target_receipts.map((r) => [r.role, r.sentence_index ?? r.card_position]), [['card', 4], ['website_citation', 4], ['website_citation', 5], ['sources_row', null]]);
  const g = captureDigest(c);
  assert.deepEqual(g.sources_only, [{ key: WA, name: null, position: 5 }]);
  assert.deepEqual(g.named_in_prose.map((x) => x.key), [BB2, 'site:ash.law']);
  assert.deepEqual(g.listings_cited_as_source.map((x) => [x.key, x.links]), [[JM, 5], [GO, 1]]);
  assert.equal(g.unplaced_card_links, null);
});

test('local overview: the tracked business found by its website, by its card; an inline name only in a "browse" line is not featured', () => {
  const d = mergeReads(undefined, localPage(), 116000);
  const byGorospe = buildAioCapture(d, { keyword: 'car accident lawyer tulsa', targetDomain: 'https://www.gorospelaw.com', copy: localCopy, telemetry: facts });
  assert.deepEqual(
    [byGorospe.target_identity, byGorospe.target_featured_in_aio, byGorospe.target_listing_cited_as_source, byGorospe.target_website_cited, byGorospe.target_advertised],
    ['website', true, true, false, true],
  );
  // bibylaw.com is the website Biby's card opens: that card, not the other listing that only shares a line with it.
  const byBiby = buildAioCapture(d, { keyword: 'car accident lawyer tulsa', targetDomain: 'bibylaw.com', copy: localCopy, telemetry: facts });
  assert.deepEqual([byBiby.target_identity, byBiby.target_featured_placement, byBiby.target_website_cited], ['website', { kind: 'card', card_position: 4, card_count: 4, after_expansion: null }, 'verified']);
  const bySecond = buildAioCapture(d, { keyword: 'car accident lawyer tulsa', targetBusinessId: BB2, copy: localCopy, telemetry: facts });
  assert.deepEqual(
    [bySecond.target_featured_in_aio, bySecond.target_named_in_prose, bySecond.target_named_in_aio_text, bySecond.target_website_cited, bySecond.target_listing_cited_as_source],
    [false, true, true, false, false],
  );
  assert.deepEqual(bySecond.target_receipts.map((r) => [r.role, r.sentence_index]), [['inline_mention', 5], ['sources_row', null]]);
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

test('written answer: a linked name in a recommending sentence is featured inline; its website is verified only once saved', () => {
  const d = mergeReads(undefined, textPage(), 112000);
  const c = buildAioCapture(d, { keyword: 'sell my house fast', targetBusinessId: TD, targetName: 'Top Dollar Home Offer', copy: textCopy, overviewOnScreen: true, telemetry: facts });
  assert.equal(c.telemetry.copy_used, true);
  assert.equal(c.overview_mode, 'web_synthesis');
  assert.equal(c.card_action_links.length, 0);
  assert.deepEqual(
    c.businesses.filter((b) => b.in_answer).map((b) => [b.business_key, b.domain, b.probable_domain, b.business_name, b.featured_placement, b.named_in_sentences, b.website_cited_in_sentences, b.website_cited_unverified_in_sentences]),
    [
      [TD, null, 'topdollarhomeoffer.com', 'Top Dollar Home Offer', { kind: 'inline', sentence_index: 2 }, [2], [], [1, 2]],
      [OC, null, 'oklahomacashbuy.com', 'Oklahoma Cash Buy', { kind: 'inline', sentence_index: 2 }, [2], [], [2]],
      [SH, null, 'sellhousetulsa.com', 'Sell House Tulsa', { kind: 'inline', sentence_index: 2 }, [2], [], [2]],
      // Named in the words, no Google link: businesses known by their websites.
      ['site:opendoor.com', 'opendoor.com', null, 'Opendoor', null, [3], [2, 3], []],
      ['site:offerpad.com', 'offerpad.com', null, 'Offerpad', null, [3], [3], []],
    ],
  );
  // Found by its ID, no website saved: featured inline, named; its website cited but unverified.
  assert.deepEqual(
    [c.target_identity, c.target_featured_placement, c.target_listing_cited_as_source, c.target_website_cited, c.target_named_in_prose],
    ['listing', { kind: 'inline', sentence_index: 2 }, false, 'unverified', true],
  );
  assert.deepEqual(c.target_receipts.map((r) => [r.role, r.sentence_index]), [['inline_link', 2], ['website_citation_unverified', 1], ['website_citation_unverified', 2]]);
  assert.deepEqual(aiPresence(c), {
    v: 280,
    status: 'parsed',
    identity: 'listing',
    featured: { kind: 'inline', sentence_index: 2 },
    named: true,
    listingCitedAsSource: false,
    websiteCited: 'unverified',
    advertised: false,
    suggestedId: null,
    citedSites: ['zillow.com', 'topdollarhomeoffer.com', 'youtube.com', 'opendoor.com', 'oklahomacashbuy.com', 'sellhousetulsa.com', 'offerpad.com'],
    listingInSources: null,
    // Each flag with what it stands on: the sentence in Google's words, and the address.
    evidence: [
      { flag: 'featured', sentence: 2, card: null, url: null, text: 'Local Cash Buyers: Buy homes as-is with no repairs. Local Tulsa options include Top Dollar Home Offer, Oklahoma Cash Buy, and Sell House Tulsa.' },
      { flag: 'website_possible', sentence: 1, card: null, url: 'https://topdollarhomeoffer.com/', text: 'To sell a house fast in Tulsa, you can choose between a direct cash sale, an iBuyer offer, or a quick listing.' },
      { flag: 'website_possible', sentence: 2, card: null, url: 'https://topdollarhomeoffer.com/', text: 'Local Cash Buyers: Buy homes as-is with no repairs. Local Tulsa options include Top Dollar Home Offer, Oklahoma Cash Buy, and Sell House Tulsa.' },
    ],
  });
  assert.equal(c.counts.cited_web_pages_count, 9);
  assert.deepEqual([c.counts.featured_businesses_count, c.counts.named_businesses_count, c.counts.websites_cited_count], [3, 5, 7]);
  assert.deepEqual(c.unreferenced_web_sources, []);
  assert.deepEqual(c.ads.map((a) => a.registrable_domain), ['joshandkatebuy.com', 'marketunity.us', 'dawnpropertybuyers.com']);
  assert.equal(c.sentence_citations.find((x) => x.sentence_index === 2 && x.clean_url === ODT)?.page_title, 'Sell your house fast in Tulsa Ok for cash - Opendoor');
  assert.equal(c.sentence_citations.find((x) => x.sentence_index === 3 && x.clean_url === 'https://www.opendoor.com/')?.page_title, 'Opendoor | Sell your home the minute you’re ready.');
  // Its ID and website saved: the same placement, the website verified.
  const saved = buildAioCapture(d, { keyword: 'sell my house fast', targetBusinessId: TD, targetDomain: 'topdollarhomeoffer.com', targetName: 'Top Dollar Home Offer', copy: textCopy, telemetry: facts });
  assert.deepEqual([saved.target_identity, saved.target_featured_placement, saved.target_website_cited], ['listing', { kind: 'inline', sentence_index: 2 }, 'verified']);
  // Its website alone saved: found by it.
  const byDomain = buildAioCapture(d, { keyword: 'sell my house fast', targetDomain: 'topdollarhomeoffer.com', copy: textCopy, telemetry: facts });
  assert.deepEqual([byDomain.target_identity, byDomain.target_featured_in_aio, byDomain.target_website_cited], ['website', true, 'verified']);
  // Nothing saved but its exact name: the same placement, found less surely, and the ID to save.
  const byName = buildAioCapture(d, { keyword: 'sell my house fast', targetName: 'Top Dollar Home Offer', copy: textCopy, telemetry: facts });
  assert.deepEqual(
    [byName.target_identity, byName.target_featured_placement, byName.target_named_in_prose, byName.target_website_cited, byName.target_suggested_id],
    ['name', { kind: 'inline', sentence_index: 2 }, true, 'unverified', TD],
  );
  const none = buildAioCapture(d, { keyword: 'sell my house fast', copy: textCopy, telemetry: facts });
  assert.deepEqual([none.target_identity, none.target_named_in_aio, none.target_cited_in_aio], [null, false, false]);
});

test('without the copy: the page read alone, each source once; names read from the page; ads apart by how their addresses are written', () => {
  const d = mergeReads(undefined, textPage(), 112000);
  const c = buildAioCapture(d, { keyword: 'sell my house fast', targetDomain: 'topdollarhomeoffer.com', telemetry: facts });
  assert.equal(c.telemetry.copy_used, false);
  assert.deepEqual(
    c.sentence_citations.filter((x) => x.sentence_index === 1).map((x) => [x.clean_url, x.page_title]),
    [[ZL, 'How to Sell a House Fast | Zillow'], ['https://topdollarhomeoffer.com/', 'Sell My House Fast Tulsa | We Buy Houses for Cash'], ['https://www.youtube.com/', 'Want to Sell Fast? How to Sell Your House in Just 1 Week']],
  );
  assert.deepEqual(c.ads.map((a) => a.registrable_domain), ['joshandkatebuy.com', 'marketunity.us', 'dawnpropertybuyers.com']);
  // No Google link can be read without the copy: named by its site's name in the words, its website cited.
  assert.deepEqual([c.target_identity, c.target_featured_in_aio, c.target_named_in_prose, c.target_website_cited], ['website', false, true, 'verified']);
  assert.equal(c.counts.featured_businesses_count, 0);
});

test("no page read (every customer point): Google's copy alone, used once this run's own snapshots show it", () => {
  // The first screen's words: the overview's cards, as the phone's snapshot labels them.
  const screen = ['AI Overview', 'Law Offices of Jeff Martin Rated 4.7 out of 5, 890 reviews.', 'Gorospe Law Group Rated 5.0 out of 5, 183 reviews.'];
  const before = ['Law Offices of Jeff Martin', 'Gorospe Law Group', 'Graves McLain Injury Lawyers', 'Biby Law Firm Injury and Accident Lawyers'];
  const opts = { keyword: 'car accident lawyer tulsa', targetBusinessId: BB, copy: localCopy, copyCheck: screen, overviewOnScreen: true, shownBeforeExpansion: before, telemetry: NOT_WATCHED };
  const c = buildAioCapture(noPageRead('car accident lawyer tulsa'), opts);
  assert.deepEqual([c.capture_status, c.telemetry.copy_used, c.telemetry.stop_reason, c.overview_mode], ['parsed', true, 'not_watched', 'local_entity_cards']);
  // Its card in the copy's order; no card buttons were read, so the site its description cites (and
  // that fits its name) is its website only unverified.
  assert.deepEqual(
    [c.target_identity, c.target_featured_placement, c.target_listing_cited_as_source, c.target_website_cited, c.target_named_in_prose, c.target_advertised],
    ['listing', { kind: 'card', card_position: 4, card_count: 4, after_expansion: false }, false, 'unverified', false, false],
  );
  const biz = (k: string) => c.businesses.find((b) => b.business_key === k)!;
  // Its own description's citation is its alone; the closing line's goes to both Biby listings, unverified.
  assert.deepEqual([biz(BB).website_cited_unverified_in_sentences, biz(BB2).website_cited_unverified_in_sentences], [[4, 5], [5]]);
  assert.deepEqual([biz(JM).listing_cited_links, biz(JM).featured_placement], [5, { kind: 'card', card_position: 1, card_count: 4, after_expansion: false }]);
  // The Sponsored block names Gorospe: advertised, and its card kept.
  assert.deepEqual([biz(GO).advertised, biz(GO).featured], [true, true]);
  // Its website saved: verified.
  assert.equal(buildAioCapture(noPageRead('q'), { ...opts, targetDomain: 'bibylaw.com' }).target_website_cited, 'verified');
  // A copy the snapshots do not show (a stale clipboard), or no copy at all: the overview was not read.
  const stale = buildAioCapture(noPageRead('q'), { ...opts, copyCheck: ['AI Overview', 'Cash buyers can close in about a week.'] });
  assert.deepEqual([stale.capture_status, stale.telemetry.copy_used, stale.target_featured_in_aio], ['unparsed', false, null]);
  assert.equal(buildAioCapture(noPageRead('q'), { ...opts, copy: null }).capture_status, 'unparsed');
  assert.equal(aiPresence(stale).status, 'unparsed');
  // A written answer: its opening sentence on the first screen is enough.
  const text = buildAioCapture(noPageRead('q'), { keyword: 'sell my house fast', targetBusinessId: TD, targetName: 'Top Dollar Home Offer', copy: textCopy, copyCheck: ['AI Overview', 'To sell a house fast in Tulsa, you can choose between a direct cash sale'], overviewOnScreen: true, telemetry: NOT_WATCHED });
  assert.deepEqual(aiPresence(text), { ...aiPresence(text), status: 'parsed', identity: 'listing', featured: { kind: 'inline', sentence_index: 2 }, named: true, listingCitedAsSource: false, websiteCited: 'unverified', advertised: false });
});

test('found by its exact name on a website the answer names it by: that website is cited, but whose it is stays unverified', () => {
  const d = mergeReads(undefined, textPage(), 112000);
  const c = buildAioCapture(d, { keyword: 'sell my house fast', targetName: 'Top Dollar Home Offer', telemetry: facts });
  assert.deepEqual([c.target_identity, c.target_named_in_prose, c.target_website_cited], ['name', true, 'unverified']);
  assert.deepEqual([...new Set(c.target_receipts.map((r) => r.role))].sort(), ['prose_name', 'website_citation_unverified']);
  // Its website saved: the same site, now known to be its own.
  const saved = buildAioCapture(d, { keyword: 'sell my house fast', targetName: 'Top Dollar Home Offer', targetDomain: 'topdollarhomeoffer.com', telemetry: facts });
  assert.deepEqual([saved.target_identity, saved.target_website_cited], ['website', 'verified']);
});

test('a copy from another search (a stale clipboard) is not used', () => {
  const d = mergeReads(undefined, textPage(), 112000);
  const c = buildAioCapture(d, { keyword: 'sell my house fast', copy: localCopy, telemetry: facts });
  assert.equal(c.telemetry.copy_used, false);
  assert.equal(c.counts.featured_businesses_count, 0);
  assert.equal(c.businesses.some((b) => b.business_id === JM), false);
});

test('an AI Overview on screen that could not be read is unparsed (its flags unknown), not a row of zeros', () => {
  const empty = page([], []);
  const c = buildAioCapture(empty, { keyword: 'q', targetBusinessId: TD, targetDomain: 'topdollarhomeoffer.com', overviewOnScreen: true, telemetry: facts });
  assert.deepEqual([c.capture_status, c.target_featured_in_aio, c.target_website_cited, c.target_cited_in_aio], ['unparsed', null, null, null]);
  assert.equal(buildAioCapture(empty, { keyword: 'q', overviewOnScreen: false, telemetry: facts }).capture_status, 'no_overview');
  assert.equal(buildAioCapture(empty, { keyword: 'q', telemetry: facts }).capture_status, 'unparsed', 'unknown screen: not "absent"');
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
