import raw from '@/data/demo-real-scans.json';
import type { DemoPin } from '@/lib/demographics';

/** Real Stakeout scans behind the public demo. Regenerate the JSON from the share reports; never hand-edit numbers. */
/** 'top25': one point in each of the highest-income census areas near the business (the wizard's "Top income areas" shape). 'grid': a standard 7×7 grid. */
export type ScanKey = 'top25' | 'grid';
export type RealPin = DemoPin & {
  pinId: string; row: number; col: number; zip: string;
  /** Observed local rank, null when the business was not in the local results the phone displayed. */
  rank: number | null;
  /** False when Google showed a single business instead of a local list. */
  pack: boolean; solo: string | null;
  aio: boolean; aiPos: number | null; aiCount: number;
  adsAbove: number | null; advertisers: number; isp: string | null; sources: string[];
};
type RawPin = Omit<RealPin, 'rankSouth' | 'rankNorth' | 'aiCited'> & { cited: boolean };
type RawScan = { shareToken: string; date: string; gridSize: number; spacingMiles: number; device: string; network: string; solv: number; aioTriggerRate: number; aioCitationRate: number; leaders: { name: string; top3: number }[]; aiNamed: { name: string; named: number; first: number; avgPlace: number; localFound: number }[]; sites: { domain: string; count: number }[]; solos: { name: string; count: number }[]; pins: RawPin[] };
export type RealScan = Omit<RawScan, 'pins'> & { pins: RealPin[] };

/** Rank value the map uses for "not found", so it lands in the grey band. */
export const NOT_FOUND = 99;

const data = raw as unknown as { business: string; ownDomain: string; city: string; keyword: string; scans: Record<ScanKey, RawScan> };
const toPin = ({ cited, ...p }: RawPin): RealPin => ({ ...p, rankSouth: p.rank ?? NOT_FOUND, rankNorth: p.rank ?? NOT_FOUND, aiCited: cited });

export const DEMO = {
  business: data.business, ownDomain: data.ownDomain, city: data.city, keyword: data.keyword,
  scans: {
    top25: { ...data.scans.top25, pins: data.scans.top25.pins.map(toPin) },
    grid: { ...data.scans.grid, pins: data.scans.grid.pins.map(toPin) },
  } as Record<ScanKey, RealScan>,
};

export const proofVideoUrl = (scan: RealScan, pin: RealPin) => `/api/proof/${pin.pinId}?kind=video&share=${scan.shareToken}`;
export const shareReportUrl = (scan: RealScan) => `/share/${scan.shareToken}`;
const DIRECTORIES = /(^|\.)(google|yelp|thumbtack|angi|bbb|facebook|nextdoor)\./;

/** Every headline number on the demo page comes from here, counted from the scan's own pins. */
export function scanStats(scan: RealScan) {
  const pins = scan.pins, n = pins.length;
  const count = (f: (p: RealPin) => boolean) => pins.filter(f).length;
  const sites = new Map<string, number>();
  for (const p of pins) for (const s of p.sources) if (!DIRECTORIES.test(s)) sites.set(s, (sites.get(s) ?? 0) + 1);
  const own = sites.get(DEMO.ownDomain) ?? 0;
  const rival = [...sites].filter(([s]) => s !== DEMO.ownDomain).sort((a, b) => b[1] - a[1])[0] ?? null;
  const above = pins.flatMap(p => (p.adsAbove == null ? [] : [p.adsAbove]));
  return {
    n,
    top3: count(p => p.rank != null && p.rank <= 3),
    notFound: count(p => p.rank == null),
    notFoundButNamed: count(p => p.rank == null && p.aiCited),
    singleBusiness: count(p => !p.pack),
    aio: count(p => p.aio),
    named: count(p => p.aiCited),
    namedFirst: count(p => p.aiPos === 1),
    ownSite: own,
    rivalSite: rival ? { domain: rival[0], count: rival[1] } : null,
    listsOpened: above.length,
    avgAdsAbove: above.length ? above.reduce((a, b) => a + b, 0) / above.length : null,
  };
}
export const pct = (part: number, whole: number) => (whole ? Math.round((100 * part) / whole) : 0);

/**
 * Ranks a leading rank-grid tool reported for the same keyword and business on the same 7×7 points,
 * row by row from the north-west corner. Transcribed from the tool's map; re-check against the source before editing.
 */
export const TRACKER_GRID: number[][] = [
  [13, 12, 11, 9, 9, 8, 5],
  [10, 8, 7, 8, 6, 4, 4],
  [12, 8, 7, 5, 5, 4, 1],
  [11, 7, 4, 3, 2, 2, 1],
  [10, 5, 4, 2, 1, 1, 1],
  [11, 8, 5, 3, 1, 1, 1],
  [11, 7, 4, 3, 1, 1, 1],
];
