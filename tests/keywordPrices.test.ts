import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanKeywords, empty, placeOf, readPrices } from '../apps/nextjs/src/lib/keywordPrices';

test('a place: a location code, or a name with the country added when it is left off', () => {
  assert.deepEqual(placeOf(1023022), { location_code: 1023022 });
  assert.deepEqual(placeOf(' 200501 '), { location_code: 200501 });
  assert.deepEqual(placeOf('Suffolk County, New York'), { location_name: 'Suffolk County,New York,United States' });
  assert.deepEqual(placeOf('Suffolk County,New York,United States'), { location_name: 'Suffolk County,New York,United States' });
  assert.deepEqual(placeOf('United States'), { location_name: 'United States' });
  assert.deepEqual(placeOf('London, England, United Kingdom'), { location_name: 'London,England,United Kingdom' });
  assert.equal(placeOf(''), null);
  assert.equal(placeOf(null), null);
  assert.equal(placeOf(-4), null);
});

test('searches as Google Ads takes them: lowercase, no symbols, short enough, no repeats', () => {
  const { keywords, skipped } = cleanKeywords(['Car Accident Lawyer', 'car accident lawyer ', 'abogado de lesiones personales', 'best lawyer 🚗 near me', 'a b c d e f g h i j k', 42, '']);
  assert.deepEqual(keywords, ['car accident lawyer', 'abogado de lesiones personales', 'best lawyer near me', '42']);
  assert.deepEqual(skipped, ['a b c d e f g h i j k']);
  assert.equal(cleanKeywords(['x'.repeat(81)]).skipped.length, 1);
  assert.deepEqual(cleanKeywords(['one', 'two', 'three'], 2), { keywords: ['one', 'two'], skipped: ['three'] });
});

test('prices read from the answer, with money in cents and Google’s blanks kept blank', () => {
  const [a, b] = readPrices([
    { keyword: 'car accident lawyer near me', spell: null, search_volume: 2400, cpc: 139.1149, low_top_of_page_bid: 90, high_top_of_page_bid: 220.004, competition: 'LOW', competition_index: 22, monthly_searches: [{ year: 2026, month: 10, search_volume: 2900 }, { year: 2026, month: 9, search_volume: null }] },
    { keyword: 'personal injury lawyer', spell: null, search_volume: null, cpc: null, low_top_of_page_bid: null, high_top_of_page_bid: null, competition: null, competition_index: null, monthly_searches: null },
    { spell: 'nameless' },
  ]);
  assert.deepEqual(a, { keyword: 'car accident lawyer near me', spell: null, searches: 2400, cpc: 139.11, lowBid: 90, highBid: 220, competition: 'LOW', competitionIndex: 22, months: [{ year: 2026, month: 10, searches: 2900 }, { year: 2026, month: 9, searches: null }], alone: false });
  assert.equal(empty(a), false);
  assert.equal(empty(b), true);
  assert.equal(readPrices(null).length, 0);
  assert.equal(readPrices([{ keyword: 'x', search_volume: 10 }], true)[0].alone, true);
});

test('keyword prices: one paid request by default; asking empty searches alone is opt-in', async () => {
  const { keywordPrices } = await import('../apps/nextjs/src/lib/keywordPrices');
  const env = { login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD };
  process.env.DATAFORSEO_LOGIN = 'test';
  process.env.DATAFORSEO_PASSWORD = 'test';
  const real = globalThis.fetch, info = console.info;
  let calls = 0;
  // Google prices the first search and leaves the other two empty, as it does for grouped searches.
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    calls++;
    const [task] = JSON.parse(String(init?.body)) as [{ keywords: string[] }];
    const result = task.keywords.map((k, i) => (i === 0 && k === task.keywords[0] && task.keywords.length > 1 ? { keyword: k, search_volume: 1900, cpc: 120 } : { keyword: k, search_volume: task.keywords.length === 1 ? 50 : null, cpc: task.keywords.length === 1 ? 80 : null }));
    return new Response(JSON.stringify({ status_code: 20000, cost: 0.09, tasks: [{ status_code: 20000, cost: 0.09, result }] }), { status: 200 });
  }) as typeof fetch;
  console.info = () => {};
  try {
    const kws = ['car accident lawyer near me', 'car accident lawyer', 'car accident attorney'];
    const one = await keywordPrices(kws, { location_name: 'Suffolk County,New York,United States' });
    assert.equal(calls, 1, 'one request for all three');
    assert.equal(one.cost, 0.09);
    assert.equal(one.askedAlone, 0);
    assert.equal(one.complete, true, 'Google had its say: the empty ones are kept as empty');
    assert.deepEqual(one.answered.sort(), [...kws].sort());
    calls = 0;
    const alone = await keywordPrices(kws, { location_name: 'Suffolk County,New York,United States' }, 'en', { alone: true });
    assert.equal(calls, 3, 'the two empty ones asked again, a request each');
    assert.equal(alone.cost, 0.27);
    assert.equal(alone.results[1].cpc, 80);
  } finally {
    globalThis.fetch = real;
    console.info = info;
    process.env.DATAFORSEO_LOGIN = env.login;
    process.env.DATAFORSEO_PASSWORD = env.password;
    if (env.login === undefined) delete process.env.DATAFORSEO_LOGIN;
    if (env.password === undefined) delete process.env.DATAFORSEO_PASSWORD;
  }
});

test('places: a city or county found in Google Ads’ own list, however its name is written', async () => {
  const { pickPlace, placeWord } = await import('../apps/nextjs/src/lib/keywordPrices');
  assert.equal(placeWord('Mt. Juliet'), placeWord('Mount Juliet'));
  assert.equal(placeWord('St. Lucie County'), 'saint lucie county');
  assert.equal(placeWord("Coeur d'Alene"), 'coeur dalene');
  assert.equal(placeWord('Winston-Salem'), 'winston salem');
  const tn = [
    { code: 9051111, name: 'Mt. Juliet,Tennessee,United States', type: 'City' },
    { code: 9051112, name: 'Wilson County,Tennessee,United States', type: 'County' },
    { code: 9051113, name: 'Lebanon,Tennessee,United States', type: 'Neighborhood' },
    { code: 9051114, name: 'Lebanon,Tennessee,United States', type: 'City' },
  ];
  assert.equal(pickPlace(tn, 'Mount Juliet', 'city')?.code, 9051111, 'Mount Juliet is Mt. Juliet to Google Ads');
  assert.equal(pickPlace(tn, 'Wilson County', 'county')?.code, 9051112);
  assert.equal(pickPlace(tn, 'Lebanon', 'city')?.code, 9051114, 'a City before a Neighborhood of the same name');
  assert.equal(pickPlace(tn, 'Wilson County', 'city'), null, 'a county is not a city');
  assert.equal(pickPlace(tn, 'Gladeville', 'city'), null, 'a town Google Ads doesn’t target: counted at its county');
});
