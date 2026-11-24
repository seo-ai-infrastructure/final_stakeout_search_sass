import { randomBytes } from 'node:crypto';
import { db } from '@stakeout/db';
import { ACCOUNT_PLANS } from './gbpPlans';
import { brandForUser, hasOwnDomain } from './brands';
import { brandInForce, isAdminAccount, paidPlan } from './brandInForce';
import { RETRY_AFTER_MS, WEBHOOK_EVENT, postWebhook, webhookBody } from './webhookSend';

export { RETRY_AFTER_MS, WEBHOOK_EVENT, checkWebhookUrl, newWebhookSecret, postWebhook, signWebhook, webhookBody } from './webhookSend';

/**
 * Scan-finished webhooks (Scale and up): when a scan finishes, its summary is posted as JSON to the
 * account's address, signed with the account's secret. Tried at once, then again 1, 5 and 30 minutes
 * later. Sending itself (address checks, signature) is in webhookSend.ts.
 */
const SITE = () => (process.env.APP_URL || 'https://stakeoutsearch.com').replace(/\/$/, '');

/** Whether the account's plan sends webhooks now. */
export async function webhooksOn(userId: string) {
  const plan = await paidPlan(userId);
  return Boolean(plan && ACCOUNT_PLANS[plan].webhooks) || isAdminAccount(userId);
}

/** The address reports are opened on: the account's own white-label domain when it has one in force, else ours. */
export async function reportBase(userId: string) {
  const b = await brandInForce(await brandForUser(userId).catch(() => null)).catch(() => null);
  return b && hasOwnDomain(b) ? 'https://' + b.domain : SITE();
}

/**
 * What a scan-finished webhook carries: the scan, its rank numbers (average rank, share of local
 * voice, points in the top 3), the AI Overview and the report's addresses. A delivery gets a share
 * link to the report (made for it when the scan had none), so it can go straight to a client; a test
 * send never shares a scan, and shows example addresses for one that is not shared.
 */
export async function scanWebhookPayload(scanId: string, opts: { test?: boolean } = {}) {
  const s = await db.gridScan.findUnique({
    where: { id: scanId },
    select: { id: true, userId: true, targetBusiness: true, keyword: true, gridSize: true, spacingKm: true, centerLat: true, centerLng: true, city: true, stateCode: true, status: true, totalPins: true, completedPins: true, failedPins: true, arp: true, atrp: true, solv: true, aioTriggerRate: true, aioCitationRate: true, completedAt: true, createdAt: true, shareToken: true },
  });
  if (!s) return null;
  const pins = await db.gridPin.findMany({ where: { scanId, status: 'COMPLETED' }, select: { rankFound: true, hasAiOverview: true, targetCitedInAi: true } });
  let token = s.shareToken;
  if (!token && !opts.test) {
    await db.gridScan.updateMany({ where: { id: s.id, shareToken: null }, data: { shareToken: randomBytes(24).toString('hex') } });
    token = (await db.gridScan.findUnique({ where: { id: s.id }, select: { shareToken: true } }))?.shareToken ?? null;
  }
  const base = await reportBase(s.userId);
  const ranks = pins.map((p) => p.rankFound).filter((r): r is number => typeof r === 'number' && r > 0);
  const shown = pins.filter((p) => p.hasAiOverview).length, cited = pins.filter((p) => p.targetCitedInAi).length;
  return {
    scanId: s.id,
    businessName: s.targetBusiness,
    keyword: s.keyword,
    gridSize: s.gridSize,
    gridSpacingMiles: +(s.spacingKm / 1.60934).toFixed(2),
    location: { city: s.city, state: s.stateCode, lat: s.centerLat, lng: s.centerLng },
    status: s.status,
    points: { total: s.totalPins, completed: s.completedPins, failed: s.failedPins },
    rank: {
      averageRank: s.arp,
      averageRankCountingNotFound: s.atrp,
      shareOfLocalVoice: s.solv,
      top3Points: ranks.filter((r) => r <= 3).length,
      foundPoints: ranks.length,
      notFoundPoints: pins.length - ranks.length,
      bestRank: ranks.length ? Math.min(...ranks) : null,
    },
    aiOverview: { status: cited ? 'cites_business' : shown ? 'shown_without_business' : 'not_shown', shownAtPoints: shown, citesBusinessAtPoints: cited, shownRate: s.aioTriggerRate, citationRate: s.aioCitationRate },
    reportUrl: `${base}/share/${token ?? 'example'}`,
    visibilityReportUrl: `${base}/reports/visibility.html?share=${token ?? 'example'}`,
    startedAt: s.createdAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
  };
}

/**
 * A finished scan: its webhook is queued when the account has an address and its plan sends webhooks.
 * A scan with no point done sends none. Re-running failed points finishes a scan again: it is sent
 * again with the newer numbers, marked updated (the scanId is the same).
 */
export async function queueScanWebhook(scanId: string) {
  const s = await db.gridScan.findUnique({ where: { id: scanId }, select: { userId: true, status: true } });
  if (!s || !['COMPLETED', 'PARTIAL'].includes(s.status)) return;
  const ep = await db.webhookEndpoint.findUnique({ where: { userId: s.userId }, select: { userId: true } });
  if (!ep || !(await webhooksOn(s.userId))) return;
  const [payload, before] = await Promise.all([scanWebhookPayload(scanId), db.webhookDelivery.count({ where: { userId: s.userId, scanId } })]);
  if (payload) await db.webhookDelivery.create({ data: { userId: s.userId, scanId, event: WEBHOOK_EVENT, payload: { ...payload, updated: before > 0 } } });
}

/** Sends the webhooks that are due (the worker, every few seconds while awake). Returns how many were tried. */
type Delivery = { id: string; userId: string; event: string; payload: unknown; attempts: number; createdAt: Date };

async function sendOne(d: Delivery) {
  const ep = await db.webhookEndpoint.findUnique({ where: { userId: d.userId } });
  if (!ep || !(await webhooksOn(d.userId))) {
    await db.webhookDelivery.update({ where: { id: d.id }, data: { status: 'SKIPPED', lastError: ep ? 'The plan no longer includes webhooks.' : 'No webhook address.' } });
    return;
  }
  // Taken by this try; should the worker stop mid-send, it is tried again in five minutes.
  const tries = d.attempts + 1;
  const claimed = await db.webhookDelivery.updateMany({ where: { id: d.id, status: 'PENDING', attempts: d.attempts }, data: { attempts: tries, nextAt: new Date(Date.now() + 5 * 60000) } });
  if (!claimed.count) return;
  const r = await postWebhook(ep.url, ep.secret, d.event, d.id, webhookBody({ ...d, attempts: tries }, d.payload));
  if (r.ok) await db.webhookDelivery.update({ where: { id: d.id }, data: { status: 'SENT', sentAt: new Date(), lastStatus: r.status, lastError: null } });
  else if (tries > RETRY_AFTER_MS.length) await db.webhookDelivery.update({ where: { id: d.id }, data: { status: 'FAILED', lastStatus: r.status, lastError: r.error } });
  else await db.webhookDelivery.update({ where: { id: d.id }, data: { nextAt: new Date(Date.now() + RETRY_AFTER_MS[tries - 1]), lastStatus: r.status, lastError: r.error } });
}

/** Sends the webhooks that are due, five at a time (the worker, beside its main loop). Returns how many were tried. */
export async function sendDueWebhooks(now = new Date()) {
  const due = await db.webhookDelivery.findMany({ where: { status: 'PENDING', nextAt: { lte: now } }, orderBy: { nextAt: 'asc' }, take: 20, select: { id: true, userId: true, event: true, payload: true, attempts: true, createdAt: true } });
  for (let i = 0; i < due.length; i += 5) await Promise.all(due.slice(i, i + 5).map((d) => sendOne(d).catch((e) => console.warn('[webhook]', d.id, (e as Error).message))));
  return due.length;
}

/** When the next webhook try is due (for a resting worker to wake for it), or null. */
export async function nextWebhookDue(): Promise<Date | null> {
  return (await db.webhookDelivery.findFirst({ where: { status: 'PENDING' }, orderBy: { nextAt: 'asc' }, select: { nextAt: true } }).catch(() => null))?.nextAt ?? null;
}
