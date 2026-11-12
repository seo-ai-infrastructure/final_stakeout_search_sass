import { createHash, randomBytes } from 'node:crypto';
import { db } from '@stakeout/db';

export type TokenPurpose = 'VERIFY_EMAIL' | 'TEASER' | 'SET_PASSWORD';
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

export async function issueToken(
  purpose: TokenPurpose,
  email: string,
  refs: { userId?: string; scanId?: string },
  ttlMs = 86400000,
) {
  const token = randomBytes(32).toString('base64url');
  await db.emailToken.create({
    data: {
      tokenHash: hash(token),
      purpose,
      email,
      userId: refs.userId,
      scanId: refs.scanId,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return token;
}

/** Marks the token used exactly once. Returns null when unknown, used or expired. */
export async function consumeToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const tokenHash = hash(token);
  const claimed = await db.emailToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (!claimed.count) return null;
  return db.emailToken.findUnique({ where: { tokenHash } });
}

/** Looks at a token without using it up: null when unknown, used or expired. */
export async function peekToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const t = await db.emailToken.findUnique({ where: { tokenHash: hash(token) } });
  return t && !t.usedAt && t.expiresAt > new Date() ? t : null;
}
