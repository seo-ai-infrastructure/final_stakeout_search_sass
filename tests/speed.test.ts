import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEDULE_LEAD_MS, asSpeed, monthlyText, queuePriority, runDays, schedulePlan, speedFactor, zonedMoment } from '../packages/core/speed';
import { scheduleText } from '../packages/core/grid';
import { pointPrice } from '../packages/core/network';

test('Scan Now costs twice a scheduled scan and goes first', () => {
  assert.equal(speedFactor('now'), 2);
  assert.equal(speedFactor('scheduled'), 1);
  assert.equal(speedFactor(undefined), 2, 'a scan that says nothing runs now');
  assert.equal(asSpeed('scheduled'), 'scheduled');
  assert.equal(asSpeed('later'), 'now');
  assert.equal(queuePriority('now'), undefined, 'no priority is first in line in BullMQ');
  assert.equal(queuePriority('scheduled'), 10);
});

test('weekly is 4 fixed runs a month and every other week 2', () => {
  assert.deepEqual(runDays('weekly', 3), [3, 10, 17, 24]);
  assert.deepEqual(runDays('weekly', 24), [3, 10, 17, 24], 'the 24th starts the same 4 days');
  assert.deepEqual(runDays('weekly', 7), [7, 14, 21, 28]);
  assert.deepEqual(runDays('biweekly', 20), [6, 20]);
  assert.deepEqual(runDays('biweekly', 14), [14, 28]);
  assert.equal(monthlyText('0 9 3,10,17,24 * *'), 'on the 3rd, 10th, 17th and 24th of each month at 9:00 AM');
  assert.equal(monthlyText('30 14 1,15 * *'), 'on the 1st and 15th of each month at 2:30 PM');
  assert.equal(monthlyText('0 13 * * 1'), null);
  assert.equal(scheduleText('weekly', '0 9 3,10,17,24 * *;tz=America/New_York'), 'on the 3rd, 10th, 17th and 24th of each month at 9:00 AM (America/New_York)');
  assert.equal(scheduleText('weekly', '0 13 * * 1'), 'every Monday at 1:00 PM (UTC)', 'older schedules still read');
});

test('a scheduled time is read in the business’s time zone', () => {
  const winter = zonedMoment('2026-12-03', '09:00', 'America/New_York');
  assert.ok(winter instanceof Date);
  assert.equal((winter as Date).toISOString(), '2026-12-03T14:00:00.000Z');
  const summer = zonedMoment('2027-07-01', '09:00', 'America/Los_Angeles');
  assert.equal((summer as Date).toISOString(), '2027-07-01T16:00:00.000Z');
  assert.deepEqual(zonedMoment('2026-12-03', '9am', 'America/New_York'), { problem: 'Give the time as HH:MM, 24-hour, such as 09:30.' });
  assert.deepEqual(zonedMoment('2026-12-03', '09:00', 'Mars/Olympus'), { problem: 'Give the time zone by its name, such as America/New_York.' });
});

test('a schedule plan: first run, then the stored repeat', () => {
  const now = new Date('2026-11-21T04:00:00Z');
  const once = schedulePlan({ repeat: 'once', date: '2026-11-24', at: '10:30', timezone: 'America/Chicago' }, now);
  assert.deepEqual(once, { runAt: new Date('2026-11-24T16:30:00Z'), repeat: 'once', cron: null });
  const weekly = schedulePlan({ repeat: 'weekly', date: '2026-11-24', at: '10:30', timezone: 'America/Chicago' }, now);
  assert.equal((weekly as { cron: string }).cron, '30 10 3,10,17,24 * *;tz=America/Chicago');
  const biweekly = schedulePlan({ repeat: 'biweekly', date: '2026-12-02', at: '08:00', timezone: 'America/New_York' }, now);
  assert.equal((biweekly as { cron: string }).cron, '0 8 2,16 * *;tz=America/New_York');
  assert.deepEqual(schedulePlan({ repeat: 'weekly', date: '2026-11-30', at: '08:00', timezone: 'America/New_York' }, now), { problem: 'A repeating scan starts on one of the 1st to the 28th of the month, so every month has its runs.' });
  const tooSoon = { problem: 'Pick a time at least 2 hours from now, or choose As soon as possible.' };
  assert.deepEqual(schedulePlan({ repeat: 'once', date: '2026-11-20', at: '08:00', timezone: 'America/New_York' }, now), tooSoon, 'in the past');
  // now is 10:00 PM in Chicago on Nov 20: 11:30 PM is 90 minutes away, midnight is 2 hours.
  assert.deepEqual(schedulePlan({ repeat: 'once', date: '2026-11-20', at: '23:30', timezone: 'America/Chicago' }, now), tooSoon, 'under 2 hours away');
  assert.deepEqual(schedulePlan({ repeat: 'once', date: '2026-11-21', at: '00:00', timezone: 'America/Chicago' }, now), { runAt: new Date('2026-11-21T06:00:00Z'), repeat: 'once', cron: null }, '2 hours away');
  assert.ok('runAt' in schedulePlan({ repeat: 'once', date: '2026-11-21', at: '00:00', timezone: 'America/Chicago' }, new Date(now.getTime() + 8 * 60000)), 'a few minutes spent sending the form are allowed');
  assert.equal(SCHEDULE_LEAD_MS, 2 * 3600000);
  assert.deepEqual(schedulePlan({ repeat: 'once', date: '2027-03-01', at: '08:00', timezone: 'America/New_York' }, now), { problem: 'Pick a first run within the next 60 days.' });
});

test('a mixed-network point gives back what it cost at its speed', () => {
  const pins = [{ rowIdx: 0, colIdx: 0 }, { rowIdx: 0, colIdx: 1 }];
  // One home point and one mobile point (2 a point scheduled): 3 scheduled, 6 on Scan Now.
  const sched = pointPrice({ network: 'mix', creditsCharged: 3, totalPins: 2, speed: 'scheduled' }, pins);
  const now = pointPrice({ network: 'mix', creditsCharged: 6, totalPins: 2, speed: 'now' }, pins);
  assert.equal(sched(pins[0]) + sched(pins[1]), 3);
  assert.equal(now(pins[0]) + now(pins[1]), 6);
});
