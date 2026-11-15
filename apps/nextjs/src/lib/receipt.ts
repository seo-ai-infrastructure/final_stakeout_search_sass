import { ispLabel } from './ispLabel';

type Pin = {
  rowIdx: number; colIdx: number; lat: number; lng: number; zip: string; city: string; stateCode: string;
  rankFound: number | null; topCompetitors: unknown; hasAiOverview: boolean; targetCitedInAi: boolean;
  evidenceSha256: string | null; scan: { keyword: string; targetBusiness: string };
};

/**
 * The receipt a customer downloads for one point: when and where the search ran, on what phone and
 * internet provider, what it found, and the fingerprint of the evidence. It is built field by field
 * from the stored record, so nothing else in that record (how the run was carried out, which
 * services it used, where files are kept) can reach a customer, now or when the record grows.
 */
export function customerReceipt(full: Record<string, unknown>, pin: Pin) {
  const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const prints = (full.fingerprints ?? {}) as Record<string, unknown>;
  return {
    receipt: 'Stakeout Search',
    searchedAt: text(full.timestamp),
    keyword: pin.scan.keyword,
    business: pin.scan.targetBusiness,
    point: { row: pin.rowIdx + 1, column: pin.colIdx + 1, latitude: pin.lat, longitude: pin.lng, city: pin.city, state: pin.stateCode, zip: pin.zip },
    phone: text(full.observedModel),
    internetProvider: ispLabel(full.proxyCheck as Parameters<typeof ispLabel>[0]),
    googleLocation: text(full.locationSource),
    result: {
      rank: pin.rankFound,
      topResults: Array.isArray(pin.topCompetitors) ? pin.topCompetitors.filter((x) => typeof x === 'string').slice(0, 20) : [],
      aiOverviewShown: pin.hasAiOverview,
      namedInAiOverview: pin.targetCitedInAi,
    },
    evidence: {
      fingerprint: pin.evidenceSha256,
      recordingFingerprint: text(prints['video.mp4']),
      algorithm: 'SHA-256',
    },
  };
}
