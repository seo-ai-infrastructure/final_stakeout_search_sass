/**
 * Apple Maps scans: the search runs on maps.apple.com in Firefox Focus on the phone. Apple's site
 * does not read the phone's GPS for a search; it searches the part of the map on screen. So each
 * grid point opens the map centred on its own coordinates (the address below), and the keyword is
 * typed there: the results are Apple's for that spot.
 */
/** The map's height and width in degrees around a point: Apple's own default view (about 3.5 miles tall). */
export const APPLE_SPAN = { lat: 0.05, lng: 0.082 };

/** maps.apple.com opened on one grid point. */
export function appleStartUrl(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('APPLE_BAD_COORDINATES');
  return `https://maps.apple.com/search?center=${lat.toFixed(6)}%2C${lng.toFixed(6)}&span=${APPLE_SPAN.lat.toFixed(6)}%2C${APPLE_SPAN.lng.toFixed(6)}`;
}

/** Scan types by the name people see. */
export const SURFACE_LABEL: Record<string, string> = {
  mobile_chrome: 'Mobile Search',
  mobile_maps: 'Google Maps app',
  mobile_google: 'Google app',
  mobile_apple: 'Apple Maps',
  desktop_aimode: 'Desktop AI Mode',
};
export const surfaceLabel = (targetType: string) => SURFACE_LABEL[targetType] ?? targetType.replaceAll('_', ' ');
