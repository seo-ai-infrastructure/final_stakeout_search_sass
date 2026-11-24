import { createHmac, randomBytes } from 'node:crypto';
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import https from 'node:https';
import { isIP } from 'node:net';

/**
 * Sending a webhook safely: which addresses may receive one (public HTTPS only, never a private
 * network, checked again at every connection), the signature, and one POST. No database here, so
 * it can be checked on its own; core/webhooks.ts queues and retries.
 */
export const WEBHOOK_EVENT = 'scan.completed';
export const RETRY_AFTER_MS = [60_000, 5 * 60_000, 30 * 60_000];
const PORTS = new Set(['', '443', '8443']);

/** Addresses a webhook may never reach: private, loopback, link-local, shared, documentation, multicast, reserved. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const dotted = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateAddress(dotted[1]);
    const hex = x.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) { const n = (parseInt(hex[1], 16) << 16) >>> 0 | parseInt(hex[2], 16); return isPrivateAddress([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')); }
    // Anything else starting "::" (IPv4-compatible forms), unique-local, link- and site-local,
    // multicast, NAT64, documentation, Teredo, 6to4 and discard addresses.
    if (x.startsWith('::')) return true;
    return /^(f[cd]|fe[89a-f]|ff)/.test(x) || /^64:ff9b:/.test(x) || /^2001:db8:/.test(x) || /^2001:(0{1,4})?:/.test(x) || /^2002:/.test(x) || /^100::/.test(x);
  }
  return true;
}

/** A webhook address as saved: public HTTPS only. The reason, when it is not. */
export function checkWebhookUrl(raw: unknown): { url: string } | { error: string } {
  let u: URL;
  try { u = new URL(String(raw ?? '').trim()); } catch { return { error: 'Enter the full address, starting with https://' }; }
  if (u.protocol !== 'https:') return { error: 'The address must start with https://' };
  if (u.username || u.password) return { error: 'Leave the user name and password out of the address.' };
  if (!PORTS.has(u.port)) return { error: 'Use the standard HTTPS port (443).' };
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home|corp|intranet|invalid|test)$/.test(host) || (!host.includes('.') && !isIP(host))) return { error: 'That address is not on the public internet.' };
  if (isIP(host) && isPrivateAddress(host)) return { error: 'That address is not on the public internet.' };
  const url = u.toString();
  if (url.length > 2000) return { error: 'That address is too long.' };
  return { url };
}

/** The signature header's value: HMAC-SHA256 of "<timestamp>.<raw body>" with the account's secret, in hex. */
export const signWebhook = (secret: string, t: number, body: string) => createHmac('sha256', secret).update(t + '.' + body).digest('hex');
export const newWebhookSecret = () => 'whsec_' + randomBytes(24).toString('base64url');

type Resolver = (hostname: string, options: LookupOptions & { all: true }, callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;
type Lookup = (hostname: string, options: LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => void;

/**
 * The name lookup for a webhook connection: it refuses the connection when any address the name
 * resolves to is private, checked at every connection (so a name cannot be pointed somewhere
 * private after it was saved).
 */
export const guardedLookup = (resolve: Resolver = dnsLookup as unknown as Resolver): Lookup => (hostname, options, callback) => {
  resolve(hostname, { ...options, all: true }, (err, list) => {
    if (err) return callback(err, '');
    if (!list?.length || list.some((a) => isPrivateAddress(a.address))) return callback(Object.assign(new Error('BLOCKED_ADDRESS'), { code: 'BLOCKED_ADDRESS' }), '');
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
};
const safeLookup = guardedLookup();

/** One POST of a webhook: ok on a 2xx answer within 10 seconds. Redirects are not followed. */
export function postWebhook(raw: string, secret: string, event: string, deliveryId: string, body: string): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  const checked = checkWebhookUrl(raw);
  if ('error' in checked) return Promise.resolve({ ok: false, status: null, error: checked.error });
  const t = Math.floor(Date.now() / 1000);
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: { ok: boolean; status: number | null; error: string | null }) => { if (!done) { done = true; resolve(r); } };
    const req = https.request(
      new URL(checked.url),
      {
        method: 'POST',
        lookup: safeLookup as never,
        timeout: 10_000,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'user-agent': 'Stakeout-Webhooks/1',
          'stakeout-event': event,
          'stakeout-delivery': deliveryId,
          'stakeout-signature': `t=${t},v1=${signWebhook(secret, t, body)}`,
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        res.resume();
        finish({ ok: status >= 200 && status < 300, status, error: status >= 200 && status < 300 ? null : status >= 300 && status < 400 ? `Answered ${status} (a redirect): use the final address.` : `Answered ${status}.` });
      },
    );
    req.on('timeout', () => req.destroy(new Error('No answer within 10 seconds.')));
    req.on('error', (e: NodeJS.ErrnoException) => finish({ ok: false, status: null, error: e.code === 'BLOCKED_ADDRESS' ? 'That address is not on the public internet.' : (e.message || 'Could not connect.').slice(0, 200) }));
    req.end(body);
  });
}

/** The body posted: one delivery's id, event and try, and the scan's summary under `data`. */
export const webhookBody = (d: { id: string; event: string; createdAt: Date; attempts: number }, data: unknown) => JSON.stringify({ id: d.id, event: d.event, createdAt: d.createdAt.toISOString(), attempt: d.attempts, data });

