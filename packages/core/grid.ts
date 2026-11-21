import { monthlyText } from './speed';
import { siteDomain } from './businessSite';
import { GOOGLE_ID_HELP, googleIdOf } from './businessIds';
import { asScanNetwork, placedLayout } from './network';
import { createHash } from 'node:crypto';
import zipcodes from 'zipcodes';
import { ANY_PHONE } from './hardware';
import { normPlace } from './proxyGeo';

export class InputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export { OFFERED_GRID_SIZES } from './gridSizes';

export function parseSpec(input: Record<string, unknown>) {
  const { keyword, targetBusiness, centerLat, centerLng } = input;
  if (
    typeof keyword !== 'string' ||
    !keyword.trim() ||
    keyword.length > 200 ||
    typeof targetBusiness !== 'string' ||
    !targetBusiness.trim() ||
    targetBusiness.length > 200
  ) {
    throw new InputError(
      'Enter a business name and query of 1–200 characters.',
    );
  }
  if (
    typeof centerLat !== 'number' ||
    !Number.isFinite(centerLat) ||
    Math.abs(centerLat) >= 85 ||
    typeof centerLng !== 'number' ||
    !Number.isFinite(centerLng) ||
    Math.abs(centerLng) > 180
  ) {
    throw new InputError('Enter valid US coordinates.');
  }
  const { gridSize = 5, spacingKm = 1.60934, trackAiOverviews = false } = input;
  if (
    typeof gridSize !== 'number' ||
    ![3, 5, 7, 9, 11].includes(gridSize) ||
    typeof spacingKm !== 'number' ||
    ![0.80467, 1.60934, 3.21868, 4.82802, 8.04672].includes(spacingKm) ||
    typeof trackAiOverviews !== 'boolean'
  )
    throw new InputError('Invalid grid size, spacing or AI option.');
  const targetType = String(input.targetType ?? 'mobile_maps');
  const scheduleType = String(input.scheduleType ?? 'once');
  // No phone choice: a scan runs on whichever phone in the fleet is free.
  const phoneBrand = ANY_PHONE;
  const phoneModel = ANY_PHONE;
  // ISP choice: "any", one ISP for every point, or a mix spread across the grid.
  const legacyIsp = String(input.ispId ?? 'ANY');
  const ispMode = String(input.ispMode ?? (legacyIsp !== 'ANY' && legacyIsp !== 'MIX' ? 'single' : 'any'));
  const rawIsps = Array.isArray(input.isps) ? input.isps : ispMode === 'single' && legacyIsp !== 'ANY' ? [legacyIsp] : [];
  const isps = [...new Set(rawIsps.map((v) => String(v).trim()))];
  if (
    !['any', 'single', 'mix'].includes(ispMode) ||
    isps.some((v) => !v || v.length > 120 || /[\u0000-\u001f]/.test(v)) ||
    (ispMode === 'any' && isps.length) ||
    (ispMode === 'single' && isps.length !== 1) ||
    (ispMode === 'mix' && (isps.length < 2 || isps.length > 6))
  )
    throw new InputError('Choose any ISP, one ISP, or a mix of 2–6 ISPs.');
  const ispId = ispMode === 'single' ? isps[0] : ispMode === 'mix' ? 'MIX' : 'ANY';
  // Which network the searches go out on: residential (home internet), mobile (mobile data) or a
  // mix of both. There is no ISP choice with mobile data or a mix.
  const network = asScanNetwork(input.network);
  if (network !== 'residential' && ispMode !== 'any') throw new InputError('Mobile and mixed networks have no ISP choice: choose "Any ISP".');
  const proxyRegion = typeof input.proxyRegion === 'string' ? input.proxyRegion : null;
  const proxyCity = typeof input.proxyCity === 'string' ? input.proxyCity : null;
  if (
    ![
      'mobile_maps',
      'mobile_chrome',
      'mobile_google',
      ...(process.env.DESKTOP_ENABLED === 'true' ? ['desktop_aimode'] : []),
    ].includes(targetType)
  )
    throw new InputError('Choose a supported Android surface.');
  if (!['once', 'daily', 'weekly', 'biweekly'].includes(scheduleType))
    throw new InputError('Invalid schedule.');
  // Optional: the business's own website, kept as a bare domain. Anything given must be readable as one.
  const typedSite = typeof input.targetDomain === 'string' ? input.targetDomain.trim() : '';
  const targetDomain = siteDomain(typedSite);
  if (typedSite && !targetDomain) throw new InputError('Enter the website as a domain, such as stuartsplumbing.com.');
  // Optional: Google's ID for the business (/g/…). Google's AI answers link each business they name
  // to its Google listing, so the answer is matched by this ID first. Anything given must hold one
  // (a Share link is turned into the ID before this, by the server).
  const typedId = typeof input.targetKgmid === 'string' ? input.targetKgmid.trim() : '';
  const targetKgmid = googleIdOf(typedId) || null;
  if (typedId && !targetKgmid) throw new InputError(GOOGLE_ID_HELP);
  return {
    keyword: keyword.trim(),
    targetBusiness: targetBusiness.trim(),
    targetDomain,
    targetKgmid,
    centerLat,
    centerLng,
    gridSize,
    spacingKm,
    // AI Overviews are captured on every scan that can show one, at no extra credit; what the
    // caller sends is ignored. The Maps app's AI answers ("Ask Maps") are not captured yet.
    trackAiOverviews: targetType !== 'mobile_maps',
    targetType,
    scheduleType,
    phoneBrand,
    phoneModel,
    ispId,
    ispMode,
    isps,
    proxyRegion,
    proxyCity,
    network,
  };
}
export type ScanSpec = ReturnType<typeof parseSpec>;
const cityIndex = new Map<string, Map<string, { lat: number; lng: number }>>();
/**
 * The centre of a US city, from the bundled ZIP code database (the mean of its ZIP centroids), or
 * null when the name is not in it. Names are matched the way proxy cities are ("St. Petersburg"
 * and "Saint Petersburg" are the same place). Offline and free: nothing to look up or go stale.
 */
export function cityCoords(city: string, stateCode: string): { lat: number; lng: number } | null {
  const st = stateCode.toUpperCase();
  let cities = cityIndex.get(st);
  if (!cities) {
    const sums = new Map<string, { lat: number; lng: number; n: number }>();
    for (const z of zipcodes.lookupByState(st) ?? []) {
      if (!Number.isFinite(z.latitude) || !Number.isFinite(z.longitude)) continue;
      const k = normPlace(z.city), c = sums.get(k) ?? { lat: 0, lng: 0, n: 0 };
      sums.set(k, { lat: c.lat + z.latitude, lng: c.lng + z.longitude, n: c.n + 1 });
    }
    cities = new Map([...sums].map(([k, c]) => [k, { lat: c.lat / c.n, lng: c.lng / c.n }]));
    cityIndex.set(st, cities);
  }
  return cities.get(normPlace(city)) ?? null;
}

export function market(lat: number, lng: number) {
  const z = zipcodes.lookupByCoords(lat, lng);
  if (!z || z.country !== 'US')
    throw new InputError('Choose a location near a US postal area.');
  const km = Math.hypot(
    (lat - z.latitude) * 111.2,
    (lng - z.longitude) * 111.2 * Math.cos((lat * Math.PI) / 180),
  );
  if (km > 120)
    throw new InputError('Location is too far from a mapped US ZIP centroid.');
  return { zip: z.zip, city: z.city, stateCode: z.state };
}
export function buildGrid(s: ScanSpec) {
  const half = (s.gridSize - 1) / 2,
    dy = ((s.spacingKm / 6371) * 180) / Math.PI,
    dx = dy / Math.cos((s.centerLat * Math.PI) / 180);
  return Array.from({ length: s.gridSize ** 2 }, (_, i) => {
    const rowIdx = Math.floor(i / s.gridSize),
      colIdx = i % s.gridSize;
    const lat = +(s.centerLat - (rowIdx - half) * dy).toFixed(6),
      lng = +(s.centerLng + (colIdx - half) * dx).toFixed(6);
    return { rowIdx, colIdx, lat, lng, ...market(lat, lng) };
  });
}
/**
 * Points placed freely instead of on a grid (the highest-income areas near the business). The
 * business itself is always one of them. They are numbered north to south, west to east, in rows
 * of the smallest offered size that holds them all, so the report can still lay them out.
 * Returns null when the list is not usable.
 */
export function placedPins(center: { lat: number; lng: number }, input: unknown, sizes: readonly number[]) {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const pts: { lat: number; lng: number }[] = [{ lat: +center.lat.toFixed(6), lng: +center.lng.toFixed(6) }];
  for (const v of input.slice(0, 120)) {
    const lat = Number((v as { lat?: unknown })?.lat), lng = Number((v as { lng?: unknown })?.lng);
    // Within about 50 km of the business, and not the same spot twice.
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat - center.lat) > 0.45 || Math.abs(lng - center.lng) > 0.6) continue;
    const key = lat.toFixed(4) + ',' + lng.toFixed(4);
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) });
  }
  const max = Math.max(...sizes) ** 2;
  const kept = pts.slice(0, max);
  if (kept.length < 3) return null;
  // North to south in rows, west to east within a row (network.ts placedLayout, which the New scan
  // page also uses to price a mixed network).
  const { gridSize, cells } = placedLayout(kept, sizes);
  const pins = cells.map((p) => ({ rowIdx: p.rowIdx, colIdx: p.colIdx, lat: p.lat, lng: p.lng, ...market(p.lat, p.lng) }));
  return { gridSize, pins };
}
export function campaignId(userId: string, s: ScanSpec) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        userId,
        s.keyword.toLowerCase(),
        s.targetBusiness.toLowerCase(),
        s.centerLat,
        s.centerLng,
        s.gridSize,
        s.spacingKm,
        s.targetType,
        s.phoneBrand,
        s.phoneModel,
        s.ispMode,
        [...s.isps].sort(),
        s.trackAiOverviews,
        // Mobile and mixed runs are their own campaigns; home-internet ids stay exactly as they were.
        ...(s.network && s.network !== 'residential' ? [s.network] : []),
      ]),
    )
    .digest('hex');
}
/**
 * A repeating scan's schedule at a chosen time: "MIN HOUR * * *" (every day) or "MIN HOUR * * DAY"
 * (every week; 0 Sunday … 6 Saturday), followed by ";tz=<time zone>" so the hour is the clock's
 * hour where the business is, through summer and winter time. Or a sentence saying what is wrong.
 */
export function fixedCron(kind: string, at: unknown, timeZone: unknown, weekday?: unknown): string | { problem: string } {
  if (kind !== 'daily' && kind !== 'weekly') return { problem: 'Only a scan that repeats (daily or weekly) has a time of day.' };
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(at ?? '').trim());
  if (!m) return { problem: 'Give the time as HH:MM, 24-hour, such as 07:30.' };
  const tz = String(timeZone ?? '').trim();
  try { if (!tz) throw new Error(); new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { return { problem: 'Give the time zone by its name, such as America/New_York.' }; }
  const day = weekday === undefined || weekday === null ? 1 : Number(weekday);
  if (kind === 'weekly' && (!Number.isInteger(day) || day < 0 || day > 6)) return { problem: 'Give the day of the week as a number, 0 Sunday to 6 Saturday.' };
  return `${Number(m[2])} ${Number(m[1])} * * ${kind === 'weekly' ? day : '*'};tz=${tz}`;
}
/** A stored schedule as the scheduler takes it: the pattern and the time zone it is read in (UTC when none is stored). */
export function cronParts(stored: string): { pattern: string; tz: string } {
  const [pattern, tz] = stored.replace(/^PAUSED:/, '').split(';tz=');
  return { pattern: pattern.trim(), tz: (tz ?? '').trim() || 'UTC' };
}
/** A schedule in words: "every day at 7:30 AM (America/New_York)". */
export function scheduleText(kind: string, stored: string | null): string | null {
  if (kind === 'once' || !stored) return null;
  const { pattern, tz } = cronParts(stored);
  // Fixed days of the month (weekly is 4 runs a month, every other week 2).
  const monthly = monthlyText(pattern);
  if (monthly) return `${monthly} (${tz})${stored.startsWith('PAUSED:') ? ', paused' : ''}`;
  const [min, hour, , , dow] = pattern.split(' ');
  const h = Number(hour), time = `${h % 12 || 12}:${String(Number(min)).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${dow === '*' ? 'every day' : 'every ' + (days[Number(dow)] ?? 'week')} at ${time} (${tz})${stored.startsWith('PAUSED:') ? ', paused' : ''}`;
}
export function scheduleCron(kind: string) {
  return kind === 'daily'
    ? '0 13 * * *'
    : kind === 'weekly'
      ? '0 13 * * 1'
      : null;
}
export function metrics(
  all: {
    rankFound: number | null;
    hasAiOverview: boolean;
    targetCitedInAi: boolean;
    /** The point's page had no map pack: it has no local rank, and is left out of the rank numbers. */
    noLocal?: boolean;
  }[],
) {
  // Rank numbers are about the points that had local results; AI numbers are about every point.
  const pins = all.filter((p) => !p.noLocal);
  const aiPct = (n: number) => +((100 * n) / all.length).toFixed(2);
  if (all.length && !pins.length)
    return {
      arp: null,
      atrp: null,
      solv: null,
      aioTriggerRate: aiPct(all.filter((p) => p.hasAiOverview).length),
      aioCitationRate: aiPct(all.filter((p) => p.targetCitedInAi).length),
    };
  if (!pins.length)
    return {
      arp: null,
      atrp: null,
      solv: null,
      aioTriggerRate: null,
      aioCitationRate: null,
    };
  const ranks = pins.flatMap((p) =>
    p.rankFound && p.rankFound <= 20 ? [p.rankFound] : [],
  );
  const sum = ranks.reduce((a, b) => a + b, 0),
    pct = (n: number) => +((100 * n) / pins.length).toFixed(2);
  return {
    arp: ranks.length ? +(sum / ranks.length).toFixed(2) : 21,
    atrp: +((sum + 21 * (pins.length - ranks.length)) / pins.length).toFixed(2),
    solv: pct(ranks.filter((r) => r <= 3).length),
    aioTriggerRate: aiPct(all.filter((p) => p.hasAiOverview).length),
    aioCitationRate: aiPct(all.filter((p) => p.targetCitedInAi).length),
  };
}
