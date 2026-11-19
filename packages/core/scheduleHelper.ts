import { Queue } from 'bullmq';
import { redis } from './redis';
import { cronParts } from './grid';
export async function registerStakeoutSchedule(
  queue: Queue,
  templateScanId: string,
  cron: string,
) {
  return queue.upsertJobScheduler(
    'schedule-' + templateScanId,
    // A schedule set for a time of day carries its own time zone; the usual ones are in UTC.
    cronParts(cron),
    {
      name: 'repeat-scan',
      data: { templateScanId },
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 4000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      },
    },
  );
}

/** Ends a repeating scan's schedule (its scan was deleted). */
export async function removeStakeoutSchedule(templateScanId: string) {
  const queue = new Queue('stakeout-recurring-schedules', { connection: redis() });
  await queue.removeJobScheduler('schedule-' + templateScanId);
}
