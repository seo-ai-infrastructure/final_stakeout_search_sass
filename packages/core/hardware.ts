/**
 * Hardware profiles a customer can select, and the Android `ro.product.model`
 * values (recorded by the admin bootstrap) that satisfy each profile.
 *
 * A device is only ever leased for a profile it matches. There is no
 * "any phone" fallback: a scan that asked for a Galaxy S23 Ultra either runs
 * on one or fails with NO_COMPATIBLE_DEVICE and is refunded.
 *
 * Operators can add regional variants without a code change:
 *   HARDWARE_MODEL_ALIASES_JSON={"Galaxy S23 Ultra":["SM-S918N"]}
 */
type Settings = Record<string, string | undefined>;

export const hardwareCatalog: Record<string, Record<string, string[]>> = {
  Samsung: {
    'Galaxy S23 Ultra': ['SM-S918U', 'SM-S918U1', 'SM-S918B', 'SM-S918W'],
    'Galaxy S24+': ['SM-S926U', 'SM-S926U1', 'SM-S926B', 'SM-S926W'],
    'Galaxy Z Fold5': ['SM-F946U', 'SM-F946U1', 'SM-F946B', 'SM-F946W'],
  },
  Google: {
    'Pixel 8 Pro': ['Pixel 8 Pro'],
    'Pixel 7': ['Pixel 7'],
    'Pixel 8a': ['Pixel 8a'],
    'Pixel 5': ['Pixel 5'],
  },
  Motorola: {
    'Moto Edge 40': ['XT2303-2', 'motorola edge 40'],
    'Moto G Stylus 5G': ['XT2315-1', 'moto g stylus 5G (2023)'],
  },
  Xiaomi: {
    'Xiaomi 13 Pro': ['2210132G', '2210132C'],
    'Redmi Note 12': ['23021RAA2Y', '23021RAAEG'],
    'Redmi Note 9': ['M2003J15SC', 'M2003J15SG', 'M2010J19SC', 'Redmi Note 9'],
  },
};

/** Brand → selectable model names (what the wizard and parseSpec accept). */
export const phoneModels: Record<string, string[]> = Object.fromEntries(
  Object.entries(hardwareCatalog).map(([brand, models]) => [brand, Object.keys(models)]),
);

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');

function aliases(env: Settings): Record<string, string[]> {
  const raw = env.HARDWARE_MODEL_ALIASES_JSON;
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [
        k,
        Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [],
      ]),
    );
  } catch {
    return {};
  }
}

/** Accepted Android model strings for a profile, normalized. */
export function acceptedModels(profileModel: string, env: Settings = process.env) {
  for (const models of Object.values(hardwareCatalog)) {
    const codes = models[profileModel];
    if (codes)
      return new Set([profileModel, ...codes, ...(aliases(env)[profileModel] ?? [])].map(norm));
  }
  return new Set<string>();
}

/** Scans no longer pick a phone model: every scan runs on whichever phone is free. */
export const ANY_PHONE = 'Any';

export function deviceMatchesProfile(
  device: { hardwareModel: string | null },
  profileModel: string,
  env: Settings = process.env,
) {
  if (!profileModel || profileModel === ANY_PHONE) return true;
  return !!device.hardwareModel && acceptedModels(profileModel, env).has(norm(device.hardwareModel));
}

/** Which selectable profiles a bootstrapped device can serve (usually exactly one). */
export function profilesForDevice(
  device: { hardwareModel: string | null },
  env: Settings = process.env,
) {
  const out: { brand: string; model: string }[] = [];
  for (const [brand, models] of Object.entries(hardwareCatalog))
    for (const model of Object.keys(models))
      if (deviceMatchesProfile(device, model, env)) out.push({ brand, model });
  return out;
}

/** A device that may be leased: enabled, bootstrapped (model read from Android) and online. */
export const leasableDeviceWhere = {
  isEnabled: true,
  bootstrappedAt: { not: null },
  adbAddr: { not: null },
  hardwareModel: { not: null },
  offlineAt: null,
  autoPausedAt: null,
} as const;
