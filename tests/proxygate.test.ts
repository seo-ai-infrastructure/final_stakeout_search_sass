import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeExit, parseIpinfo, parseIpapi, parseGoogleProbe, portOrder, ispMatches, asnOf } from '../packages/core/proxyGate';

const comcastTN = {
  ipinfo: { ip: '73.1.2.3', country: 'US', region: 'Tennessee', city: 'Mount Juliet', org: 'AS7922 Comcast Cable Communications, LLC' },
  ipapi: { ip: '73.1.2.3', countryCode: 'US', region: 'TN', regionName: 'Tennessee', city: 'Mount Juliet', isp: 'Comcast Cable Communications, LLC', org: 'Comcast IP Services, L.L.C.', as: 'AS7922 Comcast Cable Communications, LLC', hosting: false, proxy: true },
  google: { host: 'www.google.com', lang: 'en', usFooter: true },
};

test('gate: a sticky Comcast exit in Tennessee passes', () => {
  const v = judgeExit(comcastTN, { stateCode: 'TN' });
  assert.equal(v.ok, true, v.reasons.join());
  assert.equal(v.asn, 7922);
  assert.equal(v.sourcesAgree, true);
});

test('gate: the 19:05 acceptance run (Uzbek exit, Uzbek Google) is rejected', () => {
  const v = judgeExit(
    {
      ipinfo: { ip: '213.230.1.1', country: 'UZ', region: 'Tashkent', city: 'Tashkent', org: 'AS8193 Uzbektelekom' },
      ipapi: null,
      google: { host: 'www.google.com', lang: 'uz', usFooter: null },
    },
    { stateCode: 'TN' },
  );
  assert.equal(v.ok, false);
  assert.ok(v.reasons.includes('IPINFO_COUNTRY_UZ'));
  assert.ok(v.reasons.includes('GOOGLE_LANG_uz'));
});

test('gate: a "US" IP that Google serves in another language is rejected', () => {
  const v = judgeExit({ ...comcastTN, google: { host: 'www.google.com', lang: 'uz', usFooter: null } }, { stateCode: 'TN' });
  assert.deepEqual(v.reasons, ['GOOGLE_LANG_uz']);
});

test('gate: hosting ranges, datacenter networks, wrong state and non-sticky exits are rejected', () => {
  const hosting = judgeExit({ ...comcastTN, ipapi: { ...comcastTN.ipapi, hosting: true } }, { stateCode: 'TN' });
  assert.ok(hosting.reasons.includes('HOSTING_RANGE'));
  const cogent = judgeExit(
    { ...comcastTN, ipinfo: { ...comcastTN.ipinfo, org: 'AS174 Cogent Communications' }, ipapi: { ...comcastTN.ipapi, as: 'AS174 Cogent Communications', isp: 'Cogent', org: 'Cogent' } },
    { stateCode: 'TN' },
  );
  assert.ok(cogent.reasons.includes('DATACENTER_NETWORK'));
  const georgia = judgeExit({ ...comcastTN, ipapi: { ...comcastTN.ipapi, region: 'GA', regionName: 'Georgia' } }, { stateCode: 'TN' });
  assert.ok(georgia.reasons.includes('IPAPI_STATE_GA'));
  const rotating = judgeExit({ ...comcastTN, ipapi: { ...comcastTN.ipapi, ip: '73.9.9.9' } }, { stateCode: 'TN' });
  assert.ok(rotating.reasons.includes('EXIT_NOT_STICKY'));
});

test('gate: TDS Telecom (a real Mt. Juliet ISP) passes strict mode, and the chosen ISP must match', () => {
  const tds = {
    ipinfo: { ip: '69.1.1.1', country: 'US', region: 'Tennessee', city: 'Lebanon', org: 'AS4181 TDS TELECOM' },
    ipapi: { ip: '69.1.1.1', countryCode: 'US', region: 'TN', regionName: 'Tennessee', city: 'Lebanon', isp: 'TDS TELECOM', org: 'TDS Telecom', as: 'AS4181 TDS TELECOM', hosting: false, proxy: false },
    google: { host: 'www.google.com', lang: 'en-US', usFooter: null },
  };
  assert.equal(judgeExit(tds, { stateCode: 'TN', isp: 'TDS Telecom' }).ok, true);
  assert.ok(judgeExit(tds, { stateCode: 'TN', isp: 'Comcast Cable' }).reasons.includes('ISP_MISMATCH'));
});

test('gate: an unknown small network fails strict, passes deny mode, and can be allowed by ASN', () => {
  const small = {
    ipinfo: { ip: '64.1.1.1', country: 'US', region: 'Tennessee', city: 'Gallatin', org: 'AS399999 Middle TN Rural Coop' },
    ipapi: null,
    google: null,
  };
  assert.ok(judgeExit(small, { stateCode: 'TN' }).reasons.includes('NOT_RESIDENTIAL_AS399999'));
  assert.equal(judgeExit(small, { stateCode: 'TN', policy: 'deny' }).ok, true);
  assert.equal(judgeExit(small, { stateCode: 'TN', extraAsns: [399999] }).ok, true);
});

test('gate: no geolocation answer fails closed', () => {
  assert.ok(judgeExit({ ipinfo: null, ipapi: null, google: null }, { stateCode: 'TN' }).reasons.includes('NO_GEOLOCATION'));
});

test('parsers: ipinfo, ip-api and the Google probe', () => {
  assert.equal(parseIpinfo('{"ip":"1.2.3.4","country":"US","region":"Tennessee","org":"AS7922 Comcast"}')?.ip, '1.2.3.4');
  assert.equal(parseIpinfo('not json'), null);
  const a = parseIpapi('{"status":"success","query":"1.2.3.4","countryCode":"US","region":"TN","regionName":"Tennessee","as":"AS7922 Comcast","hosting":false}');
  assert.equal(a?.region, 'TN');
  assert.equal(parseIpapi('{"status":"fail"}'), null);
  const g = parseGoogleProbe('https://www.google.com/\n<html itemscope="" itemtype="http://schema.org/WebPage" lang="en">\n2');
  assert.deepEqual(g, { host: 'www.google.com', lang: 'en', usFooter: true });
  assert.equal(parseGoogleProbe('https://www.google.co.uz/\n<html lang="uz">\n0')?.host, 'www.google.co.uz');
  assert.equal(asnOf('AS20115 Charter Communications'), 20115);
});

test('ispMatches handles real ISP names', () => {
  assert.equal(ispMatches('AT&T Services', 'AS7018 AT&T Services, Inc.'), true);
  assert.equal(ispMatches('Charter Communications', 'AS20115 Charter Communications Inc'), true);
  assert.equal(ispMatches('Comcast Cable', 'AS7922 Comcast Cable Communications, LLC'), true);
  assert.equal(ispMatches('Comcast Cable', 'AS4181 TDS TELECOM'), false);
});

test('portOrder: every port once, a stable order per point, different points start apart', () => {
  const ports = Array.from({ length: 50 }, (_, i) => 10000 + i);
  const a = portOrder(ports, 'pin-a');
  assert.equal(new Set(a).size, 50);
  assert.deepEqual(portOrder(ports, 'pin-a'), a);
  assert.notEqual(portOrder(ports, 'pin-b')[0], a[0]);
});
