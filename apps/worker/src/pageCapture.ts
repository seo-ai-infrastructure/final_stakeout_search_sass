/**
 * Saves Chrome's results page while the template runs, at moments the template asks for: "pre"
 * (the results page as it loaded, before the AI Overview is expanded) and "post" (the AI Overview
 * fully shown, only on a page that has one). The worker only reads
 * the page, over Chrome's DevTools socket through the phone's ADB connection: every tap and scroll
 * stays in the template, nothing runs inside Google's page, and none of it uses the proxy.
 *
 * The handshake, all in /sdcard/stakeout/<pin_id>.*:
 *   snapon          kept fresh by the worker while it watches; without it the template does not wait.
 *   snapreq_<label> written by the template: "<pin_id>:<label>:<nonce>".
 *   snapack_<label> written back by the worker with the same text, as soon as the page is read
 *                   (before anything is uploaded). The template waits for exactly its own text, for
 *                   a few seconds at most, then carries on whatever happened: it fails open.
 */
import { gzipSync } from 'node:zlib';
import { put } from '@stakeout/core/r2';
import { shellQuote } from '@stakeout/core/runner';
import { htmlToReplayHtml, mhtmlToReplayHtml, readMhtml } from '@stakeout/core/mhtml';
import { forwardDevtools, shell, unforwardDevtools, type ShellTarget } from './deviceShell';

export const SNAP_LABELS = ['pre', 'post'] as const;
export type SnapLabel = (typeof SNAP_LABELS)[number];
/**
 * What one capture left: the keys of the page to show, its HTML and its full snapshot. `late`: the
 * read outlasted the template's wait, so the template may have moved on while it ran and the page
 * may not be the moment it asked for (kept, but not shown as that moment).
 */
export type PageSnap = {
  at: string;
  ms: number;
  url: string;
  replay: string | null;
  html: string | null;
  mhtml: string | null;
  bytes: number;
  /** Sizes read from Chrome, and the time (ms from the start of the read) each step ended at. */
  mhtmlBytes?: number;
  htmlBytes?: number;
  steps?: Record<string, number>;
  tries?: number;
  late?: boolean;
  error?: string;
};

/**
 * How long the template waits for its answer, from its request: "<pin>:<label>:<seconds>:<n>"
 * (template 3.47+), or 10 s for the older "<pin>:<label>:<n>". A read that ends less than a second
 * before that may have missed its moment.
 */
export function templateWaitMs(nonce: string): number {
  const f = nonce.split(':');
  const s = f.length >= 4 ? Number(f[2]) : NaN;
  return (Number.isFinite(s) && s >= 5 && s <= 120 ? s : 10) * 1000;
}

const DIR = '/sdcard/stakeout';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** An error as one line, with its cause when it has one ("fetch failed (ECONNREFUSED)"). */
const errText = (e: unknown) => {
  const x = e as { message?: unknown; cause?: { code?: unknown; message?: unknown } } | null;
  const cause = x?.cause ? String(x.cause.code ?? x.cause.message ?? '') : '';
  return ((e instanceof Error ? e.message : String(e)) + (cause ? ' (' + cause + ')' : '')).replace(/\s+/g, ' ').slice(0, 200);
};

/** CDP calls over one socket, matched by id; events and other replies are ignored. */
function cdpCaller(ws: WebSocket) {
  let next = 0;
  const waiting = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  ws.addEventListener('message', (ev) => {
    let msg: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    const w = msg.id ? waiting.get(msg.id) : undefined;
    if (!w) return;
    waiting.delete(msg.id!);
    clearTimeout(w.timer);
    if (msg.error) w.reject(new Error('CDP ' + (msg.error.message ?? 'error')));
    else w.resolve(msg.result);
  });
  ws.addEventListener('close', (ev) => {
    const why = 'CDP socket closed (' + ev.code + (ev.reason ? ' ' + ev.reason : '') + ')';
    for (const [id, w] of waiting) {
      clearTimeout(w.timer);
      w.reject(new Error(why));
      waiting.delete(id);
    }
  });
  return (method: string, params: Record<string, unknown> = {}, timeoutMs = 15000) =>
    new Promise<any>((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error('CDP ' + method + ' timed out'));
      }, timeoutMs);
      waiting.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
}

/**
 * The page Chrome shows now: its HTML (DOM.getOuterHTML) and a full snapshot with its styles and
 * images (Page.captureSnapshot, MHTML). Read-only: no script is run in the page.
 */
export async function readChromePage(d: ShellTarget): Promise<{ url: string; html: string; mhtml: string | null; steps: Record<string, number> }> {
  // Each failure says the step it happened at: "forward", "list", "connect" or the DevTools call.
  let step = 'forward';
  const t0 = Date.now(),
    steps: Record<string, number> = {};
  const mark = (k: string) => (steps[k] = Date.now() - t0);
  const port = await forwardDevtools(d).catch((e) => {
    throw new Error(step + ': ' + errText(e));
  });
  mark('forward');
  let ws: WebSocket | null = null;
  try {
    step = 'list';
    const tabs = (await (await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(5000) })).json()) as {
      type?: string;
      url?: string;
      webSocketDebuggerUrl?: string;
    }[];
    const pages = tabs.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    const tab = pages.find((t) => /^https:\/\/www\.google\.[a-z.]+\/search\?/.test(t.url ?? '')) ?? pages[0];
    if (!tab) throw new Error('no open page in Chrome');
    mark('list');
    step = 'connect';
    const socket = new WebSocket(tab.webSocketDebuggerUrl!);
    ws = socket;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timed out')), 5000);
      socket.addEventListener('open', () => (clearTimeout(t), resolve()), { once: true });
      socket.addEventListener('error', (ev) => (clearTimeout(t), reject(new Error('failed' + ((ev as { message?: string }).message ? ': ' + (ev as { message?: string }).message : '')))), { once: true });
      socket.addEventListener('close', (ev) => (clearTimeout(t), reject(new Error('closed (' + ev.code + ')'))), { once: true });
    });
    const call = cdpCaller(socket);
    mark('connect');
    // One read: the snapshot holds the page's HTML too, so the HTML is read on its own only when
    // the snapshot fails (every byte comes over the phone's ADB link while the template waits).
    step = 'Page.captureSnapshot';
    const mhtml = await call('Page.captureSnapshot', { format: 'mhtml' }, 30000).then(
      (r) => (typeof r?.data === 'string' && r.data ? r.data : null),
      (e) => (console.warn('[pages] snapshot not taken, reading the HTML alone:', errText(e)), null),
    );
    mark('snapshot');
    const inSnapshot = mhtml ? readMhtml(mhtml).find((p) => p.type === 'text/html')?.body.toString('utf8') : undefined;
    if (inSnapshot) return { url: tab.url ?? '', html: inSnapshot, mhtml, steps };
    step = 'DOM.getDocument';
    const doc = await call('DOM.getDocument', { depth: 1 });
    const root = ((doc?.root?.children ?? []) as { nodeName?: string; nodeId: number }[]).find((c) => c.nodeName === 'HTML') ?? doc.root;
    step = 'DOM.getOuterHTML';
    const { outerHTML } = await call('DOM.getOuterHTML', { nodeId: root.nodeId });
    mark('html');
    return { url: tab.url ?? '', html: '<!DOCTYPE html>' + String(outerHTML ?? ''), mhtml, steps };
  } catch (e) {
    throw new Error(step + ': ' + errText(e));
  } finally {
    // The socket first: an older Chrome can keep the page locked if the socket drops uncleanly.
    try {
      ws?.close();
    } catch {
      /* already closed */
    }
    await unforwardDevtools(d, port).catch(() => {});
  }
}

/**
 * Starts watching one point's template run for snapshot requests. `stop()` ends the watch once
 * the template has finished and returns what was saved (uploads finished or given up).
 */
export function watchPageSnapshots(
  o: { d: ShellTarget; tag: string; prefix: string },
  // Replaceable for a dry run off the phone.
  io: { shell: typeof shell; read: typeof readChromePage; put: typeof put } = { shell, read: readChromePage, put },
) {
  let stopped = false,
    closed = false,
    capturing = false;
  const snaps: Partial<Record<SnapLabel, PageSnap>> = {};
  const uploads: Promise<void>[] = [];
  const F = DIR + '/' + o.tag;
  // One wait on the phone per call (about 10 s, well inside the call's 30 s limit even on a slow
  // phone: a call that overruns makes the ADB helper reconnect the phone). Keeps "snapon" in place
  // (the template's first step clears this point's files) and returns the first new request.
  const waitScript =
    `F=${F}; i=0; while [ $i -lt 50 ]; do touch "$F.snapon"; ` +
    `for k in ${SNAP_LABELS.join(' ')}; do if [ -f "$F.snapreq_$k" ] && [ ! -f "$F.snapseen_$k" ]; then touch "$F.snapseen_$k"; echo "REQ $k $(head -c 200 "$F.snapreq_$k")"; exit 0; fi; done; ` +
    `[ -f "$F.done" ] && { echo DONE; exit 0; }; i=$((i+1)); sleep 0.2; done; echo NONE`;
  const loop = (async () => {
    while (!stopped) {
      const out = (await io.shell(o.d, waitScript, 30000).catch((e) => 'ERR ' + errText(e))).trim();
      if (stopped || /^DONE/.test(out)) break;
      const m = /^REQ (\w+) (\S+)/.exec(out);
      if (!m) {
        if (/^ERR/.test(out)) await sleep(1000);
        continue;
      }
      const label = m[1] as SnapLabel, nonce = m[2];
      const waitMs = templateWaitMs(nonce),
        lateMs = waitMs - 1000;
      const t0 = Date.now();
      let page: Awaited<ReturnType<typeof readChromePage>> | null = null,
        error = '';
      capturing = true;
      // One more try when the first fails fast, within the first half of the template's wait.
      let tries = 0;
      for (;;) {
        tries++;
        try {
          page = await io.read(o.d);
          error = '';
          break;
        } catch (e) {
          error = errText(e);
          if (tries >= 2 || Date.now() - t0 > waitMs / 2) break;
          await sleep(400);
        }
      }
      // The template goes on as soon as it reads its own text back: before anything is uploaded.
      await io.shell(o.d, `echo ${shellQuote(nonce)} > ${shellQuote(F + '.snapack_' + label)}`, 15000).catch(() => {});
      capturing = false;
      const ms = Date.now() - t0;
      // Read too late: the point was already settled without it.
      if (closed) break;
      if (!page) {
        snaps[label] = { at: new Date(t0).toISOString(), ms, url: '', replay: null, html: null, mhtml: null, bytes: 0, tries, ...(ms > lateMs ? { late: true } : {}), error };
        console.warn('[pages]', o.tag, label, 'not saved:', error);
        continue;
      }
      const p = page;
      uploads.push(
        (async () => {
          const key = (name: string) => o.prefix + '/page_' + label + name;
          const snap: PageSnap = {
            at: new Date(t0).toISOString(),
            ms,
            url: p.url,
            replay: null,
            html: null,
            mhtml: null,
            bytes: 0,
            mhtmlBytes: p.mhtml ? p.mhtml.length : 0,
            htmlBytes: p.html.length,
            steps: p.steps,
            tries,
            ...(ms > lateMs ? { late: true } : {}),
          };
          try {
            let shown: string;
            try {
              shown = (p.mhtml && mhtmlToReplayHtml(p.mhtml)) || htmlToReplayHtml(p.html, p.url);
            } catch (e) {
              // A snapshot that cannot be unpacked: the page's own HTML, its images left at their addresses.
              console.warn('[pages]', o.tag, label, 'snapshot not unpacked:', errText(e));
              shown = htmlToReplayHtml(p.html, p.url);
            }
            snap.bytes = Buffer.byteLength(shown);
            await io.put(key('.html'), shown, 'text/html; charset=utf-8');
            snap.replay = key('.html');
            await io.put(key('.dom.html.gz'), gzipSync(p.html), 'application/gzip');
            snap.html = key('.dom.html.gz');
            if (p.mhtml) {
              await io.put(key('.mhtml.gz'), gzipSync(p.mhtml), 'application/gzip');
              snap.mhtml = key('.mhtml.gz');
            }
          } catch (e) {
            snap.error = 'upload: ' + errText(e);
          }
          snaps[label] = snap;
        })().catch(() => {}),
      );
    }
  })().catch((e) => console.warn('[pages]', o.tag, 'watch ended:', errText(e)));
  return {
    async stop(): Promise<Partial<Record<SnapLabel, PageSnap>>> {
      stopped = true;
      // A wait still running on the phone ends by itself. A page still being read is waited for
      // (its own time limits end it), so it is kept and never overlaps the phone's next point.
      await Promise.race([loop, sleep(capturing ? 60000 : 1500)]);
      await Promise.race([Promise.allSettled(uploads), sleep(60000)]);
      closed = true;
      return { ...snaps };
    },
  };
}
