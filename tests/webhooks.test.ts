import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { RETRY_AFTER_MS, checkWebhookUrl, guardedLookup, isPrivateAddress, newWebhookSecret, postWebhook, signWebhook, webhookBody } from '../packages/core/webhookSend';
import { ACCOUNT_PLANS, ACCOUNT_PLAN_ORDER } from '../packages/core/gbpPlans';
import { embedReport, embedTop } from '../apps/nextjs/src/lib/embedHtml';

test('webhooks never reach a private, loopback, link-local or reserved address', () => {
  for (const ip of ['10.0.0.1', '127.0.0.1', '127.8.8.8', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '100.127.255.255', '0.0.0.0', '192.0.0.8', '198.18.0.1', '224.0.0.1', '255.255.255.255', '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1', '64:ff9b::a00:1', '::127.0.0.1', '::7f00:1', 'fec0::1', '2001::1', '2001:0:4136:e378::1', '2002:a00:1::1', '2001:db8::1', 'not-an-ip'])
    assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8', '2001:4860:4860::8888', '2a00:1450:4001:80b::200e'])
    assert.equal(isPrivateAddress(ip), false, ip);
});

test('a webhook address must be public HTTPS on the standard port, without a login', () => {
  assert.deepEqual(checkWebhookUrl(' https://hooks.zapier.com/hooks/catch/123/abc/ '), { url: 'https://hooks.zapier.com/hooks/catch/123/abc/' });
  assert.ok('url' in checkWebhookUrl('https://hook.us1.make.com/xyz'));
  assert.ok('url' in checkWebhookUrl('https://services.leadconnectorhq.com/hooks/abc/webhook-trigger/def'));
  assert.ok('url' in checkWebhookUrl('https://example.com:8443/in'));
  for (const bad of ['http://example.com/hook', 'ftp://example.com', 'https://user:pw@example.com/', 'https://example.com:22/', 'https://localhost/x', 'https://app.localhost/', 'https://printer.local/', 'https://db.internal/', 'https://intranet/', 'https://10.0.0.5/hook', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data', 'example.com/hook', '', null])
    assert.ok('error' in checkWebhookUrl(bad), String(bad));
});

test('the lookup refuses a name that resolves to a private address, at every connection', async () => {
  const fake = (addresses: { address: string; family: number }[]) => guardedLookup((_h, _o, cb) => cb(null, addresses));
  const ask = (look: ReturnType<typeof guardedLookup>, all = false) => new Promise<{ err: string | null; address: unknown }>((resolve) => look('hooks.example.com', all ? { all: true } : {}, (err, address) => resolve({ err: err ? (err.code ?? err.message) : null, address })));
  assert.deepEqual(await ask(fake([{ address: '93.184.216.34', family: 4 }])), { err: null, address: '93.184.216.34' });
  assert.equal((await ask(fake([{ address: '93.184.216.34', family: 4 }]), true)).err, null);
  assert.equal((await ask(fake([{ address: '10.1.2.3', family: 4 }]))).err, 'BLOCKED_ADDRESS', 'rebinding to a private address');
  assert.equal((await ask(fake([{ address: '93.184.216.34', family: 4 }, { address: '::1', family: 6 }]))).err, 'BLOCKED_ADDRESS', 'any private address among several');
  assert.equal((await ask(fake([]))).err, 'BLOCKED_ADDRESS');
});

test('a blocked address fails before any connection', async () => {
  assert.deepEqual(await postWebhook('https://127.0.0.1/hook', 'whsec_x', 'scan.completed', 'd1', '{}'), { ok: false, status: null, error: 'That address is not on the public internet.' });
  assert.equal((await postWebhook('http://example.com/hook', 'whsec_x', 'scan.completed', 'd1', '{}')).ok, false);
});

test('the signature is HMAC-SHA256 of "<timestamp>.<raw body>" with the account secret', () => {
  const secret = newWebhookSecret();
  assert.match(secret, /^whsec_[A-Za-z0-9_-]{32}$/);
  assert.notEqual(newWebhookSecret(), secret);
  const body = webhookBody({ id: 'del_1', event: 'scan.completed', createdAt: new Date('2026-11-24T12:00:00Z'), attempts: 2 }, { scanId: 's1', businessName: 'Joe’s' });
  assert.deepEqual(JSON.parse(body), { id: 'del_1', event: 'scan.completed', createdAt: '2026-11-24T12:00:00.000Z', attempt: 2, data: { scanId: 's1', businessName: 'Joe’s' } });
  const t = 1795000000;
  assert.equal(signWebhook(secret, t, body), createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
  assert.notEqual(signWebhook(secret, t, body), signWebhook(secret, t + 1, body), 'the timestamp is signed too');
});

test('four tries in all: at once, then after 1, 5 and 30 minutes', () => {
  assert.deepEqual(RETRY_AFTER_MS, [60_000, 300_000, 1_800_000]);
});

test('embeds from Agency up, webhooks from Scale up', () => {
  assert.deepEqual(ACCOUNT_PLAN_ORDER.map((p) => ACCOUNT_PLANS[p].embeds), [false, true, true, true]);
  assert.deepEqual(ACCOUNT_PLAN_ORDER.map((p) => ACCOUNT_PLANS[p].webhooks), [false, false, true, true]);
});

test('the embed escapes what customers typed, leaves circle corners empty and shows our badge without a brand', () => {
  const pins = [
    { rowIdx: 0, colIdx: 1, rankFound: 2, status: 'COMPLETED', targetCitedInAi: true },
    { rowIdx: 1, colIdx: 0, rankFound: null, status: 'COMPLETED', targetCitedInAi: false },
    { rowIdx: 1, colIdx: 1, rankFound: 1, status: 'COMPLETED', targetCitedInAi: true },
    { rowIdx: 1, colIdx: 2, rankFound: 14, status: 'COMPLETED', targetCitedInAi: false },
    { rowIdx: 2, colIdx: 1, rankFound: null, status: 'FAILED', targetCitedInAi: null },
  ];
  const html = embedReport({ targetBusiness: 'Joe <script>alert(1)</script>', keyword: '"plumber" & co', gridSize: 3, completedAt: new Date('2026-11-23T18:00:00Z'), arp: 3.4, solv: 40, city: 'Austin', stateCode: 'TX' }, pins, null, '/share/abc');
  assert.ok(!html.includes('<script>'), 'no markup from a business name');
  assert.ok(html.includes('Joe &lt;script&gt;'));
  assert.ok(html.includes('&quot;plumber&quot; &amp; co'));
  assert.ok(html.includes('Verified on real phones by Stakeout Search'));
  assert.equal((html.match(/<div aria-hidden="true"><\/div>/g) ?? []).length, 4, 'the four corners of a 3×3 circle');
  assert.ok(html.includes('class="cell r1 mid"'), 'the business’s own point is outlined');
  assert.ok(html.includes('2 of 4</b><span>Points in the top 3'));
  assert.ok(html.includes('Updated Nov 23, 2026'));
  assert.ok(html.includes('href="/share/abc"'));
  const branded = embedTop({ name: 'Northstar', accent: '#1d4ed8', logo: '/api/brand/logo?d=x.com' });
  assert.ok(branded.includes('Northstar') && !branded.includes('Stakeout') && branded.includes('--accent:#1d4ed8'));
  assert.ok(!embedTop({ name: 'X', accent: 'red;}</style><script>', logo: null }).includes('<script>'), 'only a hex colour is used');
});
