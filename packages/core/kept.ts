/**
 * Things that used to live only in Redis and must not be lost if Redis is emptied, replaced or
 * runs out of its plan: admin settings, white-label brands and their logos, merged client names,
 * the secret that signs review alerts.
 *
 * Postgres holds the lasting copy (the Kept table); Redis stays the copy that is read, so nothing
 * that reads these often (the worker reads settings every few seconds) wakes the database. A
 * change is written to Postgres first, then to Redis. When Redis turns out to have lost a value,
 * it is put back from Postgres. The first read after this was introduced copies what Redis held
 * into Postgres.
 */
import { redis } from './redis';

// Loaded when first needed, so the pure rules in files that use this can be tested without a database.
const database = async () => (await import('@stakeout/db')).db;

const mark = (scope: string) => 'stakeout:kept:synced:' + scope;

const rowsOf = async (scope: string) => (await database()).$queryRaw<{ key: string; value: string }[]>`SELECT "key", "value" FROM "Kept" WHERE "scope" = ${scope}`;
const put = async (scope: string, key: string, value: string) =>
  (await database()).$executeRaw`INSERT INTO "Kept" ("scope", "key", "value", "updatedAt") VALUES (${scope}, ${key}, ${value}, NOW()) ON CONFLICT ("scope", "key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW()`;
const putIfNew = async (scope: string, key: string, value: string) =>
  (await database()).$executeRaw`INSERT INTO "Kept" ("scope", "key", "value", "updatedAt") VALUES (${scope}, ${key}, ${value}, NOW()) ON CONFLICT ("scope", "key") DO NOTHING`;
const drop = async (scope: string, key: string) => (await database()).$executeRaw`DELETE FROM "Kept" WHERE "scope" = ${scope} AND "key" = ${key}`;

/**
 * What the two copies come to when they are first brought together: everything either holds, the
 * lasting copy winning where they differ. `toKeep` is what only Redis had (to write to Postgres);
 * `toRestore` is what Redis is missing or has wrong (to write back to it).
 */
export function reconcile(fast: Record<string, string>, lasting: { key: string; value: string }[]) {
  const held = new Map(lasting.map((r) => [r.key, r.value]));
  return {
    all: { ...fast, ...Object.fromEntries(held) },
    toKeep: Object.entries(fast).filter(([k]) => !held.has(k)),
    toRestore: lasting.filter((r) => fast[r.key] !== r.value),
  };
}

/** A set of named values kept together (a Redis hash), with its lasting copy in Postgres under `scope`. */
export function keptHash(scope: string, redisKey: string) {
  return {
    /** Every value. Read from Redis; checked against Postgres only until the two have been brought together once. */
    async all(): Promise<Record<string, string>> {
      let fast: Record<string, string>;
      let synced: string | null;
      try {
        [fast, synced] = await Promise.all([redis().hgetall(redisKey), redis().get(mark(scope))]);
      } catch {
        // Redis cannot be reached: the lasting copy is read instead.
        return Object.fromEntries((await rowsOf(scope).catch(() => [])).map((r) => [r.key, r.value]));
      }
      if (synced) return fast;
      try {
        const r = reconcile(fast, await rowsOf(scope));
        for (const [k, v] of r.toKeep) await putIfNew(scope, k, v);
        if (r.toRestore.length) await redis().hset(redisKey, ...r.toRestore.flatMap((x) => [x.key, x.value]));
        await redis().set(mark(scope), new Date().toISOString());
        return r.all;
      } catch (e) {
        // Postgres could not be reached this time: what Redis has is used, and the two are brought together on a later read.
        console.warn('[kept] ' + scope + ' not brought together yet:', e instanceof Error ? e.message : e);
        return fast;
      }
    },
    /** Sets values: Postgres first, so a value is never in Redis alone. */
    async set(values: Record<string, string>): Promise<void> {
      const pairs = Object.entries(values);
      if (!pairs.length) return;
      for (const [k, v] of pairs) await put(scope, k, v);
      await redis().hset(redisKey, ...pairs.flat());
    },
    async del(key: string): Promise<void> {
      await drop(scope, key);
      await redis().hdel(redisKey, key);
    },
  };
}

const copied = new Set<string>();
/** One value under its own Redis key (a logo, a secret), with its lasting copy in Postgres under `scope` and `key`. */
export function keptValue(scope: string, key: string, redisKey: string) {
  return {
    async get(): Promise<string | null> {
      const fast = await redis().get(redisKey).catch(() => null);
      if (fast !== null) {
        // What Redis held before this was introduced is copied across, once for each running copy of the site.
        if (!copied.has(redisKey)) { copied.add(redisKey); await putIfNew(scope, key, fast).catch(() => copied.delete(redisKey)); }
        return fast;
      }
      const row = (await database().then((d) => d.$queryRaw<{ value: string }[]>`SELECT "value" FROM "Kept" WHERE "scope" = ${scope} AND "key" = ${key}`).catch(() => []))[0];
      if (!row) return null;
      await redis().set(redisKey, row.value).catch(() => {});
      copied.add(redisKey);
      return row.value;
    },
    async set(value: string): Promise<void> {
      await put(scope, key, value);
      await redis().set(redisKey, value);
      copied.add(redisKey);
    },
    async del(): Promise<void> {
      await drop(scope, key);
      await redis().del(redisKey);
      copied.delete(redisKey);
    },
  };
}
