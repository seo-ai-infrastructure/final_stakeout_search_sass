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
  // google.com (each business's Google profile) is the business itself: never counted, even in old scans.
  assert.deepEqual(a.sources.map((s) => [s.label, s.points]), [['yelp.com', 2]]);
});

test('Google itself is never a cited website: its domains, short links and names', async () => {
  const { isGoogleSource } = await import('../packages/core/googleSource');
  for (const s of ['google.com', 'www.google.com', 'maps.google.com', 'https://www.google.com/search?kgmid=%2Fg%2F11&q=x', 'google.co.uk', 'google.com.au',
    'g.page', 'https://g.page/r/abc', 'maps.app.goo.gl', 'g.co', 'share.google', 'Google', 'Google Maps', 'Google Business Profiles', ' google '])
    assert.equal(isGoogleSource(s), true, s);
  for (const s of ['rotorooter.com', 'm.yelp.com', 'Yelp', 'Benjamin Franklin Plumbing', 'googleplex.example.com', 'notgoogle.com', 'google.evil.example', 'Googleplex', '', null])
    assert.equal(isGoogleSource(s as string), false, String(s));
});

test('re-run pricing: the normal price per point, only for points that were refunded', async () => {
  const { rerunCharge } = await import('../packages/core/rerun');
  assert.deepEqual(rerunCharge([{ isRefunded: true }, { isRefunded: true }, { isRefunded: false }], 50, 25), { perPoint: 2, refunded: 2, credits: 4 });
  assert.deepEqual(rerunCharge([{ isRefunded: false }], 18, 9), { perPoint: 2, refunded: 0, credits: 0 });
});

test('points whose evidence bundle is gone are left out of the market insights, not counted as empty', () => {
  const gone = { ...pins[2], id: 'g', insights: { v: 0, unavailable: 'bundle_missing' } as never };
  const p = paidPressure([...pins, gone]);
  assert.equal(p.points, 3, 'the point without a bundle is not an observation');
  assert.equal(aiSources([...pins, gone], 'You Painting').points, 3);
});

test('who the AI recommends: named businesses in the AI\'s own order, counted over list-style answers only', async () => {
  const { aiBusinesses, aiPosition } = await import('../apps/nextjs/src/lib/marketInsights');
  const pin = (id: string, named: string[], shown = true, status = 'COMPLETED') =>
    ({ id, status, rankFound: null, insights: { v: 1, finder: [], you: { pos: null, miles: null }, ads: [], adsAboveYou: null, ai: { shown, sources: [], named } } }) as never;
  const pins = [
    pin('a', ['Payne Air', 'Lakeland Air', "Roth's Air"]),
    pin('b', ['Lakeland Air', 'Payne Air']),
    pin('c', ['Lakeland Air', 'Watts AC', 'Payne Air', 'Lakeland Air']), // a repeat in one answer counts once
    pin('d', []), // an AI Overview that was a paragraph: no list, so no position
    pin('e', ['Ghost Co'], false), // no AI Overview shown
    pin('f', ['Ghost Co'], true, 'FAILED'),
  ];
  const r = aiBusinesses(pins, 'payne air');
  assert.equal(r.lists, 3, 'only the three answers that listed businesses');
  assert.deepEqual(r.rows.map((x) => [x.name, x.points, x.first, x.avgPos, x.isYou]), [
    ['Lakeland Air', 3, 2, 1.3, false],
    ['Payne Air', 3, 1, 2, true],
    ['Watts AC', 1, 0, 2, false], // tied with Roth's on times named: the better average place comes first
    ["Roth's Air", 1, 0, 3, false],
  ]);
  assert.deepEqual([r.you?.points, r.you?.first, r.you?.avgPos, r.you?.best], [3, 1, 2, 1]);
  assert.equal(aiBusinesses(pins, 'Nobody Plumbing').you, null);
  assert.deepEqual(aiBusinesses([pin('d', [])], 'x'), { lists: 0, rows: [], you: null });
  // One point: place in the list, or null when not listed.
  assert.deepEqual(aiPosition(['Payne Air', 'Lakeland Air', "Roth's Air"], 'PAYNE AIR'), { pos: 1, of: 3 });
  assert.deepEqual(aiPosition(['Lakeland Air', 'Payne Air'], 'Payne Air'), { pos: 2, of: 2 });
  assert.equal(aiPosition(['Lakeland Air'], 'Payne Air'), null);
  assert.equal(aiPosition([], 'Payne Air'), null);
});

test('cited sites are sorted into kinds, and a business\'s own site is recognised from its name', async () => {
  const { siteKind } = await import('../apps/nextjs/src/lib/marketInsights');
  const rivals = ['Those Guys Painting Co', 'Nash Painting', 'Mt. Juliet Painting Co.', 'Sharpton Painting', 'CertaPro Painters of Nashville'];
  const k = (d: string) => siteKind(d, 'McIntyre Painting', rivals);
  assert.deepEqual(['m.yelp.com', 'www.houzz.com', 'reddit.com', 'quora.com'].map(k), ['directory', 'directory', 'forum', 'forum']);
  assert.equal(k('mcintyrepaintingtn.com'), 'you');
  assert.deepEqual(['thoseguyspaintingco.com', 'nashpainting.com', 'mtjulietpainting.com', 'sharptonpainting.com'].map(k), Array(4).fill('competitor'));
  assert.equal(k('nashvillepaintingcompany.com'), 'site', 'a site no named business owns is left unlabelled, not guessed');
  assert.equal(k('ipaintnashville.com'), 'site');
  assert.equal(siteKind('yelp.com.evil.example', 'x'), 'site');
});

test('AI place against local place: gains, losses and businesses the local results do not rank', async () => {
  const { packOrder, aiVersusPack } = await import('../apps/nextjs/src/lib/marketInsights');
  const pin = (id: string, top: string[], status = 'COMPLETED') => ({ id, status, rankFound: null, topCompetitors: top }) as never;
  const pack = packOrder([pin('a', ['Five Star', 'Pointer', 'McIntyre']), pin('b', ['Five Star', 'McIntyre', 'Pointer']), pin('c', ['Pointer', 'Five Star', 'Those Guys']), pin('d', ['Ghost'], 'FAILED')]);
  assert.deepEqual(pack, ['Five Star', 'Pointer', 'McIntyre', 'Those Guys']);
  // A tie on top-3 points goes to the better average rank across every point, as on the leaderboard:
  // both are top 3 at two points, but B is absent from the third (counted as 21) and A is 4th there.
  const tie = packOrder([pin('a', ['A', 'B', 'X']), pin('b', ['B', 'A', 'X']), pin('c', ['X', 'Y', 'Z', 'A'])]);
  assert.deepEqual(tie.slice(0, 3), ['X', 'A', 'B']);
  const v = aiVersusPack(['McIntyre', 'Those Guys', 'AllBright', 'Five Star'], pack);
  assert.deepEqual(v.map((x) => [x.name, x.aiPos, x.packPos, x.delta]), [['McIntyre', 1, 3, 2], ['Those Guys', 2, 4, 2], ['AllBright', 3, null, null], ['Five Star', 4, 1, -3]]);
});

test('the AI "named" count includes an answer that names the business but was captured without its list', async () => {
  const { aiSources } = await import('../apps/nextjs/src/lib/marketInsights');
  const pin = (id: string, named: string[], cited: boolean) => ({ id, status: 'COMPLETED', rankFound: 2, targetCitedInAi: cited, insights: { v: 1, finder: [], you: { pos: null, miles: null }, ads: [], adsAboveYou: null, ai: { shown: true, sources: [], named } } }) as never;
  const r = aiSources([pin('full', ['McIntyre Painting', 'Other Co'], true), pin('collapsed', [], true), pin('absent', ['Other Co'], false)], 'McIntyre Painting');
  assert.deepEqual([r.shown, r.youNamed], [3, 2]);
});
