export type MetricKey = 'income' | 'owner_pct' | 'year_built' | 'none';
export type Scenario = 'south' | 'north';
export type Tract = {
  GEOID: string; NAMELSAD: string; center: number[];
  income: number | null; income_moe: number | null; income_annotation: string;
  home_value: number | null; home_value_moe: number | null; home_value_annotation: string;
  year_built: number | null; year_built_moe: number | null; year_built_annotation: string;
  owner_units: number | null; occupied_units: number | null;
  owner_units_moe: number | null; occupied_units_moe: number | null;
  owner_pct: number | null; poverty_pct: number | null; unemp_pct: number | null;
};
export type DemoPin = { id: string; lat: number; lng: number; tractId: string | null; rankSouth: number; rankNorth: number; aiCited: boolean };
export type Filters = { minOwners: number; minIncome: number };
export const validNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
export const pinRank = (pin: DemoPin, scenario: Scenario) => scenario === 'south' ? pin.rankSouth : pin.rankNorth;
export function matchesFilters(tract: Tract | undefined, filters: Filters) {
  return (filters.minOwners <= 0 || (validNumber(tract?.owner_pct) && tract.owner_pct >= filters.minOwners)) &&
    (filters.minIncome <= 0 || (validNumber(tract?.income) && tract.income >= filters.minIncome));
}
/** A represented tract's modeled weight is shared among its pins; never impute missing Census data. */
export function visibilityMetrics(pins: DemoPin[], tracts: Record<string, Tract>, scenario: Scenario, filters: Filters) {
  const eligible = pins.filter(p => matchesFilters(p.tractId ? tracts[p.tractId] : undefined, filters));
  const counts = new Map<string, number>();
  for (const p of eligible) if (p.tractId) counts.set(p.tractId, (counts.get(p.tractId) ?? 0) + 1);
  let totalWeight = 0, capturedWeight = 0, weightedPins = 0;
  for (const pin of eligible) {
    const t = pin.tractId ? tracts[pin.tractId] : undefined;
    if (!t || !validNumber(t.income) || !validNumber(t.owner_units) || t.income === 0 || t.owner_units === 0) continue;
    const weight = t.income * t.owner_units / counts.get(t.GEOID)!;
    totalWeight += weight; weightedPins++;
    if (pinRank(pin, scenario) >= 1 && pinRank(pin, scenario) <= 3) capturedWeight += weight;
  }
  const top3 = eligible.filter(p => pinRank(p, scenario) >= 1 && pinRank(p, scenario) <= 3).length;
  const standard = eligible.length ? 100 * top3 / eligible.length : null;
  const weighted = totalWeight > 0 ? 100 * capturedWeight / totalWeight : null;
  return { eligible, top3, standard, weighted, weightedPins, representedTracts: counts.size, delta: standard !== null && weighted !== null ? weighted - standard : null };
}
export const formatMoney = (value: number | null | undefined) => validNumber(value) ? `$${Math.round(value).toLocaleString('en-US')}` : 'Not available';
export const formatPercent = (value: number | null | undefined) => validNumber(value) ? `${value.toFixed(1)}%` : 'Not available';
export const formatCount = (value: number | null | undefined) => validNumber(value) ? Math.round(value).toLocaleString('en-US') : 'Not available';
