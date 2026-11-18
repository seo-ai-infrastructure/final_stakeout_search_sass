/**
 * Stripe, through its HTTP API (no SDK): hosted Checkout for one-time payments, and the check on
 * webhook signatures. Settings: STRIPE_SECRET_KEY (sk_live_… or sk_test_…) and STRIPE_WEBHOOK_SECRET
 * (whsec_…, from the webhook endpoint that points at /api/webhooks/stripe).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { InputError } from '@stakeout/core/grid';

const secretKey = () => (process.env.STRIPE_SECRET_KEY ?? '').trim();
export const stripeConfigured = () => /^(sk|rk)_(live|test)_/.test(secretKey());
/** A test-mode key: no real money moves. */
export const stripeTestMode = () => /^(sk|rk)_test_/.test(secretKey());

/** Stripe takes form fields with bracketed names: { a: { b: 1 }, c: [x] } → a[b]=1&c[0]=x. */
export function stripeForm(o: Record<string, unknown>, prefix = ''): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') out.push(stripeForm(v as Record<string, unknown>, key));
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out.filter(Boolean).join('&');
}

/** Why Stripe refused, in words for whoever is paying; Stripe's own code is kept. */
export function stripeProblem(code: string, type = ''): string {
  if (type === 'card_error' || code === 'card_declined') return `The card was declined (${code}). Try another card.`;
  if (code === 'api_key_expired' || type === 'authentication_error' || type === 'invalid_request_error' && code === 'api_key_invalid')
    return `Stripe did not accept the key (${code || type}). Check STRIPE_SECRET_KEY.`;
  return `Stripe could not complete this (${code || type || 'error'}).`;
}

export async function stripe<T = Record<string, unknown>>(path: string, method: 'GET' | 'POST' = 'GET', body?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  if (!stripeConfigured()) throw new InputError('Checkout is being set up. Email sass@stakeoutsearch.com and we will sort it out.', 503);
  const r = await fetch('https://api.stripe.com/v1' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + secretKey(),
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? stripeForm(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) {
    const e = d?.error ?? {};
    // Stripe says exactly what it refused: keep it in the log, and tell the person in plain words.
    console.error('[stripe]', method, path.split('?')[0], r.status, e.type ?? '', e.code ?? '', e.message ?? '', 'request=' + (r.headers.get('request-id') ?? ''));
    throw new InputError(stripeProblem(String(e.code ?? ''), String(e.type ?? '')), 502);
  }
  return d as T;
}

/**
 * Whether a webhook really came from Stripe: its Stripe-Signature header carries a time and an
 * HMAC-SHA256 of "<time>.<body>" under the endpoint's secret. Old messages are refused (replays).
 */
export function stripeSignatureValid(rawBody: string, header: string | null, secret: string, nowMs = Date.now(), toleranceSeconds = 300): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > toleranceSeconds) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(t + '.' + rawBody).digest('hex'));
  return sigs.some((s) => {
    const got = Buffer.from(s ?? '');
    return got.length === want.length && timingSafeEqual(got, want);
  });
}
