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
  /** Google's category ids ("plumber", "drainage_service"), the first one the primary. */
  categories: { id: string; name: string }[];
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
  const ids = (Array.isArray(i.category_ids) ? i.category_ids : []).map(str).filter(Boolean);
  // Names come as the primary ("category") followed by the additional ones, in the ids' order.
  const names = [str(i.category), ...(Array.isArray(i.additional_categories) ? i.additional_categories : []).map(str)];
  const categories = ids.map((id, n) => ({ id: id.replace(/^gcid:/, ''), name: names[n] || title(id) }));
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
  return { name, categories, attributes, links, photos: n(i.total_photos), rating: n(rating.value), reviews: n(rating.votes_count) };
}

/** The businesses that most often rank in the top three across a scan's points, the client left out. */
export function topRivals(pins: { status: string; topCompetitors?: string[] | null }[], client: string, limit = 3): { name: string; points: number }[] {
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
  client: { primaryCategory?: string | null; additionalCategories: string[]; attributes: Attr[]; suggestedServices: { typeId: string; name: string }[]; services: Service[]; links: ActionLink[]; linkTypes: string[] },
  rivals: Rival[],
  linkLabels: Record<string, string> = {},
): Gaps {
  const have = new Set([client.primaryCategory, ...client.additionalCategories].filter(Boolean).map((c) => gcid(String(c))));
  const cats = new Map<string, Gap>();
  for (const r of rivals)
    for (const c of r.categories) {
      const id = gcid(c.id);
      if (have.has(id)) continue;
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
  const listed = new Set(client.services.map((s) => s.key));
  const services = client.suggestedServices.filter((s) => !listed.has('s:' + s.typeId)).map((s) => ({ id: s.typeId, label: s.name, rivals: [] as string[] }));
  const links = client.linkTypes
    .filter((t) => !client.links.some((l) => l.type === t))
    .map((t) => ({ id: t, label: linkLabels[t] ?? t, rivals: who((r) => r.links.some((l) => l.type === LINK_KIND[t])) }))
    .sort(byRivals);
  return { categories: [...cats.values()].sort(byRivals), attributes, services, links, categoryRoom: Math.max(0, 9 - client.additionalCategories.length) };
}
