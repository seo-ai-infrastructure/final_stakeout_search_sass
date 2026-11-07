/**
 * Pre-flight gatekeeper for residential proxy exits.
 *
 * One sticky proxy port per grid point: the exit IP is checked from the phone itself,
 * through that port, before the screen recording starts, and the same IP must still be
 * in use when the capture ends. All rules here are pure so they can be unit-tested.
 */
import { US_STATE_NAMES } from './proxySeller';

export type IpinfoExit = { ip: string; country: string; region: string; city: string; org: string };
export type IpapiExit = {
  ip: string;
  countryCode: string;
  region: string; // state code, e.g. "TN"
  regionName: string;
  city: string;
  isp: string;
  org: string;
  as: string; // e.g. "AS7922 Comcast Cable Communications, LLC"
  hosting: boolean;
  proxy: boolean;
};
export type GoogleProbe = { host: string | null; lang: string | null; usFooter: boolean | null };
export type ExitEvidence = { ipinfo: IpinfoExit | null; ipapi: IpapiExit | null; google: GoogleProbe | null };
export type GatePolicy = 'strict' | 'deny' | 'off';

/** Major US residential and mobile access networks (ASNs). Extend with PROXY_ASN_ALLOW. */
export const RESIDENTIAL_ASNS = new Set<number>([
  7922, // Comcast
  7018, 20057, // AT&T, AT&T Mobility
  20115, 11427, 11426, 10796, 11351, 12271, 33363, 7843, // Charter / Spectrum (incl. former TWC)
  701, 6167, 22394, // Verizon Fios, Verizon Wireless
  21928, // T-Mobile USA
  5650, // Frontier
  22773, // Cox
  4181, // TDS Telecom
  209, 22561, // CenturyLink / Lumen residential, Brightspeed region
  6128, 19108, // Optimum (Altice), Suddenlink
  7029, // Windstream
  30036, // Mediacom
  12083, // WideOpenWest
  11492, // Cable One / Sparklight
  16591, // Google Fiber
  6181, // Cincinnati Bell / altafiber
  20001, // Charter (former Time Warner West)
]);

/** Name hints for residential ISPs (used when an ASN is not in the list). */
const RESIDENTIAL_NAMES = [
  'comcast', 'xfinity', 'charter', 'spectrum', 'timewarner', 'att', 'verizon', 'tmobile', 'frontier', 'cox',
  'tds', 'centurylink', 'lumen', 'brightspeed', 'optimum', 'altice', 'suddenlink', 'windstream', 'mediacom',
  'wideopenwest', 'cableone', 'sparklight', 'googlefiber', 'cincinnatibell', 'altafiber', 'consolidated',
  'ziply', 'astound', 'rcn', 'grande', 'wave', 'metronet', 'hotwire', 'midco', 'midcontinent', 'buckeye',
  'shentel', 'gci', 'hawaiiantelcom', 'cellcom', 'uscellular',
];

/** Datacenter, hosting and transit networks: never a real household. */
const DATACENTER_NAMES = [
  'cogent', 'hurricane', 'amazon', 'aws', 'google cloud', 'googlecloud', 'microsoft', 'azure', 'digitalocean',
  'linode', 'akamai', 'ovh', 'hetzner', 'leaseweb', 'vultr', 'choopa', 'm247', 'datacamp', 'psychz',
  'quadranet', 'colocrossing', 'hostwinds', 'contabo', 'zenlayer', 'cloudflare', 'oracle', 'alibaba',
  'tencent', 'scaleway', 'servers', 'hosting', 'datacenter', 'data center',
];

const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (v: string) => v.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9 ]/g, ' ');

/** "AS7922 Comcast Cable Communications, LLC" -> 7922 */
export function asnOf(v: string | null | undefined): number | null {
  const m = /\bAS(\d{1,10})\b/i.exec(v ?? '');
  return m ? Number(m[1]) : null;
}

/** A chosen ISP ("Comcast Cable", "AT&T Services", "TDS Telecom") seen in an exit's network name. */
export function ispMatches(chosen: string, observed: string) {
  const stop = new Set(['communications', 'communication', 'services', 'service', 'inc', 'llc', 'corp',
    'corporation', 'company', 'co', 'cable', 'the', 'of', 'holdings', 'group', 'network', 'networks']);
  const tokens = words(chosen).split(/\s+/).filter((t) => t && !stop.has(t));
  const key = squash(tokens[0] ?? chosen);
  return key.length > 1 && squash(observed).includes(key);
}

function residentialByName(network: string) {
  const s = squash(network);
  return RESIDENTIAL_NAMES.some((n) => s.includes(n));
}
function datacenterByName(network: string) {
  const s = network.toLowerCase();
  return DATACENTER_NAMES.some((n) => s.includes(n));
}

function stateMatches(region: string, regionCode: string | null, stateCode: string) {
  const code = stateCode.toUpperCase();
  if (regionCode && regionCode.toUpperCase() === code) return true;
  const name = US_STATE_NAMES[code] ?? '';
  return Boolean(region) && (squash(region) === squash(name) || region.toUpperCase() === code);
}

export type GateVerdict = {
  ok: boolean;
  reasons: string[];
  ip: string | null;
  asn: number | null;
  network: string;
  hosting: boolean | null;
  googleLang: string | null;
  sourcesAgree: boolean | null;
};

/**
 * The gatekeeper's decision for one exit. Fails closed: an exit is only accepted
 * when the checks that ran all pass and at least one geolocation source answered.
 */
export function judgeExit(
  ev: ExitEvidence,
  opts: { stateCode: string; isp?: string | null; policy?: GatePolicy; extraAsns?: number[] },
): GateVerdict {
  const policy = opts.policy ?? 'strict';
  const reasons: string[] = [];
  const { ipinfo, ipapi, google } = ev;
  const ip = ipapi?.ip || ipinfo?.ip || null;
  const network = [ipapi?.as, ipapi?.isp, ipapi?.org, ipinfo?.org].filter(Boolean).join(' · ');
  const asn = asnOf(ipapi?.as) ?? asnOf(ipinfo?.org);
  let sourcesAgree: boolean | null = null;

  if (!ipinfo && !ipapi) reasons.push('NO_GEOLOCATION');
  // 1. Every geolocation source must say US and the point's state.
  if (ipinfo) {
    if (!/^(us|usa|united states)$/i.test(ipinfo.country.trim())) reasons.push('IPINFO_COUNTRY_' + (ipinfo.country || '?'));
    else if (!stateMatches(ipinfo.region, null, opts.stateCode)) reasons.push('IPINFO_STATE_' + squash(ipinfo.region || '?'));
  }
  if (ipapi) {
    if (ipapi.countryCode.toUpperCase() !== 'US') reasons.push('IPAPI_COUNTRY_' + (ipapi.countryCode || '?'));
    else if (!stateMatches(ipapi.regionName, ipapi.region, opts.stateCode)) reasons.push('IPAPI_STATE_' + (ipapi.region || '?'));
    // 2. Datacenter / leased ranges masquerading as residential.
    if (ipapi.hosting) reasons.push('HOSTING_RANGE');
  }
  // A sticky port must show one IP to every lookup.
  if (ipinfo && ipapi) {
    sourcesAgree = ipinfo.ip === ipapi.ip;
    if (!sourcesAgree) reasons.push('EXIT_NOT_STICKY');
  }
  // 3. Residential network: ASN allow-list or a known residential ISP name; never a datacenter.
  // No network name from either lookup is not a pass: fail closed.
  if (policy !== 'off' && !network) reasons.push('NO_NETWORK_EVIDENCE');
  if (policy !== 'off' && network) {
    if (datacenterByName(network)) reasons.push('DATACENTER_NETWORK');
    else if (policy === 'strict') {
      const allowed = (asn !== null && (RESIDENTIAL_ASNS.has(asn) || (opts.extraAsns ?? []).includes(asn))) || residentialByName(network);
      if (!allowed) reasons.push('NOT_RESIDENTIAL_' + (asn ? 'AS' + asn : 'UNKNOWN'));
    }
  }
  // The receipt names the ISP that was chosen, so the exit must be on it.
  if (opts.isp && network && !ispMatches(opts.isp, network)) reasons.push('ISP_MISMATCH');
  // 4. What Google itself serves this exit: English, on google.com, and US when it says.
  if (google) {
    if (google.lang && !/^en\b/i.test(google.lang)) reasons.push('GOOGLE_LANG_' + google.lang);
    if (google.host && !/(^|\.)google\.com$/i.test(google.host)) reasons.push('GOOGLE_REDIRECT_' + google.host);
    if (google.usFooter === false) reasons.push('GOOGLE_NOT_US');
  }
  return {
    ok: reasons.length === 0,
    reasons,
    ip,
    asn,
    network,
    hosting: ipapi ? ipapi.hosting : null,
    googleLang: google?.lang ?? null,
    sourcesAgree,
  };
}

/** Parses ipinfo.io/json. */
export function parseIpinfo(raw: string): IpinfoExit | null {
  try {
    const j = JSON.parse(raw);
    if (!j?.ip) return null;
    return { ip: String(j.ip), country: String(j.country ?? ''), region: String(j.region ?? ''), city: String(j.city ?? ''), org: String(j.org ?? '') };
  } catch {
    return null;
  }
}

/** Parses ip-api.com/json (fields=status,countryCode,region,regionName,city,isp,org,as,hosting,proxy,query). */
export function parseIpapi(raw: string): IpapiExit | null {
  try {
    const j = JSON.parse(raw);
    if (j?.status !== 'success' || !j.query) return null;
    return {
      ip: String(j.query),
      countryCode: String(j.countryCode ?? ''),
      region: String(j.region ?? ''),
      regionName: String(j.regionName ?? ''),
      city: String(j.city ?? ''),
      isp: String(j.isp ?? ''),
      org: String(j.org ?? ''),
      as: String(j.as ?? ''),
      hosting: j.hosting === true,
      proxy: j.proxy === true,
    };
  } catch {
    return null;
  }
}

/**
 * Parses the phone's probe of Google's homepage: line 1 the final URL after redirects,
 * line 2 the <html ...lang="..."> tag, line 3 how often "United States" appears.
 */
export function parseGoogleProbe(raw: string): GoogleProbe | null {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const url = lines.find((l) => /^https?:\/\//i.test(l)) ?? '';
  const langTag = lines.find((l) => /<html/i.test(l)) ?? '';
  const countLine = [...lines].reverse().find((l) => /^\d+$/.test(l));
  let host: string | null = null;
  try {
    host = url ? new URL(url).hostname : null;
  } catch {
    host = null;
  }
  const lang = /lang="([^"]+)"/i.exec(langTag)?.[1] ?? null;
  if (!host && !lang) return null;
  return { host, lang, usFooter: countLine === undefined ? null : Number(countLine) > 0 ? true : null };
}

/** Order in which a point tries a list's ports: spread by point, never the same port twice. */
export function portOrder(ports: number[], seed: string): number[] {
  if (!ports.length) return [];
  let h = 0;
  for (const c of seed) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  const start = Math.abs(h) % ports.length;
  return ports.map((_, i) => ports[(start + i) % ports.length]);
}
