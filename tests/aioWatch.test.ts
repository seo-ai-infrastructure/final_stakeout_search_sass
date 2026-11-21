import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { watchAioSources, type WatchDeps } from '../apps/worker/src/aioWatch';
import { AIO_PROBE_JS, AIO_SOURCES_JS } from '../packages/core/aioSources';

// A stand-in for one DevTools endpoint: /json/list answers with whatever `targets` holds now.
type Endpoint = { port: number; lists: number; firstListAt: number; targets: { id: string; type: string; url: string; title?: string }[]; server: Server };
async function endpoint(app: string): Promise<Endpoint> {
  const e = { port: 0, lists: 0, firstListAt: 0, targets: [] as Endpoint['targets'], server: null as unknown as Server };
  e.server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/json/version') return res.end(JSON.stringify({ Browser: 'Chrome/142.0', 'Android-Package': app }));
    e.lists++;
    e.firstListAt ||= Date.now();
    res.end(JSON.stringify(e.targets));
  });
  await new Promise<void>((r) => e.server.listen(0, '127.0.0.1', r));
  e.port = (e.server.address() as AddressInfo).port;
  return e;
}

const page = (q: string, id = 'p' + q.length) => ({ id, type: 'page', url: 'https://www.google.com/search?q=' + encodeURIComponent(q) + '&oq=x', title: q });
const RUN = 'abc_1';
const at = (ms: number, f: () => void) => setTimeout(f, ms);

// The phone: files the template writes appear over time; a wait answers once one exists (or soon).
function phone(chrome: Endpoint, others: Record<string, Endpoint> = {}) {
  const files = new Set<string>();
  const forwards: string[] = [];
  const deps: Partial<WatchDeps> = {
    phoneSeconds: async () => Date.now() / 1000 - 5,
    diag: async () => '',
    forward: async (remote) => {
      forwards.push(remote);
      if (remote === 'chrome_devtools_remote') return chrome.port;
      if (others[remote]) return others[remote].port;
      throw new Error('no such socket');
    },
    unforward: async () => {},
    waitForFile: async (paths, ms) => {
      const end = Date.now() + Math.min(ms, 150);
      while (Date.now() < end) {
        const hit = paths.find((p) => files.has(p));
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 20));
      }
      return null;
    },
    front: async () =>
      [
        'mCurrentFocus=Window{1a2b u0 com.android.chrome/org.chromium.chrome.browser.ChromeTabbedActivity}',
        'pids chrome=4321 google=',
        'sockets ' + ['@chrome_devtools_remote', ...Object.keys(others).map((s) => '@' + s)].join(' '),
      ].join('\n'),
  };
  return { files, forwards, deps, add: (name: string) => files.add(`/sdcard/stakeout/${RUN}${name}`) };
}

test('aio watch: Chrome is left alone until the keyword marker, then snapshotted as typed, gone and copied', async () => {
  const chrome = await endpoint('com.android.chrome');
  chrome.targets = [page('hourly weather forecast')];
  const p = phone(chrome);
  let over = false;
  let markerAt = 0;
  at(400, () => {
    p.add('.rec');
    markerAt = Date.now();
  });
  at(600, () => (chrome.targets = [page('car accident lawyer tulsa')]));
  at(2300, () => (chrome.targets = [page('hourly weather forecast')]));
  at(2900, () => p.add('_aio_copy.txt'));
  at(3600, () => {
    p.add('.done');
    over = true;
  });
  const r = await watchAioSources({ phone: { imageId: 'x', adbAddr: null }, keyword: 'car accident lawyer tulsa', run: RUN, done: () => over, until: Date.now() + 20000, deps: p.deps });
  chrome.server.close();
  // Nothing was asked of Chrome during the warm-up searches.
  assert.ok(markerAt > 0 && chrome.firstListAt >= markerAt, 'no page list before the keyword marker');
  assert.equal(p.forwards[0], 'chrome_devtools_remote');
  assert.ok(r.trace?.some((l) => l.includes('keyword marker')));
  // The results page was looked at while Chrome listed it (the stand-in has no DevTools page: no answer).
  assert.ok(r.probes > 0);
  // Three moments, each with the app in front, the sockets, and everything listed.
  assert.deepEqual(r.snapshots?.map((s) => s.why), ['typing', 'gone', 'copied']);
  const gone = r.snapshots!.find((s) => s.why === 'gone')!;
  assert.match(gone.front[0], /ChromeTabbedActivity/);
  assert.deepEqual(gone.sockets, ['chrome_devtools_remote']);
  assert.equal(gone.lists[0].app, 'com.android.chrome');
  assert.equal(gone.lists[0].targets[0].title, 'hourly weather forecast');
  assert.ok(r.trace?.some((l) => l.includes('snapshot (copied)')));
});

test('aio watch: a template that ends without marking the keyword is never looked at in Chrome', async () => {
  const chrome = await endpoint('com.android.chrome');
  const p = phone(chrome);
  let over = false;
  at(300, () => {
    p.add('.done');
    over = true;
  });
  const r = await watchAioSources({ phone: { imageId: 'x', adbAddr: null }, keyword: 'emergency plumber tulsa', run: RUN, done: () => over, until: Date.now() + 10000, deps: p.deps });
  chrome.server.close();
  assert.equal(chrome.lists, 0);
  assert.equal(p.forwards.length, 0);
  assert.equal(r.status, 'no_results_page');
  assert.equal(r.note, 'no keyword marker');
});

test('aio watch: the results page found behind another DevTools socket is followed there', async () => {
  const chrome = await endpoint('com.android.chrome');
  const webview = await endpoint('com.google.android.googlequicksearchbox');
  chrome.targets = [page('events near me')];
  const p = phone(chrome, { webview_devtools_remote_999: webview });
  let over = false;
  at(200, () => p.add('.rec'));
  at(300, () => (webview.targets = [page('car accident lawyer tulsa', 'w1')]));
  at(900, () => p.add('_aio_copy.txt'));
  at(2600, () => {
    p.add('.done');
    over = true;
  });
  const r = await watchAioSources({ phone: { imageId: 'x', adbAddr: null }, keyword: 'car accident lawyer tulsa', run: RUN, done: () => over, until: Date.now() + 20000, deps: p.deps });
  chrome.server.close();
  webview.server.close();
  assert.equal(r.note, 'followed the results page to webview_devtools_remote_999');
  assert.ok(r.probes > 0, 'looked at the results page on the other socket');
  const copied = r.snapshots!.find((s) => s.why === 'copied')!;
  assert.ok(copied.lists.some((l) => l.socket === 'webview_devtools_remote_999' && l.app === 'com.google.android.googlequicksearchbox'));
});

test('aio watch: a tab Chrome still lists under the warm-up address is asked where it is, and read there', async () => {
  // Chrome lists only the warm-up search, all run long; the tab itself is on the keyword's results page once it is typed.
  const chrome = await endpoint('com.android.chrome');
  const warm = page('stopwatch', 'tab1');
  chrome.targets = [warm];
  const p = phone(chrome);
  const results = 'https://www.google.com/search?q=sell+my+house+fast&oq=sell+my+house+fast';
  let typed = false;
  let over = false;
  const asked: string[] = [];
  p.deps.evaluate = async (_port, id, expression) => {
    if (expression === 'location.href') return (asked.push(id), typed ? results : warm.url);
    if (expression === AIO_PROBE_JS) return JSON.stringify({ u: results, t: Date.now(), b: 6, s: 27, c: 103, aio: true });
    if (expression === AIO_SOURCES_JS)
      return JSON.stringify({ meta: { query: 'sell my house fast' }, clusters: [{ clusterIndex: 1, uuid: 'a', claimText: 'Cash buyers close fast.', visibleCitation: { label: 'x', url: null }, candidatePool: [] }] });
    return null;
  };
  at(200, () => p.add('.rec'));
  at(500, () => (typed = true));
  at(2400, () => {
    p.add('.done');
    over = true;
  });
  const r = await watchAioSources({ phone: { imageId: 'x', adbAddr: null }, keyword: 'sell my house fast', run: RUN, done: () => over, until: Date.now() + 20000, deps: p.deps });
  chrome.server.close();
  assert.equal(r.status, 'captured');
  assert.ok(r.reads >= 1 && r.probes >= 1);
  assert.equal(r.note, 'read through a tab Chrome listed under its earlier address');
  assert.ok(r.trace?.some((l) => l.includes('(its own address: R)')));
  assert.ok(asked.includes('tab1'));
  // The snapshot shows the tab's own address beside the listed one.
  const typing = r.snapshots?.find((s) => s.why === 'typing');
  assert.equal(typing?.lists[0].targets[0].real !== undefined, true);
});

test('aio watch: a missed look after a read does not end the watch; the overview growing later is read and merged', async () => {
  const chrome = await endpoint('com.android.chrome');
  const warm = page('stopwatch', 'tab1');
  chrome.targets = [warm];
  const p = phone(chrome);
  const results = 'https://www.google.com/search?q=sell+my+house+fast&oq=sell+my+house+fast';
  const loaded = Date.now();
  let state: 'warm' | 'first' | 'miss' | 'expanded' = 'warm';
  let over = false;
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ order: i + 1, url: 'https://site' + i + '.com', domain: null, title: null, snippet: null, mid: null, coords: null, related: null, count: 1, inAio: 1, sentences: [1], where: 'AI Overview', sections: ['AI Overview'], attrid: null }));
  const dossier = (sentences: number, n: number) =>
    JSON.stringify({
      meta: { query: 'sell my house fast', timestamp: 't', url: results, totalClaimClusters: sentences },
      clusters: Array.from({ length: sentences }, (_, i) => ({ clusterIndex: i + 1, uuid: 'u' + i, claimText: 'c', visibleCitation: { label: 'x', url: null }, candidatePool: [] })),
      pool: { comments: n, parsed: n, entries: rows(n) },
    });
  p.deps.evaluate = async (_port, _id, expression) => {
    if (expression === 'location.href') return state === 'first' || state === 'expanded' ? results : warm.url;
    if (expression === AIO_PROBE_JS) return JSON.stringify(state === 'expanded' ? { t: loaded, b: 8, s: 35, c: 397, aio: true } : { t: loaded, b: 6, s: 27, c: 103, aio: true });
    if (expression === AIO_SOURCES_JS) return state === 'expanded' ? dossier(8, 3) : dossier(6, 2);
    return null;
  };
  at(200, () => p.add('.rec'));
  at(400, () => (state = 'first'));
  at(1600, () => (state = 'miss'));
  at(3200, () => (state = 'expanded'));
  at(5200, () => {
    p.add('.done');
    over = true;
  });
  const r = await watchAioSources({ phone: { imageId: 'x', adbAddr: null }, keyword: 'sell my house fast', run: RUN, done: () => over, until: Date.now() + 20000, deps: p.deps });
  chrome.server.close();
  assert.equal(r.status, 'captured');
  // Read when first seen, again when the overview grew, and once more as the template ended.
  assert.equal(r.reads, 3);
  assert.equal(r.dossier?.clusters.length, 8);
  assert.equal(r.dossier?.pool?.entries.length, 3);
  assert.equal(r.dossier?.meta.reads?.length, 3);
  assert.equal(r.dossier?.meta.stats?.expandedSeen, true);
  assert.equal(r.dossier?.meta.stats?.postExpandAddedSentences, 2);
  assert.ok(r.trace?.some((l) => l.includes('(1 new address)')));
  assert.ok(r.trace?.some((l) => l.includes('last look as the template ended')));
  assert.ok(r.trace?.at(-1)?.includes('end: the template ended'));
  // The watch in the capture schema's terms.
  const t = r.telemetry!;
  assert.equal(t.stop_reason, 'template_finished');
  assert.equal(t.resolved_via_warmup_tab, true);
  assert.equal(t.warmup_tab_listed_url, warm.url);
  assert.ok(t.reads_missed >= 1, 'the missed looks are counted, and did not end the watch');
  assert.ok(t.reads_succeeded >= 2);
  assert.ok(t.first_read_ms !== null && t.last_valid_read_ms !== null && t.last_valid_read_ms >= t.first_read_ms);
});

test('aio watch: the overview is read again the moment the template copies it, even if it looks unchanged', async () => {
  const chrome = await endpoint('com.android.chrome');
  const warm = page('metronome', 'tab1');
  chrome.targets = [warm];
  const p = phone(chrome);
  const results = 'https://www.google.com/search?q=car+accident+lawyer+tulsa&oq=x';
  const loaded = Date.now();
  let typed = false;
  let over = false;
  let sourceReads = 0;
  p.deps.evaluate = async (_port, _id, expression) => {
    if (expression === 'location.href') return typed && !over ? results : warm.url;
    if (expression === AIO_PROBE_JS) return JSON.stringify({ t: loaded, b: 11, s: 31, c: 855, aio: true });
    if (expression === AIO_SOURCES_JS) {
      sourceReads++;
      return JSON.stringify({ meta: { query: 'car accident lawyer tulsa', timestamp: 't', url: results, totalClaimClusters: 1 }, clusters: [{ clusterIndex: 1, uuid: 'a', claimText: 'Firms near you.', visibleCitation: { label: 'x', url: null }, candidatePool: [] }] });
    }
    return null;
  };
  at(200, () => p.add('.rec'));
  at(300, () => (typed = true));
  at(2000, () => p.add('_aio_copy.txt'));
  at(4200, () => {
    p.add('.done');
    over = true;
  });
  const r = await watchAioSources({ phone: { imageId: 'x', adbAddr: null }, keyword: 'car accident lawyer tulsa', run: RUN, done: () => over, until: Date.now() + 20000, deps: p.deps });
  chrome.server.close();
  assert.equal(sourceReads, 2, 'read once, and again at the copy (the page looked the same)');
  assert.ok(r.trace?.some((l) => l.includes('(at the copy)')));
  assert.equal(r.telemetry?.stop_reason, 'template_finished');
});

test('aio watch: a read of a page the tab moved on to is not merged', async () => {
  const chrome = await endpoint('com.android.chrome');
  const warm = page('stopwatch', 'tab1');
  chrome.targets = [warm];
  const p = phone(chrome);
  const results = 'https://www.google.com/search?q=sell+my+house+fast&oq=x';
  let typed = false;
  let over = false;
  p.deps.evaluate = async (_port, _id, expression) => {
    if (expression === 'location.href') return typed ? results : warm.url;
    if (expression === AIO_PROBE_JS) return JSON.stringify({ t: Date.now(), b: 6, s: 27, c: 103, aio: true });
    // The page answers with another search's overview (the tab moved on between the look and the read).
    if (expression === AIO_SOURCES_JS) return JSON.stringify({ meta: { query: 'stopwatch', timestamp: 't', url: 'https://www.google.com/search?q=stopwatch', totalClaimClusters: 1 }, clusters: [{ clusterIndex: 1, uuid: 'a', claimText: 'x', visibleCitation: { label: 'x', url: null }, candidatePool: [] }] });
    return null;
  };
  at(200, () => p.add('.rec'));
  at(300, () => (typed = true));
  at(1500, () => {
    p.add('.done');
    over = true;
  });
  const r = await watchAioSources({ phone: { imageId: 'x', adbAddr: null }, keyword: 'sell my house fast', run: RUN, done: () => over, until: Date.now() + 20000, deps: p.deps });
  chrome.server.close();
  assert.equal(r.dossier, undefined);
  assert.ok(r.trace?.some((l) => l.includes('read: another page')));
});
