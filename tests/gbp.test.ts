import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPatch, describe, diff, hhmm, moreOf, moreTypesOf, periodsOf, problemWith, redBlock, showing, siteOf, weekOf, worst, type GbpLocation } from '../packages/core/gbp';
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
  // A split shift is one day with two periods; overnight hours cannot be shown as rows of one day: read-only.
  const split = weekOf({ regularHours: { periods: [{ openDay: 'MONDAY', openTime: '13:00', closeDay: 'MONDAY', closeTime: '17:00' }, { openDay: 'MONDAY', openTime: '08:00', closeDay: 'MONDAY', closeTime: '12:00' }] } })!;
  assert.deepEqual(split[0], { day: 'MONDAY', closed: false, allDay: false, open: '08:00', close: '12:00', more: [{ open: '13:00', close: '17:00' }] });
  assert.deepEqual(periodsOf(split).map((p) => [p.openDay, p.openTime, p.closeTime]), [['MONDAY', '08:00', '12:00'], ['MONDAY', '13:00', '17:00']]);
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
  assert.match(problemWith({ regularHours: { periods: [{ openDay: 'FRIDAY', openTime: '18:00', closeDay: 'SATURDAY', closeTime: '02:00' }] } }, { regularHours: week() })!, /overnight/);
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

test('holiday hours: read, changed and sent as whole dates, with past dates dropped', async () => {
  const { specialOf, specialPeriodsOf, upcomingHolidays } = await import('../packages/core/gbp');
  const at = (y: number, m: number, d: number) => ({ year: y, month: m, day: d });
  const loc: GbpLocation = {
    ...live,
    specialHours: {
      specialHourPeriods: [
        { startDate: at(2022, 12, 25), endDate: at(2022, 12, 25), closed: true },
        { startDate: at(2026, 12, 25), endDate: at(2026, 12, 25), closed: true },
        { startDate: at(2026, 11, 26), endDate: at(2026, 11, 26), openTime: { hours: 9 }, closeTime: { hours: 13 } },
      ],
    },
  };
  const today = '2026-11-18';
  const now = specialOf(loc, today)!;
  assert.equal(now.past, 1);
  assert.deepEqual(now.days, [{ date: '2026-11-26', closed: false, open: '09:00', close: '13:00' }, { date: '2026-12-25', closed: true, open: '09:00', close: '17:00' }]);
  // Unchanged dates are not a change.
  assert.deepEqual(diff(loc, { specialHours: now.days }, today), []);
  // A date spanning several days cannot be edited here.
  assert.equal(specialOf({ specialHours: { specialHourPeriods: [{ startDate: at(2026, 12, 24), endDate: at(2026, 12, 26), openTime: '09:00', closeTime: '12:00' }] } }, today), null);

  const next = [...now.days, { date: '2027-01-01', closed: true, open: '09:00', close: '17:00' }];
  const d = diff(loc, { specialHours: next }, today);
  assert.equal(d[0].key, 'specialHours');
  assert.equal(d[0].tier, 'green');
  assert.match(d[0].note!, /1 past date/);
  const patch = buildPatch(loc, { specialHours: next }, d);
  assert.equal(patch.location, null);
  assert.deepEqual(patch.hours!.fields, ['specialHours']);
  const sent = (patch.hours as any).specialHours.specialHourPeriods;
  assert.equal(sent.length, 3); // the 2022 date is gone
  assert.deepEqual(sent[0], { startDate: at(2026, 11, 26), endDate: at(2026, 11, 26), openTime: '09:00', closeTime: '13:00' });
  assert.deepEqual(sent[2], { startDate: at(2027, 1, 1), endDate: at(2027, 1, 1), closed: true });
  assert.deepEqual(specialPeriodsOf([]), []);

  assert.match(problemWith(loc, { specialHours: [{ date: '2026-11-01', closed: true, open: '', close: '' }] }, today)!, /in the past/);
  assert.match(problemWith(loc, { specialHours: [...now.days, now.days[0]] }, today)!, /listed twice/);
  assert.match(problemWith(loc, { specialHours: [{ date: '', closed: true, open: '', close: '' }] }, today)!, /not a date/);
  assert.match(problemWith(loc, { specialHours: [{ date: '2026-12-01', closed: false, open: '17:00', close: '09:00' }] }, today)!, /closing time/);
  assert.equal(problemWith(loc, { specialHours: next }, today), null);

  // Thanksgiving 2026 is the fourth Thursday of November: the 26th.
  assert.deepEqual(upcomingHolidays(today).map((h) => h.date), ['2026-11-26', '2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01']);
});

import { descriptionWarnings, highScrutiny } from '../packages/core/gbp';

test('closely checked lines of business, and what Google strips from a description', () => {
  for (const c of ['Plumber', 'Roofing contractor', 'Locksmith', 'Personal injury attorney', 'Medical spa', 'HVAC contractor', 'Towing service']) assert.equal(highScrutiny(c), true, c);
  for (const c of ['Coffee shop', 'Bakery', 'Dentist', '', undefined]) assert.equal(highScrutiny(c), false, String(c));
  assert.deepEqual(descriptionWarnings('Family plumbing in Lakeland since 1998. Licensed and insured.'), []);
  assert.deepEqual(descriptionWarnings('Call (863) 555-0100 or visit www.acme.com today'), ['a web address', 'a phone number']);
  assert.deepEqual(descriptionWarnings('<b>Best</b> plumber'), ['HTML']);
  assert.deepEqual(descriptionWarnings('BEST PLUMBER LAKELAND EMERGENCY SERVICE CALL TODAY licensed insured'), ['a lot of capital letters']);
});

test('nextHoliday: the next closing day and whether hours are set for it', () => {
  assert.deepEqual(nextHoliday({}, '2026-11-19'), { name: 'Thanksgiving', date: '2026-11-26', days: 7, set: false });
  const loc = { specialHours: { specialHourPeriods: [{ startDate: { year: 2026, month: 11, day: 26 }, closed: true }] } };
  assert.equal(nextHoliday(loc, '2026-11-19')?.set, true);
  // Nothing within 45 days in midsummer.
  assert.equal(nextHoliday({}, '2026-06-01'), null);
});
import { nextHoliday } from '../packages/core/gbp';

import { addressOf, openingOf, serviceAreasOf } from '../packages/core/gbp';

test('split shifts, an opening date and an address', () => {
  const w = weekOf(live)!;
  const two = w.map((d, i) => (i === 0 ? { ...d, open: '08:00', close: '12:00', more: [{ open: '13:00', close: '17:00' }] } : d));
  assert.equal(problemWith(live, { regularHours: two }), null);
  assert.match(diff(live, { regularHours: two })[0].to, /mon 08:00–12:00 and 13:00–17:00/);
  const overlap = w.map((d, i) => (i === 0 ? { ...d, open: '08:00', close: '14:00', more: [{ open: '13:00', close: '17:00' }] } : d));
  assert.match(problemWith(live, { regularHours: overlap })!, /overlap/);

  assert.equal(openingOf({ openInfo: { status: 'OPEN', openingDate: { year: 1990, month: 3, day: 1 } } }), '1990-03-01');
  const d = diff(live, { openingDate: '1990-03-01' });
  assert.deepEqual(d.map((c) => [c.key, c.tier, c.to]), [['openingDate', 'green', '1990-03-01']]);
  assert.deepEqual(buildPatch(live, { openingDate: '1990-03-01' }, d).location, { fields: ['openInfo.openingDate'], openInfo: { openingDate: { year: 1990, month: 3, day: 1 } } });
  assert.match(problemWith(live, { openingDate: '2090-01-01' })!, /one year ahead/);
  assert.deepEqual(diff(live, { openingDate: '' }), [], 'an empty date on a listing with none is no change');

  const shop: GbpLocation = { ...live, storefrontAddress: { addressLines: ['12 Main St'], locality: 'Lakeland', administrativeArea: 'FL', postalCode: '33801', regionCode: 'US' } };
  assert.deepEqual(diff(shop, { address: addressOf(shop) }), []);
  const moved = { ...addressOf(shop), lines: '40 Lake Ave\nSuite 2' };
  const a = diff(shop, { address: moved });
  assert.deepEqual(a.map((c) => [c.key, c.tier]), [['address', 'red']]);
  assert.deepEqual(buildPatch(shop, { address: moved }, a).location, { fields: ['storefrontAddress'], storefrontAddress: { addressLines: ['40 Lake Ave', 'Suite 2'], locality: 'Lakeland', administrativeArea: 'FL', postalCode: '33801', regionCode: 'US' } });
  assert.match(problemWith({ ...live, storefrontAddress: undefined }, { address: moved })!, /shows no address/);
  assert.deepEqual(serviceAreasOf({ serviceArea: { places: { placeInfos: [{ placeName: 'Lakeland, FL, USA', placeId: 'x' }] } } }), ['Lakeland, FL, USA']);
});

test('named hour sets: only the set named is changed, the others are sent back as they are', () => {
  const DAYS7 = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const wk = (open: string, close: string, days = ['MONDAY', 'TUESDAY']) => DAYS7.map((day) => ({ day, closed: !days.includes(day), allDay: false, open: days.includes(day) ? open : '09:00', close: days.includes(day) ? close : '17:00' }));
  const loc: GbpLocation = {
    title: 'Acme',
    categories: { primaryCategory: { name: 'categories/gcid:plumber', displayName: 'Plumber', moreHoursTypes: [{ hoursTypeId: 'DELIVERY', displayName: 'Delivery' }, { hoursTypeId: 'PICKUP', displayName: 'Pickup' }] } as never },
    moreHours: [{ hoursTypeId: 'PICKUP', periods: [{ openDay: 'MONDAY', openTime: { hours: 10 }, closeDay: 'MONDAY', closeTime: { hours: 14 } }] }],
  };
  assert.deepEqual(moreTypesOf(loc).map((t) => t.type), ['DELIVERY', 'PICKUP']);
  assert.equal(moreOf(loc)[0].type, 'PICKUP');
  assert.match(describe(loc).moreHours, /^pickup: mon 10:00–14:00/);
  // A set Google does not offer this listing is refused, with the ones it does.
  assert.match(String(problemWith(loc, { moreHours: [{ type: 'BRUNCH', days: wk('09:00', '11:00') }] })), /does not offer brunch hours.*DELIVERY, PICKUP/);
  assert.match(String(problemWith(loc, { moreHours: [{ type: 'DELIVERY', days: wk('12:00', '11:00') }] })), /Delivery hours: On monday the closing time/);
  assert.match(String(problemWith(loc, { moreHours: [{ type: 'DELIVERY', days: wk('09:00', '11:00').slice(0, 5) }] })), /incomplete/);
  // Adding delivery: pickup goes back to Google untouched.
  const change = { moreHours: [{ type: 'DELIVERY', days: wk('09:00', '17:00') }] };
  assert.equal(problemWith(loc, change), null);
  const changes = diff(loc, change);
  assert.deepEqual(changes.map((c) => [c.key, c.tier]), [['moreHours', 'green']]);
  const patch = buildPatch(loc, change, changes);
  assert.equal(patch.location, null);
  assert.deepEqual(patch.hours?.fields, ['moreHours']);
  assert.deepEqual((patch.hours as { moreHours: { hoursTypeId: string; periods: unknown[] }[] }).moreHours.map((m) => [m.hoursTypeId, m.periods.length]), [['PICKUP', 1], ['DELIVERY', 2]]);
  // Sending what is already there is no change; a week with every day closed removes the set.
  assert.deepEqual(diff(loc, { moreHours: [{ type: 'PICKUP', days: wk('10:00', '14:00', ['MONDAY']) }] }), []);
  const off = { moreHours: [{ type: 'PICKUP', days: wk('09:00', '17:00', []) }] };
  assert.equal(diff(loc, off)[0].to, 'removed');
  assert.deepEqual((buildPatch(loc, off, diff(loc, off)).hours as { moreHours: unknown[] }).moreHours, []);
  // Once Google shows it, the edit reads as live.
  const after = { ...loc, moreHours: [...loc.moreHours!, { hoursTypeId: 'DELIVERY', periods: periodsOf(wk('09:00', '17:00')) }] };
  assert.deepEqual(showing(after, change, changes), { live: ['moreHours'], waiting: [] });
});
