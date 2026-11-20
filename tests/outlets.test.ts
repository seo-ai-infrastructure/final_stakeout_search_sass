import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, postRequest } from '../packages/core/gbpPosts';
import { outletProblem, readOutletResults, withOutlets } from '../packages/core/outlets';

const fb = { profile: 'FBprof', placement: '1234567890', name: '210 Pressure Washing' };
const li = { profile: 'LIprof', placement: null, name: 'Brock (own profile)' };
const draft = (o: Record<string, string> = {}) => ({ ...emptyDraft(), body: 'Driveways look new again.', ...o });

test('one post goes to Google and to each chosen outlet, text and photo shared', () => {
  const d = draft({ image: 'https://example.com/a.jpg' });
  const r = withOutlets(postRequest(d, 'Gprof', 'accounts/1/locations/2'), d, { facebook: fb, linkedin: li });
  assert.deepEqual(r.profiles, ['Gprof', 'FBprof', 'LIprof']);
  assert.deepEqual(r.media, ['https://example.com/a.jpg']);
  assert.equal(r.post.body, 'Driveways look new again.');
  assert.equal(r.platforms.google_business.location_id, 'accounts/1/locations/2');
  assert.deepEqual(r.platforms.facebook, { format: 'post', page_id: '1234567890' });
  // The person's own LinkedIn profile: no organisation named.
  assert.deepEqual(r.platforms.linkedin, { format: 'post' });
});

test("a LinkedIn company page is named, and Google's button link becomes Facebook's link card only when there is no photo", () => {
  const d = draft({ cta: 'LEARN_MORE', ctaUrl: 'https://example.com/offer' });
  const r = withOutlets(postRequest(d, 'G', 'accounts/1/locations/2'), d, { facebook: fb, linkedin: { ...li, placement: '998877' } });
  assert.equal(r.platforms.facebook.link, 'https://example.com/offer');
  assert.equal(r.platforms.linkedin.organization_id, '998877');
  assert.equal(r.platforms.google_business.cta_url, 'https://example.com/offer');
  const withPhoto = draft({ cta: 'LEARN_MORE', ctaUrl: 'https://example.com/offer', image: 'https://example.com/a.jpg' });
  assert.equal(withOutlets(postRequest(withPhoto, 'G', 'accounts/1/locations/2'), withPhoto, { facebook: fb }).platforms.facebook.link, undefined);
  // A "Call" button has no link to share.
  const call = draft({ cta: 'CALL' });
  assert.equal(withOutlets(postRequest(call, 'G', 'accounts/1/locations/2'), call, { facebook: fb }).platforms.facebook.link, undefined);
});

test('with no outlet chosen the request is exactly the Google one', () => {
  const d = draft();
  assert.deepEqual(withOutlets(postRequest(d, 'G', 'accounts/1/locations/2'), d, {}), postRequest(d, 'G', 'accounts/1/locations/2'));
});

test('an outlet says in plain words why it cannot take a post', () => {
  assert.equal(outletProblem(draft(), 'facebook', fb), null);
  assert.equal(outletProblem(draft(), 'linkedin', li), null);
  assert.match(outletProblem(draft(), 'facebook', undefined)!, /not connected/);
  assert.match(outletProblem(draft(), 'facebook', { ...fb, placement: null })!, /Choose which Facebook Page/);
  assert.match(outletProblem(draft({ format: 'photo', body: '' }), 'linkedin', li)!, /Google listing only/);
  assert.match(outletProblem(draft({ body: '   ' }), 'facebook', fb)!, /needs some text/);
  assert.match(outletProblem(draft({ body: 'x'.repeat(3001) }), 'linkedin', li)!, /3,000 characters/);
});

test("each outlet's result is read on its own: one can fail while the others publish", () => {
  const raw = { id: 'p1', platforms: [
    { platform: 'google_business', status: 'published', params: { location_id: 'accounts/1/locations/2' } },
    { platform: 'facebook', status: 'published', permalink: 'https://facebook.com/1/posts/2' },
    { platform: 'linkedin', status: 'failed', error: 'Image is too small' },
    { platform: 'tiktok', status: 'published' },
  ] };
  assert.deepEqual(readOutletResults(raw), [
    { outlet: 'facebook', state: 'published', error: null, permalink: 'https://facebook.com/1/posts/2' },
    { outlet: 'linkedin', state: 'failed', error: 'Image is too small', permalink: null },
  ]);
  assert.deepEqual(readOutletResults(null), []);
  assert.equal(readOutletResults({ platforms: [{ platform: 'facebook', status: 'processing' }] })[0].state, 'waiting');
});
