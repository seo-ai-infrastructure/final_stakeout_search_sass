import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Reads a public web page for the AI citations checklist: is the scanned business mentioned on a
 * page Google's AI cited? The address comes from Google's answer, not from us, so it is treated
 * as untrusted: https only, public internet addresses only (checked again on every redirect), a
 * short time limit and a size limit. We say who we are; a site that refuses is reported as
 * "blocked", never worked around.
 */
const AGENT = 'StakeoutSearchBot/1.0 (+https://www.stakeoutsearch.com; checks whether a business is listed on a page)';
const MAX_BYTES = 600_000;

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const a = ip.toLowerCase();
    if (a.startsWith('::ffff:')) return privateAddress(a.slice(7));
    return a === '::1' || a === '::' || /^f[cd]/.test(a) || /^fe[89ab]/.test(a);
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224;
}

async function publicHost(url: URL) {
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) return false;
  if (isIP(url.hostname) || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname) || /\.(local|internal|localhost|lan|home|corp)$/i.test(url.hostname)) return false;
  const found = await lookup(url.hostname, { all: true }).catch(() => []);
  return found.length > 0 && found.every((f) => !privateAddress(f.address));
}

export type PageRead = { note: 'ok'; text: string; html: string } | { note: 'blocked' | 'unreachable'; text: ''; html: '' };
const none = (note: 'blocked' | 'unreachable'): PageRead => ({ note, text: '', html: '' });

export async function readPublicPage(address: string): Promise<PageRead> {
  let url: URL;
  try { url = new URL(address); } catch { return none('unreachable'); }
  try {
    for (let hop = 0; hop < 4; hop++) {
      if (!(await publicHost(url))) return none('unreachable');
      const res = await fetch(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': AGENT, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en' } });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location');
        if (!next) return none('unreachable');
        url = new URL(next, url);
        continue;
      }
      if ([401, 403, 406, 429, 451, 503].includes(res.status)) return none('blocked');
      if (!res.ok || !/html|text/i.test(res.headers.get('content-type') ?? 'text/html') || !res.body) return none('unreachable');
      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); size += value.length;
      }
      reader.cancel().catch(() => {});
      const html = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(parts).subarray(0, MAX_BYTES));
      // A page that is only a "prove you are human" wall says nothing about who is listed on it.
      if (html.length < 1500 && /captcha|verify you are|access denied|enable javascript/i.test(html)) return none('blocked');
      const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;|&rsquo;/g, "'").replace(/&[a-z]+;|&#\d+;/gi, ' ');
      return { note: 'ok', text, html };
    }
    return none('unreachable');
  } catch {
    return none('unreachable');
  }
}
