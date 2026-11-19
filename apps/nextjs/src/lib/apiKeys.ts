import { createHash, randomBytes } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';

const MAX_KEYS = 10;
const hashOf = (key: string) => createHash('sha256').update(key).digest('hex');

/** Makes a key. The key itself is returned once and never stored; only its hash is kept. */
export async function createKey(userId: string, name: unknown) {
  const label = (typeof name === 'string' ? name.trim() : '').slice(0, 60) || 'AI agent';
  if ((await db.apiKey.count({ where: { userId, revokedAt: null } })) >= MAX_KEYS) throw new InputError(`An account can have ${MAX_KEYS} keys. Revoke one first.`);
  const key = 'stk_' + randomBytes(24).toString('base64url');
  const row = await db.apiKey.create({ data: { userId, name: label, prefix: key.slice(0, 8), hash: hashOf(key) } });
  return { id: row.id, name: row.name, prefix: row.prefix, key };
}

export const listKeys = (userId: string) =>
  db.apiKey.findMany({ where: { userId, revokedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true } });

export async function revokeKey(userId: string, id: string) {
  const r = await db.apiKey.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!r.count) throw new InputError('Unknown key.', 404);
}

/** The account a key belongs to, or null: unknown, revoked, or the account is blocked. */
export async function accountOfKey(key: string) {
  if (!/^stk_[A-Za-z0-9_-]{32}$/.test(key)) return null;
  const row = await db.apiKey.findUnique({ where: { hash: hashOf(key) } });
  if (!row || row.revokedAt !== null) return null;
  const user = await db.user.findUnique({ where: { id: row.userId } });
  if (!user || user.role === 'BLOCKED') return null;
  // When it was last used, to the hour: enough to spot a forgotten key without a write on every call.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 3600000) await db.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { user, keyId: row.id };
}
