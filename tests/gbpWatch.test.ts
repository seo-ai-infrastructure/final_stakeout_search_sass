import test from 'node:test';
import assert from 'node:assert/strict';
import { changeBack, driftAlert, findDrift, watched } from '../packages/core/gbpWatch';
import type { GbpLocation } from '../packages/core/gbp';

const today = '2026-11-18';
const base: GbpLocation = {
  title: 'Harbor Law Group',
  websiteUri: 'https://harborlaw.example/?utm_source=google',
  phoneNumbers: { primaryPhone: '(863) 555-0100', additionalPhones: [] },
  categories: { primaryCategory: { name: 'categories/gcid:lawyer', displayName: 'Lawyer' }, additionalCategories: [] },
  profile: { description: 'Family law in Lakeland.' },
  regularHours: { periods: [{ openDay: 'MONDAY', openTime: { hours: 9 }, closeDay: 'MONDAY', closeTime: { hours: 17 } }] },
  storefrontAddress: { addressLines: ['1 Main St'], locality: 'Lakeland', administrativeArea: 'FL', postalCode: '33801', regionCode: 'US' },
  openInfo: { status: 'OPEN' },
};
const withChange = (over: Partial<GbpLocation>): GbpLocation => ({ ...base, ...over });

test('an unchanged listing reports nothing; the address and open status are watched too', () => {
  assert.deepEqual(findDrift(base, base, today), { drift: [], absorbed: {} });
  const w = watched(base, today);
  assert.equal(w.address, '1 Main St, Lakeland, FL, 33801');
  assert.equal(w.openStatus, 'open');
  assert.equal(watched({ title: 'X' }, today).address, 'none (service-area business)');
});

test('a change nobody here made is reported, most serious first', () => {
  const live = withChange({ websiteUri: 'https://harborlaw.example/', title: 'Harbor Law Group - Best Lakeland Lawyer', openInfo: { status: 'CLOSED_PERMANENTLY' } });
  const { drift } = findDrift(base, live, today);
  assert.deepEqual(drift.map((d) => d.key), ['title', 'websiteUri', 'openStatus']);
  assert.deepEqual(drift[1], { key: 'websiteUri', label: 'Website', was: 'https://harborlaw.example/?utm_source=google', now: 'https://harborlaw.example/' });
  assert.equal(drift[2].now, 'closed permanently');
});

test('our own edit arriving is not a change by someone else', () => {
  const live = withChange({ profile: { description: 'Family and estate law in Lakeland.' }, websiteUri: 'https://other.example/' });
  const r = findDrift(base, live, today, {}, { description: ['Family and estate law in Lakeland.'] });
  assert.deepEqual(r.absorbed, { description: 'Family and estate law in Lakeland.' });
  assert.deepEqual(r.drift.map((d) => d.key), ['websiteUri']);
});

test('a change an admin kept is what we expect from then on', () => {
  const live = withChange({ websiteUri: 'https://harborlaw.example/' });
  assert.deepEqual(findDrift(base, live, today, { websiteUri: 'https://harborlaw.example/' }).drift, []);
  // And if it then moves again, it is reported against the kept value.
  const again = findDrift(base, withChange({ websiteUri: 'https://spam.example/' }), today, { websiteUri: 'https://harborlaw.example/' }).drift[0];
  assert.equal(again.was, 'https://harborlaw.example/');
});

test('putting a field back: everyday fields only, from the baseline itself', () => {
  assert.deepEqual(changeBack(base, 'websiteUri', today), { websiteUri: 'https://harborlaw.example/?utm_source=google' });
  assert.deepEqual(changeBack(base, 'description', today), { description: 'Family law in Lakeland.' });
  assert.equal(changeBack(base, 'regularHours', today)!.regularHours!.length, 7);
  // Identity fields go through the editor's checks; address and status only on Google.
  for (const key of ['title', 'primaryCategory', 'primaryPhone', 'address', 'openStatus', 'nonsense']) assert.equal(changeBack(base, key, today), null);
  // A value that was accepted later is not in the baseline any more.
  assert.equal(changeBack(base, 'websiteUri', today, { websiteUri: 'https://harborlaw.example/' }), null);
});

test('the email says how many changes on how many listings', () => {
  assert.equal(driftAlert([]), null);
  const a = driftAlert([
    { title: 'Harbor Law Group', label: 'Website', was: 'a', now: 'b' },
    { title: 'Harbor Law Group', label: 'Phone', was: 'c', now: 'd' },
    { title: 'Glow Aesthetics', label: 'Opening hours', was: 'x'.repeat(200), now: 'y' },
  ])!;
  assert.match(a.subject, /3 changes on 2 Google listings/);
  assert.equal(a.lines[0], 'Harbor Law Group · Website: was "a", now "b"');
  assert.ok(a.lines[2].length < 160);
  assert.equal(driftAlert(Array.from({ length: 14 }, (_, i) => ({ title: 'L' + i, label: 'Website', was: 'a', now: 'b' })))!.lines[12], '…and 2 more.');
});
