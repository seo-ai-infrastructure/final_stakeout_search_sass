import { redis } from './redis';
import { cleanDomain } from './brandHost';

/**
 * A customer's white-label setup: their domain serves their shared reports under their name and
 * logo. Kept in Redis with the other admin settings (no schema change): one hash of
 * domain → brand, and one key per logo.
 */
export type Brand = { domain: string; userId: string; name: string; accent: string | null; hasLogo: boolean; updatedAt: string };

const KEY = 'stakeout:brands';
const LOGO = 'stakeout:brand-logo:';
/** Logos are small images shown in a report header. No SVG: it can carry scripts. */
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const LOGO_MAX_BYTES = 300 * 1024;

let cache: { at: number; list: Brand[] } | null = null;

export async function listBrands(fresh = false): Promise<Brand[]> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.list;
  const raw = await redis().hgetall(KEY).catch(() => ({}) as Record<string, string>);
  const list: Brand[] = [];
  for (const [domain, v] of Object.entries(raw)) {
    try {
      const b = JSON.parse(v);
      if (b && typeof b.userId === 'string' && typeof b.name === 'string') list.push({ domain, userId: b.userId, name: b.name, accent: b.accent ?? null, hasLogo: Boolean(b.hasLogo), updatedAt: String(b.updatedAt ?? '') });
    } catch {
      /* an unreadable entry is skipped */
    }
  }
  list.sort((a, b) => a.domain.localeCompare(b.domain));
  cache = { at: Date.now(), list };
  return list;
}

export const brandForHost = async (host: string) => (await listBrands()).find((b) => b.domain === host.toLowerCase()) ?? null;
export const brandForUser = async (userId: string) => (await listBrands()).find((b) => b.userId === userId) ?? null;

export class BrandError extends Error {}

/** Creates or replaces an account's brand. An account has one domain; a domain belongs to one account. */
export async function saveBrand(input: { userId: string; domain: unknown; name: unknown; accent?: unknown; logo?: { type: string; base64: string } | null }): Promise<Brand> {
  const domain = cleanDomain(input.domain);
  if (!domain) throw new BrandError('Enter a domain such as reports.example.com (not this site\'s own address).');
  const name = String(input.name ?? '').trim().slice(0, 60);
  if (!name) throw new BrandError('Enter the name to show on reports.');
  const accent = /^#[0-9a-f]{6}$/i.test(String(input.accent ?? '')) ? String(input.accent).toLowerCase() : null;
  const all = await listBrands(true);
  const taken = all.find((b) => b.domain === domain && b.userId !== input.userId);
  if (taken) throw new BrandError('That domain is already set up for another account.');
  const previous = all.find((b) => b.userId === input.userId);
  let hasLogo = previous?.domain === domain ? previous.hasLogo : false;
  if (input.logo) {
    if (!LOGO_TYPES.includes(input.logo.type)) throw new BrandError('The logo must be a PNG, JPEG or WebP image.');
    const bytes = Buffer.from(input.logo.base64, 'base64');
    if (!bytes.length || bytes.length > LOGO_MAX_BYTES) throw new BrandError(`The logo must be under ${LOGO_MAX_BYTES / 1024} KB.`);
    await redis().set(LOGO + domain, JSON.stringify({ type: input.logo.type, b64: bytes.toString('base64') }));
    hasLogo = true;
  } else if (previous && previous.domain !== domain && previous.hasLogo) {
    // The account is moving to a new domain: its logo moves with it.
    const old = await redis().get(LOGO + previous.domain);
    if (old) {
      await redis().set(LOGO + domain, old);
      hasLogo = true;
    }
  }
  const brand: Brand = { domain, userId: input.userId, name, accent, hasLogo, updatedAt: new Date().toISOString() };
  await redis().hset(KEY, domain, JSON.stringify(brand));
  if (previous && previous.domain !== domain) await removeBrand(previous.domain);
  cache = null;
  return brand;
}

export async function removeBrand(domain: string) {
  await redis().hdel(KEY, domain);
  await redis().del(LOGO + domain);
  cache = null;
}

export async function brandLogo(domain: string): Promise<{ type: string; data: Buffer } | null> {
  const raw = await redis().get(LOGO + domain).catch(() => null);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return LOGO_TYPES.includes(v.type) ? { type: v.type, data: Buffer.from(v.b64, 'base64') } : null;
  } catch {
    return null;
  }
}
