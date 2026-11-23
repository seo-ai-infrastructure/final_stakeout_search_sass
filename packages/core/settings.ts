import { keptHash } from './kept';

/**
 * Settings an admin can change from the Device fleet page without a deploy or a worker restart.
 * Stored in Redis (the website and the worker both read it); anything not set there falls back to
 * its environment variable, so nothing changes until an admin saves a value.
 */
type Settings = {
  /** Rest after every search on a phone, in seconds (SEARCH_GAP_SECONDS). */
  searchGapSeconds: number;
  /** ISPs never offered or accepted (ISP_EXCLUDE). */
  ispExclude: string[];
  /** Whether new accounts can be created (SIGNUPS_OPEN). */
  signupsOpen: boolean;
  /** What one point costs to run, for the cost estimate (COST_PER_POINT_USD). */
  costPerPointUsd: number;
  /** Phones are switched off while no scan is waiting, and on when one arrives (DUOPLUS_POWER_SAVE). */
  powerSave: boolean;
  /** Minutes the queue stays empty before the phones are switched off (POWER_IDLE_OFF_MINUTES). */
  idleOffMinutes: number;
  /** Credits one mobile-data point costs (MOBILE_CREDITS_PER_POINT); a home-internet point costs 1. */
  mobileCreditsPerPoint: number;
  /** Whether customers, not only admins, can choose mobile data (MOBILE_FOR_CUSTOMERS). */
  mobileForCustomers: boolean;
  /**
   * Whether customers' pages read the AI Overview by the four flags (featured, named, listing cited,
   * website cited) instead of the earlier single reading (AI_FLAGS_FOR_CUSTOMERS). Admins always see
   * the flags. Off until the backfill's dry run has been reviewed.
   */
  aiFlagsForCustomers: boolean;
  /**
   * Whether customers' Share of local search counts page one as a searcher sees it
   * (PAGE_ONE_SHARE_FOR_CUSTOMERS): the map pack's top 3 or an upfront spot in the AI Overview at any
   * point, over the points that showed local businesses. Otherwise the earlier rule: the pack's top
   * 3, and the AI Overview only where there was no pack, over every point. Admins always see the new one.
   */
  pageOneShareForCustomers: boolean;
};

const KEY = 'stakeout:settings';
const names = (v: string) => [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))];
const num = (v: unknown, fallback: number) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? fallback : Number(v));

export const defaultSettings = (env: Record<string, string | undefined> = process.env): Settings => ({
  searchGapSeconds: num(env.SEARCH_GAP_SECONDS, 120),
  ispExclude: names(env.ISP_EXCLUDE ?? 'Tillman Fiberco'),
  signupsOpen: env.SIGNUPS_OPEN === 'true',
  costPerPointUsd: num(env.COST_PER_POINT_USD, 0.033),
  powerSave: env.DUOPLUS_POWER_SAVE === 'true',
  idleOffMinutes: num(env.POWER_IDLE_OFF_MINUTES, 10),
  mobileCreditsPerPoint: num(env.MOBILE_CREDITS_PER_POINT, 1),
  mobileForCustomers: env.MOBILE_FOR_CUSTOMERS === 'true',
  aiFlagsForCustomers: env.AI_FLAGS_FOR_CUSTOMERS === 'true',
  pageOneShareForCustomers: env.PAGE_ONE_SHARE_FOR_CUSTOMERS === 'true',
});

/** Checks values an admin typed; throws a message they can read. Only the given keys are returned. */
export function cleanSettings(input: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {};
  if ('searchGapSeconds' in input) {
    const n = Number(input.searchGapSeconds);
    if (!Number.isInteger(n) || n < 0 || n > 900) throw new Error('The pause between searches must be a whole number of seconds from 0 to 900.');
    out.searchGapSeconds = n;
  }
  if ('ispExclude' in input) {
    const list = Array.isArray(input.ispExclude) ? input.ispExclude.map(String) : names(String(input.ispExclude ?? ''));
    const clean = [...new Set(list.map((x) => x.trim()).filter(Boolean))];
    if (clean.length > 50 || clean.some((x) => x.length > 120 || /[\u0000-\u001f]/.test(x))) throw new Error('List up to 50 ISP names, separated by commas.');
    out.ispExclude = clean;
  }
  if ('signupsOpen' in input) {
    if (typeof input.signupsOpen !== 'boolean') throw new Error('Sign-ups must be on or off.');
    out.signupsOpen = input.signupsOpen;
  }
  if ('costPerPointUsd' in input) {
    const n = Number(input.costPerPointUsd);
    if (!Number.isFinite(n) || n < 0 || n > 5) throw new Error('The cost per point must be between 0 and 5 dollars.');
    out.costPerPointUsd = n;
  }
  if ('powerSave' in input) {
    if (typeof input.powerSave !== 'boolean') throw new Error('Power saving must be on or off.');
    out.powerSave = input.powerSave;
  }
  if ('idleOffMinutes' in input) {
    const n = Number(input.idleOffMinutes);
    if (!Number.isInteger(n) || n < 2 || n > 240) throw new Error('Phones can be switched off after 2 to 240 idle minutes (a whole number).');
    out.idleOffMinutes = n;
  }
  if ('mobileCreditsPerPoint' in input) {
    const n = Number(input.mobileCreditsPerPoint);
    if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error('A mobile-data point can cost 1 to 10 phone sessions (a whole number).');
    out.mobileCreditsPerPoint = n;
  }
  if ('mobileForCustomers' in input) {
    if (typeof input.mobileForCustomers !== 'boolean') throw new Error('Mobile data for customers must be on or off.');
    out.mobileForCustomers = input.mobileForCustomers;
  }
  if ('aiFlagsForCustomers' in input) {
    if (typeof input.aiFlagsForCustomers !== 'boolean') throw new Error('The AI Overview flags for customers must be on or off.');
    out.aiFlagsForCustomers = input.aiFlagsForCustomers;
  }
  if ('pageOneShareForCustomers' in input) {
    if (typeof input.pageOneShareForCustomers !== 'boolean') throw new Error('The page-one share for customers must be on or off.');
    out.pageOneShareForCustomers = input.pageOneShareForCustomers;
  }
  return out;
}

/** Credits one point of a scan costs: 1 on home internet, the mobile price on mobile data. */
export const creditsPerPoint = (network: string | null | undefined, s: Pick<Settings, 'mobileCreditsPerPoint'>) =>
  network === 'mobile' ? s.mobileCreditsPerPoint : 1;

/** Stored values over the defaults; a stored value that no longer validates is ignored. */
export function mergeSettings(stored: Record<string, string>, base: Settings): Settings {
  const out = { ...base };
  for (const [k, raw] of Object.entries(stored)) {
    try {
      Object.assign(out, cleanSettings({ [k]: JSON.parse(raw) }));
    } catch {
      /* keep the default */
    }
  }
  return out;
}

// Postgres holds the lasting copy; Redis is the one that is read (see kept.ts).
const kept = keptHash('settings', KEY);
let cache: { at: number; value: Settings } | null = null;

/** Current settings, read at most every 15 seconds; the defaults if neither Redis nor the database can be reached. */
export async function getSettings(fresh = false): Promise<Settings> {
  if (!fresh && cache && Date.now() - cache.at < 15000) return cache.value;
  const stored = await kept.all().catch(() => ({}) as Record<string, string>);
  cache = { at: Date.now(), value: mergeSettings(stored, defaultSettings()) };
  return cache.value;
}

export async function saveSettings(input: Record<string, unknown>): Promise<Settings> {
  const clean = cleanSettings(input);
  await kept.set(Object.fromEntries(Object.entries(clean).map(([k, v]) => [k, JSON.stringify(v)])));
  return getSettings(true);
}

export const ispAllowed = (name: string, s: Pick<Settings, 'ispExclude'>) => !s.ispExclude.some((x) => x.toLowerCase() === name.trim().toLowerCase());
