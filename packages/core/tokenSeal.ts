import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Encryption for third-party tokens kept in the database (AES-256-GCM, key derived from AUTH_SECRET). */
const keyOf = (secret: string) => createHash('sha256').update('google-token:' + secret).digest();

/** Encrypts a token for storage: nonce.tag.ciphertext, base64url. */
export function sealToken(token: string, secret = process.env.AUTH_SECRET ?? ''): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const body = Buffer.concat([c.update(token, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

/** The stored token, or null when it was sealed with another secret or has been altered. */
export function openToken(sealed: string, secret = process.env.AUTH_SECRET ?? ''): string | null {
  try {
    const [iv, tag, body] = sealed.split('.').map((x) => Buffer.from(x, 'base64url'));
    if (!iv || !tag || !body || iv.length !== 12) return null;
    const d = createDecipheriv('aes-256-gcm', keyOf(secret), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
