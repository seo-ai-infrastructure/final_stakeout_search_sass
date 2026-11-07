import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedHostnames, turnstileVerdict } from '../packages/core/turnstileVerdict';

const hosts = expectedHostnames({ APP_URL: 'https://stakeoutsearch.com' });

test('turnstile: allowed hostnames come from APP_URL (apex and www) or TURNSTILE_HOSTNAMES', () => {
  assert.deepEqual([...hosts].sort(), ['stakeoutsearch.com', 'www.stakeoutsearch.com']);
  assert.deepEqual([...expectedHostnames({ TURNSTILE_HOSTNAMES: 'a.com, B.com' })], ['a.com', 'b.com']);
  assert.equal(expectedHostnames({}).size, 0);
});

test('turnstile: a valid signup token on our domain passes', () => {
  assert.equal(turnstileVerdict({ success: true, action: 'signup', hostname: 'stakeoutsearch.com' }, { action: 'signup', hostnames: hosts }), 'ok');
});

test('turnstile: wrong action, foreign hostname, failed token and a bad secret are each refused', () => {
  assert.equal(turnstileVerdict({ success: true, action: 'teaser', hostname: 'stakeoutsearch.com' }, { action: 'signup', hostnames: hosts }), 'wrong_action');
  assert.equal(turnstileVerdict({ success: true, action: 'signup', hostname: 'evil.example' }, { action: 'signup', hostnames: hosts }), 'wrong_hostname');
  assert.equal(turnstileVerdict({ success: false, 'error-codes': ['timeout-or-duplicate'] }, { action: 'signup', hostnames: hosts }), 'failed');
  assert.equal(turnstileVerdict({ success: false, 'error-codes': ['invalid-input-secret'] }, { action: 'signup', hostnames: hosts }), 'misconfigured');
});
