/**
 * The sources Google attaches to each sentence of an AI Overview, read from the results page in the
 * phone's Chrome (over the DevTools socket, see apps/worker/src/aioWatch.ts).
 *
 * The page script is ported from the AI Overview forensic auditor in aio-optimizer
 * (packages/shared/src/forensic: audit.ts, extract-node.ts, protobuf.ts). For every sentence with a
 * source button (button[data-icl-uuid]) it collects the source entries Google keeps in the page as
 * comments ("TgQPHd|||" + JSON) inside that sentence's [data-suuid] components: title, snippet,
 * URL, site, Knowledge Graph ID, coordinates and a related search, plus two raw fields kept as found.
 * The varint decoder masks with 0x7F (the TypeScript port had 0x7).
 *
 * What the entries are is only what the page shows: the sources Google lists for a sentence. They
 * are not Google's internal candidate pool, and nothing here says why one was shown and not another.
 */

/** Cheap look at the page: is this the results page, and are the AI Overview's source buttons in it yet. */
export const AIO_PROBE_JS = `(() => {
  const body = document.body;
  const text = body ? (body.textContent || '').slice(0, 400000) : '';
  const b = document.querySelectorAll('button[data-icl-uuid]').length;
  return JSON.stringify({
    u: location.href,
    t: Math.round(performance.timeOrigin),
    b,
    s: document.querySelectorAll('[data-suuid]').length,
    aio: b > 0 || /AI Overview/i.test(text),
  });
})()`;

/** The full read: one entry per sentence with its visible citation and the source entries behind it. */
export const AIO_SOURCES_JS = `(() => {
  const started = Date.now();
  const diagnostics = [];
  const ta = document.createElement('textarea');
  const decodeEntities = (s) => { if (!s) return ''; ta.innerHTML = s; return ta.value; };

  function decodeProtobufWire(b64in, depth) {
    if (!b64in || typeof b64in !== 'string' || depth > 4) return null;
    let b64 = b64in.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    let bin;
    try { bin = atob(b64); } catch (e) { return null; }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const out = {};
    let off = 0;
    const varint = () => {
      let r = 0n, shift = 0n;
      while (off < bytes.length) {
        const b = BigInt(bytes[off++]);
        r |= (b & 0x7Fn) << shift;
        if (!(b & 0x80n)) break;
        shift += 7n;
      }
      return Number(r);
    };
    while (off < bytes.length) {
      const key = varint();
      const field = key >> 3, wire = key & 7;
      if (wire === 0) out['field_' + field] = varint();
      else if (wire === 2) {
        const len = varint();
        const chunk = bytes.slice(off, off + len);
        off += len;
        const str = new TextDecoder().decode(chunk);
        if (/^[\\x20-\\x7E]+$/.test(str)) out['field_' + field] = str;
        else {
          let s = '';
          for (let i = 0; i < chunk.length; i++) s += String.fromCharCode(chunk[i]);
          const nested = decodeProtobufWire(btoa(s), depth + 1);
          out['field_' + field + '_nested'] = nested || Array.from(chunk).map((x) => x.toString(16).padStart(2, '0')).join('');
        }
      } else if (wire === 1) off += 8;
      else if (wire === 5) off += 4;
      else break;
    }
    return out;
  }

  function extractNodeData(arr) {
    const d = { title: null, snippet: null, url: null, domain: null, mid: null, coords: null, syntheticQuery: null };
    const walk = (n) => {
      if (!n) return;
      if (typeof n === 'string') {
        if (/^https?:\\/\\//i.test(n) && !d.url && !n.includes('gstatic')) d.url = n;
        else if (n.startsWith('/g/') && !d.mid) d.mid = n;
        return;
      }
      if (!Array.isArray(n)) return;
      if (n.length >= 4 && typeof n[0] === 'string' && typeof n[1] === 'string' && typeof n[2] === 'string' && n[2].includes('gstatic.com/faviconV2')) {
        if (!d.title) d.title = n[0];
        if (!d.snippet) d.snippet = n[1];
        if (typeof n[3] === 'string') d.domain = n[3];
      }
      if (n.length >= 4 && typeof n[0] === 'string' && n[0].startsWith('/g/') && typeof n[1] === 'number' && typeof n[2] === 'number') {
        d.mid = n[0];
        d.coords = { lng: n[1], lat: n[2] };
      }
      if (n.length >= 6 && typeof n[0] === 'string' && n[0].startsWith('/g/') && typeof n[5] === 'string' && n[5].length > 3) d.syntheticQuery = n[5];
      for (const x of n) walk(x);
    };
    walk(arr);
    return d;
  }

  const components = new Map();
  const suuidNodes = document.querySelectorAll('[data-suuid]');
  suuidNodes.forEach((el) => {
    const suuid = el.getAttribute('data-suuid');
    if (!suuid) return;
    const parts = suuid.split('|');
    const key = parts[1];
    if (!key) return;
    const cut = key.lastIndexOf('-');
    if (cut === -1) return;
    const parent = key.slice(0, cut);
    if (!components.has(parent)) components.set(parent, []);
    components.get(parent).push({ el, prefix: parts[0], suffix: key.slice(cut + 1) });
  });

  let comments = 0;
  try {
    const it = document.createNodeIterator(document.documentElement, NodeFilter.SHOW_COMMENT);
    let c;
    while ((c = it.nextNode())) if ((c.nodeValue || '').startsWith('TgQPHd|||')) comments++;
  } catch (e) { diagnostics.push('comment_scan_failed'); }

  const buttons = document.querySelectorAll('button[data-icl-uuid]');
  if (!buttons.length) diagnostics.push('no_markers_found');
  const clusters = [];
  buttons.forEach((button, idx) => {
    const uuid = button.getAttribute('data-icl-uuid');
    if (!uuid) return;
    const passage = button.closest('li, div.n6owBd, article') || (button.parentElement && button.parentElement.parentElement);
    const claimText = passage ? (passage.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 1200) : '';
    const label = button.getAttribute('aria-label') || (button.textContent || '').trim();
    const anchor = button.parentElement && button.parentElement.querySelector('a.PMDqCb, a.H23r4e, a[href]');
    const visibleUrl = anchor ? anchor.getAttribute('href') : null;
    const pool = [];
    for (const comp of components.get(uuid) || []) {
      const it = document.createNodeIterator(comp.el, NodeFilter.SHOW_COMMENT);
      let node;
      while ((node = it.nextNode())) {
        const val = node.nodeValue || '';
        if (!val.startsWith('TgQPHd|||')) continue;
        try {
          const parsed = JSON.parse(decodeEntities(val.slice(9)));
          const triplet = parsed && parsed[0] && parsed[0][1] ? parsed[0][1][13] : null;
          const token = parsed && parsed[0] && parsed[0][1] ? parsed[0][1][22] : null;
          pool.push({
            containerPrefix: comp.prefix,
            candidateIndex: comp.suffix,
            componentJsuid: comp.el.getAttribute('jsuid'),
            extracted: extractNodeData(parsed),
            observedNumericTriplet: Array.isArray(triplet)
              ? { raw: triplet, timestampMicroseconds: triplet[0], parsedUtc: typeof triplet[0] === 'number' ? new Date(triplet[0] / 1000).toISOString() : null }
              : null,
            attestationToken: { rawBase64: typeof token === 'string' ? token : null, decoded: typeof token === 'string' ? decodeProtobufWire(token, 0) : null },
          });
        } catch (e) {
          pool.push({ containerPrefix: comp.prefix, parseError: String(e && e.message || e).slice(0, 200) });
        }
      }
    }
    clusters.push({
      clusterIndex: idx + 1,
      uuid,
      claimText,
      visibleCitation: { label, url: visibleUrl, ved: button.getAttribute('data-ved'), hveid: button.getAttribute('data-hveid') },
      candidatePool: pool,
    });
  });

  let query = null;
  try { query = new URL(location.href).searchParams.get('q'); } catch (e) {}
  const text = document.body ? (document.body.textContent || '').slice(0, 400000) : '';
  return JSON.stringify({
    meta: {
      query,
      timestamp: new Date().toISOString(),
      url: location.href,
      title: document.title,
      totalClaimClusters: clusters.length,
      markers: { buttons: buttons.length, suuid: suuidNodes.length, comments },
      aioOnPage: /AI Overview/i.test(text),
      readMs: Date.now() - started,
      diagnostics,
    },
    clusters,
  });
})()`;

export type AioSourceEntry = {
  containerPrefix?: string;
  candidateIndex?: string;
  componentJsuid?: string | null;
  extracted?: {
    title: string | null;
    snippet: string | null;
    url: string | null;
    domain: string | null;
    mid: string | null;
    coords: { lng: number; lat: number } | null;
    syntheticQuery: string | null;
  };
  observedNumericTriplet?: { raw: unknown; timestampMicroseconds?: unknown; parsedUtc: string | null } | null;
  attestationToken?: { rawBase64: string | null; decoded: Record<string, unknown> | null };
  parseError?: string;
};

export type AioSentence = {
  clusterIndex: number;
  uuid: string;
  claimText: string;
  visibleCitation: { label: string; url: string | null; ved: string | null; hveid: string | null };
  candidatePool: AioSourceEntry[];
};

export type AioDossier = {
  meta: {
    query: string | null;
    timestamp: string;
    url: string;
    title?: string;
    totalClaimClusters: number;
    markers?: { buttons: number; suuid: number; comments: number };
    aioOnPage?: boolean;
    readMs?: number;
    diagnostics?: string[];
  };
  clusters: AioSentence[];
};

/** A site's name as compared here: lower case, without "www.". */
export function siteOf(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    const host = v.includes('://') ? new URL(v).hostname : v.split('/')[0];
    const h = host.replace(/^www\./i, '').toLowerCase();
    return h.includes('.') ? h : null;
  } catch {
    return null;
  }
}

/** Google's own result links wrap the real address in ?q= or ?url=. */
function realUrl(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v, 'https://www.google.com');
    if (/(^|\.)google\./.test(u.hostname) && u.pathname === '/url') return u.searchParams.get('q') || u.searchParams.get('url');
    return u.href;
  } catch {
    return null;
  }
}

export type AioSourcesSummary = {
  /** Sentences of the AI Overview with a source button. */
  sentences: number;
  /** Source entries across all sentences (a site listed under two sentences counts twice). */
  entries: number;
  /** Different addresses and different sites among them. */
  urls: number;
  sites: number;
  /** The most-listed sites, most first (up to 8). */
  topSites: { site: string; entries: number }[];
  /** Where the tracked business's site appears: as a sentence's visible citation, and in a sentence's source list (1-based sentence numbers). */
  target: { site: string; cited: number[]; listed: number[] } | null;
  markers: { buttons: number; suuid: number; comments: number } | null;
};

export function summarizeAioSources(d: AioDossier, targetDomain?: string | null): AioSourcesSummary {
  const target = siteOf(targetDomain);
  const urls = new Set<string>();
  const perSite = new Map<string, number>();
  const cited: number[] = [];
  const listed: number[] = [];
  let entries = 0;
  for (const c of d.clusters) {
    const visible = siteOf(realUrl(c.visibleCitation.url));
    if (target && visible === target) cited.push(c.clusterIndex);
    let here = false;
    for (const e of c.candidatePool) {
      if (!e.extracted) continue;
      entries++;
      const url = realUrl(e.extracted.url);
      if (url) urls.add(url);
      const site = siteOf(url) ?? siteOf(e.extracted.domain);
      if (!site) continue;
      perSite.set(site, (perSite.get(site) ?? 0) + 1);
      if (target && site === target) here = true;
    }
    if (here) listed.push(c.clusterIndex);
  }
  const topSites = [...perSite.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([site, n]) => ({ site, entries: n }));
  return {
    sentences: d.clusters.length,
    entries,
    urls: urls.size,
    sites: perSite.size,
    topSites,
    target: target ? { site: target, cited, listed } : null,
    markers: d.meta.markers ?? null,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * A Google results page in Chrome for this search, not the full list of businesses (the Local
 * Finder). With a keyword, the page's own query has to be that keyword.
 */
export function isResultsPage(url: string, keyword?: string): boolean {
  try {
    const u = new URL(url);
    if (!/(^|\.)google\.[a-z.]+$/i.test(u.hostname) || u.pathname !== '/search') return false;
    if (u.searchParams.get('tbm') === 'lcl' || u.searchParams.has('lqi') || u.searchParams.has('rlfi')) return false;
    return keyword == null || norm(u.searchParams.get('q') ?? '') === norm(keyword);
  } catch {
    return false;
  }
}
