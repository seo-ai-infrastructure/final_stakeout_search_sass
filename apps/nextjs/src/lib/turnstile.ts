import { InputError } from '@stakeout/core/grid';
import { expectedHostnames, turnstileVerdict, type SiteverifyResult } from '@stakeout/core/turnstileVerdict';

export const turnstileConfigured = () => Boolean(process.env.TURNSTILE_SECRET_KEY);

/**
 * Verifies a Cloudflare Turnstile token server-side before the protected handler runs.
 * Requires success, the expected action for this form, and one of this site's hostnames.
 * No-op when Turnstile is not configured.
 */
export async function requireHuman(token: unknown, ip: string | null, action?: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (typeof token !== 'string' || !token || token.length > 2048)
    throw new InputError('Complete the verification check and try again.', 400);
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  let result: SiteverifyResult;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error('siteverify ' + r.status);
    result = (await r.json()) as SiteverifyResult;
  } catch {
    throw new InputError('Verification is temporarily unavailable. Try again.', 503);
  }
  const verdict = turnstileVerdict(result, { action, hostnames: expectedHostnames() });
  if (verdict === 'ok') return;
  if (verdict === 'misconfigured') {
    console.error('[turnstile] Cloudflare rejected TURNSTILE_SECRET_KEY: it must be the Secret Key of the widget whose Site Key the page uses.');
    throw new InputError('Verification is not set up correctly yet. Please try again later.', 503);
  }
  console.warn('[turnstile] token refused:', verdict, 'action=' + (result.action ?? '-'), 'hostname=' + (result.hostname ?? '-'), (result['error-codes'] ?? []).join(','));
  throw new InputError('Verification failed. Refresh the check and try again.', 400);
}
