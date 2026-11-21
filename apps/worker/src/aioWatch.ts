import { AIO_PROBE_JS, AIO_SOURCES_JS, isResultsPage, mergeReads, type AioDossier } from '@stakeout/core/aioSources';
import type { WatcherFacts } from '@stakeout/core/aioCapture';
import { shellQuote } from '@stakeout/core/runner';
import { adbForward, adbForwardRemove, shell } from './deviceShell';

/**
 * Reads the AI Overview's sources from the results page in the phone's Chrome while the search
 * template runs. Chrome's DevTools socket is forwarded over the phone's ADB link; the page list is
 * plain HTTP and attaches to nothing; a page is only evaluated (one short DevTools session per
 * look) once it is this search's results page, loaded after the watch began. The watch goes on until
 * the template ends (a look that misses while the page scrolls or expands changes nothing), reading
 * again whenever the overview changes; the reads are merged (mergeReads: the fullest kept, every
 * address any read found added, each marked with when it was first seen). Never throws: whatever
 * happens, the point carries on as before.
 *
 * With the template's own marker files (`run`, templates that mark the keyword: v3.9+), nothing on
 * Chrome is looked at during the template's warm-up searches. One wait on the phone at a time holds
 * until the template marks that it is typing the keyword (<run>.rec); only then is Chrome's socket
 * forwarded and its page list followed. The phone is snapshotted three times: as the keyword is
 * typed, when this search's results page leaves Chrome's page list, and when the template copies
 * the overview (<run>_aio_copy.txt). A snapshot holds the app in front, every DevTools socket on
 * the phone, and everything each socket lists. A socket other than Chrome's that lists this
 * search's results page is followed: the page is looked at and read there.
 *
 * Chrome on the phones keeps listing the tab under the address it had before the keyword (the
 * results page, preloaded while the keyword is typed, takes the tab over without the list catching
 * up: seen on every point on 2026-11-21). So after the keyword each listed tab is also asked where
 * it really is (location.href), and a tab that is this search's results page is looked at and
 * read through, whatever address it is listed under.
 */

type Phone = { imageId: string; adbAddr: string | null };
type Target = { id: string; type: string; url: string; title?: string };

/** The phone at one moment of the search. */
export type PhoneSnapshot = {
  /** Seconds from the watch's start. */
  at: number;
  /** typing: the template marked the keyword; gone: this search's results page left Chrome's page list; copied: the template copied the overview. */
  why: 'typing' | 'gone' | 'copied';
  /** The focused window, the resumed activity, and the Chrome and Google app processes, as the phone reports them. */
  front: string[];
  /** DevTools sockets on the phone (Chrome's own, WebViews'), by name. */
  sockets: string[];
  /** Everything each socket lists (every kind of target), with the app and browser behind it; a page also with the address it reports itself (`real`), which can differ from the one listed. */
  lists: { socket: string; app: string | null; browser: string | null; targets: { type: string; url: string; title: string; real?: string }[]; error?: string }[];
};

export type AioWatchResult = {
  status: 'captured' | 'no_sources' | 'no_results_page' | 'no_devtools' | 'error';
  dossier?: AioDossier;
  /** Looks at the page, full reads, and different results-page loads seen. */
  probes: number;
  reads: number;
  loads: number;
  /** Pages Chrome had open (host, path and parameter names only). */
  seen: string[];
  /** Page-list calls that got no answer. */
  failures?: number;
  /** What the phone showed while Chrome's DevTools could not be reached: Chrome's process, ADB debugging, DevTools sockets. */
  sockets?: string;
  note?: string;
  /** Step by step, in seconds from the watch's start: page lists, looks, reads, and why it ended. */
  trace?: string[];
  /** The phone as the keyword was typed, when the results page left Chrome's list, and when the overview was copied. */
  snapshots?: PhoneSnapshot[];
  /** The watch in the capture schema's terms (v279): looks that found the overview and ones that missed, first read and last good look (ms into the watch), whether the page was read through a tab listed under its warm-up address, and why the watch stopped. */
  telemetry?: WatcherFacts;
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const shortUrl = (u: string) => {
  try {
    const x = new URL(u);
    return x.hostname + x.pathname + (x.search ? '?' + [...new Set(x.searchParams.keys())].join('&') : '');
  } catch {
    return u.slice(0, 80);
  }
};

/** One Runtime.evaluate in a short DevTools session: the page's string answer, or null. */
export function evaluate(port: number, targetId: string, expression: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let ws: WebSocket | null = null;
    const finish = (v: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${encodeURIComponent(targetId)}`);
    } catch {
      finish(null);
      return;
    }
    ws.addEventListener('open', () => ws?.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })));
    ws.addEventListener('message', (m) => {
      try {
        const msg = JSON.parse(String(m.data)) as { id?: number; result?: { result?: { value?: unknown } } };
        if (msg.id === 1) finish(typeof msg.result?.result?.value === 'string' ? msg.result.result.value : null);
      } catch {
        finish(null);
      }
    });
    ws.addEventListener('error', () => finish(null));
    ws.addEventListener('close', () => finish(null));
  });
}

/** Everything one DevTools endpoint lists (every kind of target), and the app and browser behind it. */
async function listAll(port: number): Promise<{ targets: Target[]; app: string | null; browser: string | null }> {
  const get = async (path: string) => (await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(2500) })).json() as Promise<unknown>;
  const [list, version] = await Promise.all([get('/json/list'), get('/json/version').catch(() => null)]);
  const v = (version ?? {}) as Record<string, unknown>;
  return {
    targets: Array.isArray(list) ? (list as Target[]) : [],
    app: typeof v['Android-Package'] === 'string' ? v['Android-Package'] : null,
    browser: typeof v.Browser === 'string' ? v.Browser : null,
  };
}

/** What the watch needs from the outside, replaceable in tests (default: the phone over ADB). */
export type WatchDeps = {
  /** A local port that reaches the named DevTools socket. */
  forward: (remote: string) => Promise<number>;
  unforward: (port: number) => Promise<void>;
  /** The phone's clock, in seconds. */
  phoneSeconds: () => Promise<number>;
  /** What the phone shows when Chrome's DevTools cannot be reached. */
  diag: () => Promise<string>;
  /** Holds on the phone (one shell; nothing is asked from here meanwhile) until one of the files exists: the one found, or null after about `ms`. */
  waitForFile: (paths: string[], ms: number) => Promise<string | null>;
  /** The focused window, the resumed activity, the Chrome and Google app processes, and the DevTools sockets ("sockets ..." line). */
  front: () => Promise<string>;
  /** One Runtime.evaluate on a page: its string answer, or null. */
  evaluate: (port: number, targetId: string, expression: string, timeoutMs: number) => Promise<string | null>;
};

export async function watchAioSources(opts: {
  phone: Phone;
  keyword: string;
  done: () => boolean;
  until: number;
  /** The template's name for this point's files on the phone (/sdcard/stakeout/<run>.rec ...), when it marks the keyword. */
  run?: string;
  deps?: Partial<WatchDeps>;
}): Promise<AioWatchResult> {
  const { phone, keyword, done, until } = opts;
  const deps: WatchDeps = {
    forward: (remote) => adbForward(phone, 'localabstract:' + remote),
    unforward: (port) => adbForwardRemove(phone, port),
    phoneSeconds: async () => Number((await shell(phone, 'date +%s', 8000)).trim()),
    diag: () =>
      shell(
        phone,
        "echo chrome=$(pidof com.android.chrome) adb=$(settings get global adb_enabled) sockets=$(grep -o '@[A-Za-z0-9_.]*devtools_remote[A-Za-z0-9_]*' /proc/net/unix 2>/dev/null | sort -u | head -5 | tr '\\n' ',')",
        8000,
      ),
    // The phone checks for the files every 0.3 s on its own and always answers before the ADB call
    // times out (a timed-out call would be taken for a dropped link and reconnected).
    waitForFile: async (paths, ms) => {
      const rounds = Math.max(1, Math.ceil(ms / 300));
      const out = await shell(
        phone,
        `i=0; while [ $i -lt ${rounds} ]; do for f in ${paths.map(shellQuote).join(' ')}; do [ -e "$f" ] && { echo "found=$f"; exit 0; }; done; sleep 0.3; i=$((i+1)); done; echo found=`,
        ms + 10000,
      );
      const hit = (/found=(.*)/.exec(out)?.[1] ?? '').trim();
      return paths.includes(hit) ? hit : null;
    },
    front: () =>
      shell(
        phone,
        [
          "dumpsys window 2>/dev/null | grep -E 'mCurrentFocus|mFocusedApp' | head -2",
          "dumpsys activity activities 2>/dev/null | grep -E 'ResumedActivity' | head -2",
          'echo pids chrome=$(pidof com.android.chrome) google=$(pidof com.google.android.googlequicksearchbox)',
          "echo sockets $(grep -o '@[^ ]*devtools_remote[^ ]*' /proc/net/unix 2>/dev/null | sort -u | head -6 | tr '\\n' ' ')",
        ].join('; '),
        20000,
      ),
    evaluate,
    ...opts.deps,
  };
  const out: AioWatchResult = { status: 'no_results_page', probes: 0, reads: 0, loads: 0, seen: [], trace: [] };
  // A short step-by-step account of the watch (seconds from its start), for working out a miss.
  // The same step again is counted on its line ("x3") rather than written again.
  const t0 = Date.now();
  const secs = () => Math.round((Date.now() - t0) / 100) / 10;
  let lastStep = '';
  let repeats = 1;
  const step = (s: string) => {
    const at = secs().toFixed(1);
    const trace = out.trace!;
    if (s === lastStep && trace.length) {
      repeats++;
      trace[trace.length - 1] = trace[trace.length - 1].replace(/ x\d+$/, '') + ' x' + repeats;
      return;
    }
    lastStep = s;
    repeats = 1;
    if (trace.length < 90) trace.push(at + ' ' + s.slice(0, 240));
  };
  const msNow = () => Date.now() - t0;
  const tele: WatcherFacts = {
    capture_version: 'v279',
    resolved_via_warmup_tab: false,
    warmup_tab_listed_url: null,
    reads_succeeded: 0,
    reads_missed: 0,
    first_read_ms: null,
    last_valid_read_ms: null,
    stop_reason: 'template_finished',
  };
  out.telemetry = tele;
  // The phone's own clock: only pages loaded after now are this point's (the same phone ran the
  // same keyword at another grid point a few minutes ago, and that tab may still be open).
  const phoneNow = await deps.phoneSeconds().catch(() => NaN);
  const since = Number.isFinite(phoneNow) && phoneNow > 0 ? phoneNow * 1000 - 3000 : Date.now() - 3000;
  const files = opts.run
    ? { typing: `/sdcard/stakeout/${opts.run}.rec`, copied: `/sdcard/stakeout/${opts.run}_aio_copy.txt`, done: `/sdcard/stakeout/${opts.run}.done` }
    : null;

  // The warm-up searches: Chrome is left alone. One wait on the phone at a time (up to 10 s, so
  // the end of the template is noticed) holds until the template marks the keyword.
  if (files) {
    step('waiting for the keyword marker (Chrome not looked at during the warm-up searches)');
    let hit: string | null = null;
    while (!hit && !done() && Date.now() < until) {
      hit = await deps.waitForFile([files.typing, files.done], Math.min(10000, Math.max(1000, until - Date.now()))).catch(() => null);
    }
    if (hit !== files.typing) {
      if (hit !== files.done && Date.now() >= until) tele.stop_reason = 'hard_timeout';
      step('end: ' + (hit === files.done ? 'the template ended without marking the keyword' : Date.now() >= until ? 'out of time' : 'the template ended'));
      return { ...out, note: 'no keyword marker' };
    }
    step('keyword marker: the template is typing the keyword');
  }

  let port = 0;
  let remote = 'chrome_devtools_remote';
  try {
    port = await deps.forward(remote);
  } catch (e) {
    return { ...out, status: 'error', note: (e as Error).message.slice(0, 120) };
  }

  // Snapshots run beside the page-list loop (never holding it up), at most four.
  const snapshots: PhoneSnapshot[] = [];
  out.snapshots = snapshots;
  const running: Promise<void>[] = [];
  let follow: string | null = null;
  let followed = false;
  const snap = async (why: PhoneSnapshot['why']) => {
    const s: PhoneSnapshot = { at: secs(), why, front: [], sockets: [], lists: [] };
    const text = await deps.front().catch((e) => 'front failed: ' + (e as Error).message.slice(0, 120));
    let googlePid = '';
    for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
      if (line.startsWith('sockets')) s.sockets = line.slice(7).trim().split(/\s+/).filter(Boolean).map((x) => x.replace(/^@/, '')).slice(0, 6);
      else {
        if (line.startsWith('pids')) googlePid = /google=(\d+)/.exec(line)?.[1] ?? '';
        if (s.front.length < 6) s.front.push(line.slice(0, 200));
      }
    }
    // Chrome's socket, every socket the phone lists, and (when it lists none) the Google app's WebView socket by its process.
    const here = remote;
    const herePort = port;
    const names = [...new Set([here, ...s.sockets, ...(googlePid && !s.sockets.length ? ['webview_devtools_remote_' + googlePid.split(' ')[0]] : [])])].slice(0, 4);
    for (const name of names) {
      let p = name === here ? herePort : 0;
      try {
        if (!p) p = await deps.forward(name);
        const l = await listAll(p);
        const targets: PhoneSnapshot['lists'][number]['targets'] = [];
        for (const t of l.targets.slice(0, 10)) {
          // A page is also asked where it is: Chrome can keep listing a tab under an older address.
          const real = t.type === 'page' && targets.filter((x) => x.real !== undefined).length < 3 ? await deps.evaluate(p, t.id, 'location.href', 1000) : null;
          targets.push({ type: String(t.type ?? ''), url: String(t.url ?? '').slice(0, 160), title: String(t.title ?? '').slice(0, 60), ...(real !== null ? { real: real.slice(0, 160) } : {}) });
        }
        s.lists.push({ socket: name, app: l.app, browser: l.browser, targets });
        if (name !== here && !followed && targets.some((t) => t.type === 'page' && isResultsPage(t.real ?? t.url, keyword))) follow ??= name;
      } catch (e) {
        s.lists.push({ socket: name, app: null, browser: null, targets: [], error: (String((e as Error).name || 'error') + ': ' + (e as Error).message).slice(0, 100) });
      } finally {
        if (p && name !== here) await deps.unforward(p);
      }
    }
    snapshots.push(s);
    const front = /([\w.]+\/[\w.$]+)/.exec(s.front.join(' '))?.[1] ?? 'unknown';
    // R / r / - as in the page lists; a page whose own address is not the one listed shows both ("r→R").
    const kind = (u: string) => (isResultsPage(u, keyword) ? 'R' : isResultsPage(u) ? 'r' : '-');
    const kinds = (l: PhoneSnapshot['lists'][number]) =>
      l.error ??
      (l.targets.map((t) => (t.type !== 'page' ? t.type : t.real !== undefined && t.real !== t.url ? kind(t.url) + '→' + (t.real ? kind(t.real) : '?') : kind(t.url))).join(' ') || 'nothing');
    step(`snapshot (${why}): front ${front} · sockets ${s.sockets.join(', ') || 'none listed'} · ` + s.lists.map((l) => `${l.socket}${l.app ? ' (' + l.app + ')' : ''}: ${kinds(l)}`).join(' | '));
  };
  const takeSnapshot = (why: PhoneSnapshot['why']) => {
    if (!files || running.length >= 4) return;
    running.push(snap(why).catch(() => {}));
  };
  // Waits for a promise while the template runs; once it has ended, only a short grace.
  const settle = async (p: Promise<unknown>, graceMs: number) => {
    let over = false;
    const tick = (async () => {
      while (!over && !done() && Date.now() < until) await pause(500);
      if (!over) await pause(graceMs);
    })();
    await Promise.race([p, tick]);
    over = true;
  };

  // The moment the template copies the overview, the phone is snapshotted (one wait at a time, as
  // above), and the overview is read again at the next look: it is fully expanded then.
  let forceRead = false;
  const copyWatch = files
    ? (async () => {
        while (!done() && Date.now() < until) {
          const hit = await deps.waitForFile([files.copied, files.done], Math.min(10000, Math.max(1000, until - Date.now()))).catch(() => null);
          if (hit === files.copied) {
            step('the template copied the overview');
            forceRead = true;
            takeSnapshot('copied');
            return;
          }
          if (hit === files.done) return;
        }
      })().catch(() => {})
    : null;
  takeSnapshot('typing');

  let listFailures = 0;
  let reached = false;
  // The newest results-page load that had an AI Overview, and what the page looked like when read
  // (source buttons, source blocks, hidden entries): any change there is read again.
  let doc = 0;
  let docShape = '';
  let lastLoad = 0;
  let listed = false;
  let gone = 0;
  let ended = 'the template ended';
  let lastSerp: Target | null = null;
  // One look at this search's results page, and a full read when its overview is new or has changed
  // (more buttons after "Show more", more hidden entries as it fills in) or the template has just
  // copied it. True when the look found the overview.
  const lookAndRead = async (serp: Target, tabsLine: string, readMs = 8000): Promise<boolean> => {
    out.probes++;
    const probe = await deps.evaluate(port, serp.id, AIO_PROBE_JS, 1500);
    let p: { t?: number; b?: number; s?: number; c?: number; aio?: boolean } | null = null;
    try {
      p = probe ? JSON.parse(probe) : null;
    } catch {
      p = null;
    }
    const loadedAt = Number(p?.t ?? 0);
    step(tabsLine + ' · ' + (p ? `look ${p.b ?? 0} buttons/${p.s ?? 0} blocks/${p.c ?? 0} entries${p.aio ? ' overview' : ''}${loadedAt >= since ? '' : ' (older page)'}` : 'look: no answer'));
    if (!p || loadedAt < since) return false;
    if (loadedAt !== lastLoad) {
      lastLoad = loadedAt;
      out.loads++;
    }
    if (!(p.aio || Number(p.b ?? 0) > 0)) return false;
    tele.reads_succeeded++;
    tele.last_valid_read_ms = msNow();
    const shape = `${p.b ?? 0}/${p.s ?? 0}/${p.c ?? 0}`;
    if (!(loadedAt !== doc || shape !== docShape || forceRead) || out.reads >= 16) return true;
    const atCopy = forceRead;
    forceRead = false;
    const raw = await deps.evaluate(port, serp.id, AIO_SOURCES_JS, readMs);
    out.reads++;
    if (!raw) {
      step('read: no answer');
      return true;
    }
    let read: AioDossier;
    try {
      read = JSON.parse(raw) as AioDossier;
    } catch {
      out.note = 'unreadable page answer';
      step('read: unreadable');
      return true;
    }
    // Only this search's page is merged, never a page the tab has moved on to.
    if (read.meta?.url && !isResultsPage(read.meta.url, keyword)) {
      step('read: another page (' + shortUrl(read.meta.url) + ')');
      return true;
    }
    const before = out.dossier?.pool?.entries.length ?? 0;
    // Nothing a read found is lost, and a smaller read downgrades nothing (see mergeReads).
    out.dossier = mergeReads(out.dossier, read, msNow());
    tele.first_read_ms ??= msNow();
    doc = loadedAt;
    docShape = shape;
    const added = (out.dossier.pool?.entries.length ?? 0) - before;
    step('read ' + read.clusters.length + ' sentences, ' + Math.round(raw.length / 1024) + ' KB' + (before && added > 0 ? ` (${added} new address${added === 1 ? '' : 'es'})` : '') + (atCopy ? ' (at the copy)' : ''));
    return true;
  };
  try {
    while (!done() && Date.now() < until) {
      // A snapshot found this search's results page behind another socket: look at it there.
      if (follow && !followed) {
        followed = true;
        await deps.unforward(port);
        remote = follow;
        port = await deps.forward(remote).catch(() => port);
        out.note = 'followed the results page to ' + remote;
        step('following the results page to ' + remote);
        listed = false;
      }
      let targets: Target[];
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) });
        targets = (await res.json()) as Target[];
        listFailures = 0;
        reached = true;
      } catch (e) {
        // Chrome may not be open yet (the template starts it a few seconds in): keep trying for the
        // whole search. Now and then, look at what the phone has: is Chrome running, is debugging
        // on, which DevTools sockets exist (and switch to Chrome's if it has another name).
        step('no page list' + (reached ? ' (' + String((e as Error).name || 'error') + ')' : ''));
        listFailures++;
        out.failures = (out.failures ?? 0) + 1;
        if (listFailures === 6 || listFailures % 20 === 0) {
          const diag = (await deps.diag().catch((e) => 'diag failed: ' + (e as Error).message)).replace(/\s+/g, ' ').trim().slice(0, 200);
          out.sockets = diag;
          const other = (diag.match(/@([A-Za-z0-9_.]*devtools_remote[A-Za-z0-9_]*)/g) ?? []).map((s) => s.slice(1)).find((s) => s.startsWith('chrome') && s !== remote);
          if (other) {
            await deps.unforward(port);
            remote = other;
            port = await deps.forward(remote).catch(() => port);
            out.note = 'switched to ' + remote;
          }
        }
        await pause(1000);
        continue;
      }
      const pages = targets.filter((t) => t.type === 'page');
      for (const t of pages) {
        const s = shortUrl(t.url);
        if (out.seen.length < 12 && !out.seen.includes(s)) out.seen.push(s);
      }
      // R: this search's results page; r: another search's results page (with its search text); -: anything else.
      const queryOf = (u: string) => {
        try {
          return (new URL(u).searchParams.get('q') ?? '').slice(0, 60);
        } catch {
          return '';
        }
      };
      const tabs =
        'tabs ' +
        (pages
          .map((t) => (isResultsPage(t.url, keyword) ? 'R ' : isResultsPage(t.url) ? `r "${queryOf(t.url)}" ` : '- ') + shortUrl(t.url))
          .join(' | ') || 'none');
      let serp = pages.find((t) => isResultsPage(t.url, keyword));
      let tabsLine = tabs;
      // After the keyword, Chrome can keep listing a tab under the address it had before (the
      // results page, preloaded while the keyword was typed, takes the tab over without the list
      // catching up): each listed tab is asked where it really is, and looked at and read there.
      if (!serp && files) {
        for (const t of pages.slice(0, 3)) {
          const real = await deps.evaluate(port, t.id, 'location.href', 1000);
          if (real && isResultsPage(real, keyword)) {
            serp = { ...t, url: real };
            tabsLine = tabs + ' (its own address: R)';
            out.note ??= 'read through a tab Chrome listed under its earlier address';
            tele.resolved_via_warmup_tab = true;
            tele.warmup_tab_listed_url ??= t.url.slice(0, 300);
            break;
          }
        }
      }
      if (!serp) {
        step(tabsLine);
        // This search's results page just left the page list: where did it go?
        if (listed) {
          listed = false;
          gone++;
          if (gone <= 2) takeSnapshot('gone');
        }
        // Not found this time: a look can miss while the page scrolls, expands ("Show more") or
        // re-renders, so the watch carries on until the template ends (a read is never lost: see mergeReads).
        tele.reads_missed++;
        await pause(1000);
        continue;
      }
      listed = true;
      lastSerp = serp;
      if (!(await lookAndRead(serp, tabsLine))) tele.reads_missed++;
      // Every half second until the page has been read; then every 1.5 s, which still catches the
      // overview growing ("Show more") without looking more than the template needs.
      await pause(out.dossier ? 1500 : 500);
    }
    if (Date.now() >= until) {
      ended = 'out of time';
      tele.stop_reason = 'hard_timeout';
    }
    // The template has ended: one last look while the results page may still be open, read whatever happens.
    if (done() && lastSerp) {
      const real = await deps.evaluate(port, lastSerp.id, 'location.href', 1000);
      if (real && isResultsPage(real, keyword)) {
        forceRead = true;
        await lookAndRead(lastSerp, 'last look as the template ended', 4000);
      }
    }
    // Chrome is no longer looked at; the overview's copy (and its snapshot) can still come.
    if (copyWatch) await settle(copyWatch, 1000);
    await settle(Promise.all(running), 3000);
    step('end: ' + ended);
    if (out.dossier) out.status = out.dossier.clusters.length ? 'captured' : 'no_sources';
    else if (!reached) out.status = 'no_devtools';
    else if (out.loads > 0) out.status = 'no_sources';
    return out;
  } catch (e) {
    if (!done()) tele.stop_reason = 'hard_timeout';
    step('end: ' + (e as Error).message.slice(0, 100));
    return { ...out, status: 'error', note: (e as Error).message.slice(0, 120) };
  } finally {
    await deps.unforward(port);
  }
}
