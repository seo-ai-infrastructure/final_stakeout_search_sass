import test from 'node:test';
import assert from 'node:assert/strict';
import { searchShare, reportSummary } from '../apps/nextjs/src/lib/reportSummary';

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
  assert.deepEqual(s.ai, { points: 9, unread: 0, named: 6, top3: 2, zero: 1, winsWithoutPack: 2, flags: null });
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
  assert.equal(s.ai.winsWithoutPack, 2);
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
  assert.equal(s.ai.winsWithoutPack, 0);
});
