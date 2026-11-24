import { db } from '@stakeout/db';
import { brandForHost, brandForUser, type Brand } from '@stakeout/core/brands';
import { isPrimaryHost } from '@stakeout/core/brandHost';
import { brandInForce as inForce } from '@stakeout/core/brandInForce';

export type ReportBrand = { name: string; accent: string | null; logo: string | null };

/** How a brand shows in a report: its name, colour and logo (the logo served by this site). */
export const reportBrand = (b: Brand): ReportBrand => ({ name: b.name, accent: b.accent, logo: b.hasLogo ? '/api/brand/logo?d=' + encodeURIComponent(b.domain) : null });

/**
 * An account's own brand on its own reports when it has a white label: the report it opens signed
 * in, and so what it prints and the offline copies it saves (an admin reading it sees the same).
 */
export async function ownerBrand(userId: string | null): Promise<ReportBrand | null> {
  if (!userId) return null;
  const b = await inForce(await brandForUser(userId).catch(() => null));
  return b ? reportBrand(b) : null;
}

/**
 * The brand an account's report is shown under on this host, and whether this host may show it at
 * all. On a customer's domain: that domain's brand, and only for reports of the account that owns
 * the domain. On our own address: the account's brand when it has one, otherwise none.
 */
export async function brandOnHost(ownerId: string | null, host: string): Promise<{ allowed: boolean; brand: ReportBrand | null }> {
  const custom = Boolean(host) && !isPrimaryHost(host);
  const b: Brand | null = await inForce(custom ? await brandForHost(host) : ownerId ? await brandForUser(ownerId) : null);
  if (custom && (!b || !ownerId || b.userId !== ownerId)) return { allowed: false, brand: null };
  return { allowed: true, brand: b ? reportBrand(b) : null };
}

/**
 * The same for a live report embed, which never breaks when a plan changes: on a customer's domain
 * it is served for that domain's own account even after the plan stops including white label (then
 * under our badge, the brand back once the plan has it again).
 */
export async function brandForEmbed(ownerId: string, host: string): Promise<{ allowed: boolean; brand: ReportBrand | null; custom: boolean }> {
  const custom = Boolean(host) && !isPrimaryHost(host);
  const raw = custom ? await brandForHost(host) : await brandForUser(ownerId).catch(() => null);
  if (custom && (!raw || raw.userId !== ownerId)) return { allowed: false, brand: null, custom };
  const b = await inForce(raw);
  return { allowed: true, brand: b ? reportBrand(b) : null, custom };
}

/** The same for a scan's share link. */
export async function brandForShare(token: string, host: string): Promise<{ allowed: boolean; brand: ReportBrand | null }> {
  const owner = await db.gridScan.findFirst({ where: { shareToken: token }, select: { userId: true } });
  return brandOnHost(owner?.userId ?? null, host);
}
