import test from 'node:test';
import assert from 'node:assert/strict';
import { aiSources, groundOwners, paidPressure, winningRadius } from '../apps/nextjs/src/lib/marketInsights';

const tract = (id: string, inc: number, own: number) => ({ v: 'acs2024', tract: { id, inc, own, occ: 1000, own_pct: own / 10 } });
const ins = (o: Partial<{ miles: number | null; ads: { name: string; where: 'results' | 'local_services' | 'finder' }[]; above: number | null; sources: string[]; named: string[]; shown: boolean }>) => ({
  v: 1 as const,
  finder: [],
  you: { pos: null, miles: o.miles ?? null },
  ads: o.ads ?? [],
  adsAboveYou: o.above ?? null,
  ai: { shown: o.shown ?? false, sources: o.sources ?? [], named: o.named ?? [] },
});
const C = { lat: 36.2, lng: -86.5 };
const pins = [
  { id: 'a', status: 'COMPLETED', rankFound: 1, lat: 36.2, lng: -86.5, census: tract('rich', 150000, 900), topCompetitors: ['You Painting', 'Rival Co', 'Other LLC'],
    insights: ins({ miles: 0.5, ads: [{ name: 'Ad Guy', where: 'finder' }], above: 1, shown: true, sources: ['google.com', 'yelp.com'], named: ['You Painting', 'Rival Co'] }) },
  { id: 'b', status: 'COMPLETED', rankFound: 2, lat: 36.21, lng: -86.5, census: tract('rich', 150000, 900), topCompetitors: ['Rival Co', 'You Painting', 'Third'],
    insights: ins({ miles: 1.2, ads: [{ name: 'Ad Guy', where: 'finder' }, { name: 'LSA Pro', where: 'local_services' }], above: 2, shown: true, sources: ['yelp.com'], named: ['Rival Co'] }) },
  { id: 'c', status: 'COMPLETED', rankFound: 9, lat: 36.25, lng: -86.5, census: tract('poor', 40000, 200), topCompetitors: ['Rival Co', 'Third', 'Other LLC'],
    insights: ins({ miles: 3.4, ads: [], above: 0 }) },
  { id: 'd', status: 'PENDING', rankFound: null, lat: 36.3, lng: -86.5, census: tract('poor', 40000, 200), topCompetitors: null, insights: null },
];

test('who owns the valuable ground: share of buying power where each business is top 3', () => {
  const { rows, points } = groundOwners(pins, 'You Painting');
  assert.equal(points, 3);
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(by['Rival Co'].top3Points, 3);
  assert.equal(Math.round(by['Rival Co'].buyingPower!), 100);
  assert.equal(by['You Painting'].isYou, true);
  // You hold the two rich points (a, b): rich tract weight 135M split across a,b; poor tract weight 8M across c,d (d pending)
  assert.ok(by['You Painting'].buyingPower! > 90 && by['You Painting'].buyingPower! < 100);
  assert.equal(rows[0].name, 'Rival Co');
  assert.equal(groundOwners(pins, 'Nobody Inc').rows.at(-1)?.buyingPower, 0, 'the tracked business always gets a row');
});

test("winning radius: Google's distances, farthest top-3 point while 3 in 4 are top 3", () => {
  const r = winningRadius(pins, C)!;
  assert.equal(r.source, 'google');
  assert.equal(r.radius, 1.2);
  assert.deepEqual(r.within, { top3: 2, total: 2 });
  assert.deepEqual(r.beyond, { top3: 0, total: 1 });
  const noDistances = winningRadius(pins.map((p) => ({ ...p, insights: null })), C)!;
  assert.equal(noDistances.source, 'center', 'a listing without distances falls back to the grid centre');
  assert.equal(noDistances.points[0].miles, 0);
});

test('paid pressure: advertisers by number of points, and ads above you on average', () => {
  const p = paidPressure(pins);
  assert.deepEqual([p.points, p.withAds], [3, 2]);
  assert.equal(p.avgAdsAboveYou, 1);
  assert.deepEqual(p.advertisers[0], { name: 'Ad Guy', points: 2, where: ['finder'] });
  assert.deepEqual(p.advertisers[1], { name: 'LSA Pro', points: 1, where: ['local_services'] });
});

test('what AI cites: websites by number of points, and how often the business was named', () => {
  const a = aiSources(pins, 'You Painting');
  assert.deepEqual([a.points, a.shown, a.youNamed], [3, 2, 1]);
  assert.deepEqual(a.sources.map((s) => [s.label, s.points]), [['yelp.com', 2], ['Google Business Profiles', 1]]);
});
