import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceOf,
  failureKind,
  kindLabel,
  locationPathOf,
  nextLocationRuns,
  parseEntries,
  refusedRun,
  refusedSummary,
  skipFooterHunt,
  stageSeconds,
  timingLine,
  timingSummary,
  withEvidence,
  LOCATION_RUNS_KEPT,
  type LocationRun,
  type RunTiming,
} from '../packages/core/runLog';

test('a failure is named by its code, and template failures by what went wrong', () => {
  assert.equal(failureKind(new Error("RPA_SURFACE_ERROR location_not_refreshed: the template finished without refreshing Google's location")), 'RPA_SURFACE_ERROR location_not_refreshed');
  assert.equal(failureKind(new Error('RPA_SURFACE_ERROR no_scroll: the template finished without scrolling')), 'RPA_SURFACE_ERROR no_scroll');
  assert.equal(failureKind(new Error('RPA_SURFACE_ERROR surface_error: wrong page')), 'RPA_SURFACE_ERROR surface_error');
  assert.equal(failureKind(new Error('RPA_TASK_FAILED CLICK_ELEMENT: element not found')), 'RPA_TASK_FAILED CLICK_ELEMENT');
  assert.equal(failureKind(new Error('RPA_TASK_FAILED cancelled')), 'RPA_TASK_FAILED cancelled');
  assert.equal(failureKind(new Error('RPA_TASK_TIMEOUT status=1')), 'RPA_TASK_TIMEOUT');
  assert.equal(failureKind(new Error('LOCATION_UNVERIFIED')), 'LOCATION_UNVERIFIED');
  assert.equal(failureKind(new Error('WRONG_QUERY the page was a search for "things to do today", not the keyword')), 'WRONG_QUERY');
  assert.equal(kindLabel('WRONG_QUERY'), 'The page was for a different search');
  assert.equal(failureKind(new Error('RPA_SURFACE_ERROR finder_not_opened: the full list of businesses never opened')), 'RPA_SURFACE_ERROR finder_not_opened');
  assert.equal(kindLabel('RPA_SURFACE_ERROR finder_not_opened'), 'The full list of businesses never opened');
  const named = new Error('x');
  named.name = 'NoSuchBucket';
  assert.equal(failureKind(named), 'NoSuchBucket');
  assert.equal(failureKind('boom'), 'PIN_FAILED');
  assert.equal(kindLabel('RPA_SURFACE_ERROR location_not_refreshed'), 'Location not refreshed');
  assert.equal(kindLabel('SOMETHING_NEW'), 'SOMETHING_NEW');
});

test('a failed attempt carries where its evidence was stored', () => {
  const e = new Error('LOCATION_UNVERIFIED');
  const ev = { video: 'scans/s/pin_1_2/abcdef012345/video.mp4', bundle: 'scans/s/pin_1_2/abcdef012345/raw.tar.gz', locationPath: 'precise,top', template: '3.42' };
  withEvidence(e, ev);
  ev.video = null; // a copy is kept, so later changes do not leak in
  assert.equal(evidenceOf(e)?.video, 'scans/s/pin_1_2/abcdef012345/video.mp4');
  assert.equal(evidenceOf(new Error('x')), null);
  assert.equal(evidenceOf('x'), null);
});

test('rejected searches are clipped, listed and summarised', () => {
  const now = Date.parse('2026-11-17T21:00:00Z');
  const run = (kind: string, phone: string, minutesAgo: number) =>
    refusedRun({ pinId: 'p', scanId: 's', point: '1,2', keyword: 'kw', phone, model: null, attempt: 1, kind, message: 'x'.repeat(500), template: '3.42', locationPath: null, video: null, bundle: null, seconds: 300, at: new Date(now - minutesAgo * 60000) });
  const runs = [run('LOCATION_UNVERIFIED', 'UXsp5', 5), run('LOCATION_UNVERIFIED', 'x0Puo', 50), run('RPA_TASK_TIMEOUT', 'UXsp5', 70), run('LOCATION_UNVERIFIED', 'UXsp5', 2000)];
  assert.equal(runs[0].message.length, 240);
  const day = refusedSummary(runs, now - 86400000);
  assert.equal(day.total, 3);
  assert.deepEqual(day.byKind[0], { kind: 'LOCATION_UNVERIFIED', n: 2 });
  assert.deepEqual(day.byPhone[0], { phone: 'UXsp5', n: 2 });
  assert.equal(refusedSummary(runs, now - 3600000).total, 2);
  assert.deepEqual(parseEntries<{ a: number }>(['{"a":1}', 'not json', null, '{"a":2}']).map((x) => x.a), [1, 2]);
});

test('an attempt is split into stages; stages it never reached are empty', () => {
  const s = 1_000_000;
  const t = stageSeconds(s, { proxy: s + 22_000, added: s + 30_000, started: s + 39_000, templateDone: s + 340_000, bundle: s + 352_000, released: s + 356_000, stored: s + 371_000, saved: s + 375_000 }, s + 376_000);
  assert.deepEqual(
    [t.proxy, t.warmup, t.setup, t.queue, t.template, t.evidence, t.transfer, t.finish, t.total, t.phoneHeld],
    [22, null, 8, 9, 301, 12, 19, 4, 376, 356],
  );
  assert.match(timingLine(t), /^proxy 22s · setup 8s · duoplus start 9s · template 301s/);
  assert.match(timingLine(t), /phone free after 356s\)$/);
  // A proxy failure: only the proxy stage and the total.
  const f = stageSeconds(s, {}, s + 95_000);
  assert.equal(f.proxy, null);
  assert.equal(f.total, 95);
  assert.equal(f.phoneHeld, 95);
  // No "running" seen (the template finished between two looks): the template stage starts when the task was added.
  assert.equal(stageSeconds(s, { added: s, templateDone: s + 200_000 }, s + 200_000).template, 200);
});

test('timing summary: medians of finished points, and the time failures cost', () => {
  const at = '2026-11-17T21:00:00Z';
  const ok = (template: number, held: number): RunTiming => ({ ...stageSeconds(0, {}, held * 1000), template, phoneHeld: held, at, pinId: 'p', phone: 'a', ok: true, kind: null, searched: true });
  const bad = (held: number, searched: boolean): RunTiming => ({ ...stageSeconds(0, {}, held * 1000), at, pinId: 'p', phone: 'a', ok: false, kind: 'X', searched });
  const s = timingSummary([ok(300, 400), ok(320, 420), ok(280, 380), bad(600, true), bad(120, false)], Date.parse(at) - 1000);
  assert.equal(s.succeeded, 3);
  assert.equal(s.median.template, 300);
  assert.equal(s.median.phoneHeld, 400);
  assert.equal(s.failedSearches, 1);
  assert.equal(s.lostMinutesSearches, 10);
  assert.equal(s.failedSetups, 1);
  assert.equal(s.lostMinutesSetups, 2);
  assert.equal(s.median.warmup, null);
  assert.equal(timingSummary([], 0).attempts, 0);
});

test('the refresh path is read from the recorder notes', () => {
  assert.equal(locationPathOf('mode=rpa\nlocation_refreshed=1\nlocation_path=footer,top\nevidence=template\n'), 'footer,top');
  assert.equal(locationPathOf('location_refreshed=1\n'), null);
  assert.equal(locationPathOf('location_path=foo;rm -rf\n'), null);
});

test('the footer hunt is skipped after two misses, checked again every 6 skipped runs, and stops on any footer', () => {
  const miss: LocationRun = { footer: false, skipped: false };
  const hit: LocationRun = { footer: true, skipped: false };
  const skipped: LocationRun = { footer: false, skipped: true };
  assert.deepEqual(skipFooterHunt([]), { skip: false, probe: false });
  assert.deepEqual(skipFooterHunt([miss]), { skip: false, probe: false }, 'one miss proves nothing');
  assert.deepEqual(skipFooterHunt([hit, miss]), { skip: false, probe: false });
  assert.deepEqual(skipFooterHunt([miss, miss]), { skip: true, probe: false });
  assert.deepEqual(skipFooterHunt([miss, hit, miss]), { skip: false, probe: false }, 'not two misses in a row');
  assert.deepEqual(skipFooterHunt([miss, miss, skipped, skipped, skipped, skipped, skipped]), { skip: true, probe: false });
  assert.deepEqual(skipFooterHunt([miss, miss, skipped, skipped, skipped, skipped, skipped, skipped]), { skip: false, probe: true }, 'every 6 skipped runs, one run hunts again');
  assert.deepEqual(skipFooterHunt([miss, miss, ...Array(6).fill(skipped), miss]), { skip: true, probe: false }, 'the check missed again: skip again');
  assert.deepEqual(skipFooterHunt([miss, miss, ...Array(6).fill(skipped), hit]), { skip: false, probe: false }, 'the footer is back');
  assert.deepEqual(skipFooterHunt([miss, miss, { footer: true, skipped: true }]), { skip: false, probe: false }, 'a footer found on a "skipped" run means the skip did not happen');
  let runs: LocationRun[] = [];
  for (let i = 0; i < 20; i++) runs = nextLocationRuns(runs, miss);
  assert.equal(runs.length, LOCATION_RUNS_KEPT);
});
