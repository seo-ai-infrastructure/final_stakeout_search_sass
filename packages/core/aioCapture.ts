/**
 * v279 capture: one point's AI Overview in the shape of the capture schema (aio_captures with its
 * sentences, sentence citations, unreferenced web sources and card action links), built from the
 * merged reads of the page (see aioSources.mergeReads). Pure: no network, no database.
 *
 * - Sentence citations: every source listed under an overview sentence, as a Google listing
 *   (gbp_listing: the business's listing, its photo, Directions or Call) or a web page.
 * - Under no sentence, in page order, each entry is either one of a business card's own links or a
 *   web page the overview holds without tying it to a sentence:
 *   1. call: a tel: link;
 *   2. directions: a Google Maps link (directions, place, maps.app.goo.gl, a Maps ID in it);
 *   3. photo / listing: Google's photo of the business (carries its Google ID), or its listing;
 *   4. website: a page carrying a Google ID, a link tagged as coming from a listing (utm_source=gbp,
 *      utm_campaign=gmb ...), the site of a business whose card links it that way, or a plain page
 *      right after a card's Directions or Call (the card's Website button);
 *   5. anything else: an unreferenced web source.
 *   A card is the run of links that belongs to one business: it starts at a Google ID other than
 *   the current card's, or at a link of a kind the current card already has. Every link of a card
 *   carries the card's position, Google ID, Maps ID, street address and coordinates, so a firm's
 *   photo, Directions and Website join into one row (entityRoster, v_aio_local_entity_roster).
 * Coordinates are only ever ones a link holds: null otherwise, never 0,0.
 */
import { cleanUrl, isGoogleKind, linkKind, mapsIdOf, placeOf, realAddress, registrableDomain, siteOf, utmParams, type AioDossier, type AioPoolRow, type FirstSeenPhase } from './aioSources';

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

export interface AioCaptureCounts {
  sentences_count: number;
  cited_web_pages_count: number;
  cited_gbp_listings_count: number;
  named_businesses_count: number;
  unreferenced_web_sources_count: number;
  card_action_links_count: number;
}

export interface AioCaptureResult {
  scan_point_id?: string | null;
  keyword: string;
  target_business_id?: string | null;
  target_domain?: string | null;
  map_pack_rank?: number | null;
  target_cited_in_aio: boolean;
  target_named_in_aio_cards: boolean;
  overview_mode: AioOverviewMode;
  overview_text: string | null;
  telemetry: AioWatcherTelemetry;
  counts: AioCaptureCounts;
  sentences: AioCaptureSentence[];
  sentence_citations: AioSentenceCitation[];
  unreferenced_web_sources: AioUnreferencedWebSource[];
  card_action_links: AioCardActionLink[];
  captured_at: string;
}

/** What the watcher itself knows; the read counts come from the merged reads. */
export type WatcherFacts = Omit<AioWatcherTelemetry, 'expanded_seen' | 'post_expand_added_sentences' | 'post_expand_added_entries'>;

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

const seen = (x: { phase?: FirstSeenPhase; firstSeenMs?: number; lastSeenMs?: number }): Seen => ({
  first_seen_phase: x.phase ?? 'initial',
  first_seen_elapsed_ms: Math.round(x.firstSeenMs ?? 0),
  last_seen_elapsed_ms: Math.round(x.lastSeenMs ?? x.firstSeenMs ?? 0),
});

const ACTION: Record<string, AioCardActionType> = { card_photo: 'photo', card_directions: 'directions', card_call: 'call', card_website: 'website', listing: 'listing' };

export function buildAioCapture(
  d: AioDossier,
  opts: {
    keyword: string;
    targetDomain?: string | null;
    targetBusinessId?: string | null;
    mapPackRank?: number | null;
    /** Business names by Google ID (from the copied answer, which links each business it names). */
    names?: Map<string, string>;
    telemetry: WatcherFacts;
    scanPointId?: string | null;
    capturedAt?: string;
  },
): AioCaptureResult {
  const names = opts.names ?? new Map<string, string>();
  // And the other way: a listing cited by name only gets its Google ID from the names the answer links.
  const idByName = new Map([...names.entries()].map(([id, name]) => [name.toLowerCase().trim(), id]));
  const rows = d.pool?.entries ?? [];
  const promoted = new Set(rows.filter((r) => r.promotedAfterExpand).map((r) => r.mid || mapsIdOf(r.url) || cleanUrl(r.url)).filter(Boolean));

  const sentences: AioCaptureSentence[] = d.clusters.map((c) => ({ sentence_index: c.clusterIndex, sentence_text: c.claimText, sentence_hash: sentenceHash(c.claimText), ...seen(c) }));

  const sentence_citations: AioSentenceCitation[] = [];
  for (const c of d.clusters) {
    let position = 0;
    for (const e of c.candidatePool) {
      const x = e.extracted;
      if (!x || (!x.url && !x.mid && !x.domain)) continue;
      const raw = x.url ?? (x.mid ? 'https://www.google.com/search?kgmid=' + encodeURIComponent(x.mid) : 'https://' + x.domain);
      const kind = linkKind(raw, x.mid);
      const google = isGoogleKind(kind);
      const clean = cleanUrl(raw) ?? raw;
      const business_id = x.mid ?? (google && x.title ? (idByName.get(x.title.toLowerCase().trim()) ?? null) : null);
      sentence_citations.push({
        sentence_index: c.clusterIndex,
        citation_position: ++position,
        target_type: google ? 'gbp_listing' : 'external_web',
        raw_url: raw,
        clean_url: clean,
        registrable_domain: registrableDomain(realAddress(raw) ?? x.domain),
        page_title: x.title,
        business_name: google ? (business_id && names.get(business_id)) || x.title || null : null,
        business_id,
        maps_id: mapsIdOf(raw),
        utm_params: utmParams(raw) as UtmParams | null,
        promoted_after_expand: promoted.has(business_id || mapsIdOf(raw) || clean),
        ...seen(e),
      });
    }
  }

  // Under no sentence, in page order: card links (grouped into cards) or unreferenced web sources.
  const loose = rows.filter((r) => r.inAio > 0 && r.sentences.length === 0).sort((a, b) => a.order - b.order);
  const kinds = loose.map((r) => linkKind(r.url, r.mid));
  const cardSites = new Set(loose.filter((_, i) => kinds[i] === 'card_website').map((r) => registrableDomain(r.url)).filter((s): s is string => Boolean(s)));
  type Card = { position: number; id: string | null; has: Set<AioCardActionType>; links: { r: AioPoolRow; action: AioCardActionType }[] };
  const cards: Card[] = [];
  const unreferenced: AioPoolRow[] = [];
  let cur: Card | null = null;
  let prevKind: string | null = null;
  for (const [i, r] of loose.entries()) {
    let kind = kinds[i];
    if (kind === 'web') {
      const site = registrableDomain(r.url);
      const followsAction = cur && !cur.has.has('website') && (prevKind === 'card_directions' || prevKind === 'card_call');
      if (followsAction || (site && cardSites.has(site))) kind = 'card_website';
    }
    prevKind = kind;
    if (kind === 'web') {
      unreferenced.push(r);
      cur = null;
      continue;
    }
    const action = ACTION[kind];
    const otherBusiness = Boolean(cur && r.mid && cur.id && r.mid !== cur.id);
    const repeat = Boolean(cur && cur.has.has(action) && !(r.mid && r.mid === cur.id));
    if (!cur || otherBusiness || repeat) {
      cur = { position: cards.length + 1, id: null, has: new Set(), links: [] };
      cards.push(cur);
    }
    cur.links.push({ r, action });
    cur.has.add(action);
    if (r.mid && !cur.id) cur.id = r.mid;
  }

  const card_action_links: AioCardActionLink[] = cards.flatMap((card) => {
    const places = card.links.map((l) => placeOf(l.r.url)).filter(Boolean);
    const maps_id = card.links.map((l) => mapsIdOf(l.r.url)).find(Boolean) ?? null;
    const street_address = places.map((p) => p!.address).find(Boolean) ?? null;
    const rowCoords = card.links.map((l) => l.r.coords).find((c) => c && !(c.lat === 0 && c.lng === 0));
    const coordinates = rowCoords ? { lat: rowCoords.lat, lng: rowCoords.lng } : (places.map((p) => p!.coords).find(Boolean) ?? null);
    const name = (card.id && names.get(card.id)) || card.links.find((l) => l.action === 'listing' && l.r.title)?.r.title || null;
    return card.links.map(({ r, action }) => ({
      card_position: card.position,
      action_type: action,
      business_name: name,
      business_id: card.id,
      maps_id,
      street_address,
      coordinates,
      raw_url: r.url,
      clean_url: cleanUrl(r.url),
      registrable_domain: registrableDomain(realAddress(r.url) ?? r.domain),
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
        registrable_domain: registrableDomain(realAddress(raw) ?? r.domain) ?? siteOf(raw) ?? raw,
        page_title: r.title,
        utm_params: utmParams(raw) as UtmParams | null,
        ...seen(r),
      };
    });

  const web = sentence_citations.filter((c) => c.target_type === 'external_web');
  const gbp = sentence_citations.filter((c) => c.target_type === 'gbp_listing');
  const businesses = new Set([...card_action_links.map((l) => l.business_id ?? (l.card_position !== null ? 'card:' + l.card_position : null)), ...gbp.map((c) => c.business_id ?? c.business_name?.toLowerCase() ?? null)].filter(Boolean));
  const counts: AioCaptureCounts = {
    sentences_count: sentences.length,
    cited_web_pages_count: new Set(web.map((c) => c.clean_url)).size,
    cited_gbp_listings_count: new Set(gbp.map((c) => c.business_id || c.maps_id || c.clean_url)).size,
    named_businesses_count: businesses.size,
    unreferenced_web_sources_count: unreferenced_web_sources.length,
    card_action_links_count: card_action_links.length,
  };
  // Business cards and the web pages the sentences cite: mostly cards (local), mostly pages (web), or as many of each (hybrid).
  const cardCount = cards.length || counts.cited_gbp_listings_count;
  const overview_mode: AioOverviewMode = cardCount && counts.cited_web_pages_count >= cardCount ? 'hybrid' : cardCount ? 'local_entity_cards' : counts.cited_web_pages_count || unreferenced_web_sources.length ? 'web_synthesis' : sentences.length ? 'web_synthesis' : 'empty';

  const targetSite = registrableDomain(opts.targetDomain);
  const stats = d.meta.stats;
  return {
    scan_point_id: opts.scanPointId ?? null,
    keyword: opts.keyword,
    target_business_id: opts.targetBusinessId ?? null,
    target_domain: opts.targetDomain ?? null,
    map_pack_rank: opts.mapPackRank ?? null,
    target_cited_in_aio: Boolean(targetSite && web.some((c) => c.registrable_domain === targetSite)),
    target_named_in_aio_cards: Boolean(opts.targetBusinessId && (card_action_links.some((l) => l.business_id === opts.targetBusinessId) || gbp.some((c) => c.business_id === opts.targetBusinessId))),
    overview_mode,
    overview_text: sentences.length ? sentences.map((s) => s.sentence_text).join(' ') : null,
    telemetry: {
      ...opts.telemetry,
      expanded_seen: stats?.expandedSeen ?? false,
      post_expand_added_sentences: stats?.postExpandAddedSentences ?? 0,
      post_expand_added_entries: stats?.postExpandAddedEntries ?? 0,
    },
    counts,
    sentences,
    sentence_citations,
    unreferenced_web_sources,
    card_action_links,
    captured_at: opts.capturedAt ?? new Date().toISOString(),
  };
}

/** One row per business card, its links joined (as v_aio_local_entity_roster). */
export function entityRoster(c: AioCaptureResult) {
  const byCard = new Map<number, AioCardActionLink[]>();
  for (const l of c.card_action_links) if (l.card_position !== null) byCard.set(l.card_position, [...(byCard.get(l.card_position) ?? []), l]);
  return [...byCard.entries()].map(([card_position, links]) => {
    const site = links.find((l) => l.action_type === 'website');
    return {
      card_position,
      business_name: links.find((l) => l.business_name)?.business_name ?? null,
      business_id: links.find((l) => l.business_id)?.business_id ?? null,
      maps_id: links.find((l) => l.maps_id)?.maps_id ?? null,
      street_address: links.find((l) => l.street_address)?.street_address ?? null,
      coordinates: links.find((l) => l.coordinates)?.coordinates ?? null,
      gbp_website_clean_url: site?.clean_url ?? null,
      gbp_website_domain: site?.registrable_domain ?? null,
      utm_source: (site?.utm_params?.utm_source as string | undefined) ?? null,
      utm_medium: (site?.utm_params?.utm_medium as string | undefined) ?? null,
      utm_campaign: (site?.utm_params?.utm_campaign as string | undefined) ?? null,
      hydrated_after_expand: links.some((l) => l.first_seen_phase === 'post_expand'),
    };
  });
}

/** What the point keeps on itself (the full capture goes to storage): counts, telemetry, the firms, the other pages. */
export function captureDigest(c: AioCaptureResult) {
  const cited = new Map<string, number>();
  for (const s of c.sentence_citations) if (s.target_type === 'external_web' && s.registrable_domain) cited.set(s.registrable_domain, (cited.get(s.registrable_domain) ?? 0) + 1);
  return {
    capture_version: c.telemetry.capture_version,
    overview_mode: c.overview_mode,
    target_cited_in_aio: c.target_cited_in_aio,
    target_named_in_aio_cards: c.target_named_in_aio_cards,
    map_pack_rank: c.map_pack_rank ?? null,
    telemetry: c.telemetry,
    counts: c.counts,
    cited_sites: [...cited.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([site, n]) => ({ site, citations: n })),
    roster: entityRoster(c).slice(0, 15),
    unreferenced_web_sources: c.unreferenced_web_sources.slice(0, 12).map((u) => ({ domain: u.registrable_domain, url: u.clean_url.slice(0, 200), title: u.page_title, phase: u.first_seen_phase })),
    promoted_after_expand: c.sentence_citations.filter((s) => s.promoted_after_expand).length,
  };
}
