import test from 'node:test';
import assert from 'node:assert/strict';
import { aiVisibility, siteLooksLike, rootDomain, wilson, type AiVisPin } from '../packages/core/aiVisibility';
import { isDirectory } from '../packages/core/directories';
import type { AiParts } from '../packages/core/aiParts';

const parts = (o: Partial<AiParts> & { brands?: AiParts['p0']['brands']; p0sites?: string[] }): AiParts => ({
  p0: { text: 'Opening answer', brands: o.brands ?? [], sites: o.p0sites ?? [] },
  cards: o.cards ?? [],
  other: o.other ?? [],
  mentions: o.mentions ?? [],
});
const pin = (id: string, p: AiParts | null | undefined, local: string[] = [], rankFound: number | null = null, shown = true): AiVisPin => ({
  id,
  status: 'COMPLETED',
  rankFound,
  topCompetitors: local,
  insights: { v: 1, ai: { shown, ...(p === undefined ? {} : { parts: p }) } },
});
const card = (name: string, kgmid: string, sites: string[] = []) => ({ name, kgmid, sites });

test("a website is a business's own when its name runs together into it", () => {
  assert.equal(siteLooksLike('rotorooter.com', 'Roto-Rooter Plumbing & Drain Services'), true);
  assert.equal(siteLooksLike('lakeland.rotorooter.com', 'Roto-Rooter Plumbing & Drain Services'), true);
  assert.equal(siteLooksLike('moodylaw.com', 'Moody Law, P.A.'), true);
  assert.equal(siteLooksLike('stuartsplumbing.com', "Stuart's Plumbing"), true);
  assert.equal(siteLooksLike('lakelandbenjaminfranklin.com', 'Benjamin Franklin Plumbing'), true);
  assert.equal(siteLooksLike('forthepeople.com', 'Morgan & Morgan'), false, 'a brand site with another name is never guessed');
  assert.equal(siteLooksLike('plumbing.com', 'Plumbing Express'), false, 'a generic word ties nothing');
  assert.equal(siteLooksLike('plumbinglakeland.com', "Stuart's Plumbing"), false);
  assert.equal(rootDomain('https://attorneys.superlawyers.com/x'), 'superlawyers.com');
  assert.equal(rootDomain('shop.example.co.uk'), 'example.co.uk');
  assert.equal(isDirectory('m.yelp.com'), true);
  assert.equal(isDirectory('attorneys.superlawyers.com'), true);
  assert.equal(isDirectory('rotorooter.com'), false);
});

test('three parts, scored per point and averaged over the same N points', () => {
  const pins = [
    // Point a: Stuart's named first in the opening answer with its phone; cards: Ben Franklin, Stuart's;
    // rotorooter.com cited in the closing text; Yelp cited inside a card.
    pin(
      'a',
      parts({
        brands: [{ name: "Stuart's Plumbing", kgmid: '/g/1tl4dvfz', phone: '(863) 877-3108' }],
        cards: [card('Benjamin Franklin Plumbing', '/g/11sj_1g57_', ['yelp.com']), card("Stuart's Plumbing", '/g/1tl4dvfz')],
        other: ['rotorooter.com'],
      }),
      ["Stuart's Plumbing", 'Benjamin Franklin Plumbing'],
      1,
    ),
    // Point b: Roto-Rooter's card first, citing its own site (not part 3); Stuart's second in the opening answer.
    pin(
      'b',
      parts({
        brands: [
          { name: 'Benjamin Franklin Plumbing', kgmid: '/g/11sj_1g57_', phone: null },
          { name: "Stuart's Plumbing", kgmid: '/g/1tl4dvfz', phone: null },
        ],
        cards: [card('Roto-Rooter Plumbing & Drain Services', '/g/1yh9tpsm4', ['rotorooter.com'])],
      }),
      ['Benjamin Franklin Plumbing', "Stuart's Plumbing"],
      2,
    ),
    // Point c: no AI Overview (0 for everyone, still one of N).
    pin('c', undefined, ["Stuart's Plumbing"], 1, false),
    // Point d: an AI Overview whose parts could not be read: left out of N.
    pin('d', null, [], 3),
  ];
  const v = aiVisibility(pins, { name: "Stuart's Plumbing" });
  assert.equal(v.points, 3);
  assert.equal(v.unread, 1);
  assert.equal(v.withAi, 2);
  const by = (n: string) => v.rows.find((r) => r.name.startsWith(n))!;
  // Stuart's: a = 50 (first, P0) + 26.25 (card slot 2) ; b = 37.5 (second, P0) → (76.25 + 37.5 + 0) / 3 = 37.9.
  assert.equal(v.you.score, 37.9);
  assert.equal(v.you.p0, 29.2);
  assert.equal(v.you.card, 8.8);
  assert.deepEqual([v.you.p0Pins, v.you.p0First, v.you.p0Phone, v.you.cardPins, v.you.cardAvgSlot], [2, 1, 1, 1, 2]);
  assert.equal(v.you.bestPin, 'a');
  // Ben Franklin: a = card 35 ; b = P0 first 50 → 85 / 3.
  assert.equal(by('Benjamin').score, 28.3);
  // Roto-Rooter: a = website cited in the closing text (15, first citation) ; b = card 35 (its own site in its own card is not part 3).
  const roto = by('Roto-Rooter');
  assert.deepEqual([roto.card, roto.web, roto.score], [11.7, 5, 16.7]);
  assert.deepEqual(roto.domains, ['rotorooter.com']);
  // Roto-Rooter is recommended at b, where the local list does not have it.
  assert.deepEqual([roto.aiPins, roto.beyondLocal], [1, 1]);
  assert.deepEqual(v.rows.map((r) => r.name.split(' ')[0]), ["Stuart's", 'Benjamin', 'Roto-Rooter']);
  assert.ok(Math.abs(v.rows.reduce((a, r) => a + r.share, 0) - 1) < 0.01, 'shares add up to all the points');
  assert.deepEqual(v.websites.map((s) => [s.domain, s.owner, s.pins]), [['rotorooter.com', 'Roto-Rooter Plumbing & Drain Services', 1]]);
  assert.deepEqual(v.directories, [{ domain: 'yelp.com', pins: 1 }], 'a directory is listed, never scored');
  assert.equal(v.leaders.p0?.name, "Stuart's Plumbing");
  assert.equal(v.leaders.card?.name.startsWith('Benjamin'), true);
});

test('two offices with one name stay apart by their Google IDs; the tracked one is matched by its ID', () => {
  const pins = [
    pin('a', parts({ cards: [card('Acme Law', '/g/other1'), card('Acme Law', '/g/mine01')] }), []),
    pin('b', parts({ cards: [card('Acme Law', '/g/mine01')] }), []),
  ];
  const v = aiVisibility(pins, { name: 'Acme Law', kgmid: '/g/mine01' });
  assert.equal(v.rows.length, 2);
  // Mine: slot 2 at a (26.25) and slot 1 at b (35) → 30.6; the other office: slot 1 at a → 17.5.
  assert.equal(v.you.score, 30.6);
  assert.equal(v.rows.find((r) => !r.you)!.score, 17.5);
});

test("the tracked business's website, given at launch, counts in part 1 and part 3", () => {
  const pins = [pin('a', parts({ p0sites: ['https://www.carcrashinjuryfirm.com/x'], other: ['carcrashinjuryfirm.com', 'avvo.com'] }), [])];
  const v = aiVisibility(pins, { name: 'Lakeland Accident & Injury Attorney at Law', domain: 'carcrashinjuryfirm.com' });
  assert.deepEqual([v.you.p0, v.you.web, v.you.score], [50, 15, 65]);
  assert.deepEqual(v.directories.map((d) => d.domain), ['avvo.com']);
});

test('nothing to read: no AI Overview anywhere', () => {
  const v = aiVisibility([pin('a', undefined, [], 4, false), pin('b', undefined, [], null, false)], { name: 'X' });
  assert.deepEqual([v.points, v.withAi, v.rows.length, v.you.score], [2, 0, 0, 0]);
  const w = wilson(3, 10);
  assert.ok(w.lower > 0.1 && w.upper < 0.61 && w.rate === 0.3);
});

test('a local listing with extra words is the same business as the AI names', async () => {
  const { sameBusinessName } = await import('../packages/core/aiVisibility');
  assert.equal(sameBusinessName('Lopez & Humphries, P.A.', 'Lopez & Humphries, P.A. - Car Accident Lawyers - Lakeland'), true);
  assert.equal(sameBusinessName('Norden Leacox Accident & Injury Law', 'Lakeland Personal Injury & Car Accident Lawyers | Norden Leacox'), true);
  assert.equal(sameBusinessName('Howell & Thornhill', 'Howell & Thornhill - Lakeland'), true);
  assert.equal(sameBusinessName('Burnetti, P.A.', 'Burnetti P.A. Personal Injury Lawyers'), true);
  assert.equal(sameBusinessName('Smith Plumbing', 'Smith & Sons Electric'), false, 'one short shared word is not enough');
  assert.equal(sameBusinessName('Morgan & Morgan', 'Dennis Hernandez Injury Attorneys'), false);
  assert.equal(sameBusinessName('1 Time Plumbing', '1-Tom-Plumber Lakeland'), false);
});

test('the saved page: a card behind "Show more" counts 0.6, and its Website button names its website', () => {
  const page = {
    expanded: false,
    sites: [],
    cards: [
      { name: '1-Tom-Plumber Lakeland', website: '1tomplumber.com', phone: null, above: true },
      { name: 'Richard C Fox Plumbing', website: 'richardfoxplumbing.com', phone: null, above: false },
    ],
  };
  const p = pin('a', parts({ cards: [card('1-Tom-Plumber Lakeland', '/g/11lf92nyhd'), card('Richard C Fox Plumbing', '/g/11dxl5n6mc')], other: ['richardfoxplumbing.com'] }), []);
  (p.insights!.ai as { page?: unknown }).page = page;
  const v = aiVisibility([p, pin('b', parts({ cards: [card('Richard C Fox Plumbing', '/g/11dxl5n6mc')] }), [])], { name: 'Richard C Fox Plumbing' });
  // Richard: a = card 2 behind Show more (26.25 × 0.6 = 15.75) + its website cited (15) ; b = card 1 (no page: in full, 35).
  assert.equal(v.you.card, 25.4);
  assert.equal(v.you.web, 7.5);
  assert.deepEqual([v.you.cardAbove, v.you.cardBehind, v.foldPins, v.foldMeasured], [0, 1, 1, true]);
  assert.deepEqual(v.you.domains, ['richardfoxplumbing.com'], 'from its Website button, not guessed from the name');
  const tom = v.rows.find((r) => r.name.startsWith('1-Tom'))!;
  assert.deepEqual([tom.card, tom.cardAbove, tom.domains], [17.5, 1, ['1tomplumber.com']]);
});

test('change since the last scan: point to point over the same grid, arrows only beyond normal variation', async () => {
  const { compareAiVisibility } = await import('../packages/core/aiVisibility');
  const grid = (cards: string[][]) =>
    cards.map((names, i) => ({ ...pin('p' + i + names.join(''), parts({ cards: names.map((n) => card(n, n === 'A' ? '/g/aaaa1' : '/g/bbbb1')) }), []), rowIdx: Math.floor(i / 3), colIdx: i % 3 }));
  // Before: A has the first card at all 9 places. After: A first at all 9, B gone → A steady, B down.
  const before = aiVisibility(grid(Array.from({ length: 9 }, () => ['A', 'B'])), { name: 'A' });
  const after = aiVisibility(grid(Array.from({ length: 9 }, () => ['A'])), { name: 'A' });
  const t = compareAiVisibility(after, before, true);
  assert.equal(t.you.trend, 'flat');
  assert.equal(t.you.method, 'paired');
  // B is not in the later scan's rows: only the businesses shown are compared.
  assert.equal(t['g:/g/bbbb1'], undefined);
  // The other way round: B appears at every place (26.25 each) → up, well beyond the noise.
  const t2 = compareAiVisibility(before, after, true);
  assert.deepEqual([t2['g:/g/bbbb1'].trend, t2['g:/g/bbbb1'].delta, t2['g:/g/bbbb1'].prev], ['up', 26.3, 0]);
  // A small change at two places of nine is noise.
  const wobble = aiVisibility(grid([['B', 'A'], ['B', 'A'], ...Array.from({ length: 7 }, () => ['A'])]), { name: 'A' });
  const t3 = compareAiVisibility(wobble, after, true);
  assert.equal(t3.you.trend, 'flat', 'two places of nine moving one slot is within normal variation');
  // Different grids: the two averages and their ranges.
  assert.equal(compareAiVisibility(before, after, false)['g:/g/bbbb1'].method, 'unpaired');
});
