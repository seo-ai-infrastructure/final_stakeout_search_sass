/** Pure rules for running the search step through DuoPlus RPA templates. */
export type RpaSurface = 'chrome' | 'maps' | 'google';
export type TemplateVar = { key: string; type: string; required: boolean; desc: string };

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD HH:mm" (or with :ss) on a clock offsetMin minutes from UTC. */
export function formatServerTime(ms: number, offsetMin: number, withSeconds = false) {
  const d = new Date(ms + offsetMin * 60000);
  const base = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return withSeconds ? base + ':' + pad(d.getUTCSeconds()) : base;
}

/**
 * DuoPlus's clock offset (minutes from UTC) from a just-created task's created_at,
 * rounded to 15 minutes. Null when the timestamp can't be read or the offset is implausible.
 */
export function learnServerOffset(createdAt: string, nowMs: number): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(createdAt.trim());
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const diffMin = Math.round((asUtc - nowMs) / 60000 / 15) * 15 || 0; // no -0
  return Math.abs(diffMin) <= 14 * 60 ? diffMin : null;
}

const SURFACE_NAME: Record<RpaSurface, RegExp> = {
  chrome: /chrome/i,
  maps: /maps?\b/i,
  google: /google[ _-]?app|gsa|search[ _-]?app/i,
};

/** The template for a surface: an explicit id, else a "Stakeout … Chrome/Maps" name, else any name for that surface. */
export function pickTemplate(list: { id: string; name: string }[], surface: RpaSurface, envId?: string) {
  if (envId) return list.find((t) => t.id === envId) ?? null;
  const forSurface = list.filter((t) => SURFACE_NAME[surface].test(t.name));
  return forSurface.find((t) => /stakeout/i.test(t.name)) ?? forSurface[0] ?? null;
}

/** The template variable that takes the search keyword. */
export function pickKeywordKey(vars: TemplateVar[]): string | null {
  const texty = vars.filter((v) => /^(string|textarea)$/i.test(v.type));
  const named = texty.find((v) => /keyword|query|search|term|关键|kw/i.test(v.key + ' ' + v.desc));
  if (named) return named.key;
  return texty.length === 1 ? texty[0].key : null;
}
