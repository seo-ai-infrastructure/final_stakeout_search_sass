/**
 * Google Business posts (updates, offers, events and photos), sent through Postproxy's posts API.
 * Pure rules: what a post needs before Google will take it, the request that publishes or
 * schedules it, reading the posts back, and the next open weekly slot for a listing.
 */

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
const isImage = (s: string) => isHttps(s) || /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(s);

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

function scheduleProblem(d: PostDraft, now: Date): string | null {
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
export function readPost(raw: unknown): GbpPost | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Raw;
  const g = (Array.isArray(r.platforms) ? r.platforms : []).find((p): p is Raw => Boolean(p) && typeof p === 'object' && (p as Raw).platform === 'google_business');
  const params = (g?.params && typeof g.params === 'object' ? g.params : {}) as Raw;
  const location = text(params.location_id);
  if (!text(r.id) || !g || !location) return null;
  const status = String(r.status ?? ''), on = String(g.status ?? '');
  const state: GbpPost['state'] =
    status === 'draft' ? 'draft' : on === 'failed' || status === 'media_processing_failed' ? 'failed' : on === 'published' ? 'published' : status === 'scheduled' ? 'scheduled' : 'publishing';
  const media = Array.isArray(r.media) ? (r.media[0] as Raw | string | undefined) : undefined;
  const image = typeof media === 'string' ? media : text((media as Raw | undefined)?.url) ?? text((media as Raw | undefined)?.source_url);
  return {
    id: String(r.id),
    location,
    format: text(params.format) ?? 'standard',
    body: String(r.body ?? ''),
    title: text(params.event_title),
    state,
    error: text(g.error),
    at: (state === 'scheduled' ? text(r.scheduled_at) : text(g.attempted_at)) ?? text(r.scheduled_at) ?? text(r.created_at),
    permalink: typeof g.permalink === 'string' && /^https:\/\//.test(g.permalink) ? g.permalink : null,
    image: image && /^https:\/\//.test(image) ? image : null,
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
