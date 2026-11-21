import test from 'node:test';
import assert from 'node:assert/strict';
import { googleIdOf, googleIdsIn, googleShortLink, isGoogleHost } from '../packages/core/businessIds';
import { parseSpec } from '../packages/core/grid';
import { parseBusiness, parseIdentity } from '../packages/core/businesses';
import { aiNameFor, aiNamesFirst, isAiTarget, rankWithoutFinder } from '../packages/core/serpEvidence';
import { buildPinInsights } from '../packages/core/pinInsights';

test('google id: read from the ID itself, a kgmid link, or a Maps place link', () => {
  assert.equal(googleIdOf('/g/11c5wk8bxd'), '/g/11c5wk8bxd');
  assert.equal(googleIdOf(' g/11C5WK8BXD '), '/g/11c5wk8bxd');
  assert.equal(googleIdOf('/m/0abc12'), '/m/0abc12');
  assert.equal(googleIdOf('https://www.google.com/search?kgmid=%2Fg%2F11c5wk8bxd&q=Edwards+%26+Patterson+Law+Firm'), '/g/11c5wk8bxd');
  assert.equal(googleIdOf('https://www.google.com/search?q=x&kgmid=/g/1tg_gkpk&hl=en'), '/g/1tg_gkpk');
  assert.equal(
    googleIdOf('https://www.google.com/maps/place/Truskett+Law/@36.03,-95.95,17z/data=!3m1!4b1!4m6!3m5!1s0x87b6:0x1a2b!8m2!3d36.03!4d-95.95!16s%2Fg%2F1260lhvwn?entry=ttu'),
    '/g/1260lhvwn',
  );
  for (const junk of ['', 'Edwards & Patterson', 'https://www.bibylaw.com/', 'https://www.google.com/maps/place/X/data=!4m2!3m1!1s0x87b6:0x1a2b', '/g/ab', '/x/11c5wk8bxd', 42, null])
    assert.equal(googleIdOf(junk), '', String(junk));
});

test('google id: short Share links are recognised for the server to follow, nothing else', () => {
  assert.equal(googleShortLink('https://maps.app.goo.gl/AbCdEf123'), 'https://maps.app.goo.gl/AbCdEf123');
  assert.equal(googleShortLink('maps.app.goo.gl/AbCdEf123?g_st=ic'), 'https://maps.app.goo.gl/AbCdEf123?g_st=ic');
  assert.equal(googleShortLink('https://g.co/kgs/Xy12Ab'), 'https://g.co/kgs/Xy12Ab');
  assert.equal(googleShortLink('https://share.google/aBcD1234'), 'https://share.google/aBcD1234');
  assert.equal(googleShortLink('https://goo.gl/maps/aBcD1234'), 'https://goo.gl/maps/aBcD1234');
  for (const no of ['https://g.co/other', 'https://evil.example/kgs/x', 'https://maps.app.goo.gl/', 'not a link', 'https://maps.app.goo.gl.evil.example/x'])
    assert.equal(googleShortLink(no), null, no);
  assert.ok(isGoogleHost('www.google.com') && isGoogleHost('maps.google.co.uk') && isGoogleHost('consent.google.com') && isGoogleHost('maps.app.goo.gl'));
  assert.ok(!isGoogleHost('google.com.evil.example') && !isGoogleHost('notgoogle.com'));
});

test('google id: IDs written in a page, escaped or not, each once', () => {
  assert.deepEqual(googleIdsIn('<a href="https://www.google.com/search?kgmid=%2Fg%2F11c5wk8bxd">x</a> "!16s\\/g\\/11c5wk8bxd" kgmid=/g/1thw77bs'), ['/g/11c5wk8bxd', '/g/1thw77bs']);
  assert.deepEqual(googleIdsIn('nothing here /g/11c5wk8bxd on its own'), []);
});

const base = { targetBusiness: 'Edwards and Patterson', keyword: 'car accident lawyer tulsa', centerLat: 36.05, centerLng: -95.95, gridSize: 3 };

test('a scan keeps the Google ID tidied, refuses a paste without one, and leaves it empty when none is given', () => {
  assert.equal(parseSpec({ ...base, targetKgmid: 'https://www.google.com/search?kgmid=%2Fg%2F11c5wk8bxd' }).targetKgmid, '/g/11c5wk8bxd');
  assert.equal(parseSpec({ ...base }).targetKgmid, null);
  assert.equal(parseSpec({ ...base, targetKgmid: '  ' }).targetKgmid, null);
  assert.throws(() => parseSpec({ ...base, targetKgmid: 'https://www.bibylaw.com/' }), /Google business ID/);
});

test('a saved business keeps its Google ID and website', () => {
  const b = { name: 'Edwards and Patterson', centerLat: 36.05, centerLng: -95.95, keywords: ['car accident lawyer tulsa'] };
  const kept = parseBusiness({ ...b, kgmid: '/g/11c5wk8bxd', domain: 'https://www.EdwardsPatterson.com/contact' });
  assert.equal(kept.kgmid, '/g/11c5wk8bxd');
  assert.equal(kept.domain, 'edwardspatterson.com');
  assert.deepEqual([parseBusiness({ ...b, kgmid: '', domain: '' }).kgmid, parseBusiness(b).domain], [null, null]);
  assert.throws(() => parseBusiness({ ...b, kgmid: 'Edwards' }), /Google business ID/);
  assert.throws(() => parseBusiness({ ...b, domain: 'not a site' }), /domain/);
  // Only the two, for keeping them up to date as scans are launched.
  assert.deepEqual(parseIdentity({ domain: 'edwardspatterson.com', kgmid: 'g/11C5WK8BXD' }), { domain: 'edwardspatterson.com', kgmid: '/g/11c5wk8bxd' });
});

// The copied AI answer, as Google's Copy button gives it (shortened).
const copy = [
  'Here are highly rated firms near you.',
  '',
  'Edwards & Patterson Law Firm (https://www.google.com/search?kgmid=%2Fg%2F11c5wk8bxd&q=Edwards+%26+Patterson+Law+Firm)',
  '5.0(351) · Personal injury attorney',
  'Offers 24/7 availability. [1] (https://www.google.com/searchviewer/10?svid=x)',
  'Truskett Law (https://www.google.com/search?kgmid=%2Fg%2F1260lhvwn&q=Truskett+Law)',
  '5.0(442) · Personal injury attorney',
  'Operates 24 hours daily. [1] (https://www.google.com/searchviewer/10?svid=y)',
  'Edwards and Patterson (https://www.google.com/search?kgmid=%2Fg%2F1other99&q=Edwards+and+Patterson)',
  '4.1(12) · Personal injury attorney',
  'Another office with the same name.',
].join('\n');

test('AI answer matched by Google ID first: found however Google writes the name, and a same-named office is not it', () => {
  // Without the ID only the same-named office matches (the wrong one).
  const byName = rankWithoutFinder([], [], 'Edwards and Patterson', copy);
  assert.equal(byName.rank, 3);
  // With the ID the business is #1, kept under its own name; the other office is marked as such.
  const byId = rankWithoutFinder([], [], 'Edwards and Patterson', copy, '/g/11c5wk8bxd');
  assert.equal(byId.from, 'ai_overview_list');
  assert.equal(byId.rank, 1);
  assert.deepEqual(byId.list, ['Edwards and Patterson', 'Truskett Law', 'Edwards and Patterson (another listing)']);
  assert.ok(isAiTarget({ name: 'Edwards & Patterson Law Firm', kgmid: '/g/11c5wk8bxd' }, 'Edwards and Patterson', '/g/11c5wk8bxd'));
  assert.ok(!isAiTarget({ name: 'Edwards and Patterson', kgmid: '/g/1other99' }, 'Edwards and Patterson', '/g/11c5wk8bxd'));
  assert.ok(isAiTarget({ name: 'Edwards and Patterson', kgmid: '' }, 'Edwards and Patterson', '/g/11c5wk8bxd'), 'an entry without a link is matched by name');
  assert.equal(aiNameFor({ name: 'Truskett Law', kgmid: '/g/1260lhvwn' }, 'Edwards and Patterson'), 'Truskett Law');
  // The point's insights keep the same names, so every report reads the business the same way.
  assert.deepEqual(buildPinInsights({ aiCopy: copy, target: 'Edwards and Patterson', targetKgmid: '/g/11c5wk8bxd' }).ai.named, byId.list);
});

test('AI answer named first: the opening linking the business’s listing counts, whatever the name', () => {
  const opening = 'Edwards & Patterson Law Firm (https://www.google.com/search?kgmid=%2Fg%2F11c5wk8bxd) is a top choice for crash cases.\n\nMore firms below.';
  assert.equal(aiNamesFirst(opening, 'EP Injury Lawyers'), false);
  assert.equal(aiNamesFirst(opening, 'EP Injury Lawyers', '/g/11c5wk8bxd'), true);
  assert.equal(aiNamesFirst(opening, 'EP Injury Lawyers', '/g/1260lhvwn'), false);
});
