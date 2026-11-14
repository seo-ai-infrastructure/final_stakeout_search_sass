import { db } from '@stakeout/db';
import { brandForHost, brandForUser, type Brand } from '@stakeout/core/brands';
import { isPrimaryHost } from '@stakeout/core/brandHost';

export type ReportBrand = { name: string; accent: string | null; logo: string | null };

/**
 * The brand a shared report is shown under, and whether this host may show it at all.
 * On a customer's domain: that domain's brand, and only for reports of the account that owns the
 * domain. On our own address: the owner's brand when they have one, otherwise none.
 */
export async function brandForShare(token: string, host: string): Promise<{ allowed: boolean; brand: ReportBrand | null }> {
  const owner = await db.gridScan.findFirst({ where: { shareToken: token }, select: { userId: true } });
  const custom = Boolean(host) && !isPrimaryHost(host);
  const b: Brand | null = custom ? await brandForHost(host) : owner ? await brandForUser(owner.userId) : null;
  if (custom && (!b || !owner || b.userId !== owner.userId)) return { allowed: false, brand: null };
  return { allowed: true, brand: b ? { name: b.name, accent: b.accent, logo: b.hasLogo ? '/api/brand/logo?d=' + encodeURIComponent(b.domain) : null } : null };
}
