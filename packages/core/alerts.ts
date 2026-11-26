/**
 * Alerts to the admins by email. Whoever notices a problem (the worker: a scan that failed; the
 * website: a worker that has gone quiet) adds a line here; the website sends them
 * (/api/alerts/flush), since it holds the mail settings. Each kind of alert is held back while an
 * earlier one of the same key is fresh, so a bad hour is one email, not fifty.
 */
import { redis } from './redis';

export const ALERTS_KEY = 'stakeout:alerts';
export type Alert = { at: string; subject: string; lines: string[]; path?: string };

/** Queues an alert unless one with this key was queued in the last `quietSeconds`. Never throws. */
export async function pushAlert(key: string, a: Omit<Alert, 'at'>, quietSeconds = 3600): Promise<boolean> {
  try {
    const fresh = await redis().set('stakeout:alert:' + key, '1', 'EX', quietSeconds, 'NX');
    if (!fresh) return false;
    await redis().rpush(ALERTS_KEY, JSON.stringify({ ...a, at: new Date().toISOString() }));
    await redis().ltrim(ALERTS_KEY, -50, -1);
    return true;
  } catch (e) {
    console.warn('[alert] not queued:', (e as Error).message);
    return false;
  }
}

/** From the worker: asks the website to send what is queued (ALERT_URL, or the site itself). */
export async function nudgeAlerts() {
  const url = process.env.ALERT_URL ?? 'https://www.stakeoutsearch.com/api/alerts/flush';
  await fetch(url, { method: 'POST', signal: AbortSignal.timeout(15000) }).catch((e) => console.warn('[alert] website not reached:', (e as Error).message));
}

/**
 * From the worker: a $1 pocket test's search is over (done, or failed for good). The website, which
 * holds the mail and Stripe settings, emails the buyer and sends a failed one's $1 back.
 */
export async function nudgePocket() {
  const url = new URL('/api/pocket/settle', process.env.ALERT_URL ?? 'https://www.stakeoutsearch.com').toString();
  await fetch(url, { method: 'POST', signal: AbortSignal.timeout(20000) }).catch((e) => console.warn('[pocket] website not reached:', (e as Error).message));
}

/** How a finished scan went, as an alert when it went badly; null when there is nothing to say. */
export function scanAlert(s: { id: string; keyword: string; targetBusiness: string; totalPins: number; failedPins: number; status: string }, reasons: { code: string; n: number }[]): Omit<Alert, 'at'> | null {
  // Points the owner stopped are not failures.
  const real = reasons.filter((r) => r.code !== 'CANCELLED');
  const failed = real.reduce((a, r) => a + r.n, 0);
  if (!failed || (s.status !== 'FAILED' && failed * 4 < s.totalPins)) return null;
  const top = real.sort((a, b) => b.n - a.n).slice(0, 3).map((r) => `${r.code} (${r.n})`).join(', ');
  return {
    subject: `Stakeout: ${failed} of ${s.totalPins} points failed · ${s.keyword}`,
    lines: [`The scan "${s.keyword}" for ${s.targetBusiness} finished ${s.status === 'FAILED' ? 'with no point completed' : 'partly'}: ${failed} of ${s.totalPins} points failed.`, `Most common reasons: ${top}.`, 'Failed points were refunded as usual.'],
    path: '/scans/' + s.id,
  };
}
