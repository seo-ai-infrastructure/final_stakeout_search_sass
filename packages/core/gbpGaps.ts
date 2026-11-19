/**
 * Competitor gaps: what the top rivals on a scan have on their Google listings that the client's
 * listing does not (categories, attributes, booking links), and what Google offers the client's
 * own categories that it has not filled in (services). Pure rules: reading a rival's public
 * listing as DataForSEO returns it, and working out the gaps.
 */
import type { Attr, ActionLink, Service } from './gbpExtras';

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/\b(llc|inc|co|corp|company|ltd)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

export type Rival = {
  name: string;
  /** Its categories, the first one the primary. `id` is Google's ("plumber") or '' when only the name is known. */
  categories: { id: string; name: string }[];
  /** The services it lists in its own words. */
  services: string[];
  /** The attributes the listing says it has ("has_wheelchair_accessible_entrance"). */
  attributes: string[];
  /** Booking, ordering and menu links on the listing. */
  links: { type: 'reservation' | 'order' | 'menu'; url: string }[];
  photos: number | null;
  rating: number | null;
  reviews: number | null;
};

/** A category id as Google's own API names it. */
export const gcid = (id: string) => 'categories/gcid:' + id.replace(/^categories\//, '').replace(/^gcid:/, '');
const title = (id: string) => { const t = id.replace(/^gcid:/, '').replace(/_/g, ' '); return t ? t[0].toUpperCase() + t.slice(1) : id; };

/**
 * One rival from a business-listing lookup (DataForSEO "my_business_info" item), or null when the
 * listing found is not the business asked for: a lookup by name can land on a different business.
 */
export function readRival(item: unknown, asked: string): Rival | null {
  const i = obj(item);
  const name = str(i.title);
  if (!name) return null;
  const a = norm(asked), b = norm(name);
  if (!(a === b || (a.length > 4 && b.includes(a)) || (b.length > 4 && a.includes(b)))) return null;
  const ids = (Array.isArray(i.category_ids) ? i.category_ids : []).map(str).filter(Boolean).map((id) => id.replace(/^gcid:/, ''));
  // Names come as the primary ("category") followed by the additional ones, in the ids' order. A
  // listing is often returned with names and no ids, or with fewer ids than names: every category
  // named is kept, with its id when there is one.
  const names = [str(i.category), ...(Array.isArray(i.additional_categories) ? i.additional_categories : []).map(str)].filter(Boolean);
  const categories = Array.from({ length: Math.max(ids.length, names.length) }, (_, n) => ({ id: ids[n] ?? '', name: names[n] || title(ids[n] ?? '') })).filter((c) => c.id || c.name);
  const services = [...new Set((Array.isArray(i.services) ? i.services : []).map((x) => str(obj(x).title)).filter((t) => t.length > 1 && t.length <= 120))];
  const available = obj(obj(i.attributes).available_attributes);
  const attributes = [...new Set(Object.values(available).flatMap((v) => (Array.isArray(v) ? v : [])).map(str).filter(Boolean))];
  const links: Rival['links'] = [];
  const add = (type: unknown, url: unknown) => {
    const t = str(type), u = str(url);
    if ((t === 'reservation' || t === 'order' || t === 'menu') && /^https:\/\//.test(u) && !links.some((l) => l.type === t && l.url === u)) links.push({ type: t, url: u });
  };
  for (const l of Array.isArray(i.local_business_links) ? i.local_business_links.map(obj) : []) {
    add(l.type, l.url);
    for (const d of Array.isArray(l.delivery_services) ? l.delivery_services.map(obj) : []) add('order', d.url);
  }
  if (str(i.book_online_url)) add('reservation', i.book_online_url);
  const rating = obj(i.rating);
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { name, categories, services, attributes, links, photos: n(i.total_photos), rating: n(rating.value), reviews: n(rating.votes_count) };
}

/** The businesses that most often rank in the top three across a scan's points, the client left out. */
export function topRivals(pins: { status: string; topCompetitors?: string[] | null }[], client: string, limit = 5): { name: string; points: number }[] {
  const seen = new Map<string, { name: string; points: number }>();
  for (const p of pins) {
    if (p.status !== 'COMPLETED') continue;
    for (const name of (p.topCompetitors ?? []).slice(0, 3)) {
      const k = norm(name);
      if (!k || k === norm(client)) continue;
      const r = seen.get(k) ?? { name, points: 0 };
      r.points++;
      seen.set(k, r);
    }
  }
  return [...seen.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)).slice(0, limit);
}

export type Gap = { id: string; label: string; group?: string; /** How many of the rivals looked up have it, and which. */ rivals: string[] };
export type Gaps = {
  /** Additional categories rivals use that the listing does not. Never the primary category. */
  categories: Gap[];
  /** Yes/no attributes Google offers this listing that it has not answered. */
  attributes: Gap[];
  /** Google's own services for the listing's categories that are not on it. */
  services: Gap[];
  /** Kinds of booking or ordering link Google offers this listing that it has none of. */
  links: Gap[];
  /** Room left for additional categories (Google allows nine). */
  categoryRoom: number;
};

const LINK_KIND: Record<string, Rival['links'][number]['type']> = {
  APPOINTMENT: 'reservation', ONLINE_APPOINTMENT: 'reservation', DINING_RESERVATION: 'reservation', FOOD_ORDERING: 'order', FOOD_DELIVERY: 'order', FOOD_TAKEOUT: 'order', SHOP_ONLINE: 'order',
};

/**
 * What the listing is missing. Rival-backed gaps come first, most rivals first; a gap no rival
 * backs is still listed for attributes, services and links (Google offers it and it is unset), but
 * a category is only ever suggested because a rival uses it.
 */
export function findGaps(
  client: { primaryCategory?: string | null; additionalCategories: string[]; categoryNames?: string[]; attributes: Attr[]; suggestedServices: { typeId: string; name: string }[]; services: Service[]; links: ActionLink[]; linkTypes: string[] },
  rivals: Rival[],
  linkLabels: Record<string, string> = {},
): Gaps {
  const have = new Set([client.primaryCategory, ...client.additionalCategories].filter(Boolean).map((c) => gcid(String(c))));
  const haveNames = new Set((client.categoryNames ?? []).map(norm));
  const cats = new Map<string, Gap>();
  for (const r of rivals)
    for (const c of r.categories) {
      // A category known only by name cannot be sent to Google: the caller looks its id up first.
      if (!c.id || have.has(gcid(c.id)) || haveNames.has(norm(c.name))) continue;
      const id = gcid(c.id);
      const g = cats.get(id) ?? { id, label: c.name, rivals: [] };
      if (!g.rivals.includes(r.name)) g.rivals.push(r.name);
      cats.set(id, g);
    }
  const byRivals = (a: Gap, b: Gap) => b.rivals.length - a.rivals.length || a.label.localeCompare(b.label);
  const who = (test: (r: Rival) => boolean) => rivals.filter(test).map((r) => r.name);
  const attributes = client.attributes
    .filter((a) => a.kind === 'BOOL' && a.value === null)
    .map((a) => ({ id: a.name, label: a.label, group: a.group, rivals: who((r) => r.attributes.includes(a.name.replace(/^attributes\//, ''))) }))
    .sort(byRivals);
  // Services: Google's own for the listing's categories that are not on it, then what rivals list
  // in their own words. A rival's service that is one of Google's marks that one; the rest can be
  // added as the business's own wording ("free:" + name).
  const listed = new Set(client.services.map((s) => s.key));
  const listedNames = new Set(client.services.map((s) => norm(s.name)));
  const offered = client.suggestedServices.filter((s) => !listed.has('s:' + s.typeId)).map((s) => ({ id: s.typeId, label: s.name, rivals: [] as string[] }));
  const own = new Map<string, Gap>();
  for (const r of rivals)
    for (const name of r.services) {
      const k = norm(name);
      if (!k || listedNames.has(k)) continue;
      const g = offered.find((o) => norm(o.label) === k) ?? own.get(k) ?? { id: 'free:' + name, label: name, rivals: [] };
      if (!g.rivals.includes(r.name)) g.rivals.push(r.name);
      if (!offered.includes(g)) own.set(k, g);
    }
  const services = [...offered, ...own.values()].sort((a, b) => b.rivals.length - a.rivals.length || Number(a.id.startsWith('free:')) - Number(b.id.startsWith('free:')) || a.label.localeCompare(b.label));
  const links = client.linkTypes
    .filter((t) => !client.links.some((l) => l.type === t))
    .map((t) => ({ id: t, label: linkLabels[t] ?? t, rivals: who((r) => r.links.some((l) => l.type === LINK_KIND[t])) }))
    .sort(byRivals);
  return { categories: [...cats.values()].sort(byRivals), attributes, services, links, categoryRoom: Math.max(0, 9 - client.additionalCategories.length) };
}

/* ───────────── A rival's listing in full, and its posts ───────────── */

export type RivalFacts = {
  description: string;
  phone: string | null;
  website: string | null;
  claimed: boolean | null;
  /** Hours open in a week (168 = always open), or null when the listing gives none. */
  hoursPerWeek: number | null;
  /** Each day's hours in words, Monday first ("Mon 8:00 AM – 5:00 PM", "Sat closed"). */
  hours: string[];
  /** When it is busiest: the day and hour Google shows as the peak. */
  busiest: string | null;
  /** How its reviews split by stars, 5 first, as counts. */
  stars: number[] | null;
  /** What its reviews talk about most, with how many mention each. */
  topics: { topic: string; mentions: number }[];
  /** What the listing says it does not have ("pay_check"). */
  lacks: string[];
  cid: string | null;
};

const DAY = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const clock = (h: number, m: number) => { const hh = h % 24; return `${hh % 12 === 0 ? 12 : hh % 12}:${String(m).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };

/** Everything else a rival's listing says, from the same lookup: description, contact, hours, busy times, review make-up. */
export function rivalFacts(item: unknown): RivalFacts {
  const i = obj(item);
  const table = obj(obj(obj(i.work_time).work_hours).timetable);
  let minutes = 0, any = false;
  const hours = DAY.map((d) => {
    const spans = (Array.isArray(table[d]) ? (table[d] as unknown[]) : []).map(obj).map((s) => ({ o: obj(s.open), c: obj(s.close) })).filter((s) => typeof s.o.hour === 'number' && typeof s.c.hour === 'number');
    if (d in table) any = true;
    const label = d[0].toUpperCase() + d.slice(1, 3);
    if (!spans.length) return label + ' closed';
    return label + ' ' + spans.map((s) => {
      const from = (s.o.hour as number) * 60 + (Number(s.o.minute) || 0), to = (s.c.hour as number) * 60 + (Number(s.c.minute) || 0);
      minutes += to > from ? to - from : to + 1440 - from;
      return from === 0 && to >= 1440 ? 'open 24 hours' : clock(s.o.hour as number, Number(s.o.minute) || 0) + ' – ' + clock(s.c.hour as number, Number(s.c.minute) || 0);
    }).join(', ');
  });
  let peak: { day: string; hour: number; index: number } | null = null;
  for (const [day, list] of Object.entries(obj(obj(i.popular_times).popular_times_by_days)))
    for (const p of Array.isArray(list) ? list.map(obj) : []) {
      const index = Number(p.popular_index), hour = Number(obj(p.time).hour);
      if (Number.isFinite(index) && Number.isFinite(hour) && (!peak || index > peak.index)) peak = { day, hour, index };
    }
  const dist = obj(i.rating_distribution);
  const stars = ['5', '4', '3', '2', '1'].map((k) => Number(dist[k]));
  const topics = Object.entries(obj(i.place_topics)).map(([topic, n]) => ({ topic, mentions: Number(n) || 0 })).filter((t) => t.mentions > 0).sort((a, b) => b.mentions - a.mentions).slice(0, 8);
  const lacks = [...new Set(Object.values(obj(obj(i.attributes).unavailable_attributes)).flatMap((v) => (Array.isArray(v) ? v : [])).map(str).filter(Boolean))];
  return {
    description: str(i.description),
    phone: str(i.phone) || null,
    website: str(i.domain) || null,
    claimed: typeof i.is_claimed === 'boolean' ? i.is_claimed : null,
    hoursPerWeek: any ? Math.round(minutes / 6) / 10 : null,
    hours: any ? hours : [],
    busiest: peak ? `${peak.day[0].toUpperCase() + peak.day.slice(1)}s around ${clock(peak.hour, 0)}` : null,
    stars: stars.every((n) => Number.isFinite(n)) ? stars : null,
    topics,
    lacks,
    cid: str(i.cid) || null,
  };
}

export type RivalPost = { text: string; at: string | null; url: string | null; image: string | null };

/** A rival's posts from a "My Business Updates" result, newest first. Field names vary, so each is looked for under its likely names. */
export function readPosts(items: unknown): RivalPost[] {
  const out: RivalPost[] = [];
  for (const x of Array.isArray(items) ? items.map(obj) : []) {
    const text = str(x.post_text) || str(x.snippet) || str(x.text);
    const when = str(x.timestamp) || str(x.post_date);
    const t = when ? Date.parse(when.replace(' +00:00', 'Z').replace(' ', 'T')) : NaN;
    const image = Array.isArray(x.images_url) ? str(x.images_url[0]) : str(x.images_url) || str(x.image_url);
    const url = str(x.url) || str(x.post_url);
    if (!text && !image) continue;
    out.push({ text: text.slice(0, 600), at: Number.isFinite(t) ? new Date(t).toISOString() : null, url: /^https:\/\//.test(url) ? url : null, image: /^https:\/\//.test(image) ? image : null });
  }
  return out.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
}

/** How often a business posts: in the last 30 and 90 days, and when it last did. */
export function postCadence(posts: RivalPost[], now: Date = new Date()) {
  const ago = (p: RivalPost) => (p.at ? (now.getTime() - Date.parse(p.at)) / 86400000 : Infinity);
  const dated = posts.filter((p) => p.at);
  return { total: posts.length, last30: dated.filter((p) => ago(p) <= 30).length, last90: dated.filter((p) => ago(p) <= 90).length, latest: dated[0]?.at ?? null, daysSince: dated[0] ? Math.max(0, Math.floor(ago(dated[0]))) : null };
}
