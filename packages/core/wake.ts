/**
 * The worker's wake-up call. With nothing to do, the worker stops asking the database (so it can
 * go to sleep, which is what it is billed by) and looks in only every 20 minutes. Whatever gives
 * it work (a new scan, a re-run, an admin action) calls wakeWorker, and it is back within a second.
 * A call that is lost costs nothing but time: the worker's next look-in finds the work.
 */
import { redis } from './redis';

export const WAKE_CHANNEL = 'stakeout:wake';

export async function wakeWorker(reason: string) {
  await redis()
    .publish(WAKE_CHANNEL, reason)
    .catch((e) => console.warn('[wake] not sent:', (e as Error).message));
}

/**
 * Whether the worker may skip the database on this tick: nothing has been open for `idleAfterMs`,
 * and its last full look-in was under `everyMs` ago.
 */
export function mayRest(now: number, lastBusy: number, lastFull: number, idleAfterMs: number, everyMs: number) {
  return now - lastBusy > idleAfterMs && now - lastFull < everyMs;
}
