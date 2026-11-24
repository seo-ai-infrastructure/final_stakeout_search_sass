/**
 * Tracked locations: the distinct businesses an account scans. A plan tracks up to so many a
 * billing month (Scout 5, Agency 20, Scale 50, Agency Max no limit; see ACCOUNT_PLANS.locations).
 * Two scans are of the same business when they carry the same Google ID, or (without one on both)
 * the same name within SAME_PLACE_KM (25 km, about 15 miles) of each other, so suburb grids across
 * one metro, a re-centred grid or a different suffix (LLC, Inc.) never count as a new client.
 */
export type ScanPlace = { business: string; googleId?: string | null; lat: number; lng: number };

/** Same name this close together: one business (an agency's suburb grids across one metro stay one client). */
export const SAME_PLACE_KM = 25;

/** A business name as compared: lower case, letters and digits only, without company suffixes. */
export function businessKey(name: string): string {
  const k = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(llc|l l c|inc|incorporated|pllc|pc|p c|co|corp|corporation|ltd|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return k || name.trim().toLowerCase();
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function samePlace(a: ScanPlace, b: ScanPlace): boolean {
  if (a.googleId && b.googleId) return a.googleId === b.googleId;
  return businessKey(a.business) === businessKey(b.business) && km(a, b) <= SAME_PLACE_KM;
}

/** The distinct businesses among these scans, in the order first seen. */
export function distinctPlaces(scans: ScanPlace[]): ScanPlace[] {
  const out: ScanPlace[] = [];
  for (const s of scans) {
    const had = out.find((o) => samePlace(o, s));
    // A later scan with the Google ID teaches the earlier one its ID.
    if (had) { if (!had.googleId && s.googleId) had.googleId = s.googleId; }
    else out.push({ ...s });
  }
  return out;
}
