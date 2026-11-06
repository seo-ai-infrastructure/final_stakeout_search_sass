import Redis, { type RedisOptions } from 'ioredis';

let client: Redis | undefined;

function cleanRedisUrl(raw?: string): string {
  const trimmed = raw?.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) throw new Error('REDIS_URL is required.');
  return trimmed;
}

export function redactRedisUrl(raw = process.env.REDIS_URL): string {
  try {
    const u = new URL(cleanRedisUrl(raw));
    return `${u.protocol}//${u.hostname}:${u.port || '6379'}`;
  } catch {
    return 'INVALID_OR_MISSING_REDIS_URL';
  }
}

export function buildRedisOptions(raw = process.env.REDIS_URL): RedisOptions {
  const url = cleanRedisUrl(raw);
  const parsed = new URL(url);
  const isTls =
    parsed.protocol === 'rediss:' || parsed.hostname.endsWith('.upstash.io');

  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    family: 0,
    ...(isTls ? { tls: { servername: parsed.hostname } } : {}),
    retryStrategy(times: number) {
      return Math.min(times * 500, 5000);
    },
  };
}

/**
 * Creates a fresh, dedicated IORedis connection (required for each BullMQ Worker).
 */
export function createRedisClient(label = 'redis'): Redis {
  const url = cleanRedisUrl(process.env.REDIS_URL);
  const target = redactRedisUrl(url);
  const instance = new Redis(url, buildRedisOptions(url));

  instance.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`[${label}] Redis error (${target}):`, {
      name: err.name,
      message: err.message,
      code: err.code,
    });
  });

  return instance;
}

/**
 * Shared singleton Redis client for non-blocking Queue producers and rate limiters.
 */
export function redis(): Redis {
  return (client ??= createRedisClient('shared-redis'));
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * DuoPlus allows one API request per second per account. One Redis key shared by
 * every worker and the web app enforces that across ALL endpoints (the earlier
 * limiter was per endpoint, so three endpoints could fire in the same second).
 */
async function takeDuoPlusSlot() {
  const interval = Number(process.env.DUOPLUS_MIN_INTERVAL_MS ?? 1050);
  const store = redis();
  for (;;) {
    if (await store.set('rl:duoplus:global', '1', 'PX', interval, 'NX')) return;
    const ttl = await store.pttl('rl:duoplus:global');
    await pause(Math.max(25, ttl) + Math.random() * 60);
  }
}

const isRateLimited = (status: number, result: any) =>
  status === 429 ||
  result?.code === 429 ||
  /too (many|frequent)|rate.?limit|frequency|频繁/i.test(String(result?.message ?? ''));

export async function duoplusPost(
  endpoint: string,
  payload: Record<string, unknown>,
) {
  for (let attempt = 0; ; attempt++) {
    await takeDuoPlusSlot();
    const response = await fetch('https://openapi.duoplus.net' + endpoint, {
      method: 'POST',
      headers: {
        'DuoPlus-API-Key': process.env.DUOPLUS_API_KEY!,
        'Content-Type': 'application/json',
        Lang: 'en',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    let result: any = null;
    try {
      result = await response.json();
    } catch {
      result = null;
    }
    // Slow down instead of failing the pin when DuoPlus says we went too fast.
    if (isRateLimited(response.status, result) && attempt < 4) {
      await pause(1500 * (attempt + 1));
      continue;
    }
    if (!response.ok)
      throw new Error('DuoPlus ' + endpoint + ' HTTP ' + response.status);
    if (
      !result ||
      result.code !== 200 ||
      result.data?.fail?.length ||
      Object.values(result.data ?? {}).some((v: any) => v?.success === false)
    ) {
      throw new Error('DuoPlus rejected ' + endpoint);
    }
    return result;
  }
}
