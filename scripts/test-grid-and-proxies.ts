/**
 * Tests the grid math and the residential proxies with the app's own code.
 *
 *   npx tsx scripts/test-grid-and-proxies.ts --lat 36.2001 --lng -86.5186 --size 7 --miles 1
 *       Grid only: every point's coordinates, ZIP and city, plus a spacing check.
 *
 *   PROXY_SELLER_API_KEY=… npx tsx scripts/test-grid-and-proxies.ts --lat … --lng … --proxies
 *       Also matches the grid's market in Proxy-Seller's GEO data and lists its ISPs.
 *
 *   … --proxies --create-list "Charter Communications"      (or --create-list "" for any ISP)
 *       Also creates ONE list with per-request rotation and tests three of its ports
 *       three times each: exit IP, city, state, ISP and whether the IP rotates.
 *
 * Needs no database. Never prints keys or proxy passwords.
 */
import { execFileSync } from 'node:child_process';
import { buildGrid, parseSpec } from '../packages/core/grid';
import { extractGeoRows, matchMarket, parseProxyLines, normPlace } from '../packages/core/proxyGeo';

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const has = (name: string) => process.argv.includes('--' + name);

const lat = Number(arg('lat')), lng = Number(arg('lng'));
const size = Number(arg('size', '7'));
const miles = Number(arg('miles', '1'));
const KM = { 0.5: 0.80467, 1: 1.60934, 2: 3.21868, 5: 8.04672 } as Record<number, number>;
if (!Number.isFinite(lat) || !Number.isFinite(lng) || !KM[miles]) {
  console.error('Usage: --lat <center> --lng <center> [--size 3|5|7|9|11] [--miles 0.5|1|2|5] [--proxies] [--create-list "<ISP>"]');
  process.exit(1);
}

// Independent check: great-circle distance (haversine), in kilometres.
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------- grid math
const spec = parseSpec({ keyword: 'test', targetBusiness: 'test', centerLat: lat, centerLng: lng, gridSize: size, spacingKm: KM[miles] });
const pins = buildGrid(spec);
const center = pins[(pins.length - 1) / 2];
console.log(`\nGRID ${size}×${size}, ${miles} mi apart, centre ${lat}, ${lng}`);
console.log('point  latitude    longitude    from centre   ZIP    city, state');
for (const p of pins) {
  const d = haversineKm(center, p) / 1.60934;
  console.log(`${String(p.rowIdx + 1)}_${String(p.colIdx + 1)}`.padEnd(7) + p.lat.toFixed(6).padEnd(12) + p.lng.toFixed(6).padEnd(13) +
    `${d.toFixed(2)} mi`.padEnd(14) + p.zip.padEnd(7) + `${p.city}, ${p.stateCode}`);
}
const gaps: number[] = [];
for (const p of pins) {
  for (const q of pins) {
    const neighbour = (q.rowIdx === p.rowIdx && q.colIdx === p.colIdx + 1) || (q.colIdx === p.colIdx && q.rowIdx === p.rowIdx + 1);
    if (neighbour) gaps.push(haversineKm(p, q));
  }
}
const want = KM[miles];
const worst = Math.max(...gaps.map((g) => Math.abs(g - want)));
const corner = haversineKm(pins[0], pins[pins.length - 1]) / 1.60934;
console.log(`\nSpacing: ${gaps.length} neighbour pairs, expected ${want.toFixed(3)} km each, worst error ${(worst * 1000).toFixed(1)} m ${worst < 0.02 ? '✓' : '✗ CHECK'}`);
console.log(`Span: corner to corner ${corner.toFixed(2)} mi (expected ${(Math.SQRT2 * miles * (size - 1)).toFixed(2)} mi)`);
const north = pins.filter((p) => p.rowIdx === 0).every((p) => p.lat > center.lat);
const east = pins.filter((p) => p.colIdx === size - 1).every((p) => p.lng > center.lng);
console.log(`Orientation: row 1 is north ${north ? '✓' : '✗'}, last column is east ${east ? '✓' : '✗'}`);
const places = [...new Set(pins.map((p) => `${p.city}, ${p.stateCode}`))];
const zips = new Set(pins.map((p) => p.zip));
console.log(`Covers ${zips.size} ZIP code(s) and ${places.length} place name(s): ${places.join(' · ')}`);
console.log(`Scan market (centre point): ${center.city}, ${center.stateCode} ${center.zip}`);

if (!has('proxies')) process.exit(0);

// ---------------------------------------------------------------- proxies
const key = process.env.PROXY_SELLER_API_KEY?.trim();
if (!key) {
  console.error('\nSet PROXY_SELLER_API_KEY to test proxies.');
  process.exit(1);
}
const base = 'https://proxy-seller.com/personal/api/v2/' + key + '/';
async function ps(path: string, body?: unknown, text = false): Promise<any> {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!res) throw new Error('Proxy-Seller unreachable (' + path.split('?')[0] + ')');
  const raw = await res.text();
  try {
    const j = JSON.parse(raw);
    if (j?.errors?.length) throw new Error('Proxy-Seller error on ' + path.split('?')[0] + ': ' + JSON.stringify(j.errors));
    return j;
  } catch (e) {
    if (text && res.ok) return raw;
    throw e;
  }
}

(async () => {
  console.log('\nPROXIES');
  const rows = extractGeoRows(await ps('resident/geo'));
  console.log(`GEO data: ${rows.length} rows read`);
  const m = matchMarket(rows, center.city, center.stateCode);
  if (!m) {
    console.log(`✗ ${center.stateCode} not found in Proxy-Seller's GEO data`);
    process.exit(1);
  }
  console.log(`Scan market → Proxy-Seller: region "${m.region}", city "${m.city || '(whole state)'}" [${m.level} level]`);
  console.log(`ISPs available (${m.isps.length}): ${m.isps.join(' · ')}`);
  for (const place of places) {
    const [city, st] = place.split(', ');
    const pm = matchMarket(rows, city, st);
    console.log(`  grid place ${place.padEnd(28)} → ${pm ? (pm.level === 'city' ? 'city "' + pm.city + '"' : 'state only') : 'not covered'}`);
  }

  const ispArg = arg('create-list');
  if (ispArg === undefined) return;
  if (ispArg && !m.isps.includes(ispArg)) {
    console.log(`✗ "${ispArg}" is not an ISP in this market. Copy one exactly from the list above.`);
    process.exit(1);
  }
  const rotation = Number(arg('rotation', '0'));
  const created = await ps('resident/list/add', {
    title: ['stakeout-test', 'US', m.region, m.city || '*', ispArg || '*', 'r' + rotation].join('|'),
    whitelist: '',
    geo: { country: 'US', region: m.region, city: m.city, isp: ispArg },
    export: { ports: 3, ext: 'txt' },
    rotation,
  });
  const listId = created?.data?.id;
  console.log(`\nCreated test list ${listId} (rotation ${rotation === 0 ? 'per request' : rotation === -1 ? 'sticky' : rotation + ' s'})`);
  const lines = parseProxyLines(String(await ps(`proxy/download/resident?ext=${encodeURIComponent('%ip%:%port%:%login%:%password%')}&listId=${listId}`, undefined, true)));
  if (!lines.length) throw new Error('No proxy lines returned for the new list');
  const results: { port: number; ip: string; city: string; region: string; org: string }[] = [];
  for (const e of lines.slice(0, 3)) {
    for (let i = 0; i < 3; i++) {
      const proxy = `socks5h://${encodeURIComponent(e.login)}:${encodeURIComponent(e.password)}@${e.host}:${e.port}`;
      let j: any = {};
      try {
        j = JSON.parse(execFileSync('curl', ['-s', '--max-time', '20', '-x', proxy, 'https://ipinfo.io/json'], { encoding: 'utf8' }));
      } catch {
        j = {};
      }
      results.push({ port: e.port, ip: j.ip ?? '—', city: j.city ?? '—', region: j.region ?? '—', org: j.org ?? '—' });
      console.log(`  port ${e.port} #${i + 1}: ${String(j.ip ?? 'no answer').padEnd(16)} ${(j.city ?? '').padEnd(16)} ${(j.region ?? '').padEnd(12)} ${j.org ?? ''}`);
    }
  }
  const ok = results.filter((r) => r.ip !== '—');
  const inState = ok.filter((r) => normPlace(r.region) === normPlace(m.region)).length;
  const inCity = ok.filter((r) => m.city && normPlace(r.city) === normPlace(m.city)).length;
  const ispWord = normPlace(ispArg || '').split(' ')[0];
  const ispMatch = ispArg ? ok.filter((r) => normPlace(r.org).includes(ispWord)).length : null;
  const distinct = new Set(ok.map((r) => r.ip)).size;
  console.log(`\nAnswered ${ok.length}/${results.length} · in ${m.region} ${inState}/${ok.length} · in ${m.city || 'city'} ${inCity}/${ok.length}` +
    (ispMatch === null ? '' : ` · on ${ispArg} ${ispMatch}/${ok.length}`) + ` · distinct IPs ${distinct}/${ok.length}`);
  console.log(distinct > 1 ? '✓ Exit IPs rotate' : '✗ Exit IP never changed: check the list\'s rotation setting');
  console.log(`\nDelete test list ${listId} in the Proxy-Seller dashboard when you're done (production lists are named "stakeout|…").`);
})().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e);
  process.exit(1);
});
