import test from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, keyOf } from '../packages/core/storageKeys';

test('what each stored file is, from its key', () => {
  const p = 'scans/cmwl/pin_0_0/08c23b786bfe/';
  assert.equal(kindOf(p + 'page_pre.mhtml.gz'), 'page snapshot (.mhtml.gz)');
  assert.equal(kindOf(p + 'page_post.dom.html.gz'), 'page HTML (.dom.html.gz)');
  assert.equal(kindOf(p + 'page_post.html'), 'page shown (.html)');
  assert.equal(kindOf(p + 'video.mp4'), 'video');
  assert.equal(kindOf(p + 'raw.tar.gz'), 'evidence bundle');
  assert.equal(kindOf(p + 'meta.json'), 'record (.json)');
  assert.equal(keyOf('https://x.r2.cloudflarestorage.com/scans/a%20b/video.mp4'), 'scans/a b/video.mp4');
  assert.equal(keyOf('scans/a/video.mp4'), 'scans/a/video.mp4');
  assert.equal(keyOf(null), null);
});
