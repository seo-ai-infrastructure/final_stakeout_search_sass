import { Queue } from 'bullmq';
import { redis } from './redis';
export async function registerStakeoutSchedule(
  queue: Queue,
  templateScanId: string,
  cron: string,
) {
  return queue.upsertJobScheduler(
    'schedule-' + templateScanId,
    { pattern: cron, tz: 'UTC' },
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
