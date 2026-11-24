import { randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { ACCOUNT_PLANS } from '@stakeout/core/gbpPlans';
import { WEBHOOK_EVENT, checkWebhookUrl, newWebhookSecret, postWebhook, reportBase, scanWebhookPayload, webhookBody, webhooksOn } from '@stakeout/core/webhooks';
import { assertAccountOwner, getAuthenticatedUser, teamSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { limit } from '@/lib/limits';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Scan-finished webhooks (Scale and up), set by the account owner: the address, its signing secret,
 * a test send and the latest deliveries. The worker sends the real ones (core/webhooks.ts).
 */
async function state(userId: string) {
  const [on, ep, recent] = await Promise.all([
    webhooksOn(userId),
    db.webhookEndpoint.findUnique({ where: { userId } }),
    db.webhookDelivery.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, scanId: true, status: true, attempts: true, lastStatus: true, lastError: true, createdAt: true, sentAt: true } }),
  ]);
  return {
    allowed: on,
    endpoint: ep ? { url: ep.url, secret: ep.secret } : null,
    deliveries: recent.map((d) => ({ ...d, createdAt: d.createdAt.toISOString(), sentAt: d.sentAt?.toISOString() ?? null })),
    event: WEBHOOK_EVENT,
  };
}

export async function GET() {
  try {
    const u = await getAuthenticatedUser();
    const team = await teamSession().catch(() => null);
    const s = await state(u.id);
    // A team member sees whether webhooks are on, never the secret or the deliveries.
    if (team && !team.paused) return Response.json({ ...s, owner: false, endpoint: s.endpoint ? { url: s.endpoint.url, secret: null } : null, deliveries: [] });
    return Response.json({ ...s, owner: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/integrations/webhook
 *   { url }          saves the address (a secret is made the first time)
 *   { rotate: true } a new signing secret
 *   { test: true }   sends one webhook now (your newest finished scan, or a sample) and says how it went
 */
export async function POST(req: Request) {
  try {
    const u = await getAuthenticatedUser();
    await assertAccountOwner();
    if (!(await webhooksOn(u.id))) throw new InputError(`Webhooks come with Scale (${'$' + ACCOUNT_PLANS.P_SCALE.tiers[0].cents / 100} a month) and Agency Max.`, 402);
    const b = (await req.json()) as { url?: unknown; rotate?: unknown; test?: unknown };
    if (b.url !== undefined) {
      const c = checkWebhookUrl(b.url);
      if ('error' in c) throw new InputError(c.error);
      await db.webhookEndpoint.upsert({ where: { userId: u.id }, create: { userId: u.id, url: c.url, secret: newWebhookSecret() }, update: { url: c.url } });
      return Response.json(await state(u.id));
    }
    const ep = await db.webhookEndpoint.findUnique({ where: { userId: u.id } });
    if (!ep) throw new InputError('Save an address first.');
    if (b.rotate === true) {
      await db.webhookEndpoint.update({ where: { userId: u.id }, data: { secret: newWebhookSecret() } });
      return Response.json(await state(u.id));
    }
    if (b.test === true) {
      await limit('webhook-test', u.id, 20, 3600);
      const last = await db.gridScan.findFirst({ where: { userId: u.id, status: { in: ['COMPLETED', 'PARTIAL'] } }, orderBy: { completedAt: 'desc' }, select: { id: true } });
      // Your newest finished scan (never shared by a test), or a made-up one.
      const data = (last ? await scanWebhookPayload(last.id, { test: true }) : null) ?? sample(await reportBase(u.id));
      const id = 'test_' + randomUUID();
      const r = await postWebhook(ep.url, ep.secret, WEBHOOK_EVENT, id, webhookBody({ id, event: WEBHOOK_EVENT, createdAt: new Date(), attempts: 1 }, { ...data, updated: false, test: true }));
      return Response.json({ ...(await state(u.id)), test: r });
    }
    throw new InputError('Unknown request.');
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE: no more webhooks (the address and its secret are forgotten). */
export async function DELETE() {
  try {
    const u = await getAuthenticatedUser();
    await assertAccountOwner();
    await db.webhookEndpoint.deleteMany({ where: { userId: u.id } });
    return Response.json(await state(u.id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** A made-up finished scan, for a test send from an account with none yet. */
function sample(base: string) {
  return {
    scanId: 'sample',
    businessName: 'Sample Plumbing Co.',
    keyword: 'plumber near me',
    gridSize: 5,
    gridSpacingMiles: 1,
    location: { city: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431 },
    status: 'COMPLETED',
    points: { total: 25, completed: 25, failed: 0 },
    rank: { averageRank: 4.2, averageRankCountingNotFound: 6.1, shareOfLocalVoice: 44, top3Points: 11, foundPoints: 22, notFoundPoints: 3, bestRank: 1 },
    aiOverview: { status: 'cites_business', shownAtPoints: 9, citesBusinessAtPoints: 4, shownRate: 36, citationRate: 16 },
    reportUrl: `${base}/share/example`,
    visibilityReportUrl: `${base}/reports/visibility.html?share=example`,
    startedAt: new Date(Date.now() - 20 * 60000).toISOString(),
    completedAt: new Date().toISOString(),
  };
}
