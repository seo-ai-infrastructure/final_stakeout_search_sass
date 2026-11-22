import test from 'node:test';
import assert from 'node:assert/strict';
import { searchShare, reportSummary } from '../apps/nextjs/src/lib/reportSummary';
import { oneBoxOf } from '../packages/core/localRank';
import { combinedPin, combinedReading } from '../apps/nextjs/src/lib/combinedMap';

const pin = (o: Record<string, unknown>) => ({ id: String(Math.random()), status: 'COMPLETED', rankFound: null, lat: 40.8, lng: -73.4, hasAiOverview: true, targetCitedInAi: false, topCompetitors: [], ...o }) as any;
const ME = 'Brandon J. Broderick, Personal Injury Attorney at Law';

test('a scan with no map pack anywhere: the headline counts the AI Overview, and Share of Local Voice does not apply', () => {
  // This morning's nine points: AI places 8, 4, 3, none, 1 (and position zero), none, 6, 8, none.
  const places: (number | null)[] = [8, 4, 3, null, 1, null, 6, 8, null];
  const pins = places.map((ai, i) => pin({ targetCitedInAi: ai != null, proxyMeta: { noLocal: true, aiPosition: ai, aiLead: i === 4 } }));
  const s = searchShare(pins, ME);
  assert.equal(s.points, 9);
  assert.equal(s.wins, 2); // AI #3 and AI #1
  assert.equal(Math.round(s.share!), 22);
  assert.deepEqual(s.local, { points: 0, top3: 0, first: 0, solv: null });
  assert.deepEqual(s.ai, { points: 9, unread: 0, named: 6, upfront: 2, zero: 1, onlyWins: 2, flags: null });
  const r = reportSummary({ pins, targetBusiness: ME, centerLat: 40.8, centerLng: -73.4 });
  assert.equal(r.completed, 9);
  assert.equal(r.localPoints, 0);
  assert.equal(r.avgRank, null);
  assert.ok(r.findings.some((f) => /no map pack at any of the 9 points/.test(f)));
  assert.ok(!r.findings.some((f) => /not in the top 3 at any/.test(f)));
});

test('a mixed scan: map-pack points count by local rank, the others by the AI Overview', () => {
  const pins = [
    pin({ rankFound: 1 }),
    pin({ rankFound: 2 }),
    pin({ rankFound: 7 }),
    pin({ rankFound: null }), // had a map pack, not found
    pin({ proxyMeta: { noLocal: true, aiPosition: 2 }, targetCitedInAi: true }),
    pin({ proxyMeta: { noLocal: true, aiPosition: null, aiLead: true }, targetCitedInAi: true }), // position zero only
    pin({ proxyMeta: { noLocal: true, aiPosition: 6 }, targetCitedInAi: true }),
    pin({ status: 'FAILED' }),
  ];
  const s = searchShare(pins, ME);
  assert.equal(s.points, 7);
  assert.equal(s.wins, 4); // two in the map pack, two in the AI Overview
  assert.equal(s.local.points, 4);
  assert.equal(s.local.solv, 50);
  assert.equal(s.local.first, 1);
  assert.equal(s.ai.onlyWins, 2);
  assert.equal(s.ai.zero, 1);
  const r = reportSummary({ pins, targetBusiness: ME, centerLat: 40.8, centerLng: -73.4 });
  assert.equal(r.localPoints, 4);
  assert.equal(r.distribution.total, 4);
  assert.ok(r.findings.some((f) => /no map pack at 3 of 7 points/.test(f)));
});

test('a scan where every point had a map pack reads exactly as before', () => {
  const pins = [pin({ rankFound: 1 }), pin({ rankFound: 3 }), pin({ rankFound: 9 }), pin({ rankFound: null })];
  const s = searchShare(pins, ME);
  assert.equal(s.share, 50);
  assert.equal(s.local.solv, 50);
  assert.equal(s.ai.onlyWins, 0);
});

// A point read with the four flags (v284+).
const read = (o: Record<string, unknown>) => ({ insights: { ai: { shown: true, sources: [], named: [], presence: { v: 285, status: 'parsed', identity: 'listing', featured: null, named: false, listingCitedAsSource: false, listingInSources: null, websiteCited: false, advertised: false, suggestedId: null, citedSites: [], ...o } } } });
const unreadAi = { insights: { ai: { shown: true, sources: [], named: [], presence: { v: 285, status: 'unparsed' } } } };

test('page one: an upfront spot in the AI Overview counts at a point with a map pack too', () => {
  const pins = [
    pin({ rankFound: 2 }), // pack top 3
    pin({ rankFound: 7, ...read({ featured: { kind: 'card', card_position: 2, card_count: 8, after_expansion: false } }) }), // #7 in the pack, card #2 above it
    pin({ rankFound: 9, ...read({ featured: { kind: 'card', card_position: 2, card_count: 8, after_expansion: true } }) }), // card #2 only after "Show more"
    pin({ rankFound: 12, ...read({ featured: { kind: 'inline', sentence_index: 5 }, named: true }) }), // recommended in the answer's prose
    pin({ rankFound: 14, ...read({ named: true }) }), // named, not featured: in the answer, not upfront
  ];
  const s = searchShare(pins, ME);
  assert.deepEqual([s.points, s.wins, s.local.top3, s.ai.onlyWins, s.ai.upfront, s.ai.named], [5, 3, 1, 2, 2, 4]); // the card after "Show more" is in the answer, not upfront
  assert.equal(s.share, 60);
});

test('page one: plain web results are left out, and so is a point whose outcome is unknown', () => {
  const pins = [
    pin({ rankFound: 1 }),
    pin({ rankFound: 5 }),
    pin({ hasAiOverview: false, proxyMeta: { noLocal: true } }), // no pack, no AI Overview: nothing local to win
    pin({ rankFound: 8, ...unreadAi }), // a loss in the pack, an AI Overview that could not be read: unknown
    pin({ rankFound: 3, ...unreadAi }), // top 3 in the pack whatever the AI Overview said: a win
    pin({ proxyMeta: { noLocal: true }, ...unreadAi }), // only an unreadable AI Overview: unknown
  ];
  const s = searchShare(pins, ME);
  assert.deepEqual([s.points, s.wins, s.noLocalSurface, s.unknown, s.ai.unread], [3, 2, 1, 2, 3]);
  // Share of Local Voice still counts every point with a map pack.
  assert.deepEqual([s.local.points, s.local.top3], [4, 2]);
});

test('a single-business panel: its own is a 1-Box win; another business\'s is a 1-Box, not a 20+', () => {
  assert.equal(oneBoxOf({ finderShown: false, rankFrom: 'single_business' }, 1), 'won');
  assert.equal(oneBoxOf({ finderShown: false, rankFrom: 'single_business' }, null), 'other');
  assert.equal(oneBoxOf({ finderShown: false, rankFrom: 'map_pack' }, null), null);
  assert.equal(oneBoxOf(null, 1), null);
  const other = combinedReading({ rank: null, rankFrom: 'single_business', hasAiOverview: false, cited: false, aiPos: null });
  assert.deepEqual([other.kind, other.oneBox, combinedPin(other, false).text], ['miss', 'other', '1-Box']);
  assert.match(other.detail, /another business held the single-business panel/);
  const own = combinedReading({ rank: 1, rankFrom: 'single_business', hasAiOverview: false, cited: false, aiPos: null });
  assert.deepEqual([own.kind, own.oneBox, combinedPin(own, false).text], ['local', 'won', '#1']);
  // In the share it still counts as a point with a pack: a loss when another business held it.
  const s = searchShare([pin({ rankFound: 1, proxyMeta: { finderShown: false, rankFrom: 'single_business' } }), pin({ rankFound: null, proxyMeta: { finderShown: false, rankFrom: 'single_business' } })], ME);
  assert.deepEqual([s.points, s.wins, s.local.points, s.local.top3], [2, 1, 2, 1]);
});

test('the earlier rule, for customers until page one is switched on: AI Overview spots count only where there was no pack, over every point', () => {
  const pins = [
    pin({ rankFound: 2 }),
    pin({ rankFound: 7, ...read({ featured: { kind: 'card', card_position: 2, card_count: 8, after_expansion: false } }) }),
    pin({ hasAiOverview: false, proxyMeta: { noLocal: true } }),
    pin({ proxyMeta: { noLocal: true, aiPosition: 1 }, targetCitedInAi: true }),
  ];
  const before = searchShare(pins, ME, { pageOne: false });
  assert.deepEqual([before.rule, before.points, before.wins, before.noLocalSurface, before.ai.onlyWins], ['earlier', 4, 2, 0, 1]);
  const now = searchShare(pins, ME);
  assert.deepEqual([now.rule, now.points, now.wins, now.noLocalSurface, now.ai.onlyWins], ['page_one', 3, 3, 1, 2]);
  // The summary follows the scan's own setting (customers: the earlier rule unless switched on).
  assert.equal(reportSummary({ pins, targetBusiness: ME, centerLat: 40.8, centerLng: -73.4 }).share.rule, 'earlier');
  assert.equal(reportSummary({ pins, targetBusiness: ME, centerLat: 40.8, centerLng: -73.4, scoring: { pageOne: true } }).share.rule, 'page_one');
});
