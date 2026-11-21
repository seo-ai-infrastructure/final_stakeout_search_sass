/**
 * Which network a scan's searches go out on, chosen on the New scan page:
 *   residential: home internet (Proxy-Seller, with Decodo as backup)
 *   mobile:      mobile data (a carrier IP from the nearest big city in the point's state)
 *   mix:         both, spread over the map like a checkerboard, so each point keeps its network
 *                on every run and both kinds of searcher are covered.
 * Pure functions only: the New scan page uses them to show the price before a scan is created.
 */

export type ScanNetwork = 'residential' | 'mobile' | 'mix';
type PointNetwork = 'residential' | 'mobile';

export const NETWORK_LABELS: Record<ScanNetwork, string> = {
  residential: 'Residential Network',
  mobile: 'Mobile Network',
  mix: 'Mix of Both: Mobile & Residential Networks',
};

export const asScanNetwork = (v: unknown): ScanNetwork => (v === 'mobile' || v === 'mix' ? v : 'residential');

/** The network one point runs on. In a mix, the points alternate like a checkerboard. */
export function pinNetwork(scanNetwork: string | null | undefined, rowIdx: number, colIdx: number): PointNetwork {
  if (scanNetwork === 'mobile') return 'mobile';
  if (scanNetwork === 'mix') return (rowIdx + colIdx) % 2 === 0 ? 'mobile' : 'residential';
  return 'residential';
}

/** Credits for a scan's points: 1 for a home-internet point, the mobile price for a mobile one. */
export function scanCost(network: string | null | undefined, pins: { rowIdx: number; colIdx: number }[], mobilePrice: number) {
  return pins.reduce((n, p) => n + (pinNetwork(network, p.rowIdx, p.colIdx) === 'mobile' ? mobilePrice : 1), 0);
}

/**
 * What each point of a scan was charged, worked out from what the whole scan was charged, so a
 * price changed later never alters a refund or a re-run. Every point costs the same unless it is
 * a mix, where mobile points cost the mobile price and home-internet points 1.
 */
export function pointPrice(
  scan: { network?: string | null; creditsCharged: number; totalPins: number; speed?: string | null },
  pins: { rowIdx: number; colIdx: number }[],
): (pin: { rowIdx: number; colIdx: number }) => number {
  if (scan.network !== 'mix') {
    const per = scan.totalPins > 0 ? scan.creditsCharged / scan.totalPins : 0;
    return () => per;
  }
  if (!scan.creditsCharged) return () => 0;
  // A home point costs 1 when scheduled, and 2 on Scan Now; the mobile points share the rest. A scan
  // from before Scan Now reads as "now" but was charged 1 a home point: the charge itself tells them
  // apart, as at 2 a home point what is left is a whole, even share of at least 2 a mobile point.
  const mobile = pins.filter((p) => pinNetwork('mix', p.rowIdx, p.colIdx) === 'mobile').length;
  const home = pins.length - mobile;
  const rest2 = scan.creditsCharged - home * 2;
  const home1 = scan.speed === 'scheduled' ? 1 : mobile ? (rest2 >= mobile * 2 && rest2 % mobile === 0 ? 2 : 1) : rest2 === 0 ? 2 : 1;
  const m = mobile ? Math.max(0, Math.round((scan.creditsCharged - home * home1) / mobile)) : 0;
  return (pin) => (pinNetwork('mix', pin.rowIdx, pin.colIdx) === 'mobile' ? m : home1);
}

/**
 * Rows and columns for freely placed points ("Top income areas"): north to south in rows of the
 * smallest offered grid that holds them all, west to east within a row. The same layout the
 * server gives them (grid.ts placedPins), so the page can price a mix exactly.
 */
export function placedLayout<T extends { lat: number; lng: number }>(points: T[], sizes: readonly number[]) {
  const gridSize = [...sizes].sort((a, b) => a - b).find((n) => n * n >= points.length) ?? Math.max(...sizes);
  const rows = [...points].sort((a, b) => b.lat - a.lat);
  const cells: (T & { rowIdx: number; colIdx: number })[] = [];
  for (let r = 0; r * gridSize < rows.length; r++) {
    const row = rows.slice(r * gridSize, (r + 1) * gridSize).sort((a, b) => a.lng - b.lng);
    row.forEach((p, c) => cells.push({ ...p, rowIdx: r, colIdx: c }));
  }
  return { gridSize, cells };
}
