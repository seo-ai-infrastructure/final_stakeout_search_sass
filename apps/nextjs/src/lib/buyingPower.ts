import type { AreaEstimate, PinCensus } from '@stakeout/core/censusLookup';

/**
 * Visibility weighted by buying power (the demo's method, on real ranks): each point's tract
 * contributes owner-occupied homes × median household income, shared equally among the points
 * in that tract so a tract is never counted twice. Points without an estimate are left out of
 * the weighting, never given a guessed value. Tracts, not block groups: their estimates are steadier.
 */
export type BuyingPowerFilters = { minOwnerPct: number; minIncome: number };
export type BuyingPowerPin = { id: string; status: string; rankFound: number | null; census?: PinCensus | null };
export const NO_FILTERS: BuyingPowerFilters = { minOwnerPct: 0, minIncome: 0 };

export const weightArea = (c?: PinCensus | null): AreaEstimate | undefined => c?.tract;

export function passesFilters(c: PinCensus | null | undefined, f: BuyingPowerFilters) {
  if (f.minOwnerPct <= 0 && f.minIncome <= 0) return true;
  const t = weightArea(c);
  return (f.minOwnerPct <= 0 || (t?.own_pct ?? -1) >= f.minOwnerPct) && (f.minIncome <= 0 || (t?.inc ?? -1) >= f.minIncome);
}

export function buyingPower(
  pins: BuyingPowerPin[],
  filters: BuyingPowerFilters = NO_FILTERS,
  rankOf: (p: BuyingPowerPin) => number | null | undefined = (p) => p.rankFound,
) {
  const observed = pins.filter((p) => p.status === 'COMPLETED');
  const eligible = observed.filter((p) => passesFilters(p.census, filters));
  const inTop3 = (p: BuyingPowerPin) => {
    const r = rankOf(p);
    return typeof r === 'number' && r >= 1 && r <= 3;
  };
  const pinsPerTract = new Map<string, number>();
  for (const p of eligible) {
    const t = weightArea(p.census);
    if (t?.id && t.inc && t.own) pinsPerTract.set(t.id, (pinsPerTract.get(t.id) ?? 0) + 1);
  }
  let total = 0,
    captured = 0,
    weightedPins = 0;
  for (const p of eligible) {
    const t = weightArea(p.census);
    if (!t?.id || !t.inc || !t.own) continue;
    const weight = (t.inc * t.own) / pinsPerTract.get(t.id)!;
    total += weight;
    weightedPins++;
    if (inTop3(p)) captured += weight;
  }
  const top3 = eligible.filter(inTop3).length;
  const standard = eligible.length ? (100 * top3) / eligible.length : null;
  const weighted = total > 0 ? (100 * captured) / total : null;
  return {
    observed: observed.length,
    eligible: eligible.length,
    top3,
    standard,
    buyingPower: weighted,
    delta: standard !== null && weighted !== null ? weighted - standard : null,
    weightedPins,
    tracts: pinsPerTract.size,
  };
}
