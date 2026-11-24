import { randomBytes } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { ACCOUNT_PLANS } from '@stakeout/core/gbpPlans';
import { isAdminAccount, paidPlan } from '@stakeout/core/brandInForce';
import { reportBase } from '@stakeout/core/webhooks';

/**
 * Live report embeds (Agency and up): an iframe a client's dashboard (GoHighLevel, AgencyAnalytics,
 * Notion...) shows, that always has the newest finished scan of one business, keyword and grid. One
 * per report; made from any of its scans. It keeps working after a move down to Scout, with our
 * badge in place of the account's brand; only its owner stops it.
 */
export type EmbedRow = { token: string; userId: string; keyword: string; business: string; gridSize: number; centerLat: number; centerLng: number };

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** The newest finished scan an embed shows: the same business, keyword and grid size, centred within a kilometre. */
export async function embedScan(e: EmbedRow) {
  const rows = await db.gridScan.findMany({
    where: { userId: e.userId, gridSize: e.gridSize, status: { in: ['COMPLETED', 'PARTIAL'] }, keyword: { equals: e.keyword, mode: 'insensitive' }, targetBusiness: { equals: e.business, mode: 'insensitive' } },
    orderBy: { completedAt: 'desc' },
    take: 25,
    select: { id: true, centerLat: true, centerLng: true },
  });
  return rows.find((r) => km({ lat: r.centerLat, lng: r.centerLng }, { lat: e.centerLat, lng: e.centerLng }) <= 1)?.id ?? null;
}

export const embedsOn = async (userId: string) => { const p = await paidPlan(userId); return Boolean(p && ACCOUNT_PLANS[p].embeds) || isAdminAccount(userId); };

/** The embed's address and the snippet to paste: on the account's own white-label domain when it has one. */
export async function embedView(e: { token: string; userId: string; business: string }) {
  const url = `${await reportBase(e.userId)}/embed/${e.token}`;
  const title = ('Local rankings for ' + e.business).replace(/"/g, '');
  return { token: e.token, url, snippet: `<iframe src="${url}" title="${title}" width="100%" height="760" style="border:0;max-width:920px" loading="lazy"></iframe>` };
}

/** The live embed for the report a scan belongs to, if one is on. */
export async function embedFor(userId: string, scanId: string) {
  const s = await db.gridScan.findFirst({ where: { id: scanId, userId }, select: { keyword: true, targetBusiness: true, gridSize: true, centerLat: true, centerLng: true } });
  if (!s) throw new InputError('Scan unavailable.', 404);
  const mine = await db.reportEmbed.findMany({ where: { userId, revokedAt: null, gridSize: s.gridSize, keyword: { equals: s.keyword, mode: 'insensitive' }, business: { equals: s.targetBusiness, mode: 'insensitive' } } });
  const e = mine.find((m) => km({ lat: m.centerLat, lng: m.centerLng }, { lat: s.centerLat, lng: s.centerLng }) <= 1);
  return { scan: s, embed: e ? await embedView(e) : null };
}

/** Turns on a live embed for a scan's report (Agency and up); the one already on is kept. */
export async function createEmbed(userId: string, scanId: string) {
  const { scan, embed } = await embedFor(userId, scanId);
  if (embed) return embed;
  if (!(await embedsOn(userId))) throw new InputError(`Live report embeds come with Agency (${'$' + ACCOUNT_PLANS.P_AGENCY.tiers[0].cents / 100} a month) and up.`, 402);
  const e = await db.reportEmbed.create({ data: { token: randomBytes(18).toString('base64url'), userId, scanId, keyword: scan.keyword, business: scan.targetBusiness, gridSize: scan.gridSize, centerLat: scan.centerLat, centerLng: scan.centerLng } });
  return embedView(e);
}

/** Stops an embed: the iframe shows that it was turned off. */
export async function revokeEmbed(userId: string, token: string) {
  const r = await db.reportEmbed.updateMany({ where: { userId, token, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!r.count) throw new InputError('That embed is not on.', 404);
}
