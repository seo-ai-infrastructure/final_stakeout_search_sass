/*
 * Stakeout's visibility scoring, version 2.1.0: the v2 engine as supplied, with two fixes (an AI
 * answer above the map pack takes the larger share; a first-three AI card behind "Show more" never
 * scores below card 4). How Stakeout's stored readings become its inputs is in briefScore.ts.
 */
/**
 * Stakeout Search — Local & AI Visibility Scoring Engine (v2)
 * Model Identifier: 2.0.0
 *
 * Reference implementation for:
 *  - Section 1 & 2: Scenario-normalized pin scoring [0, 100] (Pack, 1-Box, Finder, AI cards & citations)
 *  - Section 2: Paid-unit ad adjustment (V = S * delta) & initial viewport presence
 *  - Section 3: Geographic (GVS), Census ACS Income-Weighted (EVS), Bipartite 150m Cohort Matcher, & PSSI
 *  - Section 4: Two-Tier Commercial Attribution, PMRV Benchmark, & Stage-Aligned Unit Economics
 */

export const MODEL_VERSION = '2.1.0' as const;
export const MAX_MATCH_DISTANCE_METERS = 150;

export type OneBoxState = 'won' | 'other' | null;
export type AiParseState = 'parsed' | 'unparsed' | 'legacy' | 'none';
export type ModuleOrder = 'pack_above_ai' | 'ai_above_pack' | 'unknown';
export type PinCoverageBasis = 'complete' | 'partial_pack_only' | 'excluded';

export type PinScenario =
  | 'PACK_ONLY'
  | 'PACK_ONLY_PARTIAL'
  | 'AI_ONLY'
  | 'HYBRID_PACK_TOP'
  | 'HYBRID_AI_TOP'
  | 'HYBRID_DEFAULT'
  | 'HYBRID_1BOX_AI'
  | 'EXCLUDED';

export type ReviewFlag =
  | 'recommendation_conflict'
  | 'invalid_pack_rank'
  | 'invalid_ai_card_rank'
  | 'contradictory_panel_state'
  | 'unknown_module_order'
  | 'invalid_paid_unit_count';

export interface ListingCitationEvidence {
  confirmed?: boolean;
  links?: number | null;
  inSources?: number | null;
}

export interface StakeoutPin {
  /** Unique observation ID within the scan (defaults to `${r},${c}`). */
  id?: string;
  r: number;
  c: number;
  lat?: number | null;
  lng?: number | null;
  /** Census ACS 5-year tract median household income in USD (negative sentinel values normalized to null). */
  inc?: number | null;
  tractId?: string | null;
  censusVintage?: string | null;

  /** True when Google showed a Map Pack or single-business Knowledge Panel (1-Box). */
  pack: boolean;
  /** Verified Map Pack or Finder rank (1-based), or null when checked and confirmed absent. */
  rank: number | null;
  /** Panel ownership when SERP renders a single-business Knowledge Panel instead of a 3-Pack. */
  oneBox?: OneBoxState;
  /** True when rank 4–10 was verified after opening Local Finder ("More businesses"). */
  finderExpanded?: boolean | null;

  /** True when Google rendered an AI Overview / AI Answer on the captured page. */
  aiShown: boolean;
  state: AiParseState;
  featured?: {
    card?: number | null;
    of?: number | null;
    afterMore?: boolean | null;
    inline?: boolean | null;
  } | null;
  named?: boolean | null;
  /** Confirmed target-specific boolean or Stakeout listing citation evidence object. */
  listing?: boolean | ListingCitationEvidence | null;
  website?: 'confirmed' | 'possible' | boolean | null;
  /** Screen-vs-parser card index conflict detected during capture. */
  conflict?: number | null;

  /** Observed vertical order on Hybrid SERPs. */
  moduleOrder?: ModuleOrder;
  /** Shorthand flag: true => 'pack_above_ai', false => 'ai_above_pack'. */
  packAboveAi?: boolean | null;

  /** Verified nonnegative integer count of paid units above the first organic local/AI module. */
  paidUnitsAbove?: number | null;
  /** Captured Y-axis offset in pixels (retained for receipt telemetry, never treated as ad count). */
  firstModuleOffsetPx?: number | null;
  viewportHeightPx?: number | null;
  /** Direct first-screen observation: whether target business appeared on initial settled screen. */
  visibleInitialScreen?: boolean | null;
}

export interface ScorePinOptions {
  /**
   * When true, pins with unresolved data-integrity flags (conflict, invalid ranks, contradictory panel)
   * return baseScore: null and coverage: 'excluded' until reviewed. Defaults to false (flags recorded,
   * parsed evidence scored as captured).
   */
  holdFlaggedForReview?: boolean;
}

export interface PinScoreResult {
  modelVersion: typeof MODEL_VERSION;
  scenario: PinScenario;
  coverage: PinCoverageBasis;
  valid: boolean;
  /** Full-precision placement utility S in [0, 100], or null when excluded. */
  baseScore: number | null;
  /** Full-precision ad-adjusted score V = S * delta, or null when excluded or paidUnitsAbove is unknown. */
  adjustedScore: number | null;
  packUtility: number | null;
  aiUtility: number | null;
  aiRecommendationUtility: number | null;
  confirmedWebsiteCitation: boolean;
  confirmedListingCitation: boolean;
  adDiscountFactor: number | null;
  needsReview: boolean;
  reviewFlags: ReviewFlag[];
}

export interface NormalizedObservation {
  id: string;
  score: number | null;
  adjustedScore?: number | null;
  basis: PinCoverageBasis;
  lat?: number | null;
  lng?: number | null;
  income?: number | null;
  /** Optional explicit positive weight override; otherwise derived from income intervals. */
  weight?: number | null;
  visibleInitialScreen?: boolean | null;
}

export interface VisibilitySummary {
  modelVersion: typeof MODEL_VERSION;
  /** Display-rounded (1 decimal) Geographic Visibility Score [0, 100]. */
  gvs: number | null;
  /** Full-precision GVS prior to display rounding. */
  gvsRaw: number | null;
  /** Display-rounded (1 decimal) Income-Weighted Visibility Score [0, 100]. */
  evs: number | null;
  /** Full-precision EVS prior to display rounding. */
  evsRaw: number | null;
  /** Display-rounded ad-adjusted GVS over pins with verified paid-unit counts. */
  adAdjustedGvs: number | null;
  adAdjustedGvsRaw: number | null;
  /** Unadjusted GVS computed over the exact same ad-covered pins for apples-to-apples comparison. */
  unadjustedOnAdCoveredGvs: number | null;
  /** Direct initial-screen presence percentage [0, 100] across observed screens. */
  firstScreenPresencePct: number | null;

  counts: {
    attemptedPins: number;
    validPins: number;
    completePins: number;
    partialFallbackPins: number;
    excludedPins: number;
    adCoveredPins: number;
    missingIncomePins: number;
    firstScreenObservedPins: number;
    firstScreenPresentPins: number;
  };
}

export interface MatchedPinPair {
  currentId: string;
  previousId: string;
  basis: 'complete' | 'partial_pack_only';
  distanceMeters: number;
  weight: number;
  currentScore: number;
  previousScore: number;
  delta: number;
}

export interface CohortComparisonResult {
  modelVersion: typeof MODEL_VERSION;
  passedGate: boolean;
  requiredPairs: number;
  pairsUsed: number;
  completePairs: number;
  partialPairs: number;
  currentValidCount: number;
  previousValidCount: number;
  currentOverlapRatio: number;
  previousOverlapRatio: number;
  /** Display-rounded unweighted matched-pin delta (null when gate fails). */
  deltaGvs: number | null;
  deltaGvsRaw: number | null;
  /** Display-rounded fixed-baseline-weighted matched-pin delta (null when gate fails). */
  deltaEvs: number | null;
  deltaEvsRaw: number | null;
  /** Explicit overlap disclosure, e.g., "9 matched of 16". */
  coverageDisclosure: string;
  pairs: MatchedPinPair[];
}

export type KeywordIntentClass = 'transactional' | 'category' | 'informational';

export interface KeywordScanScore {
  keyword: string;
  intent: KeywordIntentClass;
  isBranded: boolean;
  score: number | null;
  matchedDelta?: number | null;
}

export interface OfficePortfolioInput {
  officeId: string;
  officeName: string;
  capacityWeight?: number;
  eligible?: boolean;
  keywords: readonly KeywordScanScore[];
}

export interface PortfolioRollupResult {
  modelVersion: typeof MODEL_VERSION;
  pssi: number | null;
  pssiRaw: number | null;
  nonBrandPssi: number | null;
  brandPssi: number | null;
  sameStoreDelta: number | null;
  canRenderLeagueTable: boolean;
  eligibleOfficeCount: number;
  excludedOfficeIds: string[];
  offices: Array<{
    officeId: string;
    officeName: string;
    weight: number;
    score: number | null;
    nonBrandScore: number | null;
    brandScore: number | null;
    sameStoreDelta: number | null;
    eligibleKeywords: number;
    excludedKeywords: string[];
  }>;
}

export interface CommercialAttributionInput {
  /** Tier 1: Verified Google OAuth telemetry (GBP, GSC, GA4). */
  googleTelemetry?: {
    gbpCalls?: number | null;
    gbpBookings?: number | null;
    gbpMessages?: number | null;
    gbpWebsiteClicks?: number | null;
    gbpDirections?: number | null;
    ga4ListingLandingSessions?: number | null;
    ga4TotalLandingSessions?: number | null;
    gscTotalClicks?: number | null;
    gscMatchedNonBrandClicks?: Array<{ query: string; clicks: number; cpcUsd: number }>;
    gscUnclassifiedClicks?: number | null;
  };
  /** Tier 2: Reconciled person-level CRM / call-tracking opportunities. */
  reconciledCrm?: {
    distinctQualifiedInquiries: number;
    bookedJobsOrSignedCases?: number | null;
    collectedRevenueUsd?: number | null;
  };
  /** Paid media benchmarks matched to service, market, and period. */
  benchmarks?: {
    primaryCategoryCpcUsd?: number | null;
    costPerQualifiedCallUsd?: number | null;
    /** Conservative floor multiplier for privacy-filtered GSC landing-page clicks (default 0.50). */
    unclassifiedClickDiscount?: number;
  };
  /** Stage-aligned client conversion assumptions. */
  unitEconomics?: {
    /** Distinct qualified web inquiries per eligible web session (η_web). */
    qualifiedWebInquiryRate?: number | null;
    /** Qualified-inquiry-to-win close rate (c). */
    closeRate?: number | null;
    /** Average revenue or net fee per booked job / signed case. */
    averageValuePerWinUsd?: number | null;
  };
}

export interface CommercialImpactResult {
  attributionTier: 'reconciled_crm' | 'verified_google_telemetry' | 'unavailable';
  verifiedInquiriesH: number | null;
  observedActions: {
    gbpCalls: number | null;
    gbpBookingsAndMessages: number | null;
    gbpWebsiteClicks: number | null;
    ga4ListingSessions: number | null;
    gscClicks: number | null;
    gbpDirections: number | null;
  };
  pmrv: {
    totalUsd: number | null;
    exactMatchedUsd: number;
    fallbackUnclassifiedUsd: number;
    unclassifiedClicksPriced: number;
    coverageNote: string;
  };
  modeledPipeline: {
    expectedWinsJ: number | null;
    expectedValueUsdR: number | null;
    basisDisclosure: string;
  };
  actualOutcomes: {
    wins: number | null;
    collectedRevenueUsd: number | null;
  };
}

/* -------------------------------------------------------------------------- */
/* Lookup Tables                                                              */
/* -------------------------------------------------------------------------- */

const PACK_RANK_UTILITY: Record<number, number> = {
  1: 100,
  2: 70,
  3: 45,
  4: 20,
  5: 16,
  6: 12,
  7: 9,
  8: 7,
  9: 6,
  10: 4,
};

const AI_CARD_UTILITY: Record<number, number> = {
  1: 100,
  2: 75,
  3: 55,
  4: 28,
  5: 23,
  6: 20,
  7: 16,
  8: 14,
};

const INTENT_WEIGHTS: Record<KeywordIntentClass, number> = {
  transactional: 1.0,
  category: 0.7,
  informational: 0.35,
};

/* -------------------------------------------------------------------------- */
/* Normalization & Utility Helpers                                            */
/* -------------------------------------------------------------------------- */

export function roundDisplay(value: number | null, decimals = 1): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function normalizeIncome(inc: number | null | undefined): number | null {
  if (typeof inc !== 'number' || !Number.isFinite(inc) || inc <= 0) return null;
  return inc;
}

export function incomeWeight(inc: number | null | undefined): { weight: number; missing: boolean } {
  const clean = normalizeIncome(inc);
  if (clean === null) return { weight: 1.0, missing: true };
  if (clean < 40_000) return { weight: 0.6, missing: false };
  if (clean < 60_000) return { weight: 0.8, missing: false };
  if (clean < 80_000) return { weight: 1.0, missing: false };
  if (clean < 100_000) return { weight: 1.2, missing: false };
  if (clean < 150_000) return { weight: 1.5, missing: false };
  return { weight: 1.85, missing: false };
}

export function isConfirmedListingCitation(listing: StakeoutPin['listing']): boolean {
  if (typeof listing === 'boolean') return listing;
  if (!listing || typeof listing !== 'object') return false;
  if (typeof listing.confirmed === 'boolean') return listing.confirmed;
  const hasLinks = typeof listing.links === 'number' && listing.links > 0;
  const hasInSources = typeof listing.inSources === 'number' && listing.inSources > 0;
  return hasLinks || hasInSources;
}

export function isConfirmedWebsiteCitation(website: StakeoutPin['website']): boolean {
  return website === true || website === 'confirmed';
}

/* -------------------------------------------------------------------------- */
/* Section 2: Score a Pin                                                     */
/* -------------------------------------------------------------------------- */

export function scorePin(pin: StakeoutPin, options?: ScorePinOptions): PinScoreResult {
  const reviewFlags: ReviewFlag[] = [];

  if (pin.conflict !== null && pin.conflict !== undefined) {
    reviewFlags.push('recommendation_conflict');
  }
  if (!pin.pack && pin.oneBox) {
    reviewFlags.push('contradictory_panel_state');
  }
  if (pin.rank !== null && (!Number.isInteger(pin.rank) || pin.rank < 1)) {
    reviewFlags.push('invalid_pack_rank');
  }
  if (
    pin.featured?.card !== null &&
    pin.featured?.card !== undefined &&
    (!Number.isInteger(pin.featured.card) || pin.featured.card < 1)
  ) {
    reviewFlags.push('invalid_ai_card_rank');
  }

  const hardIntegrityFailure = reviewFlags.some(
    (f) =>
      f === 'recommendation_conflict' ||
      f === 'contradictory_panel_state' ||
      f === 'invalid_pack_rank' ||
      f === 'invalid_ai_card_rank',
  );

  const aiParsed = Boolean(pin.aiShown && pin.state === 'parsed');

  if ((options?.holdFlaggedForReview && hardIntegrityFailure) || (!pin.pack && !aiParsed)) {
    return {
      modelVersion: MODEL_VERSION,
      scenario: 'EXCLUDED',
      coverage: 'excluded',
      valid: false,
      baseScore: null,
      adjustedScore: null,
      packUtility: null,
      aiUtility: null,
      aiRecommendationUtility: null,
      confirmedWebsiteCitation: false,
      confirmedListingCitation: false,
      adDiscountFactor: null,
      needsReview: hardIntegrityFailure,
      reviewFlags,
    };
  }

  // Pack, single-business panel, and Finder utility M
  let M: number | null = null;
  if (pin.pack) {
    if (pin.oneBox === 'won') {
      M = 100;
    } else if (pin.oneBox === 'other') {
      M = 0;
    } else if (pin.rank === null || !Number.isInteger(pin.rank) || pin.rank < 1 || pin.rank > 10) {
      M = 0;
    } else {
      M = PACK_RANK_UTILITY[pin.rank] ?? 0;
    }
  }

  // AI utility A — uses max() across active recommendation roles so dual inline + Card #1/2 never penalizes
  let A: number | null = null;
  let R: number | null = null;
  const W = aiParsed && isConfirmedWebsiteCitation(pin.website) ? 1 : 0;
  const L = aiParsed && isConfirmedListingCitation(pin.listing) ? 1 : 0;

  if (aiParsed) {
    const inlineVal = pin.featured?.inline ? 60 : 0;

    let cardVal = 0;
    const card = pin.featured?.card;
    if (typeof card === 'number' && Number.isInteger(card) && card >= 1) {
      const rawCard = card <= 8 ? AI_CARD_UTILITY[card] : 12;
      // A first-three card behind "Show more" never scores below a visible card 4 (2.1.0).
      cardVal = card <= 3 && pin.featured?.afterMore ? Math.max(Math.round(0.45 * rawCard), AI_CARD_UTILITY[4]) : rawCard;
    }

    const namedVal = pin.named ? 22 : 0;
    R = Math.max(inlineVal, cardVal, namedVal);

    if (R > 0) {
      A = Math.min(100, R + 10 * W + 5 * L);
    } else {
      A = 18 * W + 14 * L - 8 * W * L;
    }
  }

  // Combine surfaces at full floating-point precision
  let scenario: PinScenario;
  let coverage: PinCoverageBasis = 'complete';
  let baseScore: number;

  if (M !== null && A === null) {
    if (pin.aiShown) {
      scenario = 'PACK_ONLY_PARTIAL';
      coverage = 'partial_pack_only';
    } else {
      scenario = 'PACK_ONLY';
      coverage = 'complete';
    }
    baseScore = M;
  } else if (M === null && A !== null) {
    scenario = 'AI_ONLY';
    baseScore = A;
  } else {
    const mVal = M as number;
    const aVal = A as number;
    if (pin.oneBox) {
      scenario = 'HYBRID_1BOX_AI';
      baseScore = 0.55 * mVal + 0.45 * aVal;
    } else {
      const order: ModuleOrder =
        pin.moduleOrder ??
        (pin.packAboveAi === true
          ? 'pack_above_ai'
          : pin.packAboveAi === false
            ? 'ai_above_pack'
            : 'unknown');
      if (order === 'pack_above_ai') {
        scenario = 'HYBRID_PACK_TOP';
        baseScore = 0.6 * mVal + 0.4 * aVal;
      } else if (order === 'ai_above_pack') {
        // The AI answer on top takes the larger share (2.1.0).
        scenario = 'HYBRID_AI_TOP';
        baseScore = 0.45 * mVal + 0.55 * aVal;
      } else {
        if (order === 'unknown') reviewFlags.push('unknown_module_order');
        scenario = 'HYBRID_DEFAULT';
        baseScore = 0.55 * mVal + 0.45 * aVal;
      }
    }
  }

  // Ad adjustment V = S * delta (only when paidUnitsAbove is a verified nonnegative integer)
  let adDiscountFactor: number | null = null;
  let adjustedScore: number | null = null;
  if (pin.paidUnitsAbove !== null && pin.paidUnitsAbove !== undefined) {
    if (Number.isInteger(pin.paidUnitsAbove) && pin.paidUnitsAbove >= 0) {
      adDiscountFactor = pin.paidUnitsAbove === 0 ? 1.0 : pin.paidUnitsAbove === 1 ? 0.88 : 0.75;
      adjustedScore = baseScore * adDiscountFactor;
    } else {
      reviewFlags.push('invalid_paid_unit_count');
    }
  }

  return {
    modelVersion: MODEL_VERSION,
    scenario,
    coverage,
    valid: true,
    baseScore,
    adjustedScore,
    packUtility: M,
    aiUtility: A,
    aiRecommendationUtility: R,
    confirmedWebsiteCitation: W === 1,
    confirmedListingCitation: L === 1,
    adDiscountFactor,
    needsReview: hardIntegrityFailure,
    reviewFlags,
  };
}

export function snapshot(
  pins: readonly StakeoutPin[],
  options?: ScorePinOptions,
): NormalizedObservation[] {
  return pins.map((pin) => {
    const result = scorePin(pin, options);
    return {
      id: pin.id ?? `${pin.r},${pin.c}`,
      score: result.baseScore,
      adjustedScore: result.adjustedScore,
      basis: result.coverage,
      lat: pin.lat,
      lng: pin.lng,
      income: pin.inc,
      visibleInitialScreen: pin.visibleInitialScreen,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Section 3: Geographic & Income-Weighted Rollups                            */
/* -------------------------------------------------------------------------- */

export function summarizeVisibility(
  observations: readonly NormalizedObservation[],
): VisibilitySummary {
  let validPins = 0;
  let completePins = 0;
  let partialFallbackPins = 0;
  let excludedPins = 0;
  let adCoveredPins = 0;
  let missingIncomePins = 0;
  let firstScreenObservedPins = 0;
  let firstScreenPresentPins = 0;

  let baseSum = 0;
  let weightedSum = 0;
  let weightTotal = 0;
  let adAdjustedSum = 0;
  let unadjustedOnAdSum = 0;

  for (const obs of observations) {
    if (obs.basis === 'excluded' || obs.score === null || !Number.isFinite(obs.score)) {
      excludedPins++;
      continue;
    }

    validPins++;
    if (obs.basis === 'complete') completePins++;
    else if (obs.basis === 'partial_pack_only') partialFallbackPins++;

    baseSum += obs.score;

    const explicitW =
      typeof obs.weight === 'number' && Number.isFinite(obs.weight) && obs.weight > 0
        ? obs.weight
        : null;
    const incInfo = incomeWeight(obs.income);
    if (explicitW === null && incInfo.missing) missingIncomePins++;
    const w = explicitW ?? incInfo.weight;

    weightedSum += w * obs.score;
    weightTotal += w;

    if (typeof obs.adjustedScore === 'number' && Number.isFinite(obs.adjustedScore)) {
      adCoveredPins++;
      adAdjustedSum += obs.adjustedScore;
      unadjustedOnAdSum += obs.score;
    }

    if (typeof obs.visibleInitialScreen === 'boolean') {
      firstScreenObservedPins++;
      if (obs.visibleInitialScreen) firstScreenPresentPins++;
    }
  }

  const gvsRaw = validPins > 0 ? baseSum / validPins : null;
  const evsRaw = validPins > 0 && weightTotal > 0 ? weightedSum / weightTotal : null;
  const adAdjustedGvsRaw = adCoveredPins > 0 ? adAdjustedSum / adCoveredPins : null;
  const unadjustedOnAdRaw = adCoveredPins > 0 ? unadjustedOnAdSum / adCoveredPins : null;
  const firstScreenRaw =
    firstScreenObservedPins > 0 ? (100 * firstScreenPresentPins) / firstScreenObservedPins : null;

  return {
    modelVersion: MODEL_VERSION,
    gvs: roundDisplay(gvsRaw, 1),
    gvsRaw,
    evs: roundDisplay(evsRaw, 1),
    evsRaw,
    adAdjustedGvs: roundDisplay(adAdjustedGvsRaw, 1),
    adAdjustedGvsRaw,
    unadjustedOnAdCoveredGvs: roundDisplay(unadjustedOnAdRaw, 1),
    firstScreenPresencePct: roundDisplay(firstScreenRaw, 1),
    counts: {
      attemptedPins: observations.length,
      validPins,
      completePins,
      partialFallbackPins,
      excludedPins,
      adCoveredPins,
      missingIncomePins,
      firstScreenObservedPins,
      firstScreenPresentPins,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Section 3: Exact Max-Cardinality Min-Distance Spatial Matcher (<= 150 m)   */
/* -------------------------------------------------------------------------- */

const EARTH_RADIUS_METERS = 6_371_008.8;

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

function hasValidCoords(
  obs: NormalizedObservation,
): obs is NormalizedObservation & { lat: number; lng: number; score: number } {
  return (
    obs.basis !== 'excluded' &&
    obs.score !== null &&
    Number.isFinite(obs.score) &&
    typeof obs.lat === 'number' &&
    Number.isFinite(obs.lat) &&
    typeof obs.lng === 'number' &&
    Number.isFinite(obs.lng) &&
    Math.abs(obs.lat) <= 90 &&
    Math.abs(obs.lng) <= 180
  );
}

/**
 * Exact integer-cost Min-Cost Max-Flow solver (Busacker-Gowen successive shortest paths).
 * Guarantees:
 *  1. Maximum cardinality of matched coordinate pairs within maxDistanceMeters
 *  2. Minimum total Haversine distance among all maximum-cardinality matchings
 *  3. Exact BigInt edge costs (0.01 mm precision + lexical ID rank) so zero-cost cycles
 *     never suffer IEEE-754 floating-point drift.
 */
function solveMaxCardinalityMinDistancePairs(
  curr: Array<NormalizedObservation & { lat: number; lng: number; score: number }>,
  prev: Array<NormalizedObservation & { lat: number; lng: number; score: number }>,
  maxDistanceMeters: number,
): Array<{
  currObs: NormalizedObservation & { lat: number; lng: number; score: number };
  prevObs: NormalizedObservation & { lat: number; lng: number; score: number };
  dist: number;
}> {
  const currSorted = [...curr].sort((a, b) => a.id.localeCompare(b.id));
  const prevSorted = [...prev].sort((a, b) => a.id.localeCompare(b.id));

  const nL = currSorted.length;
  const nR = prevSorted.length;
  if (nL === 0 || nR === 0) return [];

  interface Edge {
    to: number;
    rev: number;
    cap: number;
    cost: bigint;
  }

  const ZERO = BigInt(0);
  const S = 0;
  const T = nL + nR + 1;
  const V = T + 1;
  const graph: Edge[][] = Array.from({ length: V }, () => []);

  const addEdge = (from: number, to: number, cap: number, cost: bigint) => {
    graph[from].push({ to, rev: graph[to].length, cap, cost });
    graph[to].push({ to: from, rev: graph[from].length - 1, cap: 0, cost: -cost });
  };

  for (let i = 0; i < nL; i++) addEdge(S, 1 + i, 1, ZERO);
  for (let j = 0; j < nR; j++) addEdge(1 + nL + j, T, 1, ZERO);

  const tieSpan = BigInt(nL * nR + 1);
  const distLookup = new Map<string, number>();

  for (let i = 0; i < nL; i++) {
    for (let j = 0; j < nR; j++) {
      const d = haversineMeters(
        currSorted[i].lat,
        currSorted[i].lng,
        prevSorted[j].lat,
        prevSorted[j].lng,
      );
      if (d <= maxDistanceMeters) {
        const distHundredthsMm = BigInt(Math.round(d * 100_000));
        const tieRank = BigInt(i * nR + j);
        const exactCost = distHundredthsMm * tieSpan + tieRank;
        addEdge(1 + i, 1 + nL + j, 1, exactCost);
        distLookup.set(`${i}:${j}`, d);
      }
    }
  }

  const INF = BigInt(1) << BigInt(120);

  while (true) {
    const dist = new Array<bigint>(V).fill(INF);
    const parentNode = new Array<number>(V).fill(-1);
    const parentEdge = new Array<number>(V).fill(-1);
    const inQueue = new Array<boolean>(V).fill(false);

    dist[S] = ZERO;
    const queue: number[] = [S];
    inQueue[S] = true;

    for (let head = 0; head < queue.length; head++) {
      const u = queue[head];
      inQueue[u] = false;
      for (let eIdx = 0; eIdx < graph[u].length; eIdx++) {
        const e = graph[u][eIdx];
        if (e.cap > 0 && dist[u] + e.cost < dist[e.to]) {
          dist[e.to] = dist[u] + e.cost;
          parentNode[e.to] = u;
          parentEdge[e.to] = eIdx;
          if (!inQueue[e.to]) {
            queue.push(e.to);
            inQueue[e.to] = true;
          }
        }
      }
    }

    if (dist[T] === INF) break;

    let cur = T;
    while (cur !== S) {
      const p = parentNode[cur];
      const idx = parentEdge[cur];
      const edge = graph[p][idx];
      edge.cap -= 1;
      graph[cur][edge.rev].cap += 1;
      cur = p;
    }
  }

  const results: Array<{
    currObs: NormalizedObservation & { lat: number; lng: number; score: number };
    prevObs: NormalizedObservation & { lat: number; lng: number; score: number };
    dist: number;
  }> = [];

  for (let i = 0; i < nL; i++) {
    const u = 1 + i;
    for (const e of graph[u]) {
      if (e.to >= 1 + nL && e.to < T && e.cap === 0) {
        const j = e.to - (1 + nL);
        results.push({
          currObs: currSorted[i],
          prevObs: prevSorted[j],
          dist: distLookup.get(`${i}:${j}`) ?? 0,
        });
      }
    }
  }

  return results;
}

export function compareVisibility(
  current: readonly NormalizedObservation[],
  previous: readonly NormalizedObservation[],
  maxDistanceMeters = MAX_MATCH_DISTANCE_METERS,
): CohortComparisonResult {
  const currValid = current.filter(
    (o) => o.basis !== 'excluded' && o.score !== null && Number.isFinite(o.score),
  );
  const prevValid = previous.filter(
    (o) => o.basis !== 'excluded' && o.score !== null && Number.isFinite(o.score),
  );

  const nCurr = currValid.length;
  const nPrev = prevValid.length;
  const nMin = Math.min(nCurr, nPrev);

  // Patch A: requires >= 50% overlap of smaller grid (floored at 3 for micro-grids, capped at nMin for 1–2 pin tests)
  const requiredPairs = nMin === 0 ? 1 : Math.min(nMin, Math.max(3, Math.ceil(0.5 * nMin)));

  const currWithCoords = current.filter(hasValidCoords);
  const prevWithCoords = previous.filter(hasValidCoords);

  const bases: Array<'complete' | 'partial_pack_only'> = ['complete', 'partial_pack_only'];
  const pairs: MatchedPinPair[] = [];

  for (const basis of bases) {
    const cSub = currWithCoords.filter((o) => o.basis === basis);
    const pSub = prevWithCoords.filter((o) => o.basis === basis);
    const matched = solveMaxCardinalityMinDistancePairs(cSub, pSub, maxDistanceMeters);

    for (const m of matched) {
      const cObs = m.currObs;
      const pObs = m.prevObs;
      const explicitBaselineW =
        typeof pObs.weight === 'number' && Number.isFinite(pObs.weight) && pObs.weight > 0
          ? pObs.weight
          : null;
      const baselineInc = normalizeIncome(pObs.income) ?? normalizeIncome(cObs.income);
      const weight = explicitBaselineW ?? incomeWeight(baselineInc).weight;

      pairs.push({
        currentId: cObs.id,
        previousId: pObs.id,
        basis,
        distanceMeters: roundDisplay(m.dist, 2) ?? 0,
        weight,
        currentScore: cObs.score,
        previousScore: pObs.score,
        delta: cObs.score - pObs.score,
      });
    }
  }

  pairs.sort((a, b) => a.currentId.localeCompare(b.currentId));

  const pairsUsed = pairs.length;
  const completePairs = pairs.filter((p) => p.basis === 'complete').length;
  const partialPairs = pairs.filter((p) => p.basis === 'partial_pack_only').length;
  const passedGate = nMin > 0 && pairsUsed >= requiredPairs;

  let deltaGvsRaw: number | null = null;
  let deltaEvsRaw: number | null = null;

  if (passedGate && pairsUsed > 0) {
    const unweightedSum = pairs.reduce((acc, p) => acc + p.delta, 0);
    deltaGvsRaw = unweightedSum / pairsUsed;

    const wSum = pairs.reduce((acc, p) => acc + p.weight * p.delta, 0);
    const wTotal = pairs.reduce((acc, p) => acc + p.weight, 0);
    deltaEvsRaw = wTotal > 0 ? wSum / wTotal : null;
  }

  return {
    modelVersion: MODEL_VERSION,
    passedGate,
    requiredPairs,
    pairsUsed,
    completePairs,
    partialPairs,
    currentValidCount: nCurr,
    previousValidCount: nPrev,
    currentOverlapRatio: nCurr > 0 ? roundDisplay(pairsUsed / nCurr, 3) ?? 0 : 0,
    previousOverlapRatio: nPrev > 0 ? roundDisplay(pairsUsed / nPrev, 3) ?? 0 : 0,
    deltaGvs: roundDisplay(deltaGvsRaw, 1),
    deltaGvsRaw,
    deltaEvs: roundDisplay(deltaEvsRaw, 1),
    deltaEvsRaw,
    coverageDisclosure: `${pairsUsed} matched of ${nCurr}`,
    pairs,
  };
}

/* -------------------------------------------------------------------------- */
/* Section 3: Portfolio Search Share Index (PSSI)                             */
/* -------------------------------------------------------------------------- */

export function summarizePortfolio(
  offices: readonly OfficePortfolioInput[],
): PortfolioRollupResult {
  const excludedOfficeIds: string[] = [];
  const officeSummaries: PortfolioRollupResult['offices'] = [];

  let pssiWeightedSum = 0;
  let pssiWeightTotal = 0;
  let nonBrandWeightedSum = 0;
  let nonBrandWeightTotal = 0;
  let brandWeightedSum = 0;
  let brandWeightTotal = 0;
  let deltaWeightedSum = 0;
  let deltaWeightTotal = 0;

  for (const office of offices) {
    const omega =
      typeof office.capacityWeight === 'number' && office.capacityWeight > 0
        ? office.capacityWeight
        : 1.0;

    if (office.eligible === false) {
      excludedOfficeIds.push(office.officeId);
      continue;
    }

    let kwSum = 0;
    let kwWeight = 0;
    let nbSum = 0;
    let nbWeight = 0;
    let bSum = 0;
    let bWeight = 0;
    let dSum = 0;
    let dWeight = 0;
    let eligibleKeywords = 0;
    const excludedKeywords: string[] = [];

    for (const kw of office.keywords) {
      if (kw.score === null || !Number.isFinite(kw.score)) {
        excludedKeywords.push(kw.keyword);
        continue;
      }
      const w = INTENT_WEIGHTS[kw.intent];
      eligibleKeywords++;
      kwSum += w * kw.score;
      kwWeight += w;

      if (kw.isBranded) {
        bSum += w * kw.score;
        bWeight += w;
      } else {
        nbSum += w * kw.score;
        nbWeight += w;
      }

      if (typeof kw.matchedDelta === 'number' && Number.isFinite(kw.matchedDelta)) {
        dSum += w * kw.matchedDelta;
        dWeight += w;
      }
    }

    if (eligibleKeywords === 0 || kwWeight === 0) {
      excludedOfficeIds.push(office.officeId);
      officeSummaries.push({
        officeId: office.officeId,
        officeName: office.officeName,
        weight: omega,
        score: null,
        nonBrandScore: null,
        brandScore: null,
        sameStoreDelta: null,
        eligibleKeywords: 0,
        excludedKeywords,
      });
      continue;
    }

    const officeRaw = kwSum / kwWeight;
    const nbRaw = nbWeight > 0 ? nbSum / nbWeight : null;
    const bRaw = bWeight > 0 ? bSum / bWeight : null;
    const dRaw = dWeight > 0 ? dSum / dWeight : null;

    pssiWeightedSum += omega * officeRaw;
    pssiWeightTotal += omega;

    if (nbRaw !== null) {
      nonBrandWeightedSum += omega * nbRaw;
      nonBrandWeightTotal += omega;
    }
    if (bRaw !== null) {
      brandWeightedSum += omega * bRaw;
      brandWeightTotal += omega;
    }
    if (dRaw !== null) {
      deltaWeightedSum += omega * dRaw;
      deltaWeightTotal += omega;
    }

    officeSummaries.push({
      officeId: office.officeId,
      officeName: office.officeName,
      weight: omega,
      score: roundDisplay(officeRaw, 1),
      nonBrandScore: roundDisplay(nbRaw, 1),
      brandScore: roundDisplay(bRaw, 1),
      sameStoreDelta: roundDisplay(dRaw, 1),
      eligibleKeywords,
      excludedKeywords,
    });
  }

  officeSummaries.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const eligibleOfficeCount = officeSummaries.filter((o) => o.score !== null).length;
  const pssiRaw = pssiWeightTotal > 0 ? pssiWeightedSum / pssiWeightTotal : null;
  const nbPssiRaw = nonBrandWeightTotal > 0 ? nonBrandWeightedSum / nonBrandWeightTotal : null;
  const bPssiRaw = brandWeightTotal > 0 ? brandWeightedSum / brandWeightTotal : null;
  const sameStoreRaw = deltaWeightTotal > 0 ? deltaWeightedSum / deltaWeightTotal : null;

  return {
    modelVersion: MODEL_VERSION,
    pssi: roundDisplay(pssiRaw, 1),
    pssiRaw,
    nonBrandPssi: roundDisplay(nbPssiRaw, 1),
    brandPssi: roundDisplay(bPssiRaw, 1),
    sameStoreDelta: roundDisplay(sameStoreRaw, 1),
    canRenderLeagueTable: eligibleOfficeCount >= 2,
    eligibleOfficeCount,
    excludedOfficeIds,
    offices: officeSummaries,
  };
}

/* -------------------------------------------------------------------------- */
/* Section 4: Attribution, PMRV & Unit Economics                              */
/* -------------------------------------------------------------------------- */

export function computeCommercialImpact(
  input: CommercialAttributionInput,
): CommercialImpactResult {
  const g = input.googleTelemetry;
  const crm = input.reconciledCrm;
  const bm = input.benchmarks;
  const ue = input.unitEconomics;

  const calls = g?.gbpCalls ?? null;
  const bookingsMsgs =
    g?.gbpBookings !== null && g?.gbpBookings !== undefined
      ? (g.gbpBookings ?? 0) + (g.gbpMessages ?? 0)
      : g?.gbpMessages ?? null;
  const webClicks = g?.gbpWebsiteClicks ?? null;
  const listingSessions = g?.ga4ListingLandingSessions ?? null;
  const gscClicks = g?.gscTotalClicks ?? null;
  const directions = g?.gbpDirections ?? null;

  const hasCrm = typeof crm?.distinctQualifiedInquiries === 'number';
  const hasGoogle =
    calls !== null || webClicks !== null || listingSessions !== null || gscClicks !== null;

  const attributionTier: CommercialImpactResult['attributionTier'] = hasCrm
    ? 'reconciled_crm'
    : hasGoogle
      ? 'verified_google_telemetry'
      : 'unavailable';

  let exactMatchedUsd = 0;
  let fallbackUnclassifiedUsd = 0;
  let unclassifiedClicksPriced = 0;

  if (g?.gscMatchedNonBrandClicks?.length) {
    for (const item of g.gscMatchedNonBrandClicks) {
      if (item.clicks > 0 && item.cpcUsd > 0) {
        exactMatchedUsd += item.clicks * item.cpcUsd;
      }
    }
  }

  const catCpc = bm?.primaryCategoryCpcUsd ?? null;
  if (catCpc !== null && catCpc > 0) {
    const gbpWebVolume = listingSessions ?? webClicks ?? 0;
    exactMatchedUsd += gbpWebVolume * catCpc;

    if (calls !== null && calls > 0) {
      const callRate = bm?.costPerQualifiedCallUsd ?? 1.8 * catCpc;
      exactMatchedUsd += calls * callRate;
    }

    if (typeof g?.gscUnclassifiedClicks === 'number' && g.gscUnclassifiedClicks > 0) {
      const discount = bm?.unclassifiedClickDiscount ?? 0.5;
      unclassifiedClicksPriced = g.gscUnclassifiedClicks;
      fallbackUnclassifiedUsd = unclassifiedClicksPriced * (catCpc * discount);
    }
  }

  const totalPmrvRaw =
    exactMatchedUsd + fallbackUnclassifiedUsd > 0
      ? exactMatchedUsd + fallbackUnclassifiedUsd
      : null;

  const pmrvNote =
    totalPmrvRaw === null
      ? 'Unavailable: supply market/service CPC benchmarks to compute paid-media replacement value.'
      : unclassifiedClicksPriced > 0
        ? `Includes $${Math.round(exactMatchedUsd).toLocaleString('en-US')} priced from category and query benchmarks (calls at the call-value multiple) plus $${Math.round(fallbackUnclassifiedUsd).toLocaleString('en-US')} conservative floor (${unclassifiedClicksPriced} privacy-redacted Search Console clicks at ${Math.round(100 * (bm?.unclassifiedClickDiscount ?? 0.5))}% category CPC).`
        : '100% priced from matched query/category paid benchmarks.';

  let expectedWinsJ: number | null = null;
  let expectedValueUsdR: number | null = null;
  let basisDisclosure =
    'Unavailable: requires stage-aligned conversion rates and average value per win.';

  const closeRate = ue?.closeRate ?? null;
  const aov = ue?.averageValuePerWinUsd ?? null;
  const etaWeb = ue?.qualifiedWebInquiryRate ?? null;

  if (closeRate !== null && closeRate > 0 && closeRate <= 1 && aov !== null && aov > 0) {
    if (hasCrm && crm) {
      expectedWinsJ = roundDisplay(crm.distinctQualifiedInquiries * closeRate, 2);
      expectedValueUsdR = roundDisplay(crm.distinctQualifiedInquiries * closeRate * aov, 0);
      basisDisclosure = 'Modeled from Tier-2 deduplicated CRM qualified inquiries (Q × c).';
    } else if (hasGoogle && etaWeb !== null && etaWeb >= 0 && etaWeb <= 1) {
      const directCallsAndBookings = (calls ?? 0) + (bookingsMsgs ?? 0);
      const disjointWebEntrances = (listingSessions ?? webClicks ?? 0) + (gscClicks ?? 0);
      const estQualifiedInquiries = directCallsAndBookings + disjointWebEntrances * etaWeb;
      expectedWinsJ = roundDisplay(estQualifiedInquiries * closeRate, 2);
      expectedValueUsdR = roundDisplay(estQualifiedInquiries * closeRate * aov, 0);
      basisDisclosure =
        'Modeled from Tier-1 verified Google actions using client-supplied web qualification (η_web) and close (c) assumptions.';
    }
  }

  return {
    attributionTier,
    verifiedInquiriesH: hasCrm && crm ? crm.distinctQualifiedInquiries : null,
    observedActions: {
      gbpCalls: calls,
      gbpBookingsAndMessages: bookingsMsgs,
      gbpWebsiteClicks: webClicks,
      ga4ListingSessions: listingSessions,
      gscClicks,
      gbpDirections: directions,
    },
    pmrv: {
      totalUsd: roundDisplay(totalPmrvRaw, 0),
      exactMatchedUsd: roundDisplay(exactMatchedUsd, 0) ?? 0,
      fallbackUnclassifiedUsd: roundDisplay(fallbackUnclassifiedUsd, 0) ?? 0,
      unclassifiedClicksPriced,
      coverageNote: pmrvNote,
    },
    modeledPipeline: {
      expectedWinsJ,
      expectedValueUsdR,
      basisDisclosure,
    },
    actualOutcomes: {
      wins: crm?.bookedJobsOrSignedCases ?? null,
      collectedRevenueUsd: crm?.collectedRevenueUsd ?? null,
    },
  };
}
