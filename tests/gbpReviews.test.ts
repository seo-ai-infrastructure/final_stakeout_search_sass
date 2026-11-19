import test from 'node:test';
import assert from 'node:assert/strict';
import { filterReviews, isLow, needsReply, readReview, replyProblem, reviewSummary, REPLY_MAX_BYTES } from '../packages/core/gbpReviews';

const raw = (over: object = {}) => ({
  id: 'NGfnqwg',
  external_id: 'accounts/1/locations/2/reviews/abc',
  parent_external_id: null,
  placement_id: 'accounts/1/locations/2',
  body: 'They are fantastic!',
  status: 'synced',
  author_username: 'Kiva',
  author_avatar_url: 'https://lh3.googleusercontent.com/a/x=s120',
  platform_data: { star_rating: 5, review_reply_url: 'https://business.google.com/n/2/reviews/x' },
  permalink: 'https://search.google.com/local/reviews?placeid=P',
  posted_at: '2026-11-18T21:30:14.582Z',
  created_at: '2026-11-18T22:06:11.711Z',
  replies: [],
  ...over,
});
const reply = (over: object = {}) => ({ id: 'KDfaKpM', body: 'Thank you!', status: 'published', error: null, posted_at: '2026-11-17T10:58:21.377Z', ...over });

test('a review is read from what the service sends, with its reply', () => {
  const r = readReview(raw({ replies: [reply()] }))!;
  assert.equal(r.id, 'NGfnqwg');
  assert.equal(r.location, 'accounts/1/locations/2');
  assert.equal(r.stars, 5);
  assert.equal(r.author, 'Kiva');
  assert.equal(r.replyUrl, 'https://business.google.com/n/2/reviews/x');
  assert.deepEqual(r.reply, { id: 'KDfaKpM', text: 'Thank you!', status: 'published', error: null, postedAt: '2026-11-17T10:58:21.377Z' });
  // Missing pieces never break the list: no name, no rating, a link that is not a web address.
  const bare = readReview(raw({ author_username: null, platform_data: { star_rating: 'FIVE' }, author_avatar_url: 'javascript:x', permalink: null }))!;
  assert.equal(bare.author, 'A Google user');
  assert.equal(bare.stars, null);
  assert.equal(bare.avatar, null);
  assert.equal(bare.permalink, null);
  // A reply on its own, or something without an id, is not a review.
  assert.equal(readReview(raw({ parent_external_id: 'accounts/1/locations/2/reviews/abc' })), null);
  assert.equal(readReview({ body: 'x' }), null);
  assert.equal(readReview(null), null);
});

test('which reviews still need an answer', () => {
  const none = readReview(raw())!;
  const answered = readReview(raw({ replies: [reply()] }))!;
  const sending = readReview(raw({ replies: [reply({ status: 'pending' })] }))!;
  const failed = readReview(raw({ replies: [reply({ status: 'failed', error: 'Google said no' })] }))!;
  const retrying = readReview(raw({ replies: [reply({ status: 'failed_waiting_for_retry' })] }))!;
  const deleted = readReview(raw({ replies: [reply({ status: 'deleted' })] }))!;
  assert.deepEqual([none, answered, sending, failed, retrying, deleted].map(needsReply), [true, false, false, true, true, true]);
  assert.equal(deleted.reply, null);
  // A re-sent reply replaces the one before it.
  assert.equal(readReview(raw({ replies: [reply({ status: 'failed' }), reply({ id: 'new', status: 'published' })] }))!.reply!.id, 'new');
});

test('filters and counts', () => {
  const list = [
    readReview(raw({ id: 'a1b2', platform_data: { star_rating: 5 } }))!,
    readReview(raw({ id: 'c3d4', platform_data: { star_rating: 2 } }))!,
    readReview(raw({ id: 'e5f6', platform_data: { star_rating: 3 }, replies: [reply()] }))!,
    readReview(raw({ id: 'g7h8', platform_data: {} }))!,
  ];
  assert.deepEqual(filterReviews(list, 'unanswered').map((r) => r.id), ['a1b2', 'c3d4', 'g7h8']);
  assert.deepEqual(filterReviews(list, 'low').map((r) => r.id), ['c3d4', 'e5f6']);
  assert.equal(filterReviews(list, 'all').length, 4);
  assert.equal(isLow(list[3]), false);
  // The average leaves out a review with no rating.
  assert.deepEqual(reviewSummary(list), { count: 4, average: 3.3, unanswered: 3, lowUnanswered: 1 });
  assert.deepEqual(reviewSummary([]), { count: 0, average: null, unanswered: 0, lowUnanswered: 0 });
});

test('a reply must have words and fit Google’s limit', () => {
  assert.equal(replyProblem('Thank you, Kiva!'), null);
  assert.match(replyProblem('   ')!, /Write a reply/);
  assert.match(replyProblem(undefined)!, /Write a reply/);
  assert.equal(replyProblem('a'.repeat(REPLY_MAX_BYTES)), null);
  assert.match(replyProblem('a'.repeat(REPLY_MAX_BYTES + 1))!, /Too long/);
  // Counted in bytes, as Google does: an emoji is four.
  assert.match(replyProblem('😀'.repeat(1025))!, /Too long/);
});
