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
async function takeDuoPlusSlot(endpoint: string) {
  const interval = Number(process.env.DUOPLUS_MIN_INTERVAL_MS ?? 1050);
  const store = redis();
  const t0 = Date.now();
  for (;;) {
    if (await store.set('rl:duoplus:global', '1', 'PX', interval, 'NX')) {
      noteSlot(endpoint, Date.now() - t0);
      return;
    }
    const ttl = await store.pttl('rl:duoplus:global');
    await pause(Math.max(25, ttl) + Math.random() * 60);
  }
}

/**
 * How long this process's DuoPlus requests waited for the shared slot, kept for the admin page:
 * a long wait means requests are queueing behind each other (too many phones polling at once).
 */
const slotLog: { at: number; ms: number; endpoint: string }[] = [];
function noteSlot(endpoint: string, ms: number) {
  slotLog.push({ at: Date.now(), ms, endpoint: endpoint.replace(/^\/api\/v1\//, '') });
  if (slotLog.length > 6000) slotLog.splice(0, slotLog.length - 6000);
}
export function duoplusSlotStats(windowMs = 5 * 60000) {
  const since = Date.now() - windowMs;
  const recent = slotLog.filter((x) => x.at >= since);
  const byEndpoint = new Map<string, number>();
  for (const x of recent) byEndpoint.set(x.endpoint, (byEndpoint.get(x.endpoint) ?? 0) + 1);
  const minutes = windowMs / 60000;
  return {
    windowMinutes: minutes,
    perMinute: Math.round((recent.length / minutes) * 10) / 10,
    avgWaitMs: recent.length ? Math.round(recent.reduce((s, x) => s + x.ms, 0) / recent.length) : 0,
    maxWaitMs: recent.reduce((m, x) => Math.max(m, x.ms), 0),
    top: [...byEndpoint].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([endpoint, n]) => ({ endpoint, perMinute: Math.round((n / minutes) * 10) / 10 })),
  };
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
    await takeDuoPlusSlot(endpoint);
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
      // Keep DuoPlus's own reason: it is what tells a missing record from a refused edit.
      const why = [result?.message, result?.data?.fail_reason ?? result?.data?.fail]
        .filter((v) => v !== undefined && v !== null && v !== '')
        .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
        .join(' ')
        .slice(0, 200);
      throw new Error('DuoPlus rejected ' + endpoint + (why ? ': ' + why : '') + (result?.code !== undefined ? ' (code ' + result.code + ')' : ''));
    }
    return result;
  }
}
