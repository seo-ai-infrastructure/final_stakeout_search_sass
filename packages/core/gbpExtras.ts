/**
 * The rest of a Google listing that customers and Google's AI answers read: attributes (payments,
 * accessibility, links to social pages), the service list, and the action links ("Book online").
 * Pure rules: reading each as Google returns it, and building the smallest request that changes it.
 */

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const isHttps = (s: string) => { try { return new URL(s).protocol === 'https:'; } catch { return false; } };

/* ───────────── Attributes ───────────── */

export type AttrKind = 'BOOL' | 'URL' | 'ENUM' | 'REPEATED_ENUM';
/** A yes/no attribute: true, false, or null for not stated. Links: the list. Choices: the chosen values. */
export type AttrValue = boolean | null | string[];
export type Attr = { name: string; label: string; group: string; kind: AttrKind; value: AttrValue; options: { value: string; label: string }[]; canSayNo: boolean };

const KINDS = ['BOOL', 'URL', 'ENUM', 'REPEATED_ENUM'];

/** What one attribute is set to now, from Google's attributes list. */
function currentValue(kind: AttrKind, a: Raw | undefined): AttrValue {
  if (kind === 'BOOL') return a && Array.isArray(a.values) && typeof a.values[0] === 'boolean' ? (a.values[0] as boolean) : null;
  if (kind === 'URL') return (Array.isArray(a?.uriValues) ? a!.uriValues : []).map((u) => str(obj(u).uri)).filter(Boolean);
  if (kind === 'ENUM') return (Array.isArray(a?.values) ? a!.values : []).map(String).slice(0, 1);
  return (Array.isArray(obj(a?.repeatedEnumValue).setValues) ? (obj(a?.repeatedEnumValue).setValues as unknown[]) : []).map(String);
}

/**
 * Every attribute this listing may set (Google decides that from its category and country), with
 * its value now, grouped as Google groups them. Deprecated ones and kinds this editor does not
 * know are left out (and so are never touched).
 */
export function readAttributes(available: unknown[], current: unknown[]): Attr[] {
  const now = new Map(current.map((c) => [str(obj(c).name), obj(c)]));
  const out: Attr[] = [];
  for (const m of available.map(obj)) {
    const name = str(m.parent), kind = str(m.valueType) as AttrKind;
    if (!/^attributes\/[a-z0-9_]+$/i.test(name) || !KINDS.includes(kind) || m.deprecated === true) continue;
    const meta = (Array.isArray(m.valueMetadata) ? m.valueMetadata : []).map(obj);
    out.push({
      name,
      label: str(m.displayName) || name.replace('attributes/', '').replace(/_/g, ' '),
      group: str(m.groupDisplayName) || 'Other',
      kind,
      value: currentValue(kind, now.get(name)),
      options: kind === 'BOOL' || kind === 'URL' ? [] : meta.map((v) => ({ value: String(v.value), label: str(v.displayName) || String(v.value) })),
      // Some yes/no attributes can only be claimed, never denied ("women-owned").
      canSayNo: kind === 'BOOL' && meta.some((v) => v.value === false),
    });
  }
  return out;
}

const same = (a: AttrValue, b: AttrValue) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b);

/** Why these attribute values cannot be sent, or null. Only values that differ are looked at. */
export function attributeProblem(attrs: Attr[], want: Record<string, AttrValue>): string | null {
  for (const a of attrs) {
    if (!(a.name in want) || same(a.value, want[a.name])) continue;
    const v = want[a.name];
    if (a.kind === 'BOOL') {
      if (v !== null && typeof v !== 'boolean') return a.label + ': choose yes or no.';
      if (v === false && !a.canSayNo) return a.label + ': Google only lets this be claimed or left blank.';
    } else {
      if (!Array.isArray(v)) return a.label + ': not a list.';
      if (a.kind === 'URL') {
        // A link already on the listing (an sms: link, say) is left as it is; a new one must be a web address.
        const before = Array.isArray(a.value) ? a.value : [];
        const bad = v.find((u) => !before.includes(u) && !isHttps(u));
        if (bad !== undefined) return a.label + ': “' + bad.slice(0, 60) + '” is not an https link.';
        if (new Set(v).size !== v.length) return a.label + ': the same link twice.';
      } else {
        const bad = v.find((x) => !a.options.some((o) => o.value === x));
        if (bad !== undefined) return a.label + ': unknown choice.';
        if (a.kind === 'ENUM' && v.length > 1) return a.label + ': choose one.';
      }
    }
  }
  return null;
}

/**
 * The request that sets the attributes that differ, and nothing else: only their names are in the
 * mask, so every other attribute is left alone. An attribute set back to "not stated" (or a list
 * emptied) is named in the mask and left out of the values, which clears it. Null when nothing differs.
 */
export function attributePatch(attrs: Attr[], want: Record<string, AttrValue>): { attributes: Raw[]; attribute_mask: string[]; changed: { label: string; from: string; to: string }[] } | null {
  const attributes: Raw[] = [], mask: string[] = [], changed: { label: string; from: string; to: string }[] = [];
  const say = (a: Attr, v: AttrValue) => (v === null ? 'not stated' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v.map((x) => a.options.find((o) => o.value === x)?.label ?? x).join(', ') || 'none');
  for (const a of attrs) {
    if (!(a.name in want) || same(a.value, want[a.name])) continue;
    const v = want[a.name];
    mask.push(a.name);
    changed.push({ label: a.label, from: say(a, a.value), to: say(a, v) });
    if (v === null || (Array.isArray(v) && !v.length)) continue;
    if (a.kind === 'BOOL') attributes.push({ name: a.name, values: [v] });
    else if (a.kind === 'URL') attributes.push({ name: a.name, uriValues: (v as string[]).map((uri) => ({ uri })) });
    else if (a.kind === 'ENUM') attributes.push({ name: a.name, values: v });
    else attributes.push({ name: a.name, repeatedEnumValue: { setValues: v, unsetValues: a.options.map((o) => o.value).filter((o) => !(v as string[]).includes(o)) } });
  }
  return mask.length ? { attributes, attribute_mask: mask, changed } : null;
}

/* ───────────── Services ───────────── */

export const SERVICE_NAME_MAX = 120;
export const SERVICE_DESCRIPTION_MAX = 300;
export type Service = { key: string; name: string; description: string; kind: 'structured' | 'free' };
/** What the editor asks for: each kept service with its description, in order, plus new ones (no key yet). */
export type ServiceWant = { key?: string; name?: string; typeId?: string; description: string };

/** "job_type_id:lip_fillers" → "Lip fillers", for a structured service Google gave no name with. */
export const serviceTypeName = (id: string) => { const s = id.replace(/^job_type_id:/, '').replace(/_/g, ' ').trim(); return s ? s[0].toUpperCase() + s.slice(1) : id; };

function serviceOf(item: unknown): Service | null {
  const i = obj(item), s = obj(i.structuredServiceItem), f = obj(i.freeFormServiceItem), label = obj(f.label);
  if (str(s.serviceTypeId)) return { key: 's:' + str(s.serviceTypeId), name: serviceTypeName(str(s.serviceTypeId)), description: str(s.description), kind: 'structured' };
  if (str(label.displayName)) return { key: 'f:' + str(label.displayName).toLowerCase(), name: str(label.displayName), description: str(label.description), kind: 'free' };
  return null;
}

/** The listing's services as rows. `names` gives Google's own names for structured services, when known. */
export function readServices(items: unknown[], names: Record<string, string> = {}): Service[] {
  const out: Service[] = [];
  for (const item of items) {
    const s = serviceOf(item);
    if (s && !out.some((x) => x.key === s.key)) out.push(s.kind === 'structured' && names[s.key.slice(2)] ? { ...s, name: names[s.key.slice(2)] } : s);
  }
  return out;
}

export function serviceProblem(want: ServiceWant[]): string | null {
  const seen = new Set<string>();
  for (const w of want) {
    const name = (w.name ?? '').trim();
    if (!w.key && !w.typeId && !name) return 'A new service needs a name.';
    if (!w.key && name.length > SERVICE_NAME_MAX) return `“${name.slice(0, 30)}…”: a service name is at most ${SERVICE_NAME_MAX} characters.`;
    if (w.description.trim().length > SERVICE_DESCRIPTION_MAX) return `${name || 'A service'}: a description is at most ${SERVICE_DESCRIPTION_MAX} characters (this is ${w.description.trim().length}).`;
    const id = w.key ?? (w.typeId ? 's:' + w.typeId : 'f:' + name.toLowerCase());
    if (seen.has(id)) return `“${name || id.slice(2)}” is listed twice.`;
    seen.add(id);
  }
  return null;
}

/**
 * The full service list to send (Google replaces the whole list): the live items that are kept,
 * exactly as Google returned them but for their description, in the order asked for, then the new
 * ones. Services the listing has that are not asked for are removed. `category` is the listing's
 * primary category (a free-form service belongs to one). Returns what changes, in words.
 */
export function buildServices(live: unknown[], want: ServiceWant[], category: string): { serviceItems: unknown[]; changed: string[] } {
  const byKey = new Map<string, Raw>();
  for (const item of live) { const s = serviceOf(item); if (s && !byKey.has(s.key)) byKey.set(s.key, obj(item)); }
  const serviceItems: unknown[] = [], changed: string[] = [], kept = new Set<string>();
  for (const w of want) {
    const description = w.description.trim();
    const key = w.key ?? (w.typeId ? 's:' + w.typeId : 'f:' + (w.name ?? '').trim().toLowerCase());
    const had = byKey.get(key);
    if (had) {
      kept.add(key);
      const copy = JSON.parse(JSON.stringify(had)) as Raw;
      const holder = copy.structuredServiceItem ? obj(copy.structuredServiceItem) : obj(obj(copy.freeFormServiceItem).label);
      if (str(holder.description) !== description) {
        changed.push((serviceOf(had)?.name ?? key) + ': description ' + (description ? (str(holder.description) ? 'changed' : 'added') : 'removed'));
        if (description) holder.description = description; else delete holder.description;
      }
      serviceItems.push(copy);
    } else if (w.typeId) {
      serviceItems.push({ structuredServiceItem: { serviceTypeId: w.typeId, ...(description ? { description } : {}) } });
      changed.push((w.name?.trim() || serviceTypeName(w.typeId)) + ': added');
    } else if (!w.key) {
      const name = (w.name ?? '').trim();
      serviceItems.push({ freeFormServiceItem: { category, label: { displayName: name, languageCode: 'en', ...(description ? { description } : {}) } } });
      changed.push(name + ': added');
    }
  }
  for (const [key, item] of byKey) if (!kept.has(key)) changed.push((serviceOf(item)?.name ?? key) + ': removed');
  return { serviceItems, changed };
}

/* ───────────── Action links ───────────── */

export type ActionLink = { name: string; uri: string; type: string; preferred: boolean; editable: boolean };
export const ACTION_TYPES: Record<string, string> = {
  APPOINTMENT: 'Book an appointment', ONLINE_APPOINTMENT: 'Book an online appointment', DINING_RESERVATION: 'Reserve a table',
  FOOD_ORDERING: 'Order food', FOOD_DELIVERY: 'Order delivery', FOOD_TAKEOUT: 'Order takeout', SHOP_ONLINE: 'Shop online',
};

export function readLinks(list: unknown[]): ActionLink[] {
  return list.map(obj).filter((l) => /^locations\/[0-9]+\/placeActionLinks\/[^/]+$/.test(str(l.name))).map((l) => ({
    name: str(l.name), uri: str(l.uri), type: str(l.placeActionType), preferred: l.isPreferred === true,
    // Links a booking partner added (Google marks them) cannot be changed by the business.
    editable: l.isEditable !== false && str(l.providerType) !== 'AGGREGATOR_3P',
  }));
}

export function linkProblem(uri: unknown, type: unknown, allowed: string[]): string | null {
  if (typeof uri !== 'string' || !isHttps(uri.trim())) return 'The link must be an https address.';
  if (typeof type !== 'string' || !(type in ACTION_TYPES)) return 'Choose what the link does.';
  if (allowed.length && !allowed.includes(type)) return 'Google does not offer “' + ACTION_TYPES[type] + '” for this listing’s category.';
  return null;
}
