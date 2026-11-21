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
    let label = null;
    const tw = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    let tn;
    while ((tn = tw.nextNode())) if ((tn.nodeValue || '').trim() === 'AI Overview') { label = tn.parentElement; break; }
    // With source buttons: the smallest block holding the label and every button (the overview
    // has to contain all of its own buttons). Without: up from the label until it has some length,
    // never into a block holding another section's heading.
    const parts = [label, ...Array.from(buttons)].filter(Boolean);
    if (buttons.length) {
      let a = parts[0];
      for (const e of parts.slice(1)) while (a && !a.contains(e)) a = a.parentElement;
      aioBox = a;
    } else if (label) {
      aioBox = label;
      let up = 0;
      while (
        aioBox.parentElement && aioBox.parentElement !== document.body && (aioBox.textContent || '').length < 600 && up++ < 10 &&
        !headingsIn(aioBox.parentElement).some((h) => h.t !== 'AI Overview')
      ) aioBox = aioBox.parentElement;
    }
    if (aioBox === document.body || aioBox === document.documentElement) { aioBox = null; diagnostics.push('aio_box_is_page'); }
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
      // Some entries carry the address as Google displays it ("https://site.com › path › page").
      if (node.url && node.url.includes('›')) node.url = node.url.replace(/\s*›\s*/g, '/');
      if (!node.url && !node.title) continue;
      const key = (node.url && normUrl(node.url)) || 'title:' + node.title;
      const host = c.parentElement;
      // Which sentence lists it (by its source block's id), if any.
      const comp = host && host.closest ? host.closest('[data-suuid]') : null;
      let sentence;
      if (comp) {
        const k = (comp.getAttribute('data-suuid') || '').split('|')[1] || '';
        const cut = k.lastIndexOf('-');
        sentence = cut > 0 ? uuidIndex.get(k.slice(0, cut)) : undefined;
      }
      // In the overview: inside its block, or listed under one of its sentences.
      const inAio = Boolean((aioBox && host && aioBox.contains(host)) || sentence);
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
      if (sentence && !row.sentences.includes(sentence)) row.sentences.push(sentence);
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

/** Before or after the overview was first seen to grow ("Show more"), for anything a read found. */
export type FirstSeenPhase = 'initial' | 'post_expand';

/** When the reads first and last found something, in ms into the watch, and in which phase (see mergeReads). */
export type SeenStamp = { firstSeenMs?: number; lastSeenMs?: number; phase?: FirstSeenPhase };

export type AioSourceEntry = SeenStamp & {
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

export type AioSentence = SeenStamp & {
  clusterIndex: number;
  uuid: string;
  claimText: string;
  visibleCitation: { label: string; url: string | null; ved: string | null; hveid: string | null };
  candidatePool: AioSourceEntry[];
};

/** What the reads of one page added up to (see mergeReads). */
export type AioReadStats = {
  /** The first read's sentences and sources (distinct citations plus entries under no sentence). */
  initialSentenceCount: number;
  initialEntryCount: number;
  /** A later read had more sentences, more sources or a longer overview than any before ("Show more"). */
  expandedSeen: boolean;
  postExpandAddedSentences: number;
  postExpandAddedEntries: number;
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
    /** Every read of the page that went into this one (see mergeReads): when (ms into the watch), and what it held. */
    reads?: { atMs: number; sentences: number; rows: number }[];
    stats?: AioReadStats;
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

export type AioPoolRow = SeenStamp & {
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
  /** In the overview under no sentence at first, then under one in a later read (after "Show more"). */
  promotedAfterExpand?: boolean;
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

/** An address as Google sometimes displays it ("https://site.com › path", "site.com / path"), made a link. */
const displayToUrl = (v: string) => (/›|\s\/\s/.test(v) ? v.replace(/\s*›\s*/g, '/').replace(/\s+\/\s+/g, '/') : v);
const isGoogleHost = (host: string) => /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/i.test(host);
const parse = (v: string | null | undefined): URL | null => {
  if (!v) return null;
  try {
    return new URL(displayToUrl(v), 'https://www.google.com');
  } catch {
    return null;
  }
};

/**
 * What a source entry points to. On a local overview each business card carries its own links: its
 * Google listing, its photo, Directions (Google Maps), Call, and its website as set on the listing
 * (usually tagged utm_source=gbp or utm_campaign=gmb). Everything else is a web page.
 */
export type AioLinkKind = 'listing' | 'card_photo' | 'card_directions' | 'card_call' | 'card_website' | 'web';

export function linkKind(url: string | null | undefined, mid?: string | null): AioLinkKind {
  const u = parse(url);
  if (!u) return mid ? 'listing' : 'web';
  if (u.protocol === 'tel:') return 'card_call';
  const host = u.hostname.toLowerCase();
  if (/(^|\.)(googleusercontent|ggpht|gstatic)\.com$/.test(host)) return 'card_photo';
  if (host === 'maps.app.goo.gl' || (host === 'goo.gl' && u.pathname.startsWith('/maps'))) return 'card_directions';
  if (isGoogleHost(host)) {
    if (/^maps\./.test(host) || /^\/maps(\/|$)/.test(u.pathname) || ['daddr', 'ludocid', 'cid'].some((k) => u.searchParams.has(k)) || /!1s0x[0-9a-f]+:0x/i.test(u.href)) return 'card_directions';
    return 'listing';
  }
  if (host === 'g.page') return 'listing';
  // A page carrying a Google business ID, or a website link tagged as coming from a business's listing.
  if (mid) return 'card_website';
  const tags = [...u.searchParams.entries()].filter(([k]) => /^utm_/i.test(k)).map(([, v]) => v.toLowerCase()).join(' ');
  if (/(^|[^a-z])(gbp|gmb|gmblisting|google[-_ ]?(my[-_ ]?business|business|local|maps|places)|local[-_ ]?(listing|seo))([^a-z]|$)/.test(tags)) return 'card_website';
  return 'web';
}

/** Google's own: a listing, or one of a card's photo, Directions or Call (a card's website is the business's own page). */
export const isGoogleKind = (k: AioLinkKind) => k === 'listing' || k === 'card_photo' || k === 'card_directions' || k === 'card_call';

/** An address without its tracking: Google's wrapper unwrapped, utm_* and click ids dropped, no fragment. */
export function cleanUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const real = realUrl(displayToUrl(url));
  if (!real) return null;
  try {
    const u = new URL(real);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return real;
    for (const k of [...u.searchParams.keys()]) if (/^(utm_.*|gclid|fbclid|msclkid|srsltid|ved|usg|ei|g_st|entry)$/i.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return u.toString();
  } catch {
    return real;
  }
}

/** The utm_* tags on a link (lower-case keys), and other tracking worth keeping (cid, rwg_token, oc) under `extra`. Null with none. */
export function utmParams(url: string | null | undefined): { [k: string]: string | Record<string, string> | undefined; extra?: Record<string, string> } | null {
  const u = parse(url);
  if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) return null;
  const out: { [k: string]: string | Record<string, string> | undefined; extra?: Record<string, string> } = {};
  const extra: Record<string, string> = {};
  for (const [k, v] of u.searchParams) {
    if (/^utm_/i.test(k)) out[k.toLowerCase()] = v;
    else if (/^(cid|rwg_token|oc)$/i.test(k)) extra[k.toLowerCase()] = v;
  }
  if (Object.keys(extra).length) out.extra = extra;
  return Object.keys(out).length ? out : null;
}

/** Google Maps' ID for a place in a link: its feature id ("0x87b6…:0xc970…") or its listing number ("cid:…"). */
export function mapsIdOf(url: string | null | undefined): string | null {
  if (!url) return null;
  let s = url;
  try {
    s = decodeURIComponent(url);
  } catch {
    /* as given */
  }
  const fid = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(s) ?? /[?&]ftid=(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(s);
  if (fid) return fid[1].toLowerCase();
  const cid = /[?&](?:ludocid|cid)=(\d{6,})/.exec(s);
  return cid ? 'cid:' + cid[1] : null;
}

/** The street address and coordinates a Google Maps link holds (Directions' destination, !3d…!4d…, @lat,lng). Coordinates stay null when absent. */
export function placeOf(url: string | null | undefined): { address: string | null; coords: { lat: number; lng: number } | null } | null {
  const u = parse(url);
  if (!u || !url) return null;
  let coords: { lat: number; lng: number } | null = null;
  const c = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url) ?? /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url);
  if (c) coords = { lat: Number(c[1]), lng: Number(c[2]) };
  let address: string | null = null;
  const dir = /^\/maps\/dir\/([^/]*)\/([^/]+)/.exec(u.pathname);
  const dest = dir ? dir[2] : u.searchParams.get('daddr');
  if (dest) {
    let text = dest.replace(/\+/g, ' ');
    try {
      text = decodeURIComponent(text);
    } catch {
      /* as given */
    }
    text = text.trim();
    const ll = /^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/.exec(text);
    if (ll) coords ??= { lat: Number(ll[1]), lng: Number(ll[2]) };
    else if (text) address = text.slice(0, 200);
  }
  if (coords && (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng) || Math.abs(coords.lat) > 90 || Math.abs(coords.lng) > 180 || (coords.lat === 0 && coords.lng === 0))) coords = null;
  return address || coords ? { address, coords } : null;
}

/** The registrable domain of an address ("attorneys.superlawyers.com" → "superlawyers.com"; "x.co.uk" kept as "x.co.uk"). */
export function registrableDomain(v: string | null | undefined): string | null {
  const site = siteOf(v);
  if (!site) return null;
  const parts = site.split('.');
  if (parts.length <= 2) return site;
  const two = parts.slice(-2).join('.');
  const keep = /^(co|com|org|net|gov|edu|ac|ltd|plc)\.[a-z]{2}$/.test(two) ? 3 : 2;
  return parts.slice(-keep).join('.');
}

// The same thing across reads: a sentence by its words; a citation and a row by Google ID, Maps ID or clean address.
const sentenceKey = (c: AioSentence) => c.claimText.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || 'uuid:' + c.uuid;
/** Each sentence's key in one read; the same words twice in a read stay two sentences ("…#2"). */
const sentenceKeys = (d: AioDossier) => {
  const n = new Map<string, number>();
  return d.clusters.map((c) => {
    const k = sentenceKey(c);
    const i = (n.get(k) ?? 0) + 1;
    n.set(k, i);
    return i > 1 ? k + '#' + i : k;
  });
};
const citeKey = (e: AioSourceEntry): string | null => {
  const x = e.extracted;
  if (!x) return null;
  return x.mid || mapsIdOf(x.url) || cleanUrl(x.url) || (x.domain ? 'site:' + x.domain.toLowerCase() : null) || (x.title ? 'title:' + x.title.toLowerCase() : null);
};
const rowKey = (r: AioPoolRow) => linkKind(r.url, r.mid) + ':' + (r.mid || mapsIdOf(r.url) || cleanUrl(r.url) || (r.domain ? 'site:' + r.domain.toLowerCase() : 'order:' + r.order));
const loose = (r: AioPoolRow) => r.inAio > 0 && r.sentences.length === 0;
const entryCount = (d: AioDossier) => {
  const keys = new Set<string>();
  for (const c of d.clusters) for (const e of c.candidatePool) {
    const k = citeKey(e);
    if (k) keys.add(k);
  }
  return keys.size + (d.pool?.entries ?? []).filter(loose).length;
};
const textLength = (d: AioDossier) => d.clusters.reduce((n, c) => n + c.claimText.replace(/\s+/g, ' ').trim().length, 0);
/** `a` with its empty fields filled from `b`. */
function fill<T extends object>(a: T, b: T): T {
  const out = { ...a } as Record<string, unknown>;
  for (const [k, v] of Object.entries(b)) if (out[k] == null && v != null) out[k] = v;
  return out as T;
}

/**
 * Several reads of one results page made into one, never losing anything a read found:
 * - Sentences are matched by their words and kept in the order of the most complete read (the most
 *   sentences; the newer on a tie); a sentence only an earlier read had stays.
 * - Each sentence's citations are united (Google ID, Maps ID or clean address), so citations that
 *   appear late are added; an entry's empty fields are filled in by a later read.
 * - The page's entries are united the same way (kind of link plus its ID or address); one that was
 *   under no sentence and later sits under one is marked promotedAfterExpand.
 * - Everything is stamped with when it was first and last seen (ms into the watch) and whether that
 *   was before or after the overview was first seen to grow ("Show more"): initial or post_expand.
 * A later, smaller read (a re-render, the page scrolling away, the tab closing) downgrades nothing.
 */
export function mergeReads(prev: AioDossier | undefined, next: AioDossier, atMs: number): AioDossier {
  const read = { atMs, sentences: next.clusters.length, rows: next.pool?.entries.length ?? 0 };
  if (!prev) {
    const s = <T extends SeenStamp>(x: T): T => ({ ...x, firstSeenMs: atMs, lastSeenMs: atMs, phase: 'initial' as const });
    return {
      ...next,
      meta: { ...next.meta, reads: [read], stats: { initialSentenceCount: next.clusters.length, initialEntryCount: entryCount(next), expandedSeen: false, postExpandAddedSentences: 0, postExpandAddedEntries: 0 } },
      clusters: next.clusters.map((c) => ({ ...s(c), candidatePool: c.candidatePool.map(s) })),
      ...(next.pool ? { pool: { ...next.pool, entries: next.pool.entries.map(s) } } : {}),
    };
  }
  // The starting point is the first read with sentences: a read of the overview still loading (no
  // sentences yet) is not "before Show more", so what the next read finds is still initial.
  const settled = prev.clusters.length > 0;
  const stats: AioReadStats = settled
    ? { ...(prev.meta.stats ?? { initialSentenceCount: prev.clusters.length, initialEntryCount: entryCount(prev), expandedSeen: false, postExpandAddedSentences: 0, postExpandAddedEntries: 0 }) }
    : { initialSentenceCount: next.clusters.length, initialEntryCount: entryCount(next), expandedSeen: false, postExpandAddedSentences: 0, postExpandAddedEntries: 0 };
  if (settled && (next.clusters.length > prev.clusters.length || entryCount(next) > entryCount(prev) || textLength(next) > textLength(prev) + 20)) stats.expandedSeen = true;
  const phase: FirstSeenPhase = stats.expandedSeen ? 'post_expand' : 'initial';
  const fresh = <T extends SeenStamp>(x: T): T => ({ ...x, firstSeenMs: atMs, lastSeenMs: atMs, phase });
  const again = <T extends SeenStamp>(x: T): T => ({ ...x, lastSeenMs: atMs });
  // Already found: anything an earlier read had under a sentence or anywhere in the overview (an
  // entry that moves under a new sentence was promoted, not newly found).
  const knownCites = new Set(
    [...prev.clusters.flatMap((c) => c.candidatePool.map(citeKey)), ...(prev.pool?.entries ?? []).map((r) => r.mid || mapsIdOf(r.url) || cleanUrl(r.url) || (r.domain ? 'site:' + r.domain.toLowerCase() : null))].filter(
      (k): k is string => Boolean(k),
    ),
  );
  const addedCite = (k: string | null) => {
    if (stats.expandedSeen && k && !knownCites.has(k)) {
      knownCites.add(k);
      stats.postExpandAddedEntries++;
    }
  };

  // Sentences, in the order of the most complete read.
  const lead = next.clusters.length >= prev.clusters.length ? next : prev;
  const prevKeys = sentenceKeys(prev);
  const nextKeys = sentenceKeys(next);
  const prevBy = new Map(prev.clusters.map((c, i) => [prevKeys[i], c]));
  const nextBy = new Map(next.clusters.map((c, i) => [nextKeys[i], c]));
  const keys = [...new Set([...(lead === next ? nextKeys : prevKeys), ...prevKeys, ...nextKeys])];
  const clusters: AioSentence[] = keys.map((k, i) => {
    const p = prevBy.get(k);
    const n = nextBy.get(k);
    if (!p) {
      if (stats.expandedSeen) stats.postExpandAddedSentences++;
      return { ...fresh(n!), clusterIndex: i + 1, candidatePool: n!.candidatePool.map((e) => (addedCite(citeKey(e)), fresh(e))) };
    }
    if (!n) return { ...p, clusterIndex: i + 1 };
    const pool = [...p.candidatePool];
    const at = new Map(pool.map((e, j) => [citeKey(e) ?? 'index:' + j, j]));
    for (const e of n.candidatePool) {
      const ck = citeKey(e);
      const j = ck === null ? undefined : at.get(ck);
      if (j === undefined) {
        addedCite(ck);
        pool.push(fresh(e));
        continue;
      }
      const old = pool[j];
      pool[j] = again({ ...old, extracted: old.extracted && e.extracted ? fill(old.extracted, e.extracted) : (old.extracted ?? e.extracted) });
    }
    return { ...again(p), clusterIndex: i + 1, visibleCitation: n.visibleCitation?.url ? n.visibleCitation : p.visibleCitation, candidatePool: pool };
  });

  // The page's entries: their sentence numbers moved to the merged order, then united.
  const position = new Map(keys.map((k, i) => [k, i + 1]));
  const numbering = (d: AioDossier, ks: string[]) => new Map(d.clusters.map((c, i) => [c.clusterIndex, position.get(ks[i]) ?? 0]));
  const renumber = (r: AioPoolRow, m: Map<number, number>) => ({ ...r, sentences: [...new Set(r.sentences.map((x) => m.get(x) ?? 0).filter((x) => x > 0))].sort((a, b) => a - b) });
  const prevNumbers = numbering(prev, prevKeys);
  const nextNumbers = numbering(next, nextKeys);
  const prevRows = (prev.pool?.entries ?? []).map((r) => renumber(r, prevNumbers));
  const nextRows = (next.pool?.entries ?? []).map((r) => renumber(r, nextNumbers));
  const prevRowBy = new Map(prevRows.map((r) => [rowKey(r), r]));
  const nextRowBy = new Map(nextRows.map((r) => [rowKey(r), r]));
  const rowsLead = nextRows.length >= prevRows.length;
  const merged = new Map<string, AioPoolRow>();
  for (const r of rowsLead ? [...nextRows, ...prevRows] : [...prevRows, ...nextRows]) {
    const k = rowKey(r);
    if (merged.has(k)) continue;
    const p = prevRowBy.get(k);
    const n = nextRowBy.get(k);
    if (p && n) {
      const promoted = p.promotedAfterExpand || (loose(p) && n.sentences.length > 0);
      merged.set(
        k,
        again({
          ...fill(p, n),
          sentences: [...new Set([...p.sentences, ...n.sentences])].sort((a, b) => a - b),
          inAio: Math.max(p.inAio, n.inAio),
          count: Math.max(p.count, n.count),
          sections: [...new Set([...p.sections, ...n.sections])],
          ...(promoted ? { promotedAfterExpand: true } : {}),
        }),
      );
    } else if (p) merged.set(k, p);
    else {
      merged.set(k, fresh(n!));
      if (stats.expandedSeen && loose(n!)) stats.postExpandAddedEntries++;
    }
  }
  const leadRows = rowsLead ? next : prev;
  return {
    ...lead,
    meta: { ...lead.meta, reads: [...(prev.meta.reads ?? []), read], stats },
    clusters,
    pool: {
      comments: leadRows.pool?.comments ?? 0,
      parsed: leadRows.pool?.parsed ?? 0,
      ...(leadRows.pool?.breakdown ? { breakdown: leadRows.pool.breakdown } : {}),
      entries: [...merged.values()].map((r, i) => ({ ...r, order: i + 1 })),
    },
  };
}

/** For the point's summary: the breakdown plus a few addresses from each group worth a look. */
export function poolDigest(d: AioDossier) {
  const rows = d.pool?.entries ?? [];
  const pick = (r: AioPoolRow) => ({ site: siteOf(r.url) ?? siteOf(r.domain), title: r.title, url: r.url?.slice(0, 200) ?? null, mid: r.mid, related: r.related, at: r.coords ? `${r.coords.lat},${r.coords.lng}` : null, where: r.where });
  return {
    breakdown: d.pool?.breakdown ?? null,
    inOverviewUnderNoSentence: rows.filter(loose).slice(0, 10).map(pick),
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
  // An address as Google displays it: "https://site.com › path" or "site.com / path".
  v = displayToUrl(v);
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

/** The address a link really goes to: Google's wrapper unwrapped, display forms ("site.com › path") made links. */
export const realAddress = (v: string | null | undefined): string | null => (v ? realUrl(displayToUrl(v)) : null);

/** An address written the way an ad (or a result) displays it, "site.com › path", not a link. */
export const isDisplayAddress = (v: string | null | undefined): boolean => Boolean(v && /›|\s\/\s/.test(v));

/** Google's source viewer ("/searchviewer/10?svid=…"): a listing card in the sources row under the answer, or a sentence's link chip. */
export function isSourceViewer(url: string | null | undefined): boolean {
  const u = parse(url);
  return Boolean(u && isGoogleHost(u.hostname) && /^\/searchviewer(\/|$)/.test(u.pathname));
}

/**
 * The Google business ID behind a link: a source viewer link keeps it in its svid (a small protobuf
 * holding "/g/…" as a length-prefixed string), a search link in its kgmid.
 */
export function googleIdOfLink(url: string | null | undefined): string | null {
  const u = parse(url);
  if (!u || !isGoogleHost(u.hostname)) return null;
  const kg = u.searchParams.get('kgmid');
  if (kg && /^\/[gm]\/[0-9a-z_]{4,}$/i.test(kg)) return kg;
  const svid = u.searchParams.get('svid');
  if (!svid) return null;
  let bin: string;
  try {
    let b = svid.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    bin = atob(b);
  } catch {
    return null;
  }
  const at = /\/[gm]\//g;
  for (let m = at.exec(bin); m; m = at.exec(bin)) {
    // The byte before a protobuf string is its length: read exactly that many characters.
    const len = m.index > 0 ? bin.charCodeAt(m.index - 1) : 0;
    const exact = len >= 4 && len <= 40 ? bin.slice(m.index, m.index + len) : '';
    if (/^\/[gm]\/[0-9a-z_]+$/i.test(exact)) return exact;
    const loose = /^\/[gm]\/[0-9a-z_]{4,}/i.exec(bin.slice(m.index));
    if (loose) return loose[0];
  }
  return null;
}

export type AioSourcesSummary = {
  /** Sentences of the AI Overview with a source button. */
  sentences: number;
  /** Source entries across all sentences (a site listed under two sentences counts twice). */
  entries: number;
  /** Different addresses and different sites among them. */
  urls: number;
  sites: number;
  /** The most-listed websites, most first (up to 8); Google's own listings are counted apart (`listings`). */
  topSites: { site: string; entries: number }[];
  /** Source entries that point to a business's Google listing (or its card's links) rather than to a website. */
  listings: number;
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
  let listings = 0;
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
      if (target && site === target) here = true;
      // A business's Google listing (a local overview's cards) is not a website it cites.
      if (isGoogleKind(linkKind(url, e.extracted.mid)) && site !== target) {
        listings++;
        continue;
      }
      if (!site) continue;
      perSite.set(site, (perSite.get(site) ?? 0) + 1);
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
    listings,
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
