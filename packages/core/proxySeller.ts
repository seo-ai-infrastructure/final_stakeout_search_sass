type Settings = Record<string, string | undefined>;

/** Shared by fleet display and the worker so displayed and used ports agree. */
export function proxyPort(slotIndex: number, env: Settings = process.env) {
  const slots = env.PROXY_USE_SLOT_PORT === 'true';
  if (slots && (!Number.isSafeInteger(slotIndex) || slotIndex < 1 || slotIndex > 999))
    throw new Error('PROXY_SLOT_OUT_OF_RANGE: slot ports require a slot from 1 to 999.');
  const port = slots ? 10000 + slotIndex : Number(env.PROXY_PORT ?? 10000);
  if (!Number.isSafeInteger(port) || port < 10000 || port > 10999)
    throw new Error('PROXY_PORT_OUT_OF_RANGE: use a port from 10000 to 10999.');
  return port;
}

export function proxyCredentials(env: Settings = process.env) {
  const login = env.PROXY_SELLER_BASE_LOGIN?.trim();
  const password = env.PROXY_SELLER_PASSWORD;
  if (!login || !password)
    throw new Error('PROXY_CREDENTIALS_MISSING: configure the API Tools login and password.');
  return { login, password };
}

const readPaths = ['resident/package', 'resident/lists', 'proxy/lists'] as const;
export type ProxySellerReadPath = (typeof readPaths)[number];

/** Management reads only. Never include request URLs, payloads, or causes in errors. */
export async function proxySellerRead(
  path: ProxySellerReadPath,
  apiKey: string,
  request: typeof fetch = fetch,
): Promise<unknown> {
  if (!readPaths.includes(path)) throw new Error('PROXY_SELLER_UNSUPPORTED_READ');
  if (!apiKey || /\s/.test(apiKey)) throw new Error('PROXY_SELLER_API_KEY_MISSING_OR_INVALID');
  let response: Response;
  try {
    response = await request(
      'https://proxy-seller.com/personal/api/v2/' + encodeURIComponent(apiKey) + '/' + path,
      { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000) },
    );
  } catch {
    throw new Error('PROXY_SELLER_NETWORK_ERROR: check network access and the API IP allowlist.');
  }
  if (!response.ok) throw new Error('PROXY_SELLER_HTTP_' + response.status);
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new Error('PROXY_SELLER_INVALID_JSON');
  }
  if (
    !result || result.status !== 'success' || result.data == null ||
    (result.errors !== undefined && (!Array.isArray(result.errors) || result.errors.length > 0))
  ) {
    // The provider can return HTTP 200 for authentication, quota and other errors.
    throw new Error('PROXY_SELLER_REJECTED: check the API key, API IP allowlist, package and endpoint.');
  }
  return result.data;
}

/** Deliberately omit credentials, package keys, titles, whitelist and raw payloads. */
export function proxyPackageSummary(value: unknown) {
  const p = value as Record<string, unknown> | null;
  if (!p || typeof p !== 'object' || typeof p.is_active !== 'boolean')
    throw new Error('PROXY_SELLER_PACKAGE_SHAPE_UNRECOGNIZED');
  const bytes = (v: unknown) => {
    const text = String(v ?? '');
    return /^\d+$/.test(text) ? text : null;
  };
  const expiry = typeof p.expired_at === 'string' &&
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(p.expired_at)
    ? p.expired_at : null;
  return {
    active: p.is_active,
    trafficLimitBytes: bytes(p.traffic_limit),
    trafficUsedBytes: bytes(p.traffic_usage),
    trafficLeftBytes: bytes(p.traffic_left),
    expiresAtAsReported: expiry,
    expiryTimezone: 'Confirm with provider when no offset is present.',
  };
}

export function proxyListsSummary(value: unknown, configuredLogin?: string) {
  const items = (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) throw new Error('PROXY_SELLER_LIST_SHAPE_UNRECOGNIZED');
  return {
    listCount: items.length,
    configuredLoginFound: configuredLogin
      ? items.some((item) => item && item.login === configuredLogin)
      : null,
  };
}

// ---------------------------------------------------------------------------
// Login-suffix targeting (docs.proxy-seller.com: "Connect & target via login").
// Format: <base>_c_US[_sd_<id>|_city_<City>][_isp_<id>][_zip_<zip>]_s_<session>_ttl_<n>
// ---------------------------------------------------------------------------

/** Parses an operator map such as {"Charter Communications":"51811"}; ignores non-numeric IDs. */
export function parseIdMap(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('PROXY_ID_MAP_INVALID_JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('PROXY_ID_MAP_INVALID_JSON');
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const id = String(value ?? '').trim();
    if (/^\d{1,12}$/.test(id)) out[key] = id;
  }
  return out;
}

/** ISP codes (wizard values) that can actually be targeted. 'ANY' is always allowed. */
export function targetableIspCodes(env: Settings = process.env) {
  return ['ANY', ...Object.keys(parseIdMap(env.PROXY_ISP_IDS_JSON))];
}

/** Proxy-Seller wants spaces as '-'; DuoPlus only accepts a limited character set. */
export function citySuffix(city: string) {
  return city
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9-]/g, '');
}

export type TargetRung =
  | 'ZIP_ISP'
  | 'CITY_ISP'
  | 'STATE_ISP'
  | 'ZIP'
  | 'CITY'
  | 'STATE'
  | 'STATIC_DEVICE_PROXY';

export type TargetCandidate = {
  rung: TargetRung;
  ispApplied: boolean;
  /** Login suffix without the base credential and without the session part. */
  suffix: string;
};

/**
 * Builds the ordered targeting ladder for one pin. Narrowest first; each rung
 * that is recorded on the receipt says exactly which constraints were applied.
 */
export function targetingLadder(
  pin: { zip: string; city: string; stateCode: string },
  ispCode: string,
  env: Settings = process.env,
): TargetCandidate[] {
  const ispId = ispCode === 'ANY' ? undefined : parseIdMap(env.PROXY_ISP_IDS_JSON)[ispCode];
  const stateId = parseIdMap(env.PROXY_STATE_IDS_JSON)[pin.stateCode.toUpperCase()];
  const city = citySuffix(pin.city);
  const zip = /^\d{5}$/.test(pin.zip) ? pin.zip : undefined;
  const base = '_c_US';
  const geo: { rung: 'ZIP' | 'CITY' | 'STATE'; suffix: string }[] = [];
  if (zip) geo.push({ rung: 'ZIP', suffix: base + '_zip_' + zip });
  if (city) geo.push({ rung: 'CITY', suffix: base + '_city_' + city });
  if (stateId) geo.push({ rung: 'STATE', suffix: base + '_sd_' + stateId });
  const ladder: TargetCandidate[] = [];
  if (ispId) {
    // Documented order: _c_ → _city_/_sd_ → _isp_ → _zip_
    for (const g of geo) {
      const suffix =
        g.rung === 'ZIP'
          ? base + '_isp_' + ispId + '_zip_' + zip
          : g.suffix + '_isp_' + ispId;
      ladder.push({ rung: (g.rung + '_ISP') as TargetRung, ispApplied: true, suffix });
    }
  }
  for (const g of geo) ladder.push({ rung: g.rung, ispApplied: false, suffix: g.suffix });
  return ladder;
}

/** Full login for one attempt. Session pins the exit IP for the whole pin run. */
export function targetedLogin(baseLogin: string, suffix: string, sessionId: string, ttl = '30m') {
  if (!/^[A-Za-z0-9]{6,32}$/.test(sessionId)) throw new Error('PROXY_SESSION_ID_INVALID');
  return baseLogin + suffix + '_s_' + sessionId + '_ttl_' + ttl;
}

/** Proxy-Seller targeting is active only when API Tools credentials are configured. */
export function proxyTargetingEnabled(env: Settings = process.env) {
  return Boolean(env.PROXY_SELLER_BASE_LOGIN?.trim() && env.PROXY_SELLER_PASSWORD);
}

export const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico',
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Compares a proxy-check region ("Florida" or "FL") with the pin's state code. */
export function regionMatchesState(region: string, stateCode: string) {
  const code = stateCode.toUpperCase();
  const r = squash(region);
  if (!r) return false;
  return r === code.toLowerCase() || r === squash(US_STATE_NAMES[code] ?? '');
}

export function cityMatches(observed: string, expected: string) {
  const a = squash(observed),
    b = squash(expected);
  return Boolean(a && b) && (a === b || a.replace(/^saint/, 'st') === b.replace(/^saint/, 'st'));
}
