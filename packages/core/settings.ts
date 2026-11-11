import { redis } from './redis';

/**
 * Settings an admin can change from the Device fleet page without a deploy or a worker restart.
 * Stored in Redis (the website and the worker both read it); anything not set there falls back to
 * its environment variable, so nothing changes until an admin saves a value.
 */
export type Settings = {
  /** Rest after every search on a phone, in seconds (SEARCH_GAP_SECONDS). */
  searchGapSeconds: number;
  /** ISPs never offered or accepted (ISP_EXCLUDE). */
  ispExclude: string[];
  /** Whether new accounts can be created (SIGNUPS_OPEN). */
  signupsOpen: boolean;
  /** What one point costs to run, for the cost estimate (COST_PER_POINT_USD). */
  costPerPointUsd: number;
};

const KEY = 'stakeout:settings';
const names = (v: string) => [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))];
const num = (v: unknown, fallback: number) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? fallback : Number(v));

export const defaultSettings = (env: Record<string, string | undefined> = process.env): Settings => ({
  searchGapSeconds: num(env.SEARCH_GAP_SECONDS, 120),
  ispExclude: names(env.ISP_EXCLUDE ?? 'Tillman Fiberco'),
  signupsOpen: env.SIGNUPS_OPEN === 'true',
  costPerPointUsd: num(env.COST_PER_POINT_USD, 0.033),
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
  return out;
}

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

let cache: { at: number; value: Settings } | null = null;

/** Current settings, read at most every 15 seconds; the defaults if Redis cannot be reached. */
export async function getSettings(fresh = false): Promise<Settings> {
  if (!fresh && cache && Date.now() - cache.at < 15000) return cache.value;
  const stored = await redis().hgetall(KEY).catch(() => ({}) as Record<string, string>);
  cache = { at: Date.now(), value: mergeSettings(stored, defaultSettings()) };
  return cache.value;
}

export async function saveSettings(input: Record<string, unknown>): Promise<Settings> {
  const clean = cleanSettings(input);
  const pairs = Object.entries(clean).flatMap(([k, v]) => [k, JSON.stringify(v)]);
  if (pairs.length) await redis().hset(KEY, ...pairs);
  return getSettings(true);
}

export const ispAllowed = (name: string, s: Pick<Settings, 'ispExclude'>) => !s.ispExclude.some((x) => x.toLowerCase() === name.trim().toLowerCase());
