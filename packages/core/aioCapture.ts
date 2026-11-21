/**
 * v280 capture: one point's AI Overview in the shape of the capture schema (aio_captures with its
 * sentences, sentence citations, unreferenced web sources and card action links), built from the
 * merged reads of the page (see aioSources.mergeReads) and, when the template copied it, Google's own
 * copied answer. Pure: no network, no database.
 *
 * Google's copy is the referee (it is Google's own export of the answer): which pages each sentence
 * cites (full addresses, in order), which businesses the text names (each linked to its Google
 * business ID), the business cards (name and ID) and the Sponsored block. The page read adds what the
 * copy lacks: each card's own buttons (photo, Directions, Website with its tracking tags), the sources
 * row under the answer (its listing cards keep the business's Google ID inside the source viewer
 * link), page titles, and when each thing was first seen. A copy that does not match the page read
 * (a clipboard left from another search) is not used.
 *
 * Businesses are one record each, matched by Google business ID and by website domain: a card, a
 * name in the text, a cited page on its site, its listing in the sources row and its ad all join the
 * same record. One firm can hold several listings: on 2026-11-21 "Biby Law Firm" in a closing line
 * was a second Biby listing (another ID) on the same website as Biby's card.
 *
 * - A card's buttons are links that sit together: a photo carrying the business's ID starts a card,
 *   its Directions, Call and Website follow. A link outside such a run never joins a card, and a
 *   source viewer link (the sources row, a sentence's chip) is never a card button.
 * - Ads (the Sponsored block, which the copy names; addresses written the way an ad displays them)
 *   are kept apart and never count as sources.
 * - The page keeps many sources twice (the full address, and the site with the page's title): one page.
 * Coordinates are only ever ones a link holds: null otherwise, never 0,0.
 */
import {
  cleanUrl,
  googleIdOfLink,
  isDisplayAddress,
  isGoogleKind,
  isSourceViewer,
  linkKind,
  mapsIdOf,
  placeOf,
  realAddress,
  registrableDomain,
  siteOf,
  utmParams,
  type AioDossier,
  type AioPoolRow,
  type AioSourceEntry,
  type FirstSeenPhase,
} from './aioSources';

export type AioOverviewMode = 'web_synthesis' | 'local_entity_cards' | 'hybrid' | 'empty';
export type AioWatcherStopReason = 'template_finished' | 'hard_timeout';
export type AioCitationTargetType = 'gbp_listing' | 'external_web';
export type AioCardActionType = 'photo' | 'directions' | 'website' | 'call' | 'listing';

export interface UtmParams {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  /** Other tracking worth keeping (cid, rwg_token, oc). */
  extra?: Record<string, string>;
}

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface AioWatcherTelemetry {
  capture_version: string;
  resolved_via_warmup_tab: boolean;
  warmup_tab_listed_url: string | null;
  reads_succeeded: number;
  reads_missed: number;
  first_read_ms: number | null;
  last_valid_read_ms: number | null;
  expanded_seen: boolean;
  post_expand_added_sentences: number;
  post_expand_added_entries: number;
  stop_reason: AioWatcherStopReason;
  /** Google's copied answer was used as the referee (it matched the page read). */
  copy_used: boolean;
}

type Seen = { first_seen_phase: FirstSeenPhase; first_seen_elapsed_ms: number; last_seen_elapsed_ms: number };

export interface AioCaptureSentence extends Seen {
  sentence_index: number;
  sentence_text: string;
  sentence_hash: string;
}

export interface AioSentenceCitation extends Seen {
  sentence_index: number;
  citation_position: number;
  target_type: AioCitationTargetType;
  raw_url: string;
  clean_url: string;
  registrable_domain: string | null;
  page_title: string | null;
  business_name: string | null;
  business_id: string | null;
  maps_id: string | null;
  utm_params: UtmParams | null;
  /** Under no sentence at first, then under this one in a later read (after "Show more"). */
  promoted_after_expand: boolean;
}

export interface AioUnreferencedWebSource extends Seen {
  raw_url: string;
  clean_url: string;
  registrable_domain: string;
  page_title: string | null;
  utm_params: UtmParams | null;
}

export interface AioCardActionLink extends Seen {
  card_position: number | null;
  action_type: AioCardActionType;
  business_name: string | null;
  business_id: string | null;
  maps_id: string | null;
  street_address: string | null;
  coordinates: GeoCoordinates | null;
  raw_url: string | null;
  clean_url: string | null;
  registrable_domain: string | null;
  utm_params: UtmParams | null;
}

/** One business, whatever the ways it shows up: matched by Google business ID and website domain. */
export interface AioBusiness {
  /** Its first Google business ID, or "site:<domain>" for a business known only by its website (an advertiser). */
  business_key: string;
  business_ids: string[];
  domains: string[];
  business_name: string | null;
  /** Its business card in the answer (1-based), or null. */
  card_position: number | null;
  /** Sentences that name it (a name Google links to its listing, or its site's name). */
  named_in_sentences: number[];
  /** Sentences that cite a page on its site or its listing. */
  cited_in_sentences: number[];
  /** Its first listing card in the sources row under the answer (1-based), or null. */
  sources_row_position: number | null;
  /** In the Sponsored block inside the AI Overview. */
  advertised: boolean;
  /** Shown in the answer itself: a card, or named in the text. */
  in_answer: boolean;
}

/** A listing card in the sources row under the answer, by the Google business ID its link carries. */
export interface AioListingSource extends Seen {
  position: number;
  business_id: string;
  business_key: string | null;
  in_answer: boolean;
}

/** An ad in the AI Overview's Sponsored block. Never a source. */
export interface AioAd extends Seen {
  position: number;
  raw_url: string | null;
  registrable_domain: string | null;
  business_key: string | null;
}

export interface AioCaptureCounts {
  sentences_count: number;
  cited_web_pages_count: number;
  cited_gbp_listings_count: number;
  /** Businesses (with a Google business ID) shown in the answer: cards and names in the text, one per firm. */
  named_businesses_count: number;
  unreferenced_web_sources_count: number;
  card_action_links_count: number;
  /** Listings in the sources row (different Google business IDs). */
  sources_row_listings_count: number;
  /** Businesses in the sources row that the answer does not show. */
  sources_only_businesses_count: number;
  ads_count: number;
}

export interface AioCaptureResult {
  scan_point_id?: string | null;
  keyword: string;
  target_business_id?: string | null;
  target_domain?: string | null;
  map_pack_rank?: number | null;
  /** Matched by its Google business ID or its website: how, or null when neither matched (or neither is known). */
  target_match: 'id' | 'domain' | null;
  target_cited_in_aio: boolean;
  /** Named in the answer at all: a card or a name in the text. */
  target_named_in_aio: boolean;
  target_named_in_aio_cards: boolean;
  target_named_in_aio_text: boolean;
  target_in_sources_row: boolean;
  target_advertised: boolean;
  overview_mode: AioOverviewMode;
  overview_text: string | null;
  telemetry: AioWatcherTelemetry;
  counts: AioCaptureCounts;
  sentences: AioCaptureSentence[];
  sentence_citations: AioSentenceCitation[];
  unreferenced_web_sources: AioUnreferencedWebSource[];
  card_action_links: AioCardActionLink[];
  businesses: AioBusiness[];
  listing_sources: AioListingSource[];
  ads: AioAd[];
  /** Sites a sentence names in its words and cites (Super Lawyers, Opendoor ...). */
  named_sites: { sentence_index: number; registrable_domain: string }[];
  captured_at: string;
}

/** What the watcher itself knows; the read counts come from the merged reads. */
export type WatcherFacts = Omit<AioWatcherTelemetry, 'expanded_seen' | 'post_expand_added_sentences' | 'post_expand_added_entries' | 'copy_used'>;

/** A short stable hash of a sentence's words (cyrb53, hex). */
function sentenceHash(text: string): string {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let h1 = 0xdeadbeef ^ s.length,
    h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const seen = (x: { phase?: FirstSeenPhase; firstSeenMs?: number; lastSeenMs?: number } | null | undefined): Seen => ({
  first_seen_phase: x?.phase ?? 'initial',
  first_seen_elapsed_ms: Math.round(x?.firstSeenMs ?? 0),
  last_seen_elapsed_ms: Math.round(x?.lastSeenMs ?? x?.firstSeenMs ?? 0),
});

const ACTION: Record<string, AioCardActionType> = { card_photo: 'photo', card_directions: 'directions', card_call: 'call', card_website: 'website', listing: 'listing' };
const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const domainOf = (v: string | null | undefined) => registrableDomain(realAddress(v) ?? v);
/** A site's home page, no path or query: the form in which the page keeps a source's title. */
const isRoot = (url: string | null | undefined) => {
  try {
    const u = new URL(realAddress(url) ?? '');
    return (u.pathname === '/' || u.pathname === '') && !u.search;
  } catch {
    return false;
  }
};
const labelOf = (domain: string) => letters(domain.split('.')[0]);

/** The business name right before a link in a sentence ("… include Top Dollar Home Offer (link)"). */
function trailingName(s: string): string | null {
  const words = s.replace(/\s+/g, ' ').trim().split(' ');
  const out: string[] = [];
  for (let i = words.length - 1; i >= 0 && out.length < 9; i--) {
    const w = words[i].replace(/^•/, '');
    if (!w) break;
    if (/^[A-Z0-9&"'’]/.test(w) && !/[,;:.)]$/.test(w)) {
      out.unshift(w);
      continue;
    }
    if (/^(of|and|the|de|la|for|at|&)$/i.test(w) && out.length && i > 0 && /^[A-Z]/.test(words[i - 1]) && !/[,;:.)]$/.test(words[i - 1])) {
      out.unshift(w);
      continue;
    }
    break;
  }
  while (out.length && /^(and|or|the|of|&)$/i.test(out[0])) out.shift();
  return out.length ? out.join(' ') : null;
}

/** A name and a website that go together: "Top Dollar Home Offer" and topdollarhomeoffer.com, "Biby Law Firm" and bibylaw.com. */
function nameFitsDomain(name: string, domain: string): boolean {
  const label = labelOf(domain);
  const n = letters(name);
  return label.length >= 4 && n.length >= 4 && (n === label || n.startsWith(label) || label.startsWith(n));
}

/** The sentence's words name the site: "Super Lawyers" for superlawyers.com, "ASH LAW" for ash.law, "Reddit's" for reddit.com. */
function namesSite(text: string, domain: string): boolean {
  const label = labelOf(domain);
  if (label.length < 3) return false;
  const words = text
    .replace(/['’]s\b/g, '')
    .split(/[^A-Za-z0-9&]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase().replace(/&/g, ''));
  for (let i = 0; i < words.length; i++) {
    let acc = '';
    for (let j = i; j < Math.min(words.length, i + 6); j++) {
      acc += words[j];
      if (acc === label) return true;
      if (!label.startsWith(acc)) break;
    }
  }
  return false;
}

type CopySentence = { text: string; urls: string[]; mentions: { name: string | null; id: string }[] };
/** Google's copied answer, as far as a capture needs it. */
export type CopiedAnswer = { cards: { pos: number; name: string; id: string }[]; sentences: CopySentence[]; sponsored: string[] };

const CARD_LINE = /^(.+?) \((https:\/\/www\.google\.com\/search\?kgmid=([^&)\s]+)[^)\s]*)\)$/;
const KG_LINK = /\s\((https:\/\/www\.google\.com\/search\?kgmid=([^&)\s]+)[^)\s]*)\)/g;
const CITE = /\[(\d+)\] \(([^)\s]+)\)/g;

/**
 * The parts of Google's copied answer a capture uses: the business cards (a line that is a name and
 * its Google link), every sentence that cites something (its text, the pages it cites in order, the
 * businesses it names with their Google IDs), and the Sponsored block (everything from "Sponsored").
 */
export function readCopiedAnswer(text: string): CopiedAnswer {
  const cards: CopiedAnswer['cards'] = [];
  const sentences: CopySentence[] = [];
  const sponsored: string[] = [];
  let ads = false;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (ads || /^Sponsored(?![a-z])/.test(line)) {
      ads = true;
      const rest = line.replace(/^Sponsored/, '').trim();
      if (rest) sponsored.push(rest);
      continue;
    }
    const card = line.startsWith('•') ? null : CARD_LINE.exec(line);
    if (card && !/\[\d+\] \(/.test(line)) {
      cards.push({ pos: cards.length + 1, name: card[1].trim(), id: decodeURIComponent(card[3]) });
      continue;
    }
    const urls = [...line.matchAll(CITE)].map((m) => m[2]);
    if (!urls.length) continue;
    const mentions = [...line.matchAll(KG_LINK)].map((m) => ({ name: trailingName(line.slice(0, m.index)), id: decodeURIComponent(m[2]) }));
    const words = line
      .replace(/^•\s*/, '')
      .replace(/,?\s*\[\d+\]\s*\([^)]*\)/g, '')
      .replace(/\s*\(https?:\/\/[^)\s]*\)/g, '')
      .trim();
    sentences.push({ text: words, urls, mentions });
  }
  return { cards, sentences, sponsored };
}

export function buildAioCapture(
  d: AioDossier,
  opts: {
    keyword: string;
    targetDomain?: string | null;
    targetBusinessId?: string | null;
    mapPackRank?: number | null;
    /** Google's copied answer (the copy button's text), when the template copied it. */
    copy?: string | null;
    telemetry: WatcherFacts;
    scanPointId?: string | null;
    capturedAt?: string;
  },
): AioCaptureResult {
  const rows = (d.pool?.entries ?? []).filter((r) => r.inAio > 0);
  const clusters = d.clusters;

  // ---- Google's copy, used only when it is this page's answer (its sentences are the page's).
  const copied = opts.copy ? readCopiedAnswer(opts.copy) : null;
  const clusterKeys = clusters.map((c) => letters(c.claimText));
  const usedCluster = new Set<number>();
  const match = (text: string): number | null => {
    const k = letters(text).slice(0, 48);
    if (k.length < 12) return null;
    const i = clusterKeys.findIndex((ck, j) => !usedCluster.has(j) && (ck.includes(k) || (ck.length >= 12 && k.includes(ck.slice(0, 48)))));
    if (i < 0) return null;
    usedCluster.add(i);
    return i;
  };
  const copyToCluster = copied ? copied.sentences.map((s) => match(s.text)) : [];
  const matched = copyToCluster.filter((x) => x !== null).length;
  const pageIds = new Set(rows.map((r) => r.mid).filter(Boolean));
  const copyUsed = Boolean(
    copied &&
      copied.sentences.length > 0 &&
      (clusters.length > 0 ? matched >= Math.ceil(copied.sentences.length / 2) : copied.cards.some((c) => pageIds.has(c.id))),
  );

  // ---- Names by Google ID: the copy's cards and named businesses, then the page's listing titles.
  const names = new Map<string, string>();
  if (copyUsed) {
    for (const c of copied!.cards) names.set(c.id, c.name);
    for (const s of copied!.sentences) for (const m of s.mentions) if (m.name && !names.has(m.id)) names.set(m.id, m.name);
  }
  for (const c of clusters) for (const e of c.candidatePool) if (e.extracted?.mid && e.extracted.title && !names.has(e.extracted.mid)) names.set(e.extracted.mid, e.extracted.title);

  // ---- Sentences: the copy's, in its order and its words (the page's text of a sentence also holds
  // its chip's label, "Zillow (+6)", and a card's button labels), each timed by the page read's match.
  type Sent = { index: number; text: string; cluster: number | null; urls: string[] | null; mentions: CopySentence['mentions'] };
  const sents: Sent[] = [];
  if (copyUsed) {
    copied!.sentences.forEach((s, i) => sents.push({ index: sents.length + 1, text: s.text, cluster: copyToCluster[i], urls: s.urls, mentions: s.mentions }));
    clusters.forEach((c, j) => {
      if (!usedCluster.has(j)) sents.push({ index: sents.length + 1, text: c.claimText, cluster: j, urls: null, mentions: [] });
    });
  } else clusters.forEach((c, j) => sents.push({ index: sents.length + 1, text: c.claimText, cluster: j, urls: null, mentions: [] }));
  const sentences: AioCaptureSentence[] = sents.map((s) => ({
    sentence_index: s.index,
    sentence_text: s.text,
    sentence_hash: sentenceHash(s.text),
    ...seen(s.cluster !== null ? clusters[s.cluster] : null),
  }));

  // ---- Citations. From the copy: its full addresses, titled from the page read. Otherwise the page
  // read's entries, the site-with-title half of each source joined to its full address.
  const promoted = new Set(rows.filter((r) => r.promotedAfterExpand).map((r) => cleanUrl(r.url)).filter(Boolean));
  const sentence_citations: AioSentenceCitation[] = [];
  const cite = (s: Sent, position: number, raw: string, entry: AioSourceEntry | null, title: string | null) => {
    const kind = linkKind(raw, entry?.extracted?.mid);
    const google = isGoogleKind(kind);
    const clean = cleanUrl(raw) ?? raw;
    const business_id = google ? (googleIdOfLink(raw) ?? entry?.extracted?.mid ?? null) : null;
    sentence_citations.push({
      sentence_index: s.index,
      citation_position: position,
      target_type: google ? 'gbp_listing' : 'external_web',
      raw_url: raw,
      clean_url: clean,
      registrable_domain: domainOf(raw) ?? (entry?.extracted?.domain ? domainOf(entry.extracted.domain) : null),
      page_title: title,
      business_name: google ? ((business_id && names.get(business_id)) || title || null) : null,
      business_id,
      maps_id: mapsIdOf(raw),
      utm_params: utmParams(raw) as UtmParams | null,
      promoted_after_expand: promoted.has(clean),
      ...seen(entry ?? (s.cluster !== null ? clusters[s.cluster] : null)),
    });
  };
  for (const s of sents) {
    const pool = s.cluster !== null ? clusters[s.cluster].candidatePool.filter((e) => e.extracted && (e.extracted.url || e.extracted.mid || e.extracted.domain)) : [];
    if (s.urls) {
      const webDomains = s.urls.filter((u) => !isGoogleKind(linkKind(u))).map(domainOf);
      s.urls.forEach((u, i) => {
        const clean = cleanUrl(u);
        const same = pool.find((e) => cleanUrl(e.extracted!.url) === clean) ?? null;
        const dom = domainOf(u);
        // The page's title for it: kept with the same address, or with the site's home page when the
        // sentence cites only one page on that site.
        const titled =
          (same?.extracted?.title ? same : null) ??
          (dom && webDomains.filter((x) => x === dom).length === 1 ? (pool.find((e) => e.extracted!.title && isRoot(e.extracted!.url) && domainOf(e.extracted!.url) === dom) ?? null) : null);
        cite(s, i + 1, u, same ?? titled, titled?.extracted?.title ?? null);
      });
      continue;
    }
    const fulls = pool.filter((e) => !(e.extracted!.title && isRoot(e.extracted!.url)));
    let position = 0;
    for (const e of pool) {
      const x = e.extracted!;
      const raw = x.url ?? (x.mid ? 'https://www.google.com/search?kgmid=' + encodeURIComponent(x.mid) : 'https://' + x.domain);
      const dom = domainOf(raw);
      if (x.title && isRoot(x.url) && !isGoogleKind(linkKind(raw, x.mid))) {
        // The site-with-title half of a source: one page with the full address beside it.
        const pair = fulls.filter((f) => f !== e && domainOf(f.extracted!.url) === dom);
        if (pair.length === 1) continue;
      }
      const titled = x.title ? x.title : (fulls.length && dom ? (pool.find((f) => f.extracted!.title && isRoot(f.extracted!.url) && domainOf(f.extracted!.url) === dom && fulls.filter((g) => domainOf(g.extracted!.url) === dom).length === 1)?.extracted?.title ?? null) : null);
      cite(s, ++position, raw, e, titled);
    }
  }
  const webCites = sentence_citations.filter((c) => c.target_type === 'external_web');
  const listingCites = sentence_citations.filter((c) => c.target_type === 'gbp_listing');
  const citedUrls = new Set(webCites.map((c) => c.clean_url));
  const citedDomains = new Set(webCites.map((c) => c.registrable_domain).filter(Boolean) as string[]);

  // ---- Ads: the copy's Sponsored block names them (a site, or the advertiser's name), and an ad's
  // address is written the way ads display it. The block is the last thing in the overview.
  const adLines = copyUsed ? copied!.sponsored : [];
  const adDomains = new Set(adLines.filter((l) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(l)).map((l) => registrableDomain(l)).filter(Boolean) as string[]);
  const adWords = adLines.map((l) => letters(l.split(/\s+/)[0] ?? '')).filter((w) => w.length >= 6);
  const adLike = (r: AioPoolRow) => {
    const dom = domainOf(r.url ?? r.domain);
    if (dom && adDomains.has(dom)) return true;
    if (dom && adWords.some((w) => labelOf(dom).startsWith(w))) return true;
    return isDisplayAddress(r.url);
  };

  // ---- The page's entries under no sentence, in page order.
  const loose = rows.filter((r) => r.sentences.length === 0).sort((a, b) => a.order - b.order);
  type Card = { position: number; id: string | null; has: Set<AioCardActionType>; links: { r: AioPoolRow; action: AioCardActionType }[] };
  const cards: Card[] = [];
  const unreferenced: AioPoolRow[] = [];
  const adRows: AioPoolRow[] = [];
  let cur: Card | null = null;
  let prevKind: string | null = null;
  let adBlock = false;
  const isCitedPage = (r: AioPoolRow) => {
    const clean = cleanUrl(r.url);
    if (clean && citedUrls.has(clean)) return true;
    // The site-with-title half of a cited page.
    const dom = domainOf(r.url ?? r.domain);
    return Boolean(dom && citedDomains.has(dom) && r.title && isRoot(r.url));
  };
  for (const r of loose) {
    if (isSourceViewer(r.url)) {
      cur = null;
      prevKind = 'source';
      continue;
    }
    let kind: string = linkKind(r.url, r.mid);
    if (kind === 'web' || kind === 'card_website') {
      // A card's Website button: right after its other buttons, or tagged as the listing's website
      // (utm gbp/gmb) while the card is open. One carrying a Google ID starts its business's card.
      const open = Boolean(cur && !cur.has.has('website'));
      const cardButton = open && (kind === 'card_website' || ['card_directions', 'card_call', 'card_photo'].includes(prevKind ?? ''));
      if (!cardButton && !(kind === 'card_website' && r.mid)) {
        if (!isCitedPage(r) && (adBlock || adLike(r))) {
          adBlock = true;
          adRows.push(r);
        } else if (!isCitedPage(r)) unreferenced.push(r);
        cur = null;
        prevKind = 'web';
        continue;
      }
      kind = 'card_website';
    }
    const action = ACTION[kind];
    const otherBusiness = Boolean(cur && r.mid && cur.id && r.mid !== cur.id);
    // A second Directions, Call or Website is the next card's; another photo of the same card is not.
    const repeat = Boolean(cur && cur.has.has(action) && action !== 'photo' && !(r.mid && r.mid === cur.id));
    if (!cur || otherBusiness || repeat) {
      cur = { position: cards.length + 1, id: null, has: new Set(), links: [] };
      cards.push(cur);
    }
    cur.links.push({ r, action });
    cur.has.add(action);
    if (r.mid && !cur.id) cur.id = r.mid;
    prevKind = kind;
  }
  // A card the page read could not tie to a business takes the copy's card at its place, when the
  // copy and the page show the same number of cards.
  if (copyUsed && copied!.cards.length === cards.length) cards.forEach((c, i) => (c.id ??= copied!.cards[i].id));
  const known = cards.filter((c) => c.id || c.links.some((l) => l.action === 'website'));
  known.forEach((c, i) => (c.position = i + 1));
  const cardSite = (c: Card) => {
    const w = c.links.find((l) => l.action === 'website');
    return w ? domainOf(w.r.url ?? w.r.domain) : null;
  };

  const card_action_links: AioCardActionLink[] = cards.flatMap((card) => {
    const placed = known.includes(card);
    const places = card.links.map((l) => placeOf(l.r.url)).filter(Boolean);
    const maps_id = card.links.map((l) => mapsIdOf(l.r.url)).find(Boolean) ?? null;
    const street_address = places.map((p) => p!.address).find(Boolean) ?? null;
    const rowCoords = card.links.map((l) => l.r.coords).find((c) => c && !(c.lat === 0 && c.lng === 0));
    const coordinates = rowCoords ? { lat: rowCoords.lat, lng: rowCoords.lng } : (places.map((p) => p!.coords).find(Boolean) ?? null);
    const name = (card.id && names.get(card.id)) || card.links.find((l) => l.action === 'listing' && l.r.title)?.r.title || null;
    return card.links.map(({ r, action }) => ({
      card_position: placed ? card.position : null,
      action_type: action,
      business_name: placed ? name : null,
      business_id: placed ? card.id : null,
      maps_id: placed ? maps_id : mapsIdOf(r.url),
      street_address: placed ? street_address : null,
      coordinates: placed ? coordinates : null,
      raw_url: r.url,
      clean_url: cleanUrl(r.url),
      registrable_domain: domainOf(r.url ?? r.domain),
      utm_params: utmParams(r.url) as UtmParams | null,
      ...seen(r),
    }));
  });

  const unreferenced_web_sources: AioUnreferencedWebSource[] = unreferenced
    .filter((r) => r.url || r.domain)
    .map((r) => {
      const raw = r.url ?? 'https://' + r.domain;
      return {
        raw_url: raw,
        clean_url: cleanUrl(raw) ?? raw,
        registrable_domain: domainOf(raw) ?? siteOf(raw) ?? raw,
        page_title: r.title,
        utm_params: utmParams(raw) as UtmParams | null,
        ...seen(r),
      };
    });

  // ---- Businesses: one record per firm, joined by Google ID and website domain.
  type Rec = { ids: Set<string>; domains: Set<string>; name: string | null; card: number | null; named: Set<number>; cited: Set<number>; sources: number | null; ad: boolean; order: number };
  const recs: Rec[] = [];
  const find = (ids: (string | null | undefined)[], domains: (string | null | undefined)[], create: boolean): Rec | null => {
    const I = ids.filter(Boolean) as string[];
    const D = domains.filter(Boolean) as string[];
    const hits = recs.filter((x) => I.some((i) => x.ids.has(i)) || D.some((dd) => x.domains.has(dd)));
    if (!hits.length) {
      if (!create || (!I.length && !D.length)) return null;
      const rec: Rec = { ids: new Set(I), domains: new Set(D), name: null, card: null, named: new Set(), cited: new Set(), sources: null, ad: false, order: recs.length };
      recs.push(rec);
      return rec;
    }
    const [keep, ...rest] = hits.sort((a, b) => a.order - b.order);
    for (const o of rest) {
      o.ids.forEach((i) => keep.ids.add(i));
      o.domains.forEach((dd) => keep.domains.add(dd));
      o.named.forEach((s) => keep.named.add(s));
      o.cited.forEach((s) => keep.cited.add(s));
      keep.name ??= o.name;
      keep.card ??= o.card;
      keep.sources = keep.sources === null ? o.sources : o.sources === null ? keep.sources : Math.min(keep.sources, o.sources);
      keep.ad ||= o.ad;
      recs.splice(recs.indexOf(o), 1);
    }
    I.forEach((i) => keep.ids.add(i));
    D.forEach((dd) => keep.domains.add(dd));
    return keep;
  };
  for (const c of known) {
    const rec = find([c.id], [cardSite(c)], true)!;
    rec.card ??= c.position;
    rec.name ??= (c.id && names.get(c.id)) || null;
  }
  if (copyUsed)
    for (const c of copied!.cards) {
      const rec = find([c.id], [], true)!;
      rec.name ??= c.name;
      if (rec.card === null && !known.length) rec.card = c.pos;
    }
  for (const s of sents)
    for (const m of s.mentions) {
      // The site the same sentence cites under the business's name joins it.
      const site = (s.urls ?? []).map(domainOf).find((dd) => dd && m.name && nameFitsDomain(m.name, dd)) ?? null;
      const rec = find([m.id], [site], true)!;
      rec.named.add(s.index);
      rec.name ??= m.name;
    }
  for (const c of listingCites) {
    const rec = find([c.business_id], [], Boolean(c.business_id));
    rec?.cited.add(c.sentence_index);
  }
  for (const c of webCites) find([], [c.registrable_domain], false)?.cited.add(c.sentence_index);
  const named_sites: AioCaptureResult['named_sites'] = [];
  for (const s of sents) {
    const doms = [...new Set(webCites.filter((c) => c.sentence_index === s.index).map((c) => c.registrable_domain).filter(Boolean) as string[])];
    for (const dd of doms)
      if (namesSite(s.text, dd)) {
        named_sites.push({ sentence_index: s.index, registrable_domain: dd });
        find([], [dd], false)?.named.add(s.index);
      }
  }
  // The sources row: every source viewer link in the overview, by the business ID it carries, in page order.
  const listing_sources: AioListingSource[] = [];
  const inRow = new Set<string>();
  for (const r of [...rows].sort((a, b) => a.order - b.order)) {
    if (!isSourceViewer(r.url)) continue;
    const id = googleIdOfLink(r.url);
    if (!id || inRow.has(id)) continue;
    inRow.add(id);
    const rec = find([id], [], true)!;
    rec.sources ??= listing_sources.length + 1;
    listing_sources.push({ position: listing_sources.length + 1, business_id: id, business_key: null, in_answer: false, ...seen(r) });
  }
  const ads: AioAd[] = adRows.map((r, i) => {
    const dom = domainOf(r.url ?? r.domain);
    const rec = find([], [dom], true);
    if (rec) rec.ad = true;
    return { position: i + 1, raw_url: r.url, registrable_domain: dom, business_key: null, ...seen(r) };
  });

  const keyOf = (x: Rec) => [...x.ids][0] ?? 'site:' + [...x.domains][0];
  const recOfId = (id: string) => recs.find((x) => x.ids.has(id)) ?? null;
  const recOfDomain = (dd: string) => recs.find((x) => x.domains.has(dd)) ?? null;
  const businesses: AioBusiness[] = recs.map((x) => ({
    business_key: keyOf(x),
    business_ids: [...x.ids],
    domains: [...x.domains],
    business_name: x.name ?? ([...x.ids].map((i) => names.get(i)).find(Boolean) || null),
    card_position: x.card,
    named_in_sentences: [...x.named].sort((a, b) => a - b),
    cited_in_sentences: [...x.cited].sort((a, b) => a - b),
    sources_row_position: x.sources,
    advertised: x.ad,
    in_answer: x.card !== null || x.named.size > 0,
  }));
  for (const l of listing_sources) {
    const rec = recOfId(l.business_id);
    l.business_key = rec ? keyOf(rec) : null;
    l.in_answer = Boolean(rec && (rec.card !== null || rec.named.size > 0));
  }
  for (const a of ads) {
    const rec = a.registrable_domain ? recOfDomain(a.registrable_domain) : null;
    a.business_key = rec ? keyOf(rec) : null;
  }

  const named = businesses.filter((b) => b.in_answer && b.business_ids.length > 0);
  const counts: AioCaptureCounts = {
    sentences_count: sentences.length,
    cited_web_pages_count: citedUrls.size,
    cited_gbp_listings_count: new Set(listingCites.map((c) => c.business_id || c.maps_id || c.clean_url)).size,
    named_businesses_count: named.length,
    unreferenced_web_sources_count: unreferenced_web_sources.length,
    card_action_links_count: card_action_links.length,
    sources_row_listings_count: listing_sources.length,
    sources_only_businesses_count: businesses.filter((b) => b.sources_row_position !== null && !b.in_answer).length,
    ads_count: ads.length,
  };
  // Business cards against the web pages the sentences cite: mostly cards (local), mostly pages (web), or as many of each (hybrid).
  const cardCount = known.length || (copyUsed ? copied!.cards.length : 0);
  const overview_mode: AioOverviewMode = cardCount && counts.cited_web_pages_count >= cardCount ? 'hybrid' : cardCount ? 'local_entity_cards' : counts.cited_web_pages_count || sentences.length ? 'web_synthesis' : 'empty';

  // ---- The tracked business: by its Google business ID, else its website.
  const targetSite = registrableDomain(opts.targetDomain);
  const byId = opts.targetBusinessId ? recOfId(opts.targetBusinessId) : null;
  const byDomain = !byId && targetSite ? recOfDomain(targetSite) : null;
  const target = byId ?? byDomain;
  const t = target ? businesses.find((b) => b.business_key === keyOf(target)) ?? null : null;
  const targetCited =
    Boolean(t && t.cited_in_sentences.length) ||
    Boolean(targetSite && webCites.some((c) => c.registrable_domain === targetSite)) ||
    Boolean(opts.targetBusinessId && listingCites.some((c) => c.business_id === opts.targetBusinessId));
  const stats = d.meta.stats;
  return {
    scan_point_id: opts.scanPointId ?? null,
    keyword: opts.keyword,
    target_business_id: opts.targetBusinessId ?? null,
    target_domain: opts.targetDomain ?? null,
    map_pack_rank: opts.mapPackRank ?? null,
    target_match: byId ? 'id' : byDomain ? 'domain' : null,
    target_cited_in_aio: targetCited,
    target_named_in_aio: Boolean(t?.in_answer),
    target_named_in_aio_cards: Boolean(t && t.card_position !== null),
    target_named_in_aio_text: Boolean(t && t.named_in_sentences.length),
    target_in_sources_row: Boolean(t && t.sources_row_position !== null),
    target_advertised: Boolean(t?.advertised),
    overview_mode,
    overview_text: sentences.length ? sentences.map((s) => s.sentence_text).join(' ') : null,
    telemetry: {
      ...opts.telemetry,
      expanded_seen: stats?.expandedSeen ?? false,
      post_expand_added_sentences: stats?.postExpandAddedSentences ?? 0,
      post_expand_added_entries: stats?.postExpandAddedEntries ?? 0,
      copy_used: copyUsed,
    },
    counts,
    sentences,
    sentence_citations,
    unreferenced_web_sources,
    card_action_links,
    businesses,
    listing_sources,
    ads,
    named_sites,
    captured_at: opts.capturedAt ?? new Date().toISOString(),
  };
}

/** One row per business card, its links joined (as v_aio_local_entity_roster), with what else the answer did with the firm. */
export function entityRoster(c: AioCaptureResult) {
  const byCard = new Map<number, AioCardActionLink[]>();
  for (const l of c.card_action_links) if (l.card_position !== null) byCard.set(l.card_position, [...(byCard.get(l.card_position) ?? []), l]);
  return [...byCard.entries()].map(([card_position, links]) => {
    const site = links.find((l) => l.action_type === 'website');
    const id = links.find((l) => l.business_id)?.business_id ?? null;
    const firm = c.businesses.find((b) => b.card_position === card_position) ?? null;
    return {
      card_position,
      business_name: links.find((l) => l.business_name)?.business_name ?? null,
      business_id: id,
      /** The firm's other listings the answer showed (another ID on the same website). */
      other_business_ids: firm ? firm.business_ids.filter((x) => x !== id) : [],
      maps_id: links.find((l) => l.maps_id)?.maps_id ?? null,
      street_address: links.find((l) => l.street_address)?.street_address ?? null,
      coordinates: links.find((l) => l.coordinates)?.coordinates ?? null,
      gbp_website_clean_url: site?.clean_url ?? null,
      gbp_website_domain: site?.registrable_domain ?? null,
      utm_source: (site?.utm_params?.utm_source as string | undefined) ?? null,
      utm_medium: (site?.utm_params?.utm_medium as string | undefined) ?? null,
      utm_campaign: (site?.utm_params?.utm_campaign as string | undefined) ?? null,
      named_in_sentences: firm?.named_in_sentences ?? [],
      cited_in_sentences: firm?.cited_in_sentences ?? [],
      sources_row_position: firm?.sources_row_position ?? null,
      advertised: firm?.advertised ?? false,
      hydrated_after_expand: links.some((l) => l.first_seen_phase === 'post_expand'),
    };
  });
}

/** What the point keeps on itself (the full capture goes to storage): counts, telemetry, the firms, the other pages and the ads. */
export function captureDigest(c: AioCaptureResult) {
  const cited = new Map<string, number>();
  for (const s of c.sentence_citations) if (s.target_type === 'external_web' && s.registrable_domain) cited.set(s.registrable_domain, (cited.get(s.registrable_domain) ?? 0) + 1);
  const unplaced = c.card_action_links.filter((l) => l.card_position === null);
  return {
    capture_version: c.telemetry.capture_version,
    overview_mode: c.overview_mode,
    target_match: c.target_match,
    target_cited_in_aio: c.target_cited_in_aio,
    target_named_in_aio: c.target_named_in_aio,
    target_named_in_aio_cards: c.target_named_in_aio_cards,
    target_named_in_aio_text: c.target_named_in_aio_text,
    target_in_sources_row: c.target_in_sources_row,
    target_advertised: c.target_advertised,
    map_pack_rank: c.map_pack_rank ?? null,
    telemetry: c.telemetry,
    counts: c.counts,
    cited_sites: [...cited.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([site, n]) => ({ site, citations: n })),
    roster: entityRoster(c).slice(0, 20),
    named_in_text: c.businesses
      .filter((b) => b.named_in_sentences.length && b.card_position === null)
      .slice(0, 12)
      .map((b) => ({ ids: b.business_ids, name: b.business_name, domains: b.domains, sentences: b.named_in_sentences, cited: b.cited_in_sentences.length > 0 })),
    sources_only: c.businesses
      .filter((b) => b.sources_row_position !== null && !b.in_answer)
      .slice(0, 20)
      .map((b) => ({ ids: b.business_ids, name: b.business_name, position: b.sources_row_position })),
    named_sites: c.named_sites.slice(0, 12),
    ads: c.ads.slice(0, 8).map((a) => ({ domain: a.registrable_domain, url: a.raw_url?.slice(0, 200) ?? null, business: a.business_key })),
    unreferenced_web_sources: c.unreferenced_web_sources.slice(0, 12).map((u) => ({ domain: u.registrable_domain, url: u.clean_url.slice(0, 200), title: u.page_title, phase: u.first_seen_phase })),
    unplaced_card_links: unplaced.length ? { count: unplaced.length, urls: unplaced.slice(0, 10).map((l) => l.raw_url?.slice(0, 200) ?? null) } : null,
    promoted_after_expand: c.sentence_citations.filter((s) => s.promoted_after_expand).length,
  };
}
