/**
 * Google Business Profile edits (sent through Postproxy): which fields may change, how risky each
 * change is, the smallest safe request for it, and whether Google is showing it afterwards.
 *
 * Google replaces every object named in an update wholesale, so a request is always built from the
 * profile as it is now: the part being changed is merged into the live object, and only the fields
 * that really differ are named.
 */

export type Tier = 'green' | 'amber' | 'red';

type Category = { name: string; displayName?: string };
type Time = { hours?: number; minutes?: number } | string;
type Period = { openDay: string; openTime?: Time; closeDay: string; closeTime?: Time };

/** A location as Google returns it (only the parts used here; everything else is passed through untouched). */
export type GbpLocation = {
  name?: string;
  title?: string;
  websiteUri?: string;
  phoneNumbers?: { primaryPhone?: string; additionalPhones?: string[] };
  categories?: { primaryCategory?: Category; additionalCategories?: Category[] };
  profile?: { description?: string } & Record<string, unknown>;
  regularHours?: { periods?: Period[] };
  storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string; regionCode?: string };
  metadata?: Record<string, unknown>;
} & Record<string, unknown>;

/** One day of the week in the editor: closed, open all day, or one opening period. */
export type DayHours = { day: string; closed: boolean; allDay: boolean; open: string; close: string };

/** What the editor may ask to change. A key that is absent is left alone. */
export type GbpChange = {
  description?: string;
  websiteUri?: string;
  additionalCategories?: Category[];
  additionalPhones?: string[];
  regularHours?: DayHours[];
  title?: string;
  primaryCategory?: Category;
  primaryPhone?: string;
};

export type FieldChange = { key: keyof GbpChange; label: string; tier: Tier; from: string; to: string; note?: string };

export const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
export const RED_COOLDOWN_DAYS = 7;
export const DESCRIPTION_MAX = 750;

const LABELS: Record<keyof GbpChange, string> = {
  description: 'Description',
  websiteUri: 'Website',
  additionalCategories: 'Additional categories',
  additionalPhones: 'Additional phone numbers',
  regularHours: 'Opening hours',
  title: 'Business name',
  primaryCategory: 'Primary category',
  primaryPhone: 'Primary phone',
};

/** The site a link belongs to: its host without "www." ('' when it is not a link). */
export function siteOf(url: string | undefined): string {
  try {
    return new URL(String(url ?? '')).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

const digits = (s: string | undefined) => String(s ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const clean = (s: string | undefined) => String(s ?? '').trim();
const catNames = (c: Category[] | undefined) => (c ?? []).map((x) => x.name).filter(Boolean).sort();
const catText = (c: Category[] | undefined) => (c ?? []).map((x) => x.displayName || x.name).join(', ') || 'none';

/** "09:30" from any way Google or the editor writes a time; midnight at the end of a day is "24:00". */
export function hhmm(t: Time | undefined): string {
  if (typeof t === 'string') {
    const m = /^(\d{1,2}):(\d{2})/.exec(t);
    return m ? m[1].padStart(2, '0') + ':' + m[2] : '00:00';
  }
  return String(t?.hours ?? 0).padStart(2, '0') + ':' + String(t?.minutes ?? 0).padStart(2, '0');
}

/**
 * The week as the editor shows it, or null when a day has more than one period or a period runs
 * past its own day (split shifts, overnight hours): those cannot be shown as one row a day, and
 * saving them from this editor would lose the second period, so hours are then read-only.
 */
export function weekOf(loc: GbpLocation): DayHours[] | null {
  const periods = loc.regularHours?.periods ?? [];
  const week: DayHours[] = [];
  for (const day of DAYS) {
    const own = periods.filter((p) => p.openDay === day);
    if (own.length > 1) return null;
    const p = own[0];
    if (!p) {
      week.push({ day, closed: true, allDay: false, open: '09:00', close: '17:00' });
      continue;
    }
    const open = hhmm(p.openTime);
    const close = hhmm(p.closeTime);
    const allDay = open === '00:00' && (close === '24:00' || (close === '00:00' && p.closeDay !== day));
    if (p.closeDay !== day && !allDay) return null;
    week.push({ day, closed: false, allDay, open, close });
  }
  return week;
}

/** Google's periods for a week from the editor. */
export function periodsOf(week: DayHours[]): Period[] {
  return week
    .filter((d) => !d.closed)
    .map((d) => ({
      openDay: d.day,
      openTime: d.allDay ? '00:00' : d.open,
      closeDay: d.day,
      closeTime: d.allDay ? '24:00' : d.close,
    }));
}

const weekKey = (week: DayHours[] | null) =>
  week ? week.map((d) => (d.closed ? d.day + ':closed' : d.allDay ? d.day + ':24h' : d.day + ':' + d.open + '-' + d.close)).join('|') : 'complex';
const weekText = (week: DayHours[] | null) =>
  week
    ? week.map((d) => d.day.slice(0, 3).toLowerCase() + ' ' + (d.closed ? 'closed' : d.allDay ? '24h' : d.open + '–' + d.close)).join(', ')
    : 'split or overnight hours';

/** Each editable field of a profile in the words the edit history uses for it. */
export function describe(loc: GbpLocation): Record<keyof GbpChange, string> {
  return {
    description: clean(loc.profile?.description) || 'none',
    websiteUri: clean(loc.websiteUri) || 'none',
    additionalCategories: catText(loc.categories?.additionalCategories),
    additionalPhones: (loc.phoneNumbers?.additionalPhones ?? []).join(', ') || 'none',
    regularHours: weekText(weekOf(loc)),
    title: clean(loc.title),
    primaryCategory: loc.categories?.primaryCategory?.displayName || loc.categories?.primaryCategory?.name || 'none',
    primaryPhone: clean(loc.phoneNumbers?.primaryPhone) || 'none',
  };
}

/** Why a requested change cannot be sent at all, or null. Checked before anything is sent to Google. */
export function problemWith(live: GbpLocation, change: GbpChange): string | null {
  if (change.description !== undefined) {
    const d = clean(change.description);
    if (d.length > DESCRIPTION_MAX) return `The description is ${d.length} characters; Google allows ${DESCRIPTION_MAX}.`;
    if (/https?:\/\/|www\.\S/i.test(d)) return 'Google rejects descriptions that contain links. Remove the link.';
    if (/<[a-z/][^>]*>/i.test(d)) return 'Google rejects descriptions that contain HTML.';
  }
  if (change.websiteUri !== undefined && clean(change.websiteUri) && !/^https?:$/.test(safeProtocol(change.websiteUri)))
    return 'The website must be a full link starting with https://';
  if (change.title !== undefined && !clean(change.title)) return 'The business name cannot be empty.';
  if (change.primaryPhone !== undefined && digits(change.primaryPhone).length < 7) return 'The primary phone number is not a phone number.';
  if (change.primaryCategory !== undefined && !/^categories\/gcid:/.test(change.primaryCategory.name ?? ''))
    return 'Pick the primary category from the list.';
  if (change.additionalCategories !== undefined) {
    if (change.additionalCategories.length > 9) return 'Google allows up to 9 additional categories.';
    if (change.additionalCategories.some((c) => !/^categories\/gcid:/.test(c.name ?? ''))) return 'Pick each category from the list.';
    const primary = (change.primaryCategory ?? live.categories?.primaryCategory)?.name;
    if (change.additionalCategories.some((c) => c.name === primary)) return 'The primary category cannot also be an additional category.';
  }
  if (change.additionalPhones !== undefined) {
    if (change.additionalPhones.length > 2) return 'Google allows up to 2 additional phone numbers.';
    if (change.additionalPhones.some((p) => digits(p).length < 7)) return 'One of the additional phone numbers is not a phone number.';
  }
  if (change.regularHours !== undefined) {
    if (!weekOf(live)) return 'This profile has split or overnight hours, which this editor cannot change yet.';
    if (change.regularHours.length !== 7 || change.regularHours.some((d, i) => d.day !== DAYS[i])) return 'The week of opening hours is incomplete.';
    for (const d of change.regularHours)
      if (!d.closed && !d.allDay && !(/^\d{2}:\d{2}$/.test(d.open) && /^\d{2}:\d{2}$/.test(d.close) && d.open < d.close))
        return `On ${d.day.toLowerCase()} the closing time must be after the opening time.`;
  }
  return null;
}

function safeProtocol(url: string) {
  try {
    return new URL(url).protocol;
  } catch {
    return '';
  }
}

/**
 * The fields that really differ from the live profile, each with its risk.
 * Green: safe. Amber: Google may hold it for review. Red: identity fields, which can trigger
 * video re-verification or a suspension. A website moved to a different site is red; the same
 * site with a different path or tracking tag is green.
 */
export function diff(live: GbpLocation, change: GbpChange): FieldChange[] {
  const out: FieldChange[] = [];
  const add = (key: keyof GbpChange, tier: Tier, from: string, to: string, note?: string) => out.push({ key, label: LABELS[key], tier, from, to, note });

  if (change.description !== undefined && clean(change.description) !== clean(live.profile?.description))
    add('description', 'green', clean(live.profile?.description) || 'none', clean(change.description) || 'none');

  if (change.websiteUri !== undefined && clean(change.websiteUri) !== clean(live.websiteUri)) {
    const same = siteOf(change.websiteUri) !== '' && siteOf(change.websiteUri) === siteOf(live.websiteUri);
    const first = !clean(live.websiteUri);
    add(
      'websiteUri',
      same ? 'green' : first ? 'amber' : 'red',
      clean(live.websiteUri) || 'none',
      clean(change.websiteUri) || 'none',
      same ? undefined : first ? 'Adding a website for the first time.' : 'The link moves to a different website.',
    );
  }

  if (change.additionalCategories !== undefined && catNames(change.additionalCategories).join() !== catNames(live.categories?.additionalCategories).join())
    add('additionalCategories', 'green', catText(live.categories?.additionalCategories), catText(change.additionalCategories));

  if (change.additionalPhones !== undefined && change.additionalPhones.map(digits).join() !== (live.phoneNumbers?.additionalPhones ?? []).map(digits).join())
    add('additionalPhones', 'amber', (live.phoneNumbers?.additionalPhones ?? []).join(', ') || 'none', change.additionalPhones.join(', ') || 'none');

  if (change.regularHours !== undefined && weekKey(change.regularHours) !== weekKey(weekOf(live)))
    add('regularHours', 'green', weekText(weekOf(live)), weekText(change.regularHours));

  if (change.title !== undefined && clean(change.title) !== clean(live.title)) add('title', 'red', clean(live.title), clean(change.title));

  if (change.primaryCategory !== undefined && change.primaryCategory.name !== live.categories?.primaryCategory?.name)
    add(
      'primaryCategory',
      'red',
      live.categories?.primaryCategory?.displayName || live.categories?.primaryCategory?.name || 'none',
      change.primaryCategory.displayName || change.primaryCategory.name,
    );

  if (change.primaryPhone !== undefined && digits(change.primaryPhone) !== digits(live.phoneNumbers?.primaryPhone))
    add('primaryPhone', 'red', clean(live.phoneNumbers?.primaryPhone) || 'none', clean(change.primaryPhone));

  return out;
}

/** The highest risk among the changes. */
export function worst(changes: FieldChange[]): Tier {
  return changes.some((c) => c.tier === 'red') ? 'red' : changes.some((c) => c.tier === 'amber') ? 'amber' : 'green';
}

/**
 * Why the identity (red) changes cannot be sent now, or null: one identity field per save, and none
 * within a week of the last one on the same location. Stacked identity edits are what Google's
 * anti-hijacking checks look for.
 */
export function redBlock(changes: FieldChange[], lastRedAt: Date | null, now: Date): string | null {
  const red = changes.filter((c) => c.tier === 'red');
  if (!red.length) return null;
  if (red.length > 1) return `Change one identity field at a time (${red.map((c) => c.label.toLowerCase()).join(', ')}). Several at once is what gets a profile suspended.`;
  if (lastRedAt) {
    const left = RED_COOLDOWN_DAYS * 86400000 - (now.getTime() - lastRedAt.getTime());
    if (left > 0) return `An identity field on this profile was changed ${Math.max(1, Math.floor((now.getTime() - lastRedAt.getTime()) / 86400000))} day(s) ago. Wait ${Math.ceil(left / 86400000)} more day(s) before changing another.`;
  }
  return null;
}

/**
 * The requests to send for these changes, built on the live profile so nothing beside the changed
 * part is lost: `location` for the profile fields, `hours` for opening hours (its own endpoint).
 */
export function buildPatch(live: GbpLocation, change: GbpChange, changes: FieldChange[]) {
  const has = (k: keyof GbpChange) => changes.some((c) => c.key === k);
  const fields: string[] = [];
  const location: Record<string, unknown> = {};

  if (has('title')) {
    fields.push('title');
    location.title = clean(change.title);
  }
  if (has('websiteUri')) {
    fields.push('websiteUri');
    location.websiteUri = clean(change.websiteUri);
  }
  if (has('description')) {
    fields.push('profile');
    location.profile = { ...(live.profile ?? {}), description: clean(change.description) };
  }
  if (has('primaryCategory') || has('additionalCategories')) {
    fields.push('categories');
    const strip = (c: Category) => ({ name: c.name });
    location.categories = {
      primaryCategory: strip(has('primaryCategory') ? change.primaryCategory! : live.categories!.primaryCategory!),
      additionalCategories: (has('additionalCategories') ? change.additionalCategories! : (live.categories?.additionalCategories ?? [])).map(strip),
    };
  }
  if (has('primaryPhone') || has('additionalPhones')) {
    fields.push('phoneNumbers');
    location.phoneNumbers = {
      primaryPhone: has('primaryPhone') ? clean(change.primaryPhone) : live.phoneNumbers?.primaryPhone,
      additionalPhones: has('additionalPhones') ? change.additionalPhones!.map(clean) : (live.phoneNumbers?.additionalPhones ?? []),
    };
  }

  return {
    location: fields.length ? { fields, ...location } : null,
    hours: has('regularHours') ? { fields: ['regularHours'], regularHours: { periods: periodsOf(change.regularHours!) } } : null,
  };
}

/**
 * After an edit, the profile is read back from Google: the keys whose new value is showing, and
 * those that are not (held for review, rejected, or not yet applied).
 */
export function showing(after: GbpLocation, change: GbpChange, changes: FieldChange[]): { live: string[]; waiting: string[] } {
  const live: string[] = [];
  const waiting: string[] = [];
  for (const c of changes) (diff(after, { [c.key]: change[c.key] } as GbpChange).length === 0 ? live : waiting).push(c.key);
  return { live, waiting };
}
