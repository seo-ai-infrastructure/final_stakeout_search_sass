import test from 'node:test';
import assert from 'node:assert/strict';
import { aiFlagLines, aiFlagTotals, pinAi, placementText, withoutFlags, type AiPresenceData } from '../packages/core/aiFlags';
import { aiOverviewFold, readAiOverview } from '../packages/core/serpEvidence';
import { metrics } from '../packages/core/grid';
import { aioRollup } from '../packages/core/aioChecklist';
import { getListed } from '../packages/core/citeSites';

const presence = (o: Partial<AiPresenceData>): AiPresenceData => ({
  v: 284, status: 'parsed', identity: 'listing', featured: null, named: false, listingCitedAsSource: false, listingInSources: null, websiteCited: false, advertised: false, suggestedId: null, citedSites: [], evidence: [], ...o,
});
const pin = (id: string, p: AiPresenceData | null, old = false) => ({
  id, rowIdx: 0, colIdx: Number(id.replace(/\D/g, '')) || 0, status: 'COMPLETED', hasAiOverview: true, targetCitedInAi: old,
  aiCitations: p?.citedSites ?? [], insights: { ai: { shown: true, sources: p?.citedSites ?? [], named: [], ...(p ? { presence: p } : {}) } },
});
const site = 'https://topdollarhomeoffer.com/';
// Top Dollar on "sell my house fast" (the five replayed points): named in all five, featured inline in
// four, its website cited in all five but only possibly its own (no website saved then).
const topDollar = [1, 2, 3, 4, 5].map((i) =>
  pin('p' + i, presence({ identity: 'name', named: true, featured: i === 2 ? null : { kind: 'inline', sentence_index: 2 }, websiteCited: 'unverified', citedSites: ['zillow.com', 'topdollarhomeoffer.com'], evidence: [{ flag: 'website_possible', sentence: 1, card: null, text: 'To sell a house fast…', url: site }] }), true),
);

test('five points, each counted once where the business appeared: named 5, featured inline 4, no confirmed website, 5 possible', () => {
  assert.deepEqual(aiFlagTotals(topDollar), { read: 5, unread: 0, appeared: 5, featured: 4, featuredCard: 0, featuredInline: 4, named: 5, listing: 0, website: 0, possibleWebsite: 5 });
  const lines = aiFlagLines(pinAi(topDollar[0]));
  assert.deepEqual(lines.map((l) => [l.label, l.on, l.detail]), [
    ['Featured', true, 'inline recommendation'],
    ['Named in answer prose', true, null],
    ['Google listing cited as a source', false, null],
    ['Possible website citation', false, 'a cited site that fits the name; confirm it is the business’s website'],
  ]);
  // The address Google cited stays with the flag, for review.
  assert.deepEqual(lines[3].evidence.map((e) => e.url), [site]);
});

test('a card placement reads with its place among the cards; "after Show more" only when the first screen did not hold it', () => {
  assert.equal(placementText({ kind: 'card', card_position: 6, card_count: 10, after_expansion: false }), 'card #6 of 10');
  assert.equal(placementText({ kind: 'card', card_position: 6, card_count: 10, after_expansion: true }), 'card #6 of 10, after “Show more”');
  assert.equal(placementText({ kind: 'card', card_position: 6, after_expansion: null }), 'card #6');
});

test("a listing only among the overview's own sources counts as cited as a source, and says where", () => {
  const a = pinAi(pin('x', presence({ listingInSources: 10, evidence: [{ flag: 'listing_source', sentence: null, card: null, text: null, url: null }] })));
  assert.deepEqual([a.visible, a.listing], [true, { links: 0, sentences: 0, inSources: 10 }]);
  assert.equal(aiFlagLines(a)[2].detail, 'among the overview’s sources (#10), not under a sentence');
});

test('unparsed is unknown (left out of rates), legacy is the earlier reading, and without the flags a point reads as before', () => {
  const unread = pin('u', presence({ status: 'unparsed', named: null, featured: null, websiteCited: null }), true);
  assert.deepEqual([pinAi(unread).state, pinAi(unread).visible], ['unparsed', null]);
  assert.deepEqual([pinAi(pin('l', null, true)).state, pinAi(pin('l', null, true)).visible], ['legacy', true]);
  // The switch off: the same point, read as before (its earlier single reading).
  assert.deepEqual([pinAi(withoutFlags(unread)).state, pinAi(withoutFlags(unread)).visible], ['legacy', true]);
  // An unread overview is left out of the citation rate, not counted as "not named".
  assert.equal(metrics([{ rankFound: 1, hasAiOverview: true, targetCitedInAi: true }, { rankFound: 2, hasAiOverview: true, targetCitedInAi: false, aiUnknown: true }]).aioCitationRate, 100);
});

test('the checklist: "Website cited" passes only on a confirmed website; possible citations are listed apart, unread answers left out', () => {
  const r = aioRollup([...topDollar, pin('p9', presence({ status: 'unparsed', named: null, websiteCited: null }), true)], 'Top Dollar Home Offer', null);
  assert.deepEqual([r.named.pins, r.readable, r.unread, r.ownSite.pins, r.ownSite.possible.length], [5, 5, 1, 0, 5]);
  assert.equal(r.state.p9, 'unread');
  // Its website confirmed (saved, or opened by its own card): then it counts.
  const confirmed = topDollar.map((p) => ({ ...p, insights: { ai: { ...p.insights.ai, presence: { ...(p.insights.ai as { presence: AiPresenceData }).presence, websiteCited: 'verified' as const } } } }));
  assert.equal(aioRollup(confirmed, 'Top Dollar Home Offer', null).ownSite.pins, 5);
  assert.deepEqual([getListed(topDollar, null).ownAnswers, getListed(confirmed, null).ownAnswers], [null, 5]);
});

test('Sponsored results above the AI Overview do not cut the answer short', () => {
  const node = (cls: string, label: string) => `<node class="android.widget.${cls}" content-desc="${label}" bounds="[0,0][0,0]"/>`;
  const xml =
    '<hierarchy><node class="android.widget.FrameLayout" bounds="[0,0][1080,1920]">' +
    node('View', 'Ads') +
    node('TextView', 'Sponsored Options In The Area') +
    node('View', 'Self &amp; Associates - Tulsa 1.2 mi · Personal injury attorney Open 24 hours') +
    node('TextView', 'AI Overview') +
    node('Button', 'Law Offices of Jeff Martin Rated 4.7 out of 5, 890 reviews. ·Personal injury attorney Open ·Maple Ridge ·1.6 mi') +
    node('Button', 'LaCourse Accident &amp; Injury Law Rated 4.7 out of 5, 320 reviews. ·Personal injury attorney Open ·302 E Reconciliation Wy ·57 ft') +
    node('Button', 'Copy text') +
    node('TextView', 'Sponsored') +
    node('View', 'Richardson Boudreaux Rated 4.8 out of 5, 414 reviews. ·Personal injury attorney') +
    '</node></hierarchy>';
  assert.deepEqual(readAiOverview(xml)?.businesses.map((b) => b.name), ['Law Offices of Jeff Martin', 'LaCourse Accident & Injury Law']);
  assert.deepEqual(aiOverviewFold(xml), { folded: false, cards: ['Law Offices of Jeff Martin', 'LaCourse Accident & Injury Law'] });
});
