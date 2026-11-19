/**
 * The change watchdog: each listing is read once a day and compared with the profile as we last
 * knew it (its baseline). Anything that differs and that we did not send ourselves was changed by
 * someone else: Google's own updates, a "suggest an edit" from the public, or another manager.
 * Pure rules here; the website reads Google and keeps the baseline (apps/nextjs/src/lib/gbpWatch.ts).
 */
import { describe, specialOf, weekOf, type GbpChange, type GbpLocation, type Tier } from './gbp';

/** What is watched, in the order it is reported. The first nine can be edited here; the rest only on Google. */
export const WATCHED: { key: string; label: string; tier: Tier | null }[] = [
  { key: 'title', label: 'Business name', tier: 'red' },
  { key: 'primaryCategory', label: 'Primary category', tier: 'red' },
  { key: 'primaryPhone', label: 'Phone', tier: 'red' },
  { key: 'websiteUri', label: 'Website', tier: 'green' },
  { key: 'regularHours', label: 'Opening hours', tier: 'green' },
  { key: 'specialHours', label: 'Holiday hours', tier: 'green' },
  { key: 'additionalCategories', label: 'Additional categories', tier: 'green' },
  { key: 'additionalPhones', label: 'Additional phones', tier: 'green' },
  { key: 'description', label: 'Description', tier: 'green' },
  { key: 'address', label: 'Address', tier: null },
  { key: 'openStatus', label: 'Open or closed', tier: null },
];

/** Every watched field of a profile as one line of text. The same words the edit history uses. */
export function watched(loc: GbpLocation, today: string): Record<string, string> {
  const a = loc.storefrontAddress;
  const open = (loc.openInfo && typeof loc.openInfo === 'object' ? (loc.openInfo as { status?: unknown }).status : null) ?? null;
  return {
    ...describe(loc, today),
    address: [a?.addressLines?.join(' '), a?.locality, a?.administrativeArea, a?.postalCode].filter(Boolean).join(', ') || 'none (service-area business)',
    openStatus: typeof open === 'string' && open ? open.replace(/_/g, ' ').toLowerCase() : 'not stated',
  };
}

export type Drift = { key: string; label: string; was: string; now: string };

/**
 * What changed on a listing without us. `accepted` holds values an admin has since agreed to (they
 * replace the baseline's for that field). `ours` is what our own recent edits set each field to:
 * a field now showing one of those is our edit arriving (Google can take days to show one), so it
 * is `absorbed` into what we expect, not reported.
 */
export function findDrift(base: GbpLocation, live: GbpLocation, today: string, accepted: Record<string, string> = {}, ours: Record<string, string[]> = {}): { drift: Drift[]; absorbed: Record<string, string> } {
  const was = watched(base, today), now = watched(live, today);
  const drift: Drift[] = [];
  const absorbed: Record<string, string> = {};
  for (const f of WATCHED) {
    const expected = accepted[f.key] ?? was[f.key];
    if (now[f.key] === expected) continue;
    if ((ours[f.key] ?? []).includes(now[f.key])) absorbed[f.key] = now[f.key];
    else drift.push({ key: f.key, label: f.label, was: expected, now: now[f.key] });
  }
  return { drift, absorbed };
}

/**
 * The edit that puts one field back as the baseline had it, or null when it cannot be done from
 * here: fields only Google's own pages can change, identity fields (name, primary category, phone:
 * those go through the editor's own checks), a field whose expected value is one an admin accepted
 * later (the baseline no longer holds it), and hours this editor cannot express.
 */
export function changeBack(base: GbpLocation, key: string, today: string, accepted: Record<string, string> = {}): GbpChange | null {
  if (key in accepted) return null;
  if (WATCHED.find((f) => f.key === key)?.tier !== 'green') return null;
  switch (key) {
    case 'description': return { description: base.profile?.description ?? '' };
    case 'websiteUri': return { websiteUri: base.websiteUri ?? '' };
    case 'additionalCategories': return { additionalCategories: base.categories?.additionalCategories ?? [] };
    case 'additionalPhones': return { additionalPhones: base.phoneNumbers?.additionalPhones ?? [] };
    case 'regularHours': { const w = weekOf(base); return w ? { regularHours: w } : null; }
    case 'specialHours': { const s = specialOf(base, today); return s ? { specialHours: s.days } : null; }
    default: return null;
  }
}

/** The email about a day's findings: one line per change, the first dozen. */
export function driftAlert(found: { title: string; label: string; was: string; now: string }[]): { subject: string; lines: string[] } | null {
  if (!found.length) return null;
  const listings = new Set(found.map((f) => f.title)).size;
  const cut = (s: string) => (s.length > 90 ? s.slice(0, 87) + '…' : s);
  return {
    subject: `Stakeout: ${found.length} change${found.length === 1 ? '' : 's'} on ${listings} Google listing${listings === 1 ? '' : 's'} that we did not make`,
    lines: [
      ...found.slice(0, 12).map((f) => `${f.title} · ${f.label}: was "${cut(f.was)}", now "${cut(f.now)}"`),
      ...(found.length > 12 ? [`…and ${found.length - 12} more.`] : []),
      'Each one can be kept or put back from the Changes tab.',
    ],
  };
}
