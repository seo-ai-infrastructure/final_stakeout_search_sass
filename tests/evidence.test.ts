import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { c as tarCreate } from 'tar';
import { readBundleFile } from '../apps/worker/src/bundle';

test('a pulled bundle is unpacked safely and every file fingerprinted', async () => {
  const work = await mkdtemp(join(tmpdir(), 'bundle-test-'));
  try {
    const tag = 'a1b2c3d4e5f6_3_3';
    const folder = join(work, 'phone', tag);
    await mkdir(folder, { recursive: true });
    const files: Record<string, string> = {
      'video.mp4': 'fake-mp4-bytes',
      'serp.xml': '<hierarchy><node text="AI Overview"/></hierarchy>',
      'final.xml': '<hierarchy><node text="list"/></hierarchy>',
      'dump_0.xml': '<hierarchy/>',
      'meta.txt': 'runner=v4\n',
      'flags.txt': '',
      'notes.sh': 'echo not allowed',
    };
    for (const [name, body] of Object.entries(files)) await writeFile(join(folder, name), body);
    const tgz = join(work, 'raw.tgz');
    await tarCreate({ gzip: true, file: tgz, cwd: join(work, 'phone') }, [tag]);
    const out = join(work, 'out');
    await mkdir(out);
    const b = await readBundleFile(tgz, tag, out);
    assert.equal(b.serp, files['serp.xml']);
    assert.equal(b.final, files['final.xml']);
    assert.equal(b.video.toString(), 'fake-mp4-bytes');
    assert.equal(b.fingerprints['video.mp4'], createHash('sha256').update('fake-mp4-bytes').digest('hex'));
    assert.equal(b.fingerprints['notes.sh'], undefined, 'unexpected files are never unpacked');
    assert.match(b.fingerprints['raw.tar.gz'], /^[0-9a-f]{64}$/);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
