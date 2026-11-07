import test from 'node:test';
import assert from 'node:assert/strict';
import { safeErrorText, errorCode } from '../packages/core/errorText';

test('safeErrorText masks API keys in URLs, URL passwords and long tokens', () => {
  const e = new Error('PROXY_SELLER_UNREACHABLE https://proxy-seller.com/personal/api/v2/abc123SECRET/resident/geo');
  assert.equal(safeErrorText(e), 'Error: PROXY_SELLER_UNREACHABLE https://proxy-seller.com/personal/api/v2/***/resident/geo');
  assert.equal(
    safeErrorText(new Error('connect failed postgresql://neondb_owner:npg_secret@ep-x.neon.tech/db')),
    'Error: connect failed postgresql://neondb_owner:***@ep-x.neon.tech/db',
  );
  assert.ok(!safeErrorText(new Error('token ' + 'a'.repeat(40))).includes('a'.repeat(40)));
});

test('errorCode reads the leading machine code only', () => {
  assert.equal(errorCode(new Error('PROXY_SELLER_ERROR resident/geo Invalid key')), 'PROXY_SELLER_ERROR');
  assert.equal(errorCode(new Error('Something broke')), null);
  assert.equal(errorCode('nope'), null);
});
