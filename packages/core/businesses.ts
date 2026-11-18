/** Validation for saved businesses (a client with its keywords and scan defaults). */
import { InputError } from './grid';
import { kgmidOf, siteDomain } from './businessIds';

export const TARGET_TYPES = ['mobile_chrome', 'mobile_maps', 'mobile_google', 'desktop_aimode'] as const;
export type BusinessInput = {
  name: string;
  centerLabel: string;
  centerLat: number;
  centerLng: number;
  keywords: string[];
  targetType: string;
  gridSize: number;
  spacingKm: number;
  ispMode: string;
  isps: string[];
  trackAiOverviews: boolean;
  scheduleType: string;
  /** Google's ID for the business ("/g/…") and its website, when known. */
  kgmid: string | null;
  domain: string | null;
};

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Cleans and checks a saved business; throws InputError (400) with a readable reason. */
export function parseBusiness(raw: unknown): BusinessInput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = text(r.name, 120);
  if (!name) throw new InputError('Enter the business name exactly as it appears on Google.');
  const centerLat = Number(r.centerLat), centerLng = Number(r.centerLng);
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng) || Math.abs(centerLat) > 90 || Math.abs(centerLng) > 180)
    throw new InputError('Choose the grid centre on the map or by address.');
  const seen = new Set<string>();
  const keywords = (Array.isArray(r.keywords) ? r.keywords : [])
    .map((k) => text(k, 120))
    .filter((k) => k && !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase()))
    .slice(0, 50);
  if (!keywords.length) throw new InputError('Add at least one keyword.');
  const targetType = TARGET_TYPES.includes(r.targetType as any) ? String(r.targetType) : 'mobile_chrome';
  const gridSize = Number(r.gridSize);
  const ispMode = ['any', 'single', 'mix'].includes(String(r.ispMode)) ? String(r.ispMode) : 'any';
  const isps = ispMode === 'any' ? [] : (Array.isArray(r.isps) ? r.isps : []).map((x) => text(x, 80)).filter(Boolean).slice(0, 10);
  const typedId = text(r.kgmid, 300), typedSite = text(r.domain, 300);
  const kgmid = kgmidOf(typedId) || null, domain = siteDomain(typedSite) || null;
  if (typedId && !kgmid) throw new InputError('The Google business ID looks like /g/11cs6bzst7 (a Google link with kgmid= in it works too).');
  if (typedSite && !domain) throw new InputError('Enter the website as a domain, such as mcintyrepainting.com.');
  return {
    name,
    centerLabel: text(r.centerLabel, 200),
    centerLat,
    centerLng,
    keywords,
    targetType,
    gridSize: Number.isInteger(gridSize) && gridSize >= 3 && gridSize <= 15 && gridSize % 2 === 1 ? gridSize : 7,
    spacingKm: Math.min(10, Math.max(0.1, Number(r.spacingKm) || 1.60934)),
    ispMode,
    isps,
    trackAiOverviews: r.trackAiOverviews === true,
    scheduleType: ['once', 'daily', 'weekly'].includes(String(r.scheduleType)) ? String(r.scheduleType) : 'once',
    kgmid,
    domain,
  };
}
