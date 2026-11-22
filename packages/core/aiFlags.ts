/**
 * The tracked business in one point's Google AI Overview, as every customer page reads it.
 *
 * A point read by the role-aware capture carries its presence (insights.ai.presence), four flags kept
 * apart because they mean different things:
 * - Featured: Google put it forward, as one of the answer's business cards (its place among them, and
 *   whether it showed only after "Show more") or in a sentence recommending it by a link on its name.
 *   A name linked only in a closing "browse more" sentence is not featured.
 * - Named in answer prose: its name in the answer's words.
 * - Google listing cited as a source: a numbered source under a sentence is its Google listing, or its
 *   listing is among the overview's own sources (Google's source viewer), with no sentence citing it.
 * - Website cited: a page of its website is a source, and the website is known to be its own (its saved
 *   website, or the one its own Google card opens). A cited site that only fits its name is a
 *   "possible website citation": the citation is real, whose website it is needs confirming.
 * How surely the business is the one found (by its Google ID, its website, or only its exact name)
 * is kept apart from where it was placed. Each flag carries its evidence: the sentence in Google's
 * words, the card, the address.
 *
 * An overview that could not be read is "unparsed": its flags are unknown, never zeros, and it is
 * left out of rates. A point read before the capture existed has only the earlier single reading
 * ("legacy"). Customers see the flags once an admin turns them on (Settings: aiFlagsForCustomers);
 * until then their pages get the points without them (withoutFlags) and read as before.
 * Pure: no I/O, safe in the browser.
 */
export type AiPlacement = { kind: 'card'; card_position: number; card_count?: number; after_expansion: boolean | null } | { kind: 'inline'; sentence_index: number };
export type AiIdentity = 'listing' | 'website' | 'website_shared' | 'name' | null;
/** One piece of evidence for a flag: the sentence (its number and Google's words), the card, the address. */
export type AiEvidence = {
  flag: 'featured' | 'named' | 'listing' | 'listing_source' | 'website' | 'website_possible' | 'ad';
  sentence: number | null;
  card: number | null;
  text: string | null;
  url: string | null;
};
/** As the capture writes it (aiPresence in aioCapture.ts). */
export type AiPresenceData = {
  v: number;
  status: 'parsed' | 'unparsed' | 'no_overview';
  identity: AiIdentity;
  featured: AiPlacement | null;
  named: boolean | null;
  /** Its listing as a numbered source under the answer's sentences. */
  listingCitedAsSource: { links: number; sentences: number } | false | null;
  /** Its listing's place among the overview's own sources (Google's source viewer), when there. */
  listingInSources?: number | null;
  websiteCited: 'verified' | 'unverified' | false | null;
  advertised: boolean | null;
  suggestedId: string | null;
  citedSites: string[];
  evidence?: AiEvidence[];
};
export type PinAiState = 'parsed' | 'unparsed' | 'legacy' | 'none';
export type PinAi = {
  state: PinAiState;
  featured: AiPlacement | null;
  named: boolean;
  /** Its listing cited under sentences, or (sentences 0) only among the overview's sources at `inSources`. */
  listing: { links: number; sentences: number; inSources: number | null } | null;
  /** "verified": Website cited. "unverified": a possible website citation (whose site it is needs confirming). */
  websiteCited: 'verified' | 'unverified' | null;
  identity: AiIdentity;
  advertised: boolean;
  evidence: AiEvidence[];
  /**
   * In the AI Overview: featured, named, its listing cited as a source, or its own website cited.
   * Null when unknown (an unparsed overview); the earlier reading on a legacy point; false where no AI
   * Overview was shown. A possible website citation alone is not counted (it needs confirming).
   */
  visible: boolean | null;
};

type PinLike = { hasAiOverview?: boolean | null; targetCitedInAi?: boolean | null; insights?: unknown };

/** The presence a point carries, if it was read by the capture. */
export function presenceOf(p: { insights?: unknown }): AiPresenceData | null {
  const x = (p.insights as { ai?: { presence?: unknown } } | null | undefined)?.ai?.presence as AiPresenceData | undefined;
  return x && typeof x === 'object' && typeof x.status === 'string' ? x : null;
}

/** Whether a read presence puts the business in the answer (see PinAi.visible). */
export const presenceVisible = (x: AiPresenceData) =>
  x.status === 'parsed' && (Boolean(x.featured) || x.named === true || Boolean(x.listingCitedAsSource) || (x.listingInSources ?? null) !== null || x.websiteCited === 'verified');

export function pinAi(p: PinLike): PinAi {
  const x = presenceOf(p);
  const blank = { featured: null, named: false, listing: null, websiteCited: null, identity: null, advertised: false, evidence: [] };
  if (x?.status === 'parsed') {
    const cited = x.listingCitedAsSource ? x.listingCitedAsSource : null;
    const inSources = x.listingInSources ?? null;
    return {
      state: 'parsed',
      featured: x.featured ?? null,
      named: x.named === true,
      listing: cited || inSources !== null ? { links: cited?.links ?? 0, sentences: cited?.sentences ?? 0, inSources } : null,
      websiteCited: x.websiteCited ? x.websiteCited : null,
      identity: x.identity ?? null,
      advertised: x.advertised === true,
      evidence: x.evidence ?? [],
      visible: presenceVisible(x),
    };
  }
  if (x?.status === 'unparsed') return { ...blank, state: 'unparsed', visible: null };
  if (!p.hasAiOverview || x?.status === 'no_overview') return { ...blank, state: 'none', visible: false };
  return { ...blank, state: 'legacy', visible: Boolean(p.targetCitedInAi) };
}

/** Read by the capture (its four flags, or "unparsed"): the earlier single reading no longer applies to it. */
export const readByFlags = (a: PinAi) => a.state === 'parsed' || a.state === 'unparsed';

/** A point as a viewer may read it: without the four flags (it then reads as before). */
export function withoutFlags<T extends { insights?: unknown }>(p: T): T {
  const ins = p.insights as { ai?: Record<string, unknown> } | null | undefined;
  if (!ins?.ai || !('presence' in ins.ai)) return p;
  const { presence: _drop, ...ai } = ins.ai;
  void _drop;
  return { ...p, insights: { ...ins, ai } };
}

/** "card #6 of 10", "card #6 of 10, after “Show more”", "inline recommendation". */
export function placementText(f: AiPlacement | null): string | null {
  if (!f) return null;
  if (f.kind === 'inline') return 'inline recommendation';
  return `card #${f.card_position}${f.card_count ? ' of ' + f.card_count : ''}${f.after_expansion ? ', after “Show more”' : ''}`;
}

/** How surely the business found is the tracked one, in words (null when it was found by its Google ID). */
export function identityNote(i: AiIdentity): string | null {
  return i === 'name' ? 'matched by its exact name (no Google ID saved)' : i === 'website' ? 'matched by its website' : i === 'website_shared' ? 'its website is shared with another listing here' : null;
}

export type AiFlagLine = { key: 'featured' | 'named' | 'listing' | 'website'; label: string; on: boolean; detail: string | null; evidence: AiEvidence[] };
/** The four flags as a customer reads them, in order, for one point, each with its evidence. */
export function aiFlagLines(a: PinAi): AiFlagLine[] {
  if (a.state !== 'parsed') return [];
  const of = (...flags: AiEvidence['flag'][]) => a.evidence.filter((e) => flags.includes(e.flag));
  const l = a.listing;
  return [
    { key: 'featured', label: 'Featured', on: Boolean(a.featured), detail: placementText(a.featured), evidence: of('featured') },
    // A name linked in a recommending sentence is named there too: that sentence is its evidence.
    { key: 'named', label: 'Named in answer prose', on: a.named, detail: null, evidence: of('named').length || !a.named ? of('named') : of('featured').filter((e) => e.sentence !== null) },
    {
      key: 'listing',
      label: 'Google listing cited as a source',
      on: Boolean(l),
      detail: !l ? null : l.links ? `${l.links} link${l.links === 1 ? '' : 's'} under ${l.sentences} sentence${l.sentences === 1 ? '' : 's'}` : `among the overview’s sources (#${l.inSources}), not under a sentence`,
      evidence: of('listing', 'listing_source'),
    },
    a.websiteCited === 'unverified'
      ? { key: 'website', label: 'Possible website citation', on: false, detail: 'a cited site that fits the name; confirm it is the business’s website', evidence: of('website_possible') }
      : { key: 'website', label: 'Website cited', on: a.websiteCited === 'verified', detail: null, evidence: of('website') },
  ];
}

export type AiFlagKey = 'appeared' | 'featured' | 'named' | 'listing' | 'website' | 'possibleWebsite' | 'unread';
/** The points behind each count (see aiFlagTotals), so a count opens the very points it counts. */
export function aiFlagPins(pins: (PinLike & { id: string })[]): Record<AiFlagKey, string[]> {
  const of = (f: (a: PinAi) => boolean) => pins.filter((p) => f(pinAi(p))).map((p) => p.id);
  const read = (a: PinAi) => a.state === 'parsed';
  return {
    appeared: of((a) => read(a) && a.visible === true),
    featured: of((a) => read(a) && Boolean(a.featured)),
    named: of((a) => read(a) && a.named),
    listing: of((a) => read(a) && Boolean(a.listing)),
    website: of((a) => read(a) && a.websiteCited === 'verified'),
    possibleWebsite: of((a) => read(a) && a.websiteCited === 'unverified'),
    unread: of((a) => a.state === 'unparsed'),
  };
}

/** Across points: where the business appeared (each point once), and each flag's count. */
export function aiFlagTotals(pins: PinLike[]) {
  const read = pins.map(pinAi).filter((a) => a.state === 'parsed');
  const n = (f: (a: PinAi) => boolean) => read.filter(f).length;
  return {
    read: read.length,
    unread: pins.map(pinAi).filter((a) => a.state === 'unparsed').length,
    appeared: n((a) => a.visible === true),
    featured: n((a) => Boolean(a.featured)),
    featuredCard: n((a) => a.featured?.kind === 'card'),
    featuredInline: n((a) => a.featured?.kind === 'inline'),
    named: n((a) => a.named),
    listing: n((a) => Boolean(a.listing)),
    website: n((a) => a.websiteCited === 'verified'),
    possibleWebsite: n((a) => a.websiteCited === 'unverified'),
  };
}
