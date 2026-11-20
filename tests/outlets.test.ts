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

test('Google is one outlet among the others: a post can go without it', async () => {
  const { buildPostRequest, draftProblem } = await import('../packages/core/outlets');
  const d = draft({ scheduledAt: new Date(Date.now() + 3600000).toISOString() });
  const r = buildPostRequest(d, null, { facebook: fb, linkedin: li });
  assert.deepEqual(r.profiles, ['FBprof', 'LIprof']);
  assert.equal(r.platforms.google_business, undefined);
  assert.equal(r.post.body, 'Driveways look new again.');
  assert.ok(r.post.scheduled_at);
  // With Google ticked it is the same request as before.
  assert.deepEqual(buildPostRequest(d, { profile: 'G', location: 'accounts/1/locations/2' }, { facebook: fb }), withOutlets(postRequest(d, 'G', 'accounts/1/locations/2'), d, { facebook: fb }));
  assert.equal(draftProblem(d, false, { facebook: fb }), null);
  assert.match(draftProblem(d, false, {})!, /at least one place/);
  assert.match(draftProblem(draft({ format: 'offer' }), false, { facebook: fb })!, /Google formats/);
  // Without Google its 1,500 limit no longer applies; LinkedIn's 3,000 does.
  assert.equal(draftProblem(draft({ body: 'x'.repeat(2000) }), false, { linkedin: li }), null);
  assert.match(draftProblem(draft({ body: 'x'.repeat(2000) }), true, { linkedin: li })!, /1500/);
  assert.match(draftProblem(draft({ body: 'x'.repeat(3500) }), false, { linkedin: li })!, /3,000/);
  assert.match(draftProblem(draft({ scheduledAt: new Date(Date.now() + 60000).toISOString() }), false, { facebook: fb })!, /five minutes/);
});

test('a post with no Google copy is read through our own record of its listing, and each outlet has its own state', async () => {
  const { readPost } = await import('../packages/core/gbpPosts');
  const raw = { id: 'p9', status: 'processed', body: 'Hello', platforms: [{ platform: 'facebook', status: 'published', permalink: 'https://facebook.com/x', attempted_at: '2026-11-20T18:00:00Z' }, { platform: 'linkedin', status: 'failed', error: 'too small' }] };
  assert.equal(readPost(raw), null); // nothing says which listing it is
  const p = readPost(raw, 'accounts/1/locations/2')!;
  assert.equal(p.location, 'accounts/1/locations/2');
  assert.equal(p.google, null);
  assert.equal(p.state, 'published'); // out somewhere; the LinkedIn mark carries the failure
  assert.equal(p.also!.length, 2);
  // A Google copy decides the listing by itself, whatever record there is.
  const withG = { id: 'p1', status: 'scheduled', scheduled_at: '2026-12-01T15:00:00Z', platforms: [{ platform: 'google_business', status: 'pending', params: { location_id: 'accounts/1/locations/7' } }, { platform: 'facebook', status: 'pending' }] };
  const q = readPost(withG, 'accounts/1/locations/2')!;
  assert.equal(q.location, 'accounts/1/locations/7');
  assert.equal(q.state, 'scheduled');
  assert.deepEqual(q.google, { state: 'waiting', error: null, permalink: null });
  // Everything failed: the post failed.
  assert.equal(readPost({ id: 'p2', status: 'processed', platforms: [{ platform: 'facebook', status: 'failed', error: 'no' }] }, 'L')!.state, 'failed');
});

test('the Page that looks like the listing comes first; with no clear match nothing is suggested', async () => {
  const { rankChoices } = await import('../packages/core/outlets');
  const pages = ['ABC Roofing Repair & Replacement', 'Brock Misner', 'Plano Tree Service', 'Plano Tree Service Pros', 'Smiley Drain'].map((name, i) => ({ id: String(i), name }));
  const r = rankChoices('Plano Tree Service', pages);
  assert.equal(r[0].name, 'Plano Tree Service');
  assert.equal(r[0].suggested, true);
  assert.equal(r.filter((x) => x.suggested).length, 1);
  assert.deepEqual(r.slice(1).map((x) => x.name), ['ABC Roofing Repair & Replacement', 'Brock Misner', 'Plano Tree Service Pros', 'Smiley Drain']);
  assert.equal(rankChoices('Brandon J. Broderick, Personal Injury Attorney at Law', [{ name: 'Smiley Drain' }, { name: 'Brandon J. Broderick, Personal Injury Attorney At Law' }])[0].suggested, true);
  const none = rankChoices('Stakeout Search', pages);
  assert.equal(none.some((x) => x.suggested), false);
  assert.deepEqual(none.map((x) => x.name), pages.map((x) => x.name));
});
