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
  /** The DevTools sockets the phone has, when Chrome's could not be reached. */
  sockets?: string;
  note?: string;
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

export async function watchAioSources(opts: { phone: Phone; keyword: string; done: () => boolean; until: number }): Promise<AioWatchResult> {
  const { phone, keyword, done, until } = opts;
  const out: AioWatchResult = { status: 'no_results_page', probes: 0, reads: 0, loads: 0, seen: [] };
  // The phone's own clock: only pages loaded after now are this point's (the same phone ran the
  // same keyword at another grid point a few minutes ago, and that tab may still be open).
  const phoneNow = Number((await shell(phone, 'date +%s', 8000).catch(() => '')).trim());
  const since = Number.isFinite(phoneNow) && phoneNow > 0 ? phoneNow * 1000 - 3000 : Date.now() - 3000;
  let port = 0;
  try {
    port = await adbForward(phone, 'localabstract:chrome_devtools_remote');
  } catch (e) {
    return { ...out, status: 'error', note: (e as Error).message.slice(0, 120) };
  }
  let listFailures = 0;
  // The newest results-page load that had an AI Overview, and the most source buttons read from it.
  let doc = 0;
  let docButtons = -1;
  let lastLoad = 0;
  try {
    while (!done() && Date.now() < until) {
      let targets: Target[];
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) });
        targets = (await res.json()) as Target[];
        listFailures = 0;
      } catch {
        if (++listFailures >= 5) {
          out.status = 'no_devtools';
          break;
        }
        await pause(1500);
        continue;
      }
      for (const t of targets) {
        const s = shortUrl(t.url);
        if (t.type === 'page' && out.seen.length < 12 && !out.seen.includes(s)) out.seen.push(s);
      }
      const serp = targets.find((t) => t.type === 'page' && isResultsPage(t.url, keyword));
      if (!serp) {
        // The results page was read and is gone (the template opened the full list): done.
        if (out.dossier) break;
        await pause(1500);
        continue;
      }
      out.probes++;
      const probe = await evaluate(port, serp.id, AIO_PROBE_JS, 3000);
      let p: { t?: number; b?: number; aio?: boolean } | null = null;
      try {
        p = probe ? JSON.parse(probe) : null;
      } catch {
        p = null;
      }
      const loadedAt = Number(p?.t ?? 0);
      if (p && loadedAt >= since) {
        if (loadedAt !== lastLoad) {
          lastLoad = loadedAt;
          out.loads++;
        }
        const buttons = Number(p.b ?? 0);
        // Read a load once it shows an AI Overview, and again if more source buttons appear in it.
        const newer = loadedAt !== doc;
        if ((p.aio || buttons > 0) && (newer || buttons > docButtons)) {
          const raw = await evaluate(port, serp.id, AIO_SOURCES_JS, 8000);
          out.reads++;
          if (raw) {
            try {
              out.dossier = JSON.parse(raw) as AioDossier;
              doc = loadedAt;
              docButtons = out.dossier.meta.markers?.buttons ?? buttons;
            } catch {
              out.note = 'unreadable page answer';
            }
          }
          if (out.reads >= 6) break;
        }
      }
      await pause(1500);
    }
    if (out.dossier) out.status = out.dossier.clusters.length ? 'captured' : 'no_sources';
    else if (out.status === 'no_results_page' && out.loads > 0) out.status = 'no_sources';
    if (out.status === 'no_devtools') {
      out.sockets = (
        await shell(phone, "grep -o '@[A-Za-z0-9_.]*devtools_remote[A-Za-z0-9_]*' /proc/net/unix 2>/dev/null | sort -u | head -5", 8000).catch(() => '')
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
    }
    return out;
  } catch (e) {
    return { ...out, status: 'error', note: (e as Error).message.slice(0, 120) };
  } finally {
    await adbForwardRemove(phone, port);
  }
}
