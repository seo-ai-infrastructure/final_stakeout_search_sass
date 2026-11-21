import test from 'node:test';
import assert from 'node:assert/strict';
import { rankWithoutFinder, readAiCopy } from '../packages/core/serpEvidence';

// Google's own "Copy text" of an AI answer, 2026-11-20 (Huntington NY, "best personal injury
// attorneys near me"): a written section of three businesses as bullets, then three business
// cards. Shortened; structure kept exactly (tabs before the inner bullets).
const COPY = [
  'Top-rated personal injury attorneys serving Huntington, NY include Brandon J. Broderick, Personal Injury Attorney at Law, Zandra Law, PLLC (https://www.google.com/search?kgmid=%2Fg%2F11v_4q5my3), and Brian J. Levy & Associates, P.C (https://www.google.com/search?kgmid=%2Fg%2F11g6hvd06t). Most offer free consultations. [1] (https://www.google.com/searchviewer/10?svid=AAA), [2] (https://www.google.com/searchviewer/10?svid=BBB)',
  '',
  'Huntington & Huntington Station',
  '',
  '• Brandon J. Broderick, Personal Injury Attorney at Law',
  '\t• Address: 215 E Main St #203, Huntington, NY 11743',
  '\t• Phone: +1 877-641-3853',
  '\t• Rating: 5/5 (83 reviews) | Hours: Open 24 hours, Mon–Sun',
  '\t• Focus: Motor vehicle and pedestrian accidents. Offers free consultations. [1] (https://www.google.com/searchviewer/10?svid=CCC)',
  '• Zandra Law, PLLC (https://www.google.com/search?kgmid=%2Fg%2F11v_4q5my3)',
  '\t• Address: 1100 New York Ave A, Huntington Station, NY 11746',
  '\t• Rating: 5/5 (63 reviews) | Hours: Open 24 hours, Mon–Sun',
  '• Mandler & Sieger, LLP (https://www.google.com/search?kgmid=%2Fg%2F1tnpggrh)',
  '\t• Address: 1609 New York Ave, Huntington Station, NY 11746',
  '\t• Focus: Founded in 1990. [1] (https://mandlersieger.com/), [2] (https://www.google.com/searchviewer/10?svid=DDD)',
  '',
  'Nearby Long Island Options',
  '',
  'Brian J. Levy & Associates, P.C. (https://www.google.com/search?kgmid=%2Fg%2F11g6hvd06t&q=Brian+J.+Levy+%26+Associates%2C+P.C.)',
  '5.0(1.8K) · Personal injury attorney',
  'Open · Syosset, NY · 6.9 mi',
  '• Address: 75 Jackson Ave, Syosset, NY 11791',
  '• Phone: +1 516-496-1777',
  '• Focus: Over 15 years of experience. [1] (https://www.google.com/searchviewer/10?svid=EEE)',
  'Law Office of Carl Maltese (https://www.google.com/search?kgmid=%2Fg%2F1tdc67_q&q=Law+Office+of+Carl+Maltese)',
  '5.0(188) · Personal injury attorney',
  'Open · Smithtown, NY · 7.6 mi',
  '• Address: 1050 W Jericho Turnpike, Smithtown, NY 11787',
  'The Odierno Law Firm Accident and Injury Lawyers (https://www.google.com/search?kgmid=%2Fg%2F1tczlhw1&q=The+Odierno+Law+Firm)',
  '4.9(667) · Personal injury attorney',
  '• Address: 145 Pinelawn Rd #130, Melville, NY 11747',
  '',
  'Comparison',
  '',
  'Firm\tLocation\tRating\tHours',
  'Brandon J. Broderick\tHuntington, NY\t5/5 (83)\tOpen 24 hours',
  'Zandra Law, PLLC (https://www.google.com/search?kgmid=%2Fg%2F11v_4q5my3)\tHuntington Station, NY\t5/5 (63)\tOpen 24 hours',
  '',
  'Most users on a Reddit discussion agree on several firms, including Brandon J. Broderick (https://www.google.com/search?kgmid=%2Fg%2F11b5yx1h9w), Block O’Toole & Murphy, and Duffy & Duffy. [1] (https://www.reddit.com/r/longisland/comments/x/)',
].join('\n');

test('a written section of businesses (bullets with indented details) is read, before the cards, in order', () => {
  const names = readAiCopy(COPY).businesses.map((b) => b.name);
  assert.deepEqual(names, [
    'Brandon J. Broderick, Personal Injury Attorney at Law',
    'Zandra Law, PLLC',
    'Mandler & Sieger, LLP',
    'Brian J. Levy & Associates, P.C.',
    'Law Office of Carl Maltese',
    'The Odierno Law Firm Accident and Injury Lawyers',
  ]);
  const b = readAiCopy(COPY).businesses;
  assert.equal(b[0].kgmid, ''); // named without a Google link
  assert.equal(b[1].kgmid, '/g/11v_4q5my3');
  assert.ok(b[0].lines.some((l) => /215 E Main St/.test(l)));
  // A card's own detail bullets ("• Address: ...") are details, never businesses.
  assert.ok(!names.some((n) => /^Address|^Phone|^Focus/.test(n)));
});

test('the rank comes from the copied answer when it names more businesses than the cards on screen', () => {
  const card = (n: string) => `<node class="android.view.View" text="${n} Rated 5.0 out of 5, 100 reviews. ·Personal injury attorney Open ·Syosset, NY ·6.9 mi" />`;
  const xml = `<hierarchy><node class="android.widget.TextView" text="AI Overview" />${['Brian J. Levy &amp; Associates, P.C.', 'Law Office of Carl Maltese', 'The Odierno Law Firm Accident and Injury Lawyers'].map(card).join('')}<node class="android.widget.Button" text="Copy text" /></hierarchy>`;
  const target = 'Brandon J. Broderick, Personal Injury Attorney at Law';
  const withCopy = rankWithoutFinder([null], [xml], target, COPY);
  assert.equal(withCopy.from, 'ai_overview_list');
  assert.equal(withCopy.rank, 1);
  assert.equal(withCopy.list.length, 6);
  // Without the copied text nothing changes from before.
  const without = rankWithoutFinder([null], [xml], target);
  assert.equal(without.rank, null);
  assert.ok(without.list.length <= 3);
});

test('"position zero": the business is named in the answer\'s opening sentences', async () => {
  const { aiNamesFirst } = await import('../packages/core/serpEvidence');
  assert.equal(aiNamesFirst(COPY, 'Brandon J. Broderick, Personal Injury Attorney at Law'), true);
  assert.equal(aiNamesFirst(COPY, 'Zandra Law, PLLC'), true);
  // Named further down (a card), not in the opening.
  assert.equal(aiNamesFirst(COPY, 'Law Office of Carl Maltese'), false);
  assert.equal(aiNamesFirst(COPY, 'Mandler & Sieger, LLP'), false);
  // An answer that starts straight with business cards has no opening sentence.
  assert.equal(aiNamesFirst('Law Office of Carl Maltese (https://www.google.com/search?kgmid=%2Fg%2F1tdc67_q)\n5.0(188) · Personal injury attorney', 'Law Office of Carl Maltese'), false);
  assert.equal(aiNamesFirst(null, 'Anyone'), false);
});

test('a page with no map pack has no local rank; rank totals leave such points out', async () => {
  const { noLocalResults, aiPositionOf, localRankOf } = await import('../packages/core/localRank');
  const { metrics } = await import('../packages/core/grid');
  const ai = { finderShown: false, rankFrom: 'ai_overview_list', aiPosition: 1 };
  assert.equal(noLocalResults(ai), true);
  assert.equal(localRankOf(ai, null), null);
  assert.equal(aiPositionOf(ai, null), 1);
  // Saved before the rule: the AI place sat in the rank field.
  const old = { finderShown: false, rankFrom: 'ai_overview_list' };
  assert.equal(localRankOf(old, 3), null);
  assert.equal(aiPositionOf(old, 3), 3);
  // A map pack (full list or its top three) and a single-business result keep their rank.
  assert.equal(noLocalResults({ finderShown: false, rankFrom: 'map_pack' }), false);
  assert.equal(noLocalResults({ finderShown: false, rankFrom: 'single_business' }), false);
  assert.equal(noLocalResults({}), false);
  assert.equal(localRankOf({ finderShown: false, rankFrom: 'map_pack' }, 2), 2);
  // Two points with local results (#1 and not found) and two without: rank numbers use the two.
  const m = metrics([
    { rankFound: 1, hasAiOverview: true, targetCitedInAi: true },
    { rankFound: null, hasAiOverview: false, targetCitedInAi: false },
    { rankFound: null, hasAiOverview: true, targetCitedInAi: true, noLocal: true },
    { rankFound: null, hasAiOverview: true, targetCitedInAi: false, noLocal: true },
  ]);
  assert.equal(m.solv, 50);
  assert.equal(m.arp, 1);
  assert.equal(m.aioTriggerRate, 75);
  assert.equal(m.aioCitationRate, 50);
  // Every point without a map pack: no rank numbers at all, AI numbers still there.
  const none = metrics([{ rankFound: null, hasAiOverview: true, targetCitedInAi: true, noLocal: true }]);
  assert.deepEqual([none.arp, none.atrp, none.solv, none.aioTriggerRate, none.aioCitationRate], [null, null, null, 100, 100]);
});

test('the ads a copied answer ends with ("SponsoredYou …", the word glued to the next) are never businesses or answer text', () => {
  // A bulleted business list, then the AI Overview's ads as Google's copy appends them (2026-11-21 shape).
  const copy = [
    '• Truskett Law (https://www.google.com/search?kgmid=%2Fg%2F1260lhvwn)',
    '\t• Focus: Car wrecks and wrongful death. [1] (https://truskettlaw.com/)',
    '• Greg Denney Law (https://www.google.com/search?kgmid=%2Fg%2F1tlw9lcz)',
    '\t• Focus: Auto accidents. [1] (https://gregdenneylaw.com/)',
    'SponsoredYou might consider these options:',
    'Richardson Boudreaux',
    'Since 1984 - Available by Phone 24/7',
    'Frasier Law',
    'Free Consultation',
    'joshandkatebuy.com',
  ].join('\n');
  const c = readAiCopy(copy);
  assert.deepEqual(c.businesses.map((b) => b.name), ['Truskett Law', 'Greg Denney Law']);
  assert.ok(!c.blocks.some((b) => b.kind !== 'business' && /Richardson|Frasier|joshandkatebuy/.test(b.text)));
  assert.ok(!c.businesses.some((b) => b.lines.some((l) => /Richardson|Frasier|Sponsored/.test(l))));
  assert.deepEqual(c.sponsored, ['You might consider these options:', 'Richardson Boudreaux', 'Since 1984 - Available by Phone 24/7', 'Frasier Law', 'Free Consultation', 'joshandkatebuy.com']);
  assert.equal(rankWithoutFinder([], [], 'Frasier Law', copy).rank, null, 'an advertiser is not in the answer’s list');
});
