import { InputError } from '@stakeout/core/grid';

export const turnstileConfigured = () => Boolean(process.env.TURNSTILE_SECRET_KEY);

/** Verifies a Cloudflare Turnstile token. No-op when Turnstile is not configured. */
export async function requireHuman(token: unknown, ip: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (typeof token !== 'string' || !token || token.length > 2048)
    throw new InputError('Complete the verification check and try again.', 400);
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  let ok = false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    ok = r.ok && (await r.json())?.success === true;
  } catch {
    throw new InputError('Verification is temporarily unavailable. Try again.', 503);
  }
  if (!ok) throw new InputError('Verification failed. Refresh the check and try again.', 400);
}
