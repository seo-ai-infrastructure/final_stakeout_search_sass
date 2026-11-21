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

/**
 * Cheap look at the page (a few milliseconds, small answer): when it was loaded, how many source
 * buttons, source blocks and hidden source entries it has, and whether an AI Overview is on it. A
 * change in these counts is what makes the watch read the page again.
 */
export const AIO_PROBE_JS = `(() => {
  const b = document.querySelectorAll('button[data-icl-uuid]').length;
  let c = 0;
  try {
    const it = document.createNodeIterator(document.documentElement, NodeFilter.SHOW_COMMENT);
    let n;
    while ((n = it.nextNode())) if ((n.nodeValue || '').startsWith('TgQPHd|||')) c++;
  } catch (e) {}
  let aio = b > 0;
  if (!aio && document.body) {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let tn;
    while ((tn = tw.nextNode())) if ((tn.nodeValue || '').trim() === 'AI Overview') { aio = true; break; }
  }
  return JSON.stringify({
    u: location.href,
    t: Math.round(performance.timeOrigin),
    b,
    s: document.querySelectorAll('[data-suuid]').length,
    c,
    aio,
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

  const buttons = document.querySelectorAll('button[data-icl-uuid]');
  const uuidIndex = new Map();
  buttons.forEach((b, i) => uuidIndex.set(b.getAttribute('data-icl-uuid'), i + 1));

  // The page's section headings ("People also ask", "Things to know", "Videos" ...): role=heading
  // and h2 elements outside links (a result's own title is a link, not a section).
  const heads = [];
  try {
    document.querySelectorAll('[role="heading"], h2').forEach((h) => {
      if (h.closest('a')) return;
      const t = (h.textContent || '').replace(/\\s+/g, ' ').trim();
      if (t && t.length <= 80) heads.push({ el: h, t });
    });
  } catch (e) { diagnostics.push('headings_failed'); }
  const headsIn = new Map();
  const headingsIn = (el) => {
    if (!headsIn.has(el)) headsIn.set(el, heads.filter((h) => el.contains(h.el)));
    return headsIn.get(el);
  };

  // The "AI Overview" label (one pass over the text nodes), then up to the block that holds the
  // overview: until it has some length, never into a block holding another section's heading.
  let aioBox = null;
  try {
    const tw = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    let tn;
    while ((tn = tw.nextNode())) if ((tn.nodeValue || '').trim() === 'AI Overview') { aioBox = tn.parentElement; break; }
    let up = 0;
    while (
      aioBox && aioBox.parentElement && aioBox.parentElement !== document.body && (aioBox.textContent || '').length < 600 && up++ < 10 &&
      !headingsIn(aioBox.parentElement).some((h) => h.t !== 'AI Overview')
    ) aioBox = aioBox.parentElement;
  } catch (e) { diagnostics.push('aio_box_failed'); }

  // The section a node belongs to: the first block above it that holds a section heading, when that
  // block holds one section only (a block holding several, or the overview, is the page itself).
  const sectionOf = (node) => {
    let a = node.parentElement, up = 0;
    while (a && a !== document.body && up++ < 25) {
      const hs = headingsIn(a);
      if (hs.length) {
        const names = new Set(hs.map((h) => h.t));
        return names.size === 1 && !(aioBox && a.contains(aioBox)) ? hs[0].t : null;
      }
      a = a.parentElement;
    }
    return null;
  };
  // One address however it is written: no "www.", no trailing slash, no #fragment.
  const normUrl = (u) => {
    try {
      const x = new URL(u);
      return (x.hostname.replace(/^www\\./i, '') + x.pathname.replace(/\\/+$/, '') + x.search).toLowerCase();
    } catch (e) { return null; }
  };

  // Every source entry on the page, not only those attached to a sentence: one row per address,
  // with how often it appears, whether it sits inside the overview block, which sentences (if
  // any) list it, and the section it sits under, in page order.
  let comments = 0, parsedEntries = 0;
  const poolMap = new Map();
  const rawByWhere = {};
  try {
    const it = document.createNodeIterator(document.documentElement, NodeFilter.SHOW_COMMENT);
    let c;
    while ((c = it.nextNode())) {
      const v = c.nodeValue || '';
      if (!v.startsWith('TgQPHd|||')) continue;
      comments++;
      let node;
      try { node = extractNodeData(JSON.parse(decodeEntities(v.slice(9)))); parsedEntries++; } catch (e) { continue; }
      if (!node.url && !node.title) continue;
      const key = (node.url && normUrl(node.url)) || 'title:' + node.title;
      const host = c.parentElement;
      const inAio = Boolean(aioBox && host && aioBox.contains(host));
      const where = inAio ? 'AI Overview' : sectionOf(c) || 'no section heading';
      rawByWhere[where] = (rawByWhere[where] || 0) + 1;
      let row = poolMap.get(key);
      if (!row) {
        if (poolMap.size >= 400) continue;
        const attr = host && host.closest ? host.closest('[data-attrid]') : null;
        row = {
          order: poolMap.size + 1,
          url: node.url,
          domain: node.domain,
          title: node.title ? node.title.slice(0, 140) : null,
          snippet: node.snippet ? node.snippet.slice(0, 220) : null,
          mid: node.mid,
          coords: node.coords,
          related: node.syntheticQuery,
          count: 0,
          inAio: 0,
          sentences: [],
          where,
          sections: [],
          attrid: attr ? attr.getAttribute('data-attrid') : null,
        };
        poolMap.set(key, row);
      }
      row.count++;
      if (!row.sections.includes(where)) row.sections.push(where);
      if (!row.title && node.title) row.title = node.title.slice(0, 140);
      if (!row.snippet && node.snippet) row.snippet = node.snippet.slice(0, 220);
      if (inAio) row.inAio++;
      const comp = host && host.closest ? host.closest('[data-suuid]') : null;
      if (comp) {
        const k = (comp.getAttribute('data-suuid') || '').split('|')[1] || '';
        const cut = k.lastIndexOf('-');
        const n = cut > 0 ? uuidIndex.get(k.slice(0, cut)) : undefined;
        if (n && !row.sentences.includes(n)) row.sentences.push(n);
      }
    }
  } catch (e) { diagnostics.push('comment_scan_failed'); }

  // How the page's entries break down: all of them against different addresses; inside the
  // overview (listed under a sentence, or in the overview but under no sentence); by section.
  const rows = Array.from(poolMap.values());
  const uniqueByWhere = {};
  for (const r of rows) for (const w of r.sections) uniqueByWhere[w] = (uniqueByWhere[w] || 0) + 1;
  const sections = Object.keys(rawByWhere)
    .map((w) => ({ section: w, entries: rawByWhere[w], addresses: uniqueByWhere[w] || 0 }))
    .sort((a, b) => b.entries - a.entries)
    .slice(0, 15);
  const breakdown = {
    entries: comments,
    parsed: parsedEntries,
    addresses: rows.length,
    inOverview: rows.filter((r) => r.inAio > 0).length,
    underSentences: rows.filter((r) => r.sentences.length > 0).length,
    inOverviewUnderNoSentence: rows.filter((r) => r.inAio > 0 && r.sentences.length === 0).length,
    outsideOverview: rows.filter((r) => r.inAio === 0).length,
    sections,
  };

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

  // Where this page keeps things, for pages laid out unlike the desktop one: comment kinds, script
  // blocks that carry Google's data, and the attributes used inside the AI Overview.
  const anatomy = { comments: {}, scripts: { total: 0, tgqphd: 0, afInit: 0, wjd: 0, folsrch: 0, iclUuid: 0, suuid: 0 }, aio: null, attrs: {} };
  try {
    const it = document.createNodeIterator(document.documentElement, NodeFilter.SHOW_COMMENT);
    let c, seen = 0;
    while ((c = it.nextNode()) && seen < 20000) {
      seen++;
      const v = (c.nodeValue || '').trim();
      const kind = v.indexOf('|||') > 0 && v.indexOf('|||') <= 16 ? v.slice(0, v.indexOf('|||')) : /^[\\w-]{1,16}/.test(v) ? 'word:' + v.match(/^[\\w-]{1,16}/)[0] : 'other';
      anatomy.comments[kind] = (anatomy.comments[kind] || 0) + 1;
    }
    const top = Object.entries(anatomy.comments).sort((a, b) => b[1] - a[1]).slice(0, 12);
    anatomy.comments = Object.fromEntries(top);
  } catch (e) { diagnostics.push('anatomy_comments_failed'); }
  try {
    for (const s of Array.from(document.scripts)) {
      const t = s.textContent || '';
      anatomy.scripts.total++;
      if (t.includes('TgQPHd')) anatomy.scripts.tgqphd++;
      if (t.includes('AF_initDataCallback')) anatomy.scripts.afInit++;
      if (t.includes('W_jd')) anatomy.scripts.wjd++;
      if (t.includes('folsrch')) anatomy.scripts.folsrch++;
      if (t.includes('icl-uuid') || t.includes('icl_uuid')) anatomy.scripts.iclUuid++;
      if (t.includes('suuid')) anatomy.scripts.suuid++;
    }
  } catch (e) { diagnostics.push('anatomy_scripts_failed'); }
  try {
    const box = aioBox;
    if (box) {
      const counts = {};
      box.querySelectorAll('*').forEach((el) => { for (const a of Array.from(el.attributes)) if (a.name !== 'class' && a.name !== 'style') counts[a.name] = (counts[a.name] || 0) + 1; });
      anatomy.attrs = Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 40));
      const links = Array.from(box.querySelectorAll('a[href]')).map((a) => a.getAttribute('href') || '').filter((h) => /^https?:/.test(h) || h.startsWith('/url'));
      anatomy.aio = {
        tag: box.tagName,
        textLength: (box.textContent || '').length,
        elements: box.querySelectorAll('*').length,
        links: links.length,
        sampleLinks: links.slice(0, 8).map((h) => h.slice(0, 160)),
        buttons: box.querySelectorAll('button, [role=button]').length,
        html: box.outerHTML.slice(0, 3000),
      };
    }
  } catch (e) { diagnostics.push('anatomy_aio_failed'); }

  return JSON.stringify({
    meta: {
      query,
      timestamp: new Date().toISOString(),
      url: location.href,
      title: document.title,
      totalClaimClusters: clusters.length,
      markers: { buttons: buttons.length, suuid: suuidNodes.length, comments },
      aioOnPage: /AI Overview/i.test(text),
      htmlLength: document.documentElement.outerHTML.length,
      anatomy,
      readMs: Date.now() - started,
      diagnostics,
    },
    clusters,
    pool: { comments, parsed: parsedEntries, breakdown, entries: rows },
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
    htmlLength?: number;
    /** Where the page keeps things (see AIO_SOURCES_JS), for pages laid out unlike the desktop one. */
    anatomy?: {
      comments: Record<string, number>;
      scripts: Record<string, number>;
      aio: { tag: string; textLength: number; elements: number; links: number; sampleLinks: string[]; buttons: number; html: string } | null;
      attrs: Record<string, number>;
    };
    readMs?: number;
    diagnostics?: string[];
  };
  clusters: AioSentence[];
  /** Every hidden source entry on the page, one row per address (see AIO_SOURCES_JS). */
  pool?: {
    comments: number;
    parsed: number;
    breakdown?: AioPoolBreakdown;
    entries: AioPoolRow[];
  };
};

export type AioPoolRow = {
  order: number;
  url: string | null;
  domain: string | null;
  title: string | null;
  snippet: string | null;
  mid: string | null;
  coords: { lng: number; lat: number } | null;
  related: string | null;
  /** Times this address appears on the page, and how many of those are inside the overview block. */
  count: number;
  inAio: number;
  /** The overview sentences (1-based) that list it. */
  sentences: number[];
  /** The section it first appears under ("AI Overview", "People also ask" ...), and every section it appears under. */
  where: string;
  sections: string[];
  attrid: string | null;
};

export type AioPoolBreakdown = {
  /** Hidden entries on the page, how many could be read, and how many different addresses they point to. */
  entries: number;
  parsed: number;
  addresses: number;
  /** Addresses inside the overview block; listed under a sentence; in the block but under no sentence; elsewhere on the page. */
  inOverview: number;
  underSentences: number;
  inOverviewUnderNoSentence: number;
  outsideOverview: number;
  /** Entries and different addresses under each section heading, most first. */
  sections: { section: string; entries: number; addresses: number }[];
};

/** For the point's summary: the breakdown plus a few addresses from each group worth a look. */
export function poolDigest(d: AioDossier) {
  const rows = d.pool?.entries ?? [];
  const pick = (r: AioPoolRow) => ({ site: siteOf(r.url) ?? siteOf(r.domain), title: r.title, url: r.url?.slice(0, 200) ?? null, mid: r.mid, related: r.related, at: r.coords ? `${r.coords.lat},${r.coords.lng}` : null, where: r.where });
  return {
    breakdown: d.pool?.breakdown ?? null,
    inOverviewUnderNoSentence: rows.filter((r) => r.inAio > 0 && r.sentences.length === 0).slice(0, 10).map(pick),
    outsideOverview: rows.filter((r) => r.inAio === 0).slice(0, 10).map(pick),
    withEntityIds: rows.filter((r) => r.mid).length,
    withCoordinates: rows.filter((r) => r.coords).length,
    withRelatedSearch: rows.filter((r) => r.related).length,
  };
}

/** A few source entries as read, for a quick look on the point without opening the full read. */
export function sampleEntries(d: AioDossier, n = 6) {
  const out: { sentence: number; title: string | null; site: string | null; url: string | null; mid: string | null; related: string | null; at: string | null }[] = [];
  for (const c of d.clusters) {
    for (const e of c.candidatePool) {
      if (!e.extracted || out.length >= n) continue;
      out.push({
        sentence: c.clusterIndex,
        title: e.extracted.title?.slice(0, 120) ?? null,
        site: siteOf(e.extracted.url) ?? siteOf(e.extracted.domain),
        url: e.extracted.url?.slice(0, 200) ?? null,
        mid: e.extracted.mid,
        related: e.extracted.syntheticQuery?.slice(0, 120) ?? null,
        at: e.extracted.coords ? `${e.extracted.coords.lat},${e.extracted.coords.lng}` : null,
      });
    }
  }
  return out;
}

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
