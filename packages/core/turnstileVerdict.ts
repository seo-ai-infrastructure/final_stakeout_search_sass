/**
 * Cloudflare Turnstile siteverify rules (canonical checks from Cloudflare's Turnstile guide):
 * the token must be valid, minted for the expected action (signup, teaser, …), and solved
 * on one of this deployment's own hostnames.
 */
export type SiteverifyResult = {
  success?: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
};

export type TurnstileVerdict = 'ok' | 'failed' | 'wrong_action' | 'wrong_hostname' | 'misconfigured';

/** Allowed frontend hostnames: TURNSTILE_HOSTNAMES, else APP_URL's host and its www twin. */
export function expectedHostnames(env: Record<string, string | undefined> = process.env): Set<string> {
  const listed = (env.TURNSTILE_HOSTNAMES ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (listed.length) return new Set(listed);
  try {
    const host = new URL(env.APP_URL ?? '').hostname.toLowerCase();
    if (!host) return new Set();
    const bare = host.replace(/^www\./, '');
    return new Set([bare, 'www.' + bare]);
  } catch {
    return new Set();
  }
}

export function turnstileVerdict(r: SiteverifyResult, expect: { action?: string; hostnames: Set<string> }): TurnstileVerdict {
  const codes = r['error-codes'] ?? [];
  if (codes.includes('invalid-input-secret') || codes.includes('missing-input-secret')) return 'misconfigured';
  if (r.success !== true) return 'failed';
  if (expect.action && r.action !== expect.action) return 'wrong_action';
  if (expect.hostnames.size && !expect.hostnames.has(String(r.hostname ?? '').toLowerCase())) return 'wrong_hostname';
  return 'ok';
}
