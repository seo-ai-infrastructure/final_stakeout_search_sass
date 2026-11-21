import { AIO_PROBE_JS, AIO_SOURCES_JS, isResultsPage, type AioDossier } from '@stakeout/core/aioSources';
import { adbForward, adbForwardRemove, shell } from './deviceShell';

/**
 * Reads the AI Overview's sources from the results page in the phone's Chrome while the search
 * template runs. Chrome's DevTools socket is forwarded over the phone's ADB link; the page list is
 * plain HTTP and attaches to nothing; a page is only evaluated (one short DevTools session per
 * look) once it is this search's results page, loaded after the watch began. Reading stops when the
 * results page has been read and the template moves on (the full list of businesses), or when the
 * template ends. Never throws: whatever happens, the point carries on as before.
 */

type Phone = { imageId: string; adbAddr: string | null };
type Target = { id: string; type: string; url: string };

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

/** What the watch needs from the outside, replaceable in tests (default: the phone over ADB). */
export type WatchDeps = {
  /** A local port that reaches the named DevTools socket. */
  forward: (remote: string) => Promise<number>;
  unforward: (port: number) => Promise<void>;
  /** The phone's clock, in seconds. */
  phoneSeconds: () => Promise<number>;
  /** What the phone shows when Chrome's DevTools cannot be reached. */
  diag: () => Promise<string>;
};

export async function watchAioSources(opts: { phone: Phone; keyword: string; done: () => boolean; until: number; deps?: Partial<WatchDeps> }): Promise<AioWatchResult> {
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
    ...opts.deps,
  };
  const out: AioWatchResult = { status: 'no_results_page', probes: 0, reads: 0, loads: 0, seen: [], trace: [] };
  // A short step-by-step account of the watch (seconds from its start), for working out a miss.
  // The same step again is counted on its line ("x3") rather than written again.
  const t0 = Date.now();
  let lastStep = '';
  let repeats = 1;
  const step = (s: string) => {
    const at = ((Date.now() - t0) / 1000).toFixed(1);
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
  // The phone's own clock: only pages loaded after now are this point's (the same phone ran the
  // same keyword at another grid point a few minutes ago, and that tab may still be open).
  const phoneNow = await deps.phoneSeconds().catch(() => NaN);
  const since = Number.isFinite(phoneNow) && phoneNow > 0 ? phoneNow * 1000 - 3000 : Date.now() - 3000;
  let port = 0;
  let remote = 'chrome_devtools_remote';
  try {
    port = await deps.forward(remote);
  } catch (e) {
    return { ...out, status: 'error', note: (e as Error).message.slice(0, 120) };
  }
  let listFailures = 0;
  let reached = false;
  // The newest results-page load that had an AI Overview, and what the page looked like when read
  // (source buttons, source blocks, hidden entries): any change there is read again.
  let doc = 0;
  let docShape = '';
  let lastLoad = 0;
  let ended = 'the template ended';
  try {
    while (!done() && Date.now() < until) {
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
      const serp = pages.find((t) => isResultsPage(t.url, keyword));
      if (!serp) step(tabs);
      if (!serp) {
        // The results page was read and is gone (the template opened the full list): done.
        if (out.dossier) {
          ended = 'the results page was read and is gone';
          break;
        }
        await pause(1000);
        continue;
      }
      // While this search's results page is open it is looked at every half second (a look takes a
      // few milliseconds), so the last read is never more than about half a second old when the
      // template moves on.
      out.probes++;
      const probe = await evaluate(port, serp.id, AIO_PROBE_JS, 1500);
      let p: { t?: number; b?: number; s?: number; c?: number; aio?: boolean } | null = null;
      try {
        p = probe ? JSON.parse(probe) : null;
      } catch {
        p = null;
      }
      const loadedAt = Number(p?.t ?? 0);
      step(tabs + ' · ' + (p ? `look ${p.b ?? 0} buttons/${p.s ?? 0} blocks/${p.c ?? 0} entries${p.aio ? ' overview' : ''}${loadedAt >= since ? '' : ' (older page)'}` : 'look: no answer'));
      if (p && loadedAt >= since) {
        if (loadedAt !== lastLoad) {
          lastLoad = loadedAt;
          out.loads++;
        }
        const shape = `${p.b ?? 0}/${p.s ?? 0}/${p.c ?? 0}`;
        // Read a load once it shows an AI Overview, and again whenever its sources change (more
        // buttons after "Show more", more hidden entries as the page fills in).
        if ((p.aio || Number(p.b ?? 0) > 0) && (loadedAt !== doc || shape !== docShape) && out.reads < 12) {
          const raw = await evaluate(port, serp.id, AIO_SOURCES_JS, 8000);
          out.reads++;
          if (raw) {
            try {
              out.dossier = JSON.parse(raw) as AioDossier;
              doc = loadedAt;
              docShape = shape;
              step('read ' + out.dossier.clusters.length + ' sentences, ' + Math.round(raw.length / 1024) + ' KB');
            } catch {
              out.note = 'unreadable page answer';
              step('read: unreadable');
            }
          } else step('read: no answer');
        }
      }
      await pause(500);
    }
    if (Date.now() >= until) ended = 'out of time';
    step('end: ' + ended);
    if (out.dossier) out.status = out.dossier.clusters.length ? 'captured' : 'no_sources';
    else if (!reached) out.status = 'no_devtools';
    else if (out.loads > 0) out.status = 'no_sources';
    return out;
  } catch (e) {
    step('end: ' + (e as Error).message.slice(0, 100));
    return { ...out, status: 'error', note: (e as Error).message.slice(0, 120) };
  } finally {
    await deps.unforward(port);
  }
}
