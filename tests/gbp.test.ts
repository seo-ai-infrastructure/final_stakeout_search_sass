import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPatch, describe, diff, hhmm, periodsOf, problemWith, redBlock, showing, siteOf, weekOf, worst, type GbpLocation } from '../packages/core/gbp';
import { postproxyProblem } from '../apps/nextjs/src/lib/postproxy';

const live: GbpLocation = {
  title: 'Acme Plumbing',
  websiteUri: 'https://www.acmeplumbing.com/',
  phoneNumbers: { primaryPhone: '(863) 555-0100', additionalPhones: ['(863) 555-0199'] },
  categories: {
    primaryCategory: { name: 'categories/gcid:plumber', displayName: 'Plumber' },
    additionalCategories: [{ name: 'categories/gcid:drainage_service', displayName: 'Drainage service' }],
  },
  profile: { description: 'Family plumbers since 1990.', somethingElse: 'kept' },
  regularHours: {
    periods: [
      { openDay: 'MONDAY', openTime: { hours: 8 }, closeDay: 'MONDAY', closeTime: { hours: 17, minutes: 30 } },
      { openDay: 'SATURDAY', openTime: { hours: 0 }, closeDay: 'SATURDAY', closeTime: { hours: 24 } },
    ],
  },
};
const week = () => weekOf(live)!;

test('times and weeks are read from every shape Google uses', () => {
  assert.equal(hhmm({ hours: 9 }), '09:00');
  assert.equal(hhmm({}), '00:00');
  assert.equal(hhmm('9:05:00'), '09:05');
  const w = week();
  assert.deepEqual(w[0], { day: 'MONDAY', closed: false, allDay: false, open: '08:00', close: '17:30' });
  assert.equal(w[1].closed, true);
  assert.equal(w[5].allDay, true);
  // 24 hours written as midnight to midnight of the next day.
  assert.equal(weekOf({ regularHours: { periods: [{ openDay: 'SUNDAY', openTime: {}, closeDay: 'MONDAY', closeTime: {} }] } })![6].allDay, true);
  // Split shifts and overnight hours cannot be one row a day: read-only.
  assert.equal(weekOf({ regularHours: { periods: [{ openDay: 'MONDAY', openTime: '08:00', closeDay: 'MONDAY', closeTime: '12:00' }, { openDay: 'MONDAY', openTime: '13:00', closeDay: 'MONDAY', closeTime: '17:00' }] } }), null);
  assert.equal(weekOf({ regularHours: { periods: [{ openDay: 'FRIDAY', openTime: '18:00', closeDay: 'SATURDAY', closeTime: '02:00' }] } }), null);
  assert.deepEqual(periodsOf(w).map((p) => p.openDay), ['MONDAY', 'SATURDAY']);
  assert.equal(periodsOf(w)[1].closeTime, '24:00');
});

test('only fields that really differ count, each with its risk', () => {
  // The form sends everything; an untouched form changes nothing.
  assert.deepEqual(diff(live, { description: 'Family plumbers since 1990.', websiteUri: 'https://www.acmeplumbing.com/', additionalCategories: live.categories!.additionalCategories, additionalPhones: ['863-555-0199'], regularHours: week(), title: 'Acme Plumbing', primaryPhone: '+1 863 555 0100', primaryCategory: { name: 'categories/gcid:plumber' } }), []);
  const d = diff(live, { description: 'New text.', additionalPhones: [], title: 'Acme Plumbing & Drain' });
  assert.deepEqual(d.map((c) => [c.key, c.tier]), [['description', 'green'], ['additionalPhones', 'amber'], ['title', 'red']]);
  assert.equal(worst(d), 'red');
  assert.equal(worst(d.slice(0, 2)), 'amber');
  assert.equal(worst([]), 'green');
});

test('a tracking tag on the same website is safe; a different website is an identity change', () => {
  assert.equal(siteOf('https://www.AcmePlumbing.com/x'), 'acmeplumbing.com');
  assert.equal(siteOf('not a link'), '');
  assert.equal(diff(live, { websiteUri: 'https://acmeplumbing.com/?utm_source=google' })[0].tier, 'green');
  assert.equal(diff(live, { websiteUri: 'https://newbrand.com/' })[0].tier, 'red');
  assert.equal(diff({ ...live, websiteUri: undefined }, { websiteUri: 'https://acmeplumbing.com/' })[0].tier, 'amber');
});

test('a change Google would reject is refused before anything is sent', () => {
  assert.match(problemWith(live, { description: 'x'.repeat(751) })!, /750/);
  assert.match(problemWith(live, { description: 'Visit https://acme.com' })!, /links/);
  assert.match(problemWith(live, { additionalCategories: [{ name: 'Emergency plumber' }] })!, /from the list/);
  assert.match(problemWith(live, { additionalCategories: [{ name: 'categories/gcid:plumber' }] })!, /primary category cannot also/);
  assert.match(problemWith(live, { additionalPhones: ['1', '2', '3'] })!, /up to 2/);
  assert.match(problemWith(live, { title: '  ' })!, /cannot be empty/);
  const bad = week(); bad[0] = { ...bad[0], open: '18:00', close: '09:00' };
  assert.match(problemWith(live, { regularHours: bad })!, /monday/);
  assert.match(problemWith({ regularHours: { periods: [{ openDay: 'FRIDAY', openTime: '18:00', closeDay: 'SATURDAY', closeTime: '02:00' }] } }, { regularHours: week() })!, /split or overnight/);
  assert.equal(problemWith(live, { description: 'Fine.', websiteUri: 'https://acmeplumbing.com/a', additionalPhones: ['863-555-0111'] }), null);
});

test('identity edits: one field per save, and one a week per profile', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  const one = diff(live, { title: 'Acme Plumbing Co' });
  const two = diff(live, { title: 'Acme Plumbing Co', primaryPhone: '863-555-0000' });
  assert.equal(redBlock(diff(live, { description: 'x' }), new Date('2026-11-17T12:00:00Z'), now), null);
  assert.equal(redBlock(one, null, now), null);
  assert.match(redBlock(two, null, now)!, /one identity field at a time/);
  assert.match(redBlock(one, new Date('2026-11-15T12:00:00Z'), now)!, /Wait 4 more day/);
  assert.equal(redBlock(one, new Date('2026-11-11T11:00:00Z'), now), null);
});

test('the request names only what changed and keeps the rest of each object', () => {
  const change = { description: 'New text.', additionalCategories: [{ name: 'categories/gcid:water_heater', displayName: 'Water heater' }], primaryPhone: '863-555-0000' };
  const p = buildPatch(live, change, diff(live, change));
  assert.deepEqual(p.location!.fields, ['profile', 'categories', 'phoneNumbers']);
  // The description is merged into the live profile object, not sent alone.
  assert.deepEqual((p.location as any).profile, { description: 'New text.', somethingElse: 'kept' });
  // The primary category is kept when only the additional ones change; the additional phone is kept when only the primary changes.
  assert.deepEqual((p.location as any).categories, { primaryCategory: { name: 'categories/gcid:plumber' }, additionalCategories: [{ name: 'categories/gcid:water_heater' }] });
  assert.deepEqual((p.location as any).phoneNumbers, { primaryPhone: '863-555-0000', additionalPhones: ['(863) 555-0199'] });
  assert.equal(p.hours, null);

  const w = week(); w[1] = { day: 'TUESDAY', closed: false, allDay: false, open: '08:00', close: '17:00' };
  const h = buildPatch(live, { regularHours: w }, diff(live, { regularHours: w }));
  assert.equal(h.location, null);
  assert.deepEqual(h.hours!.fields, ['regularHours']);
  assert.equal(h.hours!.regularHours.periods.length, 3);
});

test('after sending, an edit is live only when Google shows the new value', () => {
  const change = { description: 'New text.', title: 'Acme Plumbing Co' };
  const changes = diff(live, change);
  // Google applied the description and held the name for review.
  const after = { ...live, profile: { description: 'New text.' } };
  assert.deepEqual(showing(after, change, changes), { live: ['description'], waiting: ['title'] });
  assert.deepEqual(showing({ ...after, title: 'Acme Plumbing Co' }, change, changes), { live: ['description', 'title'], waiting: [] });
  // The history's words for a field match the words the edit was recorded in.
  assert.equal(describe({ ...after, title: 'Acme Plumbing Co' }).title, changes.find((c) => c.key === 'title')!.to);
  assert.equal(describe(after).description, changes.find((c) => c.key === 'description')!.to);
});

test('Postproxy failures are explained in words an admin can act on', () => {
  assert.match(postproxyProblem(401, null, null), /POSTPROXY_API_KEY/);
  assert.match(postproxyProblem(429, null, '30'), /30 seconds/);
  assert.equal(postproxyProblem(422, { error: 'Location is not eligible: canModifyServiceList' }, null), 'Location is not eligible: canModifyServiceList');
  assert.match(postproxyProblem(404, null, null), /not reachable/);
});
