/**
 * The two ways a scan can run.
 *   Scan Now   jumps ahead of every scheduled scan.
 *   Scheduled  runs either as soon as possible (right away when the
 *              phones are free, otherwise at the end of the line, behind Scan Now) or at the day and
 *              hour the customer picks, at least SCHEDULE_LEAD_MS ahead.
 * Both cost one phone session a grid point: one pin is one session, across the board.
 * A repeating scheduled scan runs on fixed days of the month, so every month has the same number of
 * runs: weekly is 4 runs (the d, d+7, d+14 and d+21 of the month), every other week is 2 (d and d+14).
 */
export type Speed = 'now' | 'scheduled';
export type Repeat = 'once' | 'weekly' | 'biweekly';

export const asSpeed = (v: unknown): Speed => (v === 'scheduled' ? 'scheduled' : 'now');

/** How far ahead a picked time must be. Sooner than that, a scheduled scan runs as soon as possible. */
export const SCHEDULE_LEAD_MS = 2 * 3600000;
/** Slack on the server for the minutes spent filling in the form after the time was picked. */
const LEAD_GRACE_MS = 10 * 60000;
export const asRepeat = (v: unknown): Repeat => (v === 'weekly' || v === 'biweekly' ? v : 'once');

/** Phone sessions a grid point costs at this speed: one, Scan Now or scheduled (Scan Now was 2 until 22 Nov 2026). */
export const speedFactor = (_speed: string | null | undefined) => 1;

/** BullMQ priority for a scan's points: none (first in line) for Scan Now, behind it when scheduled. */
export const queuePriority = (speed: string | null | undefined) => (speed === 'scheduled' ? 10 : undefined);

/** The days of the month a repeating scan runs on, from the day of the month of its first run. */
export function runDays(repeat: Repeat, firstDay: number): number[] {
  if (repeat === 'weekly') {
    const d = ((firstDay - 1) % 7) + 1;
    return [d, d + 7, d + 14, d + 21];
  }
  if (repeat === 'biweekly') {
    const d = ((firstDay - 1) % 14) + 1;
    return [d, d + 14];
  }
  return [firstDay];
}

const pad = (n: number) => String(n).padStart(2, '0');
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function zoneOk(tz: string) {
  try {
    if (!tz) return false;
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** How far ahead of UTC a time zone is at a moment, in ms. */
function offsetAt(t: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - t;
}

/** A wall-clock date and time in a time zone, as the moment it happens. */
export function zonedMoment(date: string, at: string, tz: string): Date | { problem: string } {
  const d = DATE.exec(String(date ?? '').trim());
  if (!d) return { problem: 'Give the date as YYYY-MM-DD.' };
  const m = TIME.exec(String(at ?? '').trim());
  if (!m) return { problem: 'Give the time as HH:MM, 24-hour, such as 09:30.' };
  if (!zoneOk(tz)) return { problem: 'Give the time zone by its name, such as America/New_York.' };
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(m[1]), Number(m[2]));
  let t = wall - offsetAt(wall, tz);
  t = wall - offsetAt(t, tz);
  return new Date(t);
}

/**
 * A scheduled scan's plan: when it first runs and, when it repeats, the stored schedule for the
 * worker ("M H d1,d2,… * *;tz=…"). The first run is at least 2 hours and no more than 60 days ahead.
 */
export function schedulePlan(input: { repeat: unknown; date: unknown; at: unknown; timezone: unknown }, now = new Date()): { runAt: Date; repeat: Repeat; cron: string | null } | { problem: string } {
  const repeat = asRepeat(input.repeat);
  const tz = String(input.timezone ?? '').trim();
  const date = String(input.date ?? '').trim();
  const at = String(input.at ?? '').trim();
  const runAt = zonedMoment(date, at, tz);
  if (!(runAt instanceof Date)) return runAt;
  if (runAt.getTime() < now.getTime() + SCHEDULE_LEAD_MS - LEAD_GRACE_MS) return { problem: 'Pick a time at least 2 hours from now, or choose As soon as possible.' };
  if (runAt.getTime() > now.getTime() + 60 * 86400000) return { problem: 'Pick a first run within the next 60 days.' };
  const day = Number(date.slice(8, 10));
  if (repeat !== 'once' && day > 28) return { problem: 'A repeating scan starts on one of the 1st to the 28th of the month, so every month has its runs.' };
  const [h, mi] = at.split(':').map(Number);
  const cron = repeat === 'once' ? null : `${mi} ${h} ${runDays(repeat, day).join(',')} * *;tz=${tz}`;
  return { runAt, repeat, cron };
}

const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

/** "the 3rd, 10th, 17th and 24th of each month at 9:00 AM" for a stored monthly-day schedule, or null. */
export function monthlyText(pattern: string): string | null {
  const [min, hour, dom, mon, dow] = pattern.trim().split(/\s+/);
  if (!dom || dom === '*' || mon !== '*' || dow !== '*' || !/^\d+(,\d+)*$/.test(dom)) return null;
  const days = dom.split(',').map(Number);
  const h = Number(hour);
  const time = `${h % 12 || 12}:${pad(Number(min))} ${h < 12 ? 'AM' : 'PM'}`;
  const list = days.length === 1 ? ordinal(days[0]) : days.slice(0, -1).map(ordinal).join(', ') + ' and ' + ordinal(days[days.length - 1]);
  return `on the ${list} of each month at ${time}`;
}
