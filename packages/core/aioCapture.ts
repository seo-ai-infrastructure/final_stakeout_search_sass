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
 * Businesses are one record per Google listing (its business ID), or per website for a business the
 * answer names without a Google link. What counts is where each match occurs (v282):
 * - featured, with its placement: its card (card #N, and whether only after "Show more"), or a
 *   sentence that recommends it by Google's link on its name ("Local Tulsa options include Top Dollar
 *   Home Offer"). A linked name in a sentence that points elsewhere ("browse … directories … through
 *   Super Lawyers, Biby Law Firm …") is named, not featured;
 * - Google listing cited as a source: its ID in a numbered citation (the chip under a sentence). On
 *   2026-11-21 every lawyer card's chip carried Jeff Martin's ID: one source, eleven links;
 * - website cited: verified when the site is the one its card's Website button opens (or the tracked
 *   business's saved website); unverified when the cited site only fits its name;
 * - named in the answer's words: its name, or its site's name, linked or not (ASH LAW).
 * Two listings on one website stay two, and a name sharing a sentence with a site does not make that
 * site its own: "Biby Law Firm" in a closing line was another Biby listing (/g/11lrpbxs5b) than Biby's
 * card (/g/11f5mhtzdr). Who the tracked business is (saved ID, saved website, or exact name) is kept
 * apart from where Google put it. Every match keeps its receipt (card, text, citation, sources row,
 * ad). A page with an AI Overview on screen that could not be read is "unparsed", never a row of zeros.
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
import { knownSite } from './citeSites';
import type { AiEvidence, AiPresenceData } from './aiFlags';

export type AioOverviewMode = 'web_synthesis' | 'local_entity_cards' | 'hybrid' | 'empty';
/** not_watched: no page read was made (customer points read Google's copied answer alone). */
export type AioWatcherStopReason = 'template_finished' | 'hard_timeout' | 'not_watched';
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

/**
 * Where a business was matched: its card; Google's link on its name in a sentence that recommends it
 * (inline_link) or one that only points elsewhere, "browse … directories … through …"
 * (inline_mention); its name in the words; its listing cited as a source; its website cited
 * (verified: the site its card's Website button opens, or the tracked business's saved website;
 * unverified: a site that only fits its name); the sources row; an ad.
 */
export type AioMatchRole = 'card' | 'inline_link' | 'inline_mention' | 'prose_name' | 'listing_citation' | 'website_citation' | 'website_citation_unverified' | 'sources_row' | 'ad';

/** Where Google featured a business: its card (and whether it was on screen before "Show more"), or a sentence recommending it by a linked name. */
export type AioPlacement = { kind: 'card'; card_position: number; /** How many business cards the overview held. */ card_count: number; after_expansion: boolean | null } | { kind: 'inline'; sentence_index: number };

/** The receipt of one match: what was matched, where, and by what (an ID, an address, words). */
export interface AioReceipt {
  role: AioMatchRole;
  sentence_index: number | null;
  card_position: number | null;
  business_id: string | null;
  url: string | null;
  text: string | null;
}

/**
 * One business: a Google listing (by its business ID), or a business the answer names without a
 * Google link (by its website). Listings that share a website stay apart (same_website_as).
 */
export interface AioBusiness {
  /** Its Google business ID, or "site:<domain>". */
  business_key: string;
  business_id: string | null;
  /** Its website, verified: the site its card's Website button opens (a business known by its site: that site). */
  domain: string | null;
  /** A cited site that only fits its name ("Top Dollar Home Offer", topdollarhomeoffer.com): not verified. */
  probable_domain: string | null;
  business_name: string | null;
  kind: 'listing' | 'site';
  /** Its business card in the answer (1-based), or null. */
  card_position: number | null;
  /** Featured: its card, or a sentence recommending it by a linked name. */
  featured: boolean;
  featured_placement: AioPlacement | null;
  /** Sentences whose text links its listing (Google's link on its name), and those of them that recommend it. */
  linked_in_sentences: number[];
  recommended_in_sentences: number[];
  /** Sentences whose words name it (or its site), linked or not. */
  named_in_sentences: number[];
  /** Sentences with a numbered citation carrying its Google business ID (a Google listing cited as a source), and how many such links. */
  listing_cited_in_sentences: number[];
  listing_cited_links: number;
  /** Sentences citing a page on its verified website, and on a site that only fits its name. */
  website_cited_in_sentences: number[];
  website_cited_unverified_in_sentences: number[];
  /** Its first listing card in the sources row under the answer (1-based), or null. */
  sources_row_position: number | null;
  /** In the Sponsored block inside the AI Overview. */
  advertised: boolean;
  /** Shown in the answer: featured, or named in its words. */
  in_answer: boolean;
  /** Other listings on this page with the same verified website: the same firm, perhaps, but no branch is credited for another. */
  same_website_as: string[];
  receipts: AioReceipt[];
}

/** A page a sentence cites, by its website: the business(es) whose verified website it is, and those it only fits by name. */
export interface AioSiteCitation {
  sentence_index: number;
  registrable_domain: string;
  url: string;
  credited_to: string[];
  unverified_to: string[];
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
  /** Different websites cited. */
  websites_cited_count: number;
  /** Different Google listings referenced in numbered citations. */
  cited_gbp_listings_count: number;
  card_businesses_count: number;
  /** Listings featured: cards, and names Google links in the text. */
  featured_businesses_count: number;
  /** Businesses in the answer: featured, or named in its words without a link. */
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
  target_name?: string | null;
  map_pack_rank?: number | null;
  /** parsed; unparsed (an AI Overview on screen that could not be read: its flags are null, not false); no_overview. */
  capture_status: 'parsed' | 'unparsed' | 'no_overview';
  /**
   * How surely the tracked business is the one found (apart from where it was found): listing (its
   * saved Google business ID); website (its saved website, the only business here with it);
   * website_shared (several listings use that website: none credited); name (its exact name, no ID
   * saved: unverified; the ID Google links under that name is in target_suggested_id); null.
   */
  target_identity: 'listing' | 'website' | 'website_shared' | 'name' | null;
  /** Featured in the AI Overview: its card, or a sentence recommending it by a linked name. */
  target_featured_in_aio: boolean | null;
  /** Where: card #N (and whether only after "Show more"), or the recommending sentence. */
  target_featured_placement: AioPlacement | null;
  /** Its Google listing cited as a source (its ID in a numbered citation); the links are in the receipts. */
  target_listing_cited_as_source: boolean | null;
  /** Its website cited: verified (its saved website, or its card's), unverified (a site that only fits its name), or false. */
  target_website_cited: 'verified' | 'unverified' | false | null;
  /** Named in the answer's words (its exact name, or its site's name), with or without a link. */
  target_named_in_prose: boolean | null;
  target_in_sources_row: boolean | null;
  target_advertised: boolean | null;
  /** Website cited (verified or not) or listing cited as a source. */
  target_cited_in_aio: boolean | null;
  /** Featured or named in the answer's words. */
  target_named_in_aio: boolean | null;
  target_named_in_aio_cards: boolean | null;
  target_named_in_aio_text: boolean | null;
  /** Every match of the tracked business, with where it occurred. */
  target_receipts: AioReceipt[];
  /** The ID the answer links under the tracked business's exact name, when no ID is saved for it. */
  target_suggested_id: string | null;
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
  /** Sites a sentence names in its words and cites (Super Lawyers, ASH LAW, Opendoor ...). */
  named_sites: { sentence_index: number; registrable_domain: string }[];
  /** Every web page cited, by website, with the business(es) credited (none when several listings share the website). */
  site_citations: AioSiteCitation[];
  captured_at: string;
}

/** The capture rules' version, written on every capture (a point is replayed when its capture is older). */
export const AIO_CAPTURE_VERSION = 'v284';

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

/** The words of a sentence that name the site: "Super Lawyers" for superlawyers.com, "ASH LAW" for ash.law, "Reddit" in "Reddit's". */
function namedSite(text: string, domain: string): string | null {
  const label = labelOf(domain);
  if (label.length < 3) return null;
  const words = text.replace(/['’]s\b/g, '').split(/[^A-Za-z0-9&]+/).filter(Boolean);
  // A site whose ending is part of its name ("ASH LAW" for ash.law) keeps that word.
  const ending = domain.split('.').pop()!.toLowerCase();
  for (let i = 0; i < words.length; i++) {
    let acc = '';
    for (let j = i; j < Math.min(words.length, i + 6); j++) {
      acc += words[j].toLowerCase().replace(/&/g, '');
      if (acc === label) {
        const withEnding = words[j + 1]?.toLowerCase() === ending && !/^(com|net|org|co|us|io|info|biz)$/.test(ending);
        return words.slice(i, withEnding ? j + 2 : j + 1).join(' ');
      }
      if (!label.startsWith(acc)) break;
    }
  }
  return null;
}

/** A business's exact name among a sentence's words (case, punctuation and "&"/"and" aside). */
const flatWords = (s: string) => ' ' + s.toLowerCase().replace(/&/g, ' and ').replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const hasName = (text: string, name: string) => {
  const n = flatWords(name).trim();
  return n.length >= 4 && flatWords(text).includes(' ' + n + ' ');
};
/** The page's text of a card's own description begins with the card's button labels ("CallDirectionsWebsite…"). */
const buttonsFirst = (t: string) => /^(?:Call|Directions|Website|Menu|Order|Book|Reserve|Appointment){2,}/.test(t.replace(/\s+/g, ''));
const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
/**
 * A sentence that points elsewhere for more ("You can also browse additional attorney directories
 * and firm details through Super Lawyers, Biby Law Firm, and ASH LAW"): a business it links is
 * mentioned there, not recommended.
 */
const POINTER = /\b(browse|director(?:y|ies)|resources?|learn more|find more|more (?:information|details)|firm details)\b/i;
/** A card's name as the phone's screen shows it ("Richardson Richardson Boudreaux Injury and…") against its full name. */
const sameCardName = (screen: string, name: string) => {
  const truncated = /(…|\.\.\.)\s*$/.test(screen);
  const a = flatWords(screen.replace(/(…|\.\.\.)\s*$/, '')).trim();
  const b = flatWords(name).trim();
  return a.length >= 4 && (a === b || (truncated && b.startsWith(a)));
};

type CopySentence = { text: string; urls: string[]; mentions: { name: string | null; id: string }[]; /** The copy's card (1-based) this is the description of: the first citing line under its name. */ card: number | null };
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
  // The card whose description is still to come: the first citing line under a card's name.
  let open: number | null = null;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // The ads come after the answer, the word glued to the next ("SponsoredYou might consider…").
    if (ads || /^Sponsored(?![a-z])/.test(line)) {
      ads = true;
      const rest = line.replace(/^Sponsored/, '').trim();
      if (rest) sponsored.push(rest);
      continue;
    }
    const card = line.startsWith('•') ? null : CARD_LINE.exec(line);
    if (card && !/\[\d+\] \(/.test(line)) {
      cards.push({ pos: cards.length + 1, name: card[1].trim(), id: decodeURIComponent(card[3]) });
      open = cards.length;
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
    sentences.push({ text: words, urls, mentions, card: open });
    open = null;
  }
  return { cards, sentences, sponsored };
}

export function buildAioCapture(
  d: AioDossier,
  opts: {
    keyword: string;
    targetDomain?: string | null;
    targetBusinessId?: string | null;
    /** The tracked business's name, matched exactly in the answer's words. */
    targetName?: string | null;
    mapPackRank?: number | null;
    /** Google's copied answer (the copy button's text), when the template copied it. */
    copy?: string | null;
    /**
     * The words of this run's own AI Overview snapshots (their labels). Without a page read, the copy
     * is used only when it is this page's answer: a card's name or the start of a sentence is there.
     */
    copyCheck?: string[] | null;
    /** Whether the phone's screen showed an AI Overview: one that could not be read is "unparsed", not zeros. */
    overviewOnScreen?: boolean | null;
    /** The business cards on the phone's screen before "Show more" (their names): a card not among them was featured only after expansion. */
    shownBeforeExpansion?: string[] | null;
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
  // No page read: the copy against the run's own snapshots (a stale clipboard holds another answer).
  const hay = opts.copyCheck?.length ? letters(opts.copyCheck.join(' ')) : '';
  const onScreen = Boolean(
    copied &&
      hay &&
      (copied.cards.some((c) => letters(c.name).length >= 6 && hay.includes(letters(c.name))) ||
        copied.sentences.some((x) => {
          const k = letters(x.text).slice(0, 40);
          return k.length >= 24 && hay.includes(k);
        })),
  );
  const copyUsed = Boolean(
    copied &&
      copied.sentences.length > 0 &&
      (clusters.length > 0 ? matched >= Math.ceil(copied.sentences.length / 2) : copied.cards.some((c) => pageIds.has(c.id)) || onScreen),
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
  type Sent = { index: number; text: string; cluster: number | null; urls: string[] | null; mentions: CopySentence['mentions']; card: number | null };
  const sents: Sent[] = [];
  if (copyUsed) {
    copied!.sentences.forEach((s, i) => sents.push({ index: sents.length + 1, text: s.text, cluster: copyToCluster[i], urls: s.urls, mentions: s.mentions, card: s.card }));
    clusters.forEach((c, j) => {
      if (!usedCluster.has(j)) sents.push({ index: sents.length + 1, text: c.claimText, cluster: j, urls: null, mentions: [], card: null });
    });
  } else clusters.forEach((c, j) => sents.push({ index: sents.length + 1, text: c.claimText, cluster: j, urls: null, mentions: [], card: null }));
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

  // ---- Which sentence is a card's own description: the copy says (the first citing line under a
  // card's name), unless the page's text of it shows it is not under a card's buttons; without the
  // copy, the page's sentences that start with a card's buttons, in card order.
  const keyOfCard = (c: Card) => c.id ?? (cardSite(c) ? 'site:' + cardSite(c) : null);
  const sentCard = new Map<number, string>();
  if (copyUsed) {
    for (const s of sents) {
      if (!s.card || (s.cluster !== null && !buttonsFirst(clusters[s.cluster].claimText))) continue;
      const id = copied!.cards[s.card - 1]?.id;
      if (id) sentCard.set(s.index, id);
    }
  } else {
    let k = 0;
    for (const s of sents) {
      if (s.cluster === null || !buttonsFirst(clusters[s.cluster].claimText)) continue;
      const c = known[k++];
      const key = c ? keyOfCard(c) : null;
      if (key) sentCard.set(s.index, key);
    }
  }

  // ---- Businesses: one record per Google listing, or per website for a business named without a
  // Google link. A listing's website is verified only by its card's Website button (or, for the
  // tracked business, its saved website): a cited site that merely fits its name is "unverified",
  // and a site that is another listing's verified website is never given to a second one.
  type Rec = {
    key: string;
    id: string | null;
    domain: string | null;
    probable: string | null;
    name: string | null;
    kind: 'listing' | 'site';
    card: number | null;
    afterExpansion: boolean | null;
    linked: Set<number>;
    recommended: Set<number>;
    named: Set<number>;
    listing: Set<number>;
    listingLinks: number;
    website: Set<number>;
    websiteUnverified: Set<number>;
    sources: number | null;
    ad: boolean;
    receipts: AioReceipt[];
  };
  const recs = new Map<string, Rec>();
  const make = (key: string, id: string | null, kind: Rec['kind'], domain: string | null = null): Rec => {
    let r = recs.get(key);
    if (!r) {
      r = { key, id, domain, probable: null, name: null, kind, card: null, afterExpansion: null, linked: new Set(), recommended: new Set(), named: new Set(), listing: new Set(), listingLinks: 0, website: new Set(), websiteUnverified: new Set(), sources: null, ad: false, receipts: [] };
      recs.set(key, r);
    }
    return r;
  };
  const byDomain = (dd: string) => [...recs.values()].filter((r) => r.domain === dd);
  const byProbable = (dd: string) => [...recs.values()].filter((r) => !r.domain && r.probable === dd);
  const receipt = (r: Rec, x: Partial<AioReceipt> & { role: AioMatchRole }) => r.receipts.push({ sentence_index: null, card_position: null, business_id: r.id, url: null, text: null, ...x });
  // On the phone's screen before "Show more": unknown without the first screen's snapshot.
  const before = opts.shownBeforeExpansion ?? null;
  const expandedOnly = (name: string | null) => (before && name ? !before.some((s) => sameCardName(s, name)) : null);

  // Cards: featured, in their order (the page's; the copy's when the page read missed one).
  for (const c of known) {
    const site = cardSite(c);
    const r = c.id ? make(c.id, c.id, 'listing') : make('site:' + site, null, 'listing', site);
    r.card ??= c.position;
    r.domain ??= site;
    r.name ??= (c.id && names.get(c.id)) || null;
    r.afterExpansion = expandedOnly(r.name);
    receipt(r, { role: 'card', card_position: c.position, url: c.links.find((l) => l.action === 'website')?.r.url ?? null, text: r.name });
  }
  if (copyUsed)
    for (const c of copied!.cards) {
      const r = make(c.id, c.id, 'listing');
      r.name ??= c.name;
      if (r.card === null) {
        r.card = c.pos;
        r.afterExpansion = expandedOnly(r.name);
        receipt(r, { role: 'card', card_position: c.pos, text: c.name });
      }
    }
  // A card whose Website button was not read (no page read): the site its own description cites,
  // when it fits its name, is its probable website (unverified).
  for (const [si, key] of sentCard) {
    const r = recs.get(key);
    if (!r || r.domain || r.probable || !r.name) continue;
    r.probable = webCites.filter((c) => c.sentence_index === si).map((c) => c.registrable_domain).find((dd) => dd && nameFitsDomain(r.name!, dd)) ?? null;
  }
  // Names Google links in the text: recommended where the sentence recommends; only mentioned where
  // it points elsewhere for more. A site the same sentence cites under the name is its probable website.
  for (const s of sents)
    for (const m of s.mentions) {
      const r = make(m.id, m.id, 'listing');
      r.name ??= m.name;
      r.linked.add(s.index);
      r.named.add(s.index);
      const pointer = POINTER.test(s.text);
      if (!pointer) r.recommended.add(s.index);
      r.probable ??= (s.urls ?? []).map(domainOf).find((dd) => dd && m.name && nameFitsDomain(m.name, dd)) ?? null;
      receipt(r, { role: pointer ? 'inline_mention' : 'inline_link', sentence_index: s.index, text: m.name });
    }
  // A numbered citation carrying a business's ID: its Google listing cited as a source.
  for (const c of listingCites) {
    if (!c.business_id) continue;
    const r = make(c.business_id, c.business_id, 'listing');
    r.name ??= names.get(c.business_id) ?? null;
    r.listing.add(c.sentence_index);
    r.listingLinks++;
    receipt(r, { role: 'listing_citation', sentence_index: c.sentence_index, url: c.raw_url });
  }
  // A site the sentence names in its words and cites: the business it names (ASH LAW, Opendoor) —
  // unless the sentence links a listing on it or is its card's own, or the site is a directory,
  // review or community site (Super Lawyers, Reddit): a source, not a business.
  const named_sites: AioCaptureResult['named_sites'] = [];
  for (const s of sents) {
    const doms = [...new Set(webCites.filter((c) => c.sentence_index === s.index).map((c) => c.registrable_domain).filter(Boolean) as string[])];
    for (const dd of doms) {
      const words = namedSite(s.text, dd);
      if (!words) continue;
      named_sites.push({ sentence_index: s.index, registrable_domain: dd });
      const owners = [...byDomain(dd), ...byProbable(dd)];
      if (owners.some((o) => o.linked.has(s.index) || sentCard.get(s.index) === o.key)) continue;
      if (!owners.length && knownSite(dd)) continue;
      // Several businesses on that website: which one the words mean is not known.
      const r = owners.length === 1 ? owners[0] : owners.length === 0 ? make('site:' + dd, null, 'site', dd) : null;
      if (!r) continue;
      r.name ??= words;
      r.named.add(s.index);
      receipt(r, { role: 'prose_name', sentence_index: s.index, text: words });
    }
  }
  // A listing's exact name in a sentence's words, without a link (and not its own card's sentence).
  for (const r of recs.values()) {
    if (r.kind !== 'listing' || !r.name) continue;
    for (const s of sents) {
      if (r.named.has(s.index) || sentCard.get(s.index) === r.key || !hasName(s.text, r.name)) continue;
      r.named.add(s.index);
      receipt(r, { role: 'prose_name', sentence_index: s.index, text: r.name });
    }
  }
  // A cited page credits its website's business(es): the listing(s) whose card opens that website (in
  // any sentence: the website was cited); else, unverified, a business whose name it only fits.
  const site_citations: AioSiteCitation[] = [];
  for (const c of webCites) {
    const dd = c.registrable_domain;
    if (!dd) continue;
    const verified = byDomain(dd);
    let unverified = verified.length ? [] : byProbable(dd);
    // A card's own description citing the site that fits it: that card's, not every listing the site fits.
    const own = sentCard.get(c.sentence_index);
    if (own && unverified.some((r) => r.key === own)) unverified = unverified.filter((r) => r.key === own);
    for (const r of verified) {
      r.website.add(c.sentence_index);
      receipt(r, { role: 'website_citation', sentence_index: c.sentence_index, url: c.raw_url });
    }
    for (const r of unverified) {
      r.websiteUnverified.add(c.sentence_index);
      receipt(r, { role: 'website_citation_unverified', sentence_index: c.sentence_index, url: c.raw_url });
    }
    site_citations.push({ sentence_index: c.sentence_index, registrable_domain: dd, url: c.clean_url, credited_to: verified.map((r) => r.key), unverified_to: unverified.map((r) => r.key) });
  }
  // The sources row: every source viewer link in the overview, by the business ID it carries, in page order.
  const listing_sources: AioListingSource[] = [];
  for (const row of [...rows].sort((a, b) => a.order - b.order)) {
    if (!isSourceViewer(row.url)) continue;
    const id = googleIdOfLink(row.url);
    if (!id || listing_sources.some((l) => l.business_id === id)) continue;
    const r = make(id, id, 'listing');
    r.name ??= names.get(id) ?? null;
    r.sources ??= listing_sources.length + 1;
    receipt(r, { role: 'sources_row', text: String(listing_sources.length + 1) });
    listing_sources.push({ position: listing_sources.length + 1, business_id: id, business_key: id, in_answer: false, ...seen(row) });
  }
  // Ads, by where they sit (the Sponsored block): the business(es) on the ad's website, or the
  // advertiser on its own. A business with its own card keeps it (Richardson: card and ad).
  const adName = (dd: string) =>
    adLines.find((l) => {
      const w = letters(l.split(/\s+/)[0] ?? '');
      return w.length >= 6 && labelOf(dd).startsWith(w);
    }) ?? null;
  const ads: AioAd[] = adRows.map((row, i) => {
    const dd = domainOf(row.url ?? row.domain);
    let owners = dd ? byDomain(dd) : [];
    if (!owners.length && dd) {
      const r = make('site:' + dd, null, 'site', dd);
      r.name ??= adName(dd);
      owners = [r];
    }
    for (const r of owners) {
      r.ad = true;
      receipt(r, { role: 'ad', url: row.url });
    }
    return { position: i + 1, raw_url: row.url, registrable_domain: dd, business_key: owners.length === 1 ? owners[0].key : null, ...seen(row) };
  });

  // No page read: the ads' rows are unknown, but the Sponsored block names its advertisers. A line
  // that is exactly a business's name marks it advertised (its card, if any, is kept).
  if (!rows.length && adLines.length)
    for (const r of recs.values()) {
      if (!r.name || r.ad || !adLines.some((l) => flatWords(l) === flatWords(r.name!))) continue;
      r.ad = true;
      receipt(r, { role: 'ad', text: r.name });
      ads.push({ position: ads.length + 1, raw_url: null, registrable_domain: r.domain ?? r.probable, business_key: r.key, ...seen(null) });
    }
  const cardTotal = [...recs.values()].filter((r) => r.card !== null).length;
  const placementOf = (r: Rec): AioPlacement | null =>
    r.card !== null ? { kind: 'card', card_position: r.card, card_count: cardTotal, after_expansion: r.afterExpansion } : r.recommended.size ? { kind: 'inline', sentence_index: Math.min(...r.recommended) } : null;
  const businesses: AioBusiness[] = [...recs.values()].map((r) => ({
    business_key: r.key,
    business_id: r.id,
    domain: r.domain,
    probable_domain: r.domain ? null : r.probable,
    business_name: r.name ?? (r.id ? (names.get(r.id) ?? null) : null),
    kind: r.kind,
    card_position: r.card,
    featured: placementOf(r) !== null,
    featured_placement: placementOf(r),
    linked_in_sentences: sorted(r.linked),
    recommended_in_sentences: sorted(r.recommended),
    named_in_sentences: sorted(r.named),
    listing_cited_in_sentences: sorted(r.listing),
    listing_cited_links: r.listingLinks,
    website_cited_in_sentences: sorted(r.website),
    website_cited_unverified_in_sentences: sorted(r.websiteUnverified),
    sources_row_position: r.sources,
    advertised: r.ad,
    in_answer: placementOf(r) !== null || r.named.size > 0,
    same_website_as: r.domain && r.id ? byDomain(r.domain).filter((o) => o !== r && o.id).map((o) => o.key) : [],
    receipts: r.receipts,
  }));
  for (const l of listing_sources) l.in_answer = Boolean(businesses.find((b) => b.business_key === l.business_key)?.in_answer);

  const counts: AioCaptureCounts = {
    sentences_count: sentences.length,
    cited_web_pages_count: citedUrls.size,
    websites_cited_count: citedDomains.size,
    cited_gbp_listings_count: new Set(listingCites.map((c) => c.business_id || c.maps_id || c.clean_url)).size,
    card_businesses_count: businesses.filter((b) => b.card_position !== null).length,
    featured_businesses_count: businesses.filter((b) => b.featured).length,
    named_businesses_count: businesses.filter((b) => b.in_answer).length,
    unreferenced_web_sources_count: unreferenced_web_sources.length,
    card_action_links_count: card_action_links.length,
    sources_row_listings_count: listing_sources.length,
    sources_only_businesses_count: businesses.filter((b) => b.sources_row_position !== null && !b.in_answer).length,
    ads_count: ads.length,
  };
  // Business cards against the web pages the sentences cite: mostly cards (local), mostly pages (web), or as many of each (hybrid).
  const cardCount = counts.card_businesses_count;
  const overview_mode: AioOverviewMode = cardCount && counts.cited_web_pages_count >= cardCount ? 'hybrid' : cardCount ? 'local_entity_cards' : counts.cited_web_pages_count || sentences.length ? 'web_synthesis' : 'empty';
  // Nothing read although the screen showed an AI Overview: unknown, not "absent".
  const capture_status: AioCaptureResult['capture_status'] = sentences.length || cardCount ? 'parsed' : opts.overviewOnScreen === false ? 'no_overview' : 'unparsed';

  // ---- The tracked business. Who it is (by its saved Google ID; else its saved website, when one
  // business here has it; else, with no ID saved, its exact name) is apart from where Google put it:
  // a name match finds the same card or recommendation, only less surely.
  const tId = opts.targetBusinessId || null;
  const tSite = registrableDomain(opts.targetDomain);
  const tName = opts.targetName?.trim() || null;
  let t = tId ? (recs.get(tId) ?? null) : null;
  let identity: AioCaptureResult['target_identity'] = t ? 'listing' : null;
  if (!t && tSite) {
    // The business whose card opens that website; else one whose name fits it. Once an ID is saved,
    // only a business without one can be it by its website (another branch is not).
    const pick = (list: Rec[]) => list.filter((o) => !tId || !o.id);
    const verifiedOwners = pick(byDomain(tSite));
    const owners = verifiedOwners.length ? verifiedOwners : pick(byProbable(tSite));
    if (owners.length === 1) {
      t = owners[0];
      identity = 'website';
    } else if (owners.length > 1) identity = 'website_shared';
  }
  let suggested: string | null = null;
  if (!t && !identity && !tId && tName) {
    const same = [...recs.values()].find((r) => r.name && flatWords(r.name) === flatWords(tName));
    if (same) {
      t = same;
      identity = 'name';
      suggested = same.id;
    }
  }
  const proseHit = tName ? sents.filter((s) => hasName(s.text, tName)) : [];
  const placement = t ? placementOf(t) : null;
  // Its website is verified when its saved website is cited, or a site its own card opens. A website
  // the answer names it by (found by its name alone) is cited, but whose it is stays unverified.
  const nameOnlySite = Boolean(t && t.kind === 'site' && !(tSite && t.domain === tSite));
  const websiteVerified = Boolean(tSite && webCites.some((c) => c.registrable_domain === tSite)) || Boolean(t && !nameOnlySite && t.website.size > 0);
  const flags = {
    featured: placement !== null,
    listing: tId ? listingCites.some((c) => c.business_id === tId) : Boolean(t && t.listing.size > 0),
    website: (websiteVerified ? 'verified' : t && (t.websiteUnverified.size > 0 || (nameOnlySite && t.website.size > 0)) ? 'unverified' : false) as 'verified' | 'unverified' | false,
    prose: Boolean(t && t.named.size > 0) || proseHit.length > 0,
    sources: Boolean(t && t.sources !== null),
    ad: Boolean(t && t.ad),
    card: Boolean(t && t.card !== null),
  };
  const parsed = capture_status === 'parsed';
  const nul = <T,>(v: T): T | null => (parsed ? v : null);
  const has = (role: AioMatchRole, s: number) => Boolean(t && t.receipts.some((r) => r.role.startsWith(role) && r.sentence_index === s));
  const target_receipts: AioReceipt[] = [
    ...(t ? t.receipts.map((r) => (nameOnlySite && r.role === 'website_citation' ? { ...r, role: 'website_citation_unverified' as const } : r)) : []),
    // Its saved website cited where no business here was credited with it.
    ...(tSite ? webCites.filter((c) => c.registrable_domain === tSite && !has('website_citation', c.sentence_index)).map((c) => ({ role: 'website_citation' as const, sentence_index: c.sentence_index, card_position: null, business_id: null, url: c.raw_url, text: null })) : []),
    ...(tId && !t ? listingCites.filter((c) => c.business_id === tId).map((c) => ({ role: 'listing_citation' as const, sentence_index: c.sentence_index, card_position: null, business_id: tId, url: c.raw_url, text: null })) : []),
    ...proseHit.filter((s) => !(t && t.named.has(s.index))).map((s) => ({ role: 'prose_name' as const, sentence_index: s.index, card_position: null, business_id: null, url: null, text: tName })),
  ];
  const stats = d.meta.stats;
  return {
    scan_point_id: opts.scanPointId ?? null,
    keyword: opts.keyword,
    target_business_id: tId,
    target_domain: opts.targetDomain ?? null,
    target_name: tName,
    map_pack_rank: opts.mapPackRank ?? null,
    capture_status,
    target_identity: identity,
    target_featured_in_aio: nul(flags.featured),
    target_featured_placement: parsed ? placement : null,
    target_listing_cited_as_source: nul(flags.listing),
    target_website_cited: nul(flags.website),
    target_named_in_prose: nul(flags.prose),
    target_in_sources_row: nul(flags.sources),
    target_advertised: nul(flags.ad),
    target_cited_in_aio: nul(flags.website !== false || flags.listing),
    target_named_in_aio: nul(flags.featured || flags.prose),
    target_named_in_aio_cards: nul(flags.card),
    target_named_in_aio_text: nul(Boolean(t && t.linked.size > 0) || flags.prose),
    target_receipts: parsed ? target_receipts : [],
    target_suggested_id: suggested,
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
    site_citations,
    captured_at: opts.capturedAt ?? new Date().toISOString(),
  };
}

/** A page read that read nothing: a capture built from Google's copied answer alone (customer points have no page read). */
export function noPageRead(query: string | null): AioDossier {
  return { meta: { query, timestamp: new Date().toISOString(), url: '', totalClaimClusters: 0 }, clusters: [], pool: { comments: 0, parsed: 0, entries: [] } };
}
/** The watch facts of a capture with no page read. */
export const NOT_WATCHED: WatcherFacts = {
  capture_version: AIO_CAPTURE_VERSION,
  resolved_via_warmup_tab: false,
  warmup_tab_listed_url: null,
  reads_succeeded: 0,
  reads_missed: 0,
  first_read_ms: null,
  last_valid_read_ms: null,
  stop_reason: 'not_watched',
};

/** One row per business card, its links joined (as v_aio_local_entity_roster), with what else the answer did with the business. */
export function entityRoster(c: AioCaptureResult) {
  const byCard = new Map<number, AioCardActionLink[]>();
  for (const l of c.card_action_links) if (l.card_position !== null) byCard.set(l.card_position, [...(byCard.get(l.card_position) ?? []), l]);
  return [...byCard.entries()].map(([card_position, links]) => {
    const site = links.find((l) => l.action_type === 'website');
    const firm = c.businesses.find((b) => b.card_position === card_position) ?? null;
    return {
      card_position,
      business_name: links.find((l) => l.business_name)?.business_name ?? firm?.business_name ?? null,
      business_id: links.find((l) => l.business_id)?.business_id ?? firm?.business_id ?? null,
      /** Shown only after "Show more" (null: the first screen was not kept). */
      after_expansion: firm?.featured_placement?.kind === 'card' ? firm.featured_placement.after_expansion : null,
      /** Other listings on this page with the same verified website (branch relationship not resolved). */
      same_website_as: firm?.same_website_as ?? [],
      maps_id: links.find((l) => l.maps_id)?.maps_id ?? null,
      street_address: links.find((l) => l.street_address)?.street_address ?? null,
      coordinates: links.find((l) => l.coordinates)?.coordinates ?? null,
      gbp_website_clean_url: site?.clean_url ?? null,
      gbp_website_domain: site?.registrable_domain ?? null,
      utm_source: (site?.utm_params?.utm_source as string | undefined) ?? null,
      utm_medium: (site?.utm_params?.utm_medium as string | undefined) ?? null,
      utm_campaign: (site?.utm_params?.utm_campaign as string | undefined) ?? null,
      named_in_sentences: firm?.named_in_sentences ?? [],
      listing_cited_in_sentences: firm?.listing_cited_in_sentences ?? [],
      website_cited_in_sentences: firm?.website_cited_in_sentences ?? [],
      sources_row_position: firm?.sources_row_position ?? null,
      advertised: firm?.advertised ?? false,
      hydrated_after_expand: links.some((l) => l.first_seen_phase === 'post_expand'),
    };
  });
}

/**
 * The tracked business in an AI Overview, as customer pages show it (one per point): featured (and
 * where), named in the answer's words, its Google listing cited as a source, its website cited
 * (verified or not), how surely it is the business, and the websites the answer cites (ads never
 * among them). An unread overview is "unparsed": its flags are unknown, not false.
 */
export function aiPresence(c: AioCaptureResult): AiPresenceData {
  const listingLinks = c.target_receipts.filter((r) => r.role === 'listing_citation');
  const parsed = c.capture_status === 'parsed';
  const inSources = c.target_receipts.find((r) => r.role === 'sources_row');
  const words = (i: number | null) => {
    const t = i === null ? null : (c.sentences.find((s) => s.sentence_index === i)?.sentence_text ?? null);
    return t && t.length > 320 ? t.slice(0, 317) + '…' : t;
  };
  return {
    v: Number(/\d+/.exec(c.telemetry.capture_version)?.[0] ?? 0),
    status: c.capture_status,
    identity: c.target_identity,
    featured: c.target_featured_placement,
    named: c.target_named_in_prose,
    listingCitedAsSource: c.target_listing_cited_as_source === null ? null : c.target_listing_cited_as_source ? { links: listingLinks.length, sentences: new Set(listingLinks.map((r) => r.sentence_index)).size } : false,
    listingInSources: parsed ? (inSources ? Number(inSources.text) || null : null) : null,
    websiteCited: c.target_website_cited,
    advertised: c.target_advertised,
    suggestedId: c.target_suggested_id,
    citedSites: [...new Set(c.sentence_citations.filter((s) => s.target_type === 'external_web' && s.registrable_domain).map((s) => s.registrable_domain as string))],
    // What each flag stands on, so a customer can check it: the sentence (in Google's words), the card, the address.
    evidence: parsed
      ? c.target_receipts.slice(0, 24).map((r) => ({
          flag: EVIDENCE_FLAG[r.role],
          sentence: r.sentence_index,
          card: r.card_position,
          text: r.sentence_index !== null ? words(r.sentence_index) : r.role === 'sources_row' ? null : r.text,
          url: r.url,
        }))
      : [],
  };
}
const EVIDENCE_FLAG: Record<AioMatchRole, AiEvidence['flag']> = {
  card: 'featured',
  inline_link: 'featured',
  inline_mention: 'named',
  prose_name: 'named',
  listing_citation: 'listing',
  sources_row: 'listing_source',
  website_citation: 'website',
  website_citation_unverified: 'website_possible',
  ad: 'ad',
};
export type AiPresence = AiPresenceData;

/** What the point keeps on itself (the full capture goes to storage): status, the tracked business's flags and receipts, counts, the businesses by role, the ads. */
export function captureDigest(c: AioCaptureResult) {
  const cited = new Map<string, number>();
  for (const s of c.sentence_citations) if (s.target_type === 'external_web' && s.registrable_domain) cited.set(s.registrable_domain, (cited.get(s.registrable_domain) ?? 0) + 1);
  const unplaced = c.card_action_links.filter((l) => l.card_position === null);
  const brief = (b: AioBusiness) => ({ key: b.business_key, name: b.business_name, domain: b.domain ?? b.probable_domain, verified_site: Boolean(b.domain) });
  return {
    capture_version: c.telemetry.capture_version,
    capture_status: c.capture_status,
    overview_mode: c.overview_mode,
    presence: aiPresence(c),
    target: {
      identity: c.target_identity,
      featured_in_aio: c.target_featured_in_aio,
      placement: c.target_featured_placement,
      listing_cited_as_source: c.target_listing_cited_as_source,
      website_cited: c.target_website_cited,
      named_in_prose: c.target_named_in_prose,
      in_sources_row: c.target_in_sources_row,
      advertised: c.target_advertised,
      suggested_id: c.target_suggested_id,
      receipts: c.target_receipts.slice(0, 30).map((r) => ({ ...r, url: r.url?.slice(0, 200) ?? null })),
    },
    target_cited_in_aio: c.target_cited_in_aio,
    target_named_in_aio: c.target_named_in_aio,
    target_named_in_aio_cards: c.target_named_in_aio_cards,
    target_named_in_aio_text: c.target_named_in_aio_text,
    map_pack_rank: c.map_pack_rank ?? null,
    telemetry: c.telemetry,
    counts: c.counts,
    cited_sites: [...cited.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([site, n]) => ({ site, citations: n })),
    roster: entityRoster(c).slice(0, 20),
    featured_inline: c.businesses.filter((b) => b.featured_placement?.kind === 'inline').slice(0, 12).map((b) => ({ ...brief(b), sentences: b.recommended_in_sentences, website_cited: b.website_cited_in_sentences, website_cited_unverified: b.website_cited_unverified_in_sentences })),
    named_in_prose: c.businesses.filter((b) => b.named_in_sentences.length && !b.featured).slice(0, 12).map((b) => ({ ...brief(b), sentences: b.named_in_sentences, linked: b.linked_in_sentences, website_cited: b.website_cited_in_sentences, website_cited_unverified: b.website_cited_unverified_in_sentences })),
    listings_cited_as_source: c.businesses.filter((b) => b.listing_cited_links).slice(0, 12).map((b) => ({ ...brief(b), sentences: b.listing_cited_in_sentences, links: b.listing_cited_links, featured: b.featured })),
    site_citations: c.site_citations.slice(0, 30).map((s) => ({ sentence: s.sentence_index, site: s.registrable_domain, credited_to: s.credited_to, unverified_to: s.unverified_to })),
    sources_only: c.businesses.filter((b) => b.sources_row_position !== null && !b.in_answer).slice(0, 20).map((b) => ({ key: b.business_key, name: b.business_name, position: b.sources_row_position })),
    ads: c.ads.slice(0, 8).map((a) => ({ domain: a.registrable_domain, url: a.raw_url?.slice(0, 200) ?? null, business: a.business_key, name: c.businesses.find((b) => b.business_key === a.business_key)?.business_name ?? null })),
    unreferenced_web_sources: c.unreferenced_web_sources.slice(0, 12).map((u) => ({ domain: u.registrable_domain, url: u.clean_url.slice(0, 200), title: u.page_title, phase: u.first_seen_phase })),
    unplaced_card_links: unplaced.length ? { count: unplaced.length, urls: unplaced.slice(0, 10).map((l) => l.raw_url?.slice(0, 200) ?? null) } : null,
    promoted_after_expand: c.sentence_citations.filter((s) => s.promoted_after_expand).length,
  };
}
