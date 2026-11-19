import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, nextWeeklySlot, postProblem, postRequest, readPost, type PostDraft } from '../packages/core/gbpPosts';

const now = new Date('2026-11-18T15:00:00Z');
const draft = (over: Partial<PostDraft> = {}): PostDraft => ({ ...emptyDraft(), body: 'Free gutter check with every roof wash this month.', ...over });
const loc = 'accounts/1/locations/2';

test('an update needs words, a button needs a link, and Google’s limits are kept', () => {
  assert.equal(postProblem(draft(), now), null);
  assert.match(postProblem(draft({ body: '  ' }), now)!, /Write the post/);
  assert.match(postProblem(draft({ body: 'x'.repeat(1501) }), now)!, /Too long/);
  assert.match(postProblem(draft({ cta: 'BOOK' }), now)!, /https link/);
  assert.match(postProblem(draft({ cta: 'BOOK', ctaUrl: 'http://x.example' }), now)!, /https link/);
  assert.equal(postProblem(draft({ cta: 'BOOK', ctaUrl: 'https://x.example/book' }), now), null);
  // "Call now" uses the listing's own number.
  assert.equal(postProblem(draft({ cta: 'CALL' }), now), null);
  assert.match(postProblem(draft({ cta: 'DANCE' }), now)!, /Unknown button/);
  assert.match(postProblem(draft({ image: 'ftp://x/y.png' }), now)!, /JPG or PNG/);
  assert.equal(postProblem(draft({ image: 'data:image/jpeg;base64,AAAA' }), now), null);
});

test('events and offers need dates that make sense', () => {
  const ev = { format: 'event' as const, title: 'Open house', startDate: '2026-11-20', endDate: '2026-11-21' };
  assert.equal(postProblem(draft(ev), now), null);
  assert.match(postProblem(draft({ ...ev, title: '' }), now)!, /needs a name/);
  assert.match(postProblem(draft({ ...ev, endDate: '2026-11-19' }), now)!, /before the start/);
  assert.match(postProblem(draft({ ...ev, startDate: '2026-11-01', endDate: '2026-11-02' }), now)!, /already passed/);
  assert.match(postProblem(draft({ ...ev, startTime: '09:00' }), now)!, /both a start and an end time/);
  assert.match(postProblem(draft({ ...ev, endDate: '2026-11-20', startTime: '17:00', endTime: '09:00' }), now)!, /not after/);
  // An offer needs dates but no title, and may have no words.
  assert.equal(postProblem(draft({ format: 'offer', body: '', startDate: '2026-11-20', endDate: '2026-11-30' }), now), null);
  assert.match(postProblem(draft({ format: 'offer', startDate: '', endDate: '' }), now)!, /start and end dates/);
  assert.match(postProblem(draft({ format: 'offer', startDate: '2026-11-20', endDate: '2026-11-30', redeemUrl: 'x.example' }), now)!, /redeem/);
  // A photo post is the photo.
  assert.match(postProblem(draft({ format: 'photo', body: '' }), now)!, /needs a photo/);
  assert.equal(postProblem(draft({ format: 'photo', body: '', image: 'https://x.example/a.jpg' }), now), null);
});

test('a scheduled post must be in the future', () => {
  assert.match(postProblem(draft({ scheduledAt: '2026-11-18T15:02:00Z' }), now)!, /five minutes/);
  assert.equal(postProblem(draft({ scheduledAt: '2026-11-19T14:00:00Z' }), now), null);
  assert.match(postProblem(draft({ scheduledAt: 'soon' }), now)!, /not a time/);
  assert.match(postProblem(draft({ scheduledAt: '2028-01-01T00:00:00Z' }), now)!, /more than a year/);
});

test('the request carries only what the post has', () => {
  assert.deepEqual(postRequest(draft(), 'W9', loc), {
    post: { body: 'Free gutter check with every roof wash this month.' },
    profiles: ['W9'],
    platforms: { google_business: { format: 'standard', location_id: loc } },
  });
  const offer = postRequest(draft({ format: 'offer', title: '10% off', startDate: '2026-11-20', endDate: '2026-11-30', coupon: 'ROOF10', terms: 'One per home.', cta: 'CALL', ctaUrl: 'https://ignored.example', image: 'https://x.example/a.jpg', scheduledAt: '2026-11-19T14:00:00Z' }), 'W9', loc);
  assert.deepEqual(offer.platforms.google_business, { format: 'offer', location_id: loc, cta_action_type: 'CALL', event_title: '10% off', event_start_date: '2026-11-20', event_end_date: '2026-11-30', offer_coupon_code: 'ROOF10', offer_terms: 'One per home.' });
  assert.deepEqual(offer.media, ['https://x.example/a.jpg']);
  assert.equal(offer.post.scheduled_at, '2026-11-19T14:00:00.000Z');
  // A photo post sends no words and no button.
  assert.deepEqual(postRequest(draft({ format: 'photo', cta: 'BOOK', ctaUrl: 'https://x.example', image: 'https://x.example/a.jpg' }), 'W9', loc), {
    post: {}, profiles: ['W9'], media: ['https://x.example/a.jpg'], platforms: { google_business: { format: 'photo', location_id: loc } },
  });
});

test('posts are read back with where they stand', () => {
  const raw = (status: string, on: string, over: object = {}) => ({
    id: 'p1', body: 'Hello', status, scheduled_at: '2026-11-20T14:00:00Z', created_at: '2026-11-18T10:00:00Z', media: [{ url: 'https://cdn.example/a.jpg' }],
    platforms: [{ platform: 'google_business', status: on, error: null, attempted_at: '2026-11-18T10:01:00Z', permalink: 'https://local.google.com/place?id=1', params: { location_id: loc, format: 'event', event_title: 'Open house' } }],
    ...over,
  });
  const p = readPost(raw('processed', 'published'))!;
  assert.deepEqual([p.state, p.format, p.title, p.location, p.at, p.image], ['published', 'event', 'Open house', loc, '2026-11-18T10:01:00Z', 'https://cdn.example/a.jpg']);
  assert.equal(readPost(raw('scheduled', 'processing'))!.state, 'scheduled');
  assert.equal(readPost(raw('scheduled', 'processing'))!.at, '2026-11-20T14:00:00Z');
  assert.equal(readPost(raw('processing', 'processing'))!.state, 'publishing');
  assert.equal(readPost(raw('processed', 'failed'))!.state, 'failed');
  assert.equal(readPost(raw('media_processing_failed', 'processing'))!.state, 'failed');
  assert.equal(readPost(raw('draft', 'processing'))!.state, 'draft');
  // A post that went somewhere else, or to no listing, is not ours to show.
  assert.equal(readPost({ id: 'x', platforms: [{ platform: 'facebook', params: {} }] }), null);
  assert.equal(readPost({ id: 'x', platforms: [{ platform: 'google_business', params: {} }] }), null);
  assert.equal(readPost(null), null);
});

test('the weekly slot is the next free one', () => {
  // A Wednesday at 10:00 local time; the slot is Monday 09:00.
  const wed = new Date(2026, 10, 18, 10, 0, 0);
  const first = nextWeeklySlot(1, '09:00', [], wed);
  assert.deepEqual([first.getFullYear(), first.getMonth(), first.getDate(), first.getDay(), first.getHours()], [2026, 10, 23, 1, 9]);
  // That Monday already has a post: the Monday after.
  assert.equal(nextWeeklySlot(1, '09:00', [first.toISOString()], wed).getDate(), 30);
  // Today's slot, an hour or more away, is taken; one that has passed is not.
  assert.equal(nextWeeklySlot(3, '15:00', [], wed).getDate(), 18);
  assert.equal(nextWeeklySlot(3, '09:00', [], wed).getDate(), 25);
});

import { localDay, planSlots } from '../packages/core/gbpPosts';

test('planning ahead gives every chosen weekday for the weeks asked, skipping days that have a post', () => {
  const now = new Date(2026, 10, 19, 10, 0, 0); // a Thursday, 10:00 where the viewer is
  const slots = planSlots([1, 4], '09:00', 4, [], now);
  // Today's 09:00 has passed, so the first is Monday; four weeks hold four Mondays and three more Thursdays.
  assert.equal(slots.length, 7);
  assert.equal(slots[0].getDay(), 1);
  assert.equal(localDay(slots[0]), '2026-11-23');
  assert.ok(slots.every((s) => [1, 4].includes(s.getDay()) && s.getHours() === 9 && s.getMinutes() === 0));
  assert.ok(slots.every((s, i) => i === 0 || s.getTime() > slots[i - 1].getTime()));
  // Later the same day still counts when it is more than an hour off.
  assert.equal(localDay(planSlots([4], '15:00', 1, [], now)[0]), '2026-11-19');
  assert.equal(planSlots([4], '10:30', 1, [], now).length, 0);
  // A day that already has a post is left alone.
  assert.equal(planSlots([1, 4], '09:00', 4, ['2026-11-23', '2026-11-26'], now).length, 5);
  assert.equal(planSlots([], '09:00', 4, [], now).length, 0);
  assert.equal(planSlots([0, 1, 2, 3, 4, 5, 6], '09:00', 12, [], now).length, 40);
});

import { calendarWeeks, emptyWeeks } from '../packages/core/gbpPosts';

test('a month is laid out in whole weeks, Sunday first', () => {
  const nov = calendarWeeks(2026, 10);
  assert.equal(nov.length, 5);
  assert.ok(nov.every((w) => w.length === 7));
  assert.equal(nov[0][0], '2026-11-01'); // November 2026 starts on a Sunday
  assert.equal(nov[4][6], '2026-12-05');
  const dec = calendarWeeks(2026, 11);
  assert.equal(dec[0][0], '2026-11-29');
  assert.equal(dec[0][2], '2026-12-01');
  assert.equal(dec[dec.length - 1].includes('2026-12-31'), true);
  // A February that fits four weeks exactly.
  assert.deepEqual(calendarWeeks(2026, 1).map((w) => w[0]), ['2026-02-01', '2026-02-08', '2026-02-15', '2026-02-22']);
});

test('weeks ahead with no post are found', () => {
  assert.deepEqual(emptyWeeks([], '2026-11-19', 4), ['2026-11-19', '2026-11-26', '2026-12-03', '2026-12-10']);
  assert.deepEqual(emptyWeeks(['2026-11-19', '2026-12-09'], '2026-11-19', 4), ['2026-11-26', '2026-12-10']);
  assert.deepEqual(emptyWeeks(['2026-11-25', '2026-11-26', '2026-12-03', '2026-12-16'], '2026-11-19', 4), []);
  assert.deepEqual(emptyWeeks([], 'soon', 4), []);
});
