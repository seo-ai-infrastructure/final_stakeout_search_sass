/**
 * Google Business posts (updates, offers, events and photos), sent through Postproxy's posts API.
 * Pure rules: what a post needs before Google will take it, the request that publishes or
 * schedules it, reading the posts back, and the next open weekly slot for a listing.
 */

import { readOutletResults, type OutletResult } from './outlets';
export type PostFormat = 'standard' | 'offer' | 'event' | 'photo';
export const CTA: { value: string; label: string }[] = [
  { value: '', label: 'No button' },
  { value: 'LEARN_MORE', label: 'Learn more' },
  { value: 'BOOK', label: 'Book' },
  { value: 'ORDER', label: 'Order online' },
  { value: 'SHOP', label: 'Buy' },
  { value: 'SIGN_UP', label: 'Sign up' },
  { value: 'CALL', label: 'Call now' },
];
export const BODY_MAX = 1500;

export type PostDraft = {
  format: PostFormat;
  body: string;
  cta: string;
  ctaUrl: string;
  /** Event name, or the offer's headline. */
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  coupon: string;
  redeemUrl: string;
  terms: string;
  /** A public https image address, or a data: address made from a chosen file. Empty for none. */
  image: string;
  /** When it goes out: empty for now, or an ISO time. */
  scheduledAt: string;
};
export const emptyDraft = (): PostDraft => ({ format: 'standard', body: '', cta: '', ctaUrl: '', title: '', startDate: '', endDate: '', startTime: '', endTime: '', coupon: '', redeemUrl: '', terms: '', image: '', scheduledAt: '' });

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const isHttps = (s: string) => { try { return new URL(s).protocol === 'https:'; } catch { return false; } };
export const isImage = (s: string) => isHttps(s) || /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(s);

/** Why this post cannot be sent, or null. `now` decides what "in the past" means. */
export function postProblem(d: PostDraft, now: Date = new Date()): string | null {
  const today = now.toISOString().slice(0, 10);
  if (!['standard', 'offer', 'event', 'photo'].includes(d.format)) return 'Choose what kind of post this is.';
  if (d.image && !isImage(d.image)) return 'The image must be a JPG or PNG file, or an https link to one.';
  if (d.format === 'photo') return d.image ? scheduleProblem(d, now) : 'A photo post needs a photo.';
  if (!d.body.trim() && d.format === 'standard') return 'Write the post first.';
  if (d.body.trim().length > BODY_MAX) return `Too long: Google allows ${BODY_MAX} characters (this is ${d.body.trim().length}).`;
  if (d.cta && !CTA.some((c) => c.value === d.cta)) return 'Unknown button.';
  if (d.cta && d.cta !== 'CALL' && !isHttps(d.ctaUrl.trim())) return 'The button needs an https link.';
  if (d.format === 'event' && !d.title.trim()) return 'An event needs a name.';
  if (d.title.trim().length > 58) return 'The title is too long: Google allows 58 characters.';
  if (d.format === 'event' || d.format === 'offer') {
    if (!isDate(d.startDate) || !isDate(d.endDate)) return 'Set the start and end dates.';
    if (d.endDate < d.startDate) return 'The end date is before the start date.';
    if (d.endDate < today) return 'The end date has already passed.';
    if ((d.startTime && !isTime(d.startTime)) || (d.endTime && !isTime(d.endTime))) return 'Times are HH:MM, 24-hour.';
    if (Boolean(d.startTime) !== Boolean(d.endTime)) return 'Set both a start and an end time, or neither.';
    if (d.startDate === d.endDate && d.startTime && d.endTime <= d.startTime) return 'The end time is not after the start time.';
  }
  if (d.format === 'offer' && d.redeemUrl.trim() && !isHttps(d.redeemUrl.trim())) return 'The link to redeem the offer must be an https link.';
  return scheduleProblem(d, now);
}

export function scheduleProblem(d: PostDraft, now: Date): string | null {
  if (!d.scheduledAt) return null;
  const t = Date.parse(d.scheduledAt);
  if (Number.isNaN(t)) return 'The scheduled time is not a time.';
  if (t < now.getTime() + 5 * 60000) return 'Schedule it at least five minutes from now, or post it now.';
  if (t > now.getTime() + 366 * 86400000) return 'That is more than a year away.';
  return null;
}

/** The request that publishes (or schedules) the post on one listing. Call postProblem first. */
export function postRequest(d: PostDraft, profile: string, location: string) {
  const g: Record<string, string> = { format: d.format, location_id: location };
  if (d.format !== 'photo') {
    if (d.cta) {
      g.cta_action_type = d.cta;
      if (d.cta !== 'CALL') g.cta_url = d.ctaUrl.trim();
    }
    if (d.format === 'event' || d.format === 'offer') {
      if (d.title.trim()) g.event_title = d.title.trim();
      g.event_start_date = d.startDate;
      g.event_end_date = d.endDate;
      if (d.startTime && d.endTime) {
        g.event_start_time = d.startTime;
        g.event_end_time = d.endTime;
      }
    }
    if (d.format === 'offer') {
      if (d.coupon.trim()) g.offer_coupon_code = d.coupon.trim();
      if (d.redeemUrl.trim()) g.offer_redeem_url = d.redeemUrl.trim();
      if (d.terms.trim()) g.offer_terms = d.terms.trim();
    }
  }
  const post: Record<string, string> = d.format === 'photo' ? {} : { body: d.body.trim() };
  if (d.scheduledAt) post.scheduled_at = new Date(d.scheduledAt).toISOString();
  return { post, profiles: [profile], ...(d.image ? { media: [d.image] } : {}), platforms: { google_business: g } };
}

export type GbpPost = {
  /** How the same post fared on the other outlets it was sent to (Facebook, LinkedIn); empty when it went to Google alone. */
  also?: OutletResult[];
  /** The Google copy on its own (null: this post was not sent to Google). `state` above is the post as a whole. */
  google?: { state: 'waiting' | 'published' | 'failed'; error: string | null; permalink: string | null } | null;
  id: string;
  location: string;
  format: string;
  body: string;
  title: string | null;
  /** scheduled, publishing, published, failed, draft. */
  state: 'scheduled' | 'publishing' | 'published' | 'failed' | 'draft';
  error: string | null;
  at: string | null;
  permalink: string | null;
  image: string | null;
};

type Raw = Record<string, unknown>;
const text = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** One post as the service lists it, for the listing it went to; null when it has no Google listing. */
/**
 * A post as the posting service has it. A post belongs to a listing by its Google copy (the
 * location written in it); one that was not sent to Google is read only when `owner` says which
 * listing it was made for (our own record, see lib/outlets). `state` is the post as a whole:
 * scheduled until it goes out, published once it is out anywhere, failed when it went nowhere.
 */
export function readPost(raw: unknown, owner?: string | null): GbpPost | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Raw;
  const parts = (Array.isArray(r.platforms) ? r.platforms : []).filter((p): p is Raw => Boolean(p) && typeof p === 'object');
  const g = parts.find((p) => p.platform === 'google_business');
  const params = (g?.params && typeof g.params === 'object' ? g.params : {}) as Raw;
  const location = text(params.location_id) ?? (g ? undefined : owner || undefined);
  if (!text(r.id) || !location) return null;
  const status = String(r.status ?? '');
  const one = (p: Raw) => (String(p.status ?? '') === 'published' ? 'published' : String(p.status ?? '') === 'failed' ? 'failed' : 'waiting') as 'waiting' | 'published' | 'failed';
  const each = parts.map(one);
  const state: GbpPost['state'] =
    status === 'draft'
      ? 'draft'
      : status === 'media_processing_failed' || (each.length > 0 && each.every((x) => x === 'failed'))
        ? 'failed'
        : each.length > 0 && each.every((x) => x === 'published')
          ? 'published'
          : status === 'scheduled'
            ? 'scheduled'
            : each.some((x) => x === 'published')
              ? 'published'
              : 'publishing';
  const media = Array.isArray(r.media) ? (r.media[0] as Raw | string | undefined) : undefined;
  const image = typeof media === 'string' ? media : text((media as Raw | undefined)?.url) ?? text((media as Raw | undefined)?.source_url);
  const link = (p: Raw | undefined) => (typeof p?.permalink === 'string' && /^https:\/\//.test(p.permalink) ? p.permalink : null);
  const tried = parts.map((p) => text(p.attempted_at)).find(Boolean);
  return {
    id: String(r.id),
    location,
    format: text(params.format) ?? 'standard',
    body: String(r.body ?? ''),
    title: text(params.event_title),
    state,
    error: text(g?.error) ?? (state === 'failed' ? text(parts.find((p) => text(p.error))?.error) : null) ?? null,
    at: (state === 'scheduled' ? text(r.scheduled_at) : tried) ?? text(r.scheduled_at) ?? text(r.created_at),
    permalink: link(g),
    image: image && /^https:\/\//.test(image) ? image : null,
    also: readOutletResults(raw),
    google: g ? { state: one(g), error: text(g.error) ?? null, permalink: link(g) } : null,
  };
}

/**
 * The next open weekly slot: the first `weekday` (0 Sunday … 6 Saturday) at `time` (HH:MM, in the
 * viewer's own time zone) that is at least an hour away and not within a day of a post already
 * scheduled (`taken`, ISO times). One post a week per listing lands on the same slot, week after week.
 */
export function nextWeeklySlot(weekday: number, time: string, taken: string[], now: Date = new Date()): Date {
  const [h, m] = (isTime(time) ? time : '09:00').split(':').map(Number);
  const slot = new Date(now);
  slot.setHours(h, m, 0, 0);
  slot.setDate(slot.getDate() + ((weekday - slot.getDay() + 7) % 7));
  const busy = taken.map((t) => Date.parse(t)).filter((t) => !Number.isNaN(t));
  for (let i = 0; i < 60; i++) {
    const t = slot.getTime();
    if (t >= now.getTime() + 3600000 && !busy.some((b) => Math.abs(b - t) < 86400000)) break;
    slot.setDate(slot.getDate() + 7);
  }
  return slot;
}

/** A moment's calendar day where the viewer is, as YYYY-MM-DD. */
export const localDay = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/**
 * The open slots for planning ahead: every chosen weekday (0 Sunday … 6 Saturday) at `time`
 * (HH:MM, the viewer's own time zone) over the next `weeks` weeks, soonest first, leaving out any
 * less than an hour away and any day that already has a post (`takenDays`, YYYY-MM-DD). Capped at 40.
 */
export function planSlots(weekdays: number[], time: string, weeks: number, takenDays: string[], now: Date = new Date()): Date[] {
  const [h, m] = (isTime(time) ? time : '09:00').split(':').map(Number);
  const days = new Set(weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  const taken = new Set(takenDays);
  const out: Date[] = [];
  const span = Math.min(12, Math.max(1, Math.round(weeks) || 4)) * 7;
  for (let i = 0; i < span && out.length < 40; i++) {
    const slot = new Date(now);
    slot.setDate(slot.getDate() + i);
    slot.setHours(h, m, 0, 0);
    if (days.has(slot.getDay()) && slot.getTime() >= now.getTime() + 3600000 && !taken.has(localDay(slot))) out.push(slot);
  }
  return out;
}

const ymd = (d: Date) => localDay(d);

/**
 * A month laid out as a calendar: whole weeks, Sunday first, each day as YYYY-MM-DD, including the
 * days of the months either side that fill the first and last week. `month` is 0 for January.
 */
export function calendarWeeks(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // Noon, so a clock change in the middle of the month never moves a day.
  const day = new Date(year, month, 1 - first.getDay(), 12);
  const weeks: string[][] = [];
  while (day.getTime() <= last.getTime() + 12 * 3600000 || weeks.length === 0) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) { week.push(ymd(day)); day.setDate(day.getDate() + 1); }
    weeks.push(week);
  }
  return weeks;
}

/**
 * Which of the next `count` weeks have no post: each week is seven days, the first starting on
 * `today` (YYYY-MM-DD). `days` are the days that have a post. Returns each empty week's first day.
 */
export function emptyWeeks(days: string[], today: string, count: number): string[] {
  const has = new Set(days);
  const start = new Date(today + 'T12:00:00');
  if (Number.isNaN(start.getTime())) return [];
  const out: string[] = [];
  for (let w = 0; w < count; w++) {
    let any = false;
    for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(d.getDate() + w * 7 + i); if (has.has(ymd(d))) any = true; }
    if (!any) { const d = new Date(start); d.setDate(d.getDate() + w * 7); out.push(ymd(d)); }
  }
  return out;
}
