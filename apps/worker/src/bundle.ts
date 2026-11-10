import { createHash } from 'node:crypto';
import { writeFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { x as unpack } from 'tar';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2, bucket } from '@stakeout/core/r2';

/** Downloads a bundle the phone uploaded to R2 (phone-upload mode), then reads it. */
export async function readBundle(key: string, tag: string, dir: string) {
  const obj = await r2().send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!obj.ContentLength || obj.ContentLength > 64 * 1024 ** 2)
    throw new Error('INVALID_BUNDLE_SIZE');
  await writeFile(join(dir, 'raw.tgz'), await obj.Body!.transformToByteArray());
  return readBundleFile(join(dir, 'raw.tgz'), tag, dir);
}

/**
 * Reads a capture bundle from a local .tar.gz. Only expected files are unpacked,
 * with size limits, and every file is fingerprinted (SHA-256) for the receipt.
 */
export async function readBundleFile(tgzPath: string, tag: string, dir: string) {
  const raw = await readFile(tgzPath);
  if (!raw.length || raw.length > 64 * 1024 ** 2) throw new Error('INVALID_BUNDLE_SIZE');
  let bytes = 0,
    files = 0;
  await unpack({
    file: tgzPath,
    cwd: dir,
    strict: true,
    filter: (name, entry) => {
      if (!('type' in entry)) return false;
      if (name === tag || name === tag + '/') return entry.type === 'Directory';
      if (!name.startsWith(tag + '/') || entry.type !== 'File') return false;
      const leaf = name.slice(tag.length + 1);
      if (
        !/^(video\.mp4|dump_\d{1,2}\.xml|final\.xml|serp\.xml|aio_(initial|expanded)\.xml|shot_(top|ai|pack|finder)\.png|first_screen\.xml|aio_copy\.txt|pack\.xml|location\.xml|error\.xml|rpa_status\.json|rpa_events\.tsv|finder_top\.xml|capture\.json|events\.tsv|captures\.tsv|flags\.txt|meta\.txt)$/.test(
          leaf,
        )
      )
        return false;
      const allowed = leaf === 'video.mp4' ? 40 * 1024 ** 2 : 4000000;
      bytes += entry.size;
      files++;
      return entry.size <= allowed && bytes <= 64 * 1024 ** 2 && files <= 24;
    },
  });
  const folder = join(dir, tag),
    entries = await readdir(folder);
  console.log('[evidence]', tag, 'files:', [...entries].sort().join(', '));
  const xml = async (pattern: RegExp) =>
    Promise.all(
      entries
        .filter((f) => pattern.test(f))
        .sort()
        .map((f) => readFile(join(folder, f), 'utf8')),
    );
  const finalXml = entries.includes('final.xml')
    ? await readFile(join(folder, 'final.xml'), 'utf8')
    : null;
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const fingerprints: Record<string, string> = { 'raw.tar.gz': sha(raw) };
  for (const f of entries.sort()) fingerprints[f] = sha(await readFile(join(folder, f)));
  return {
    raw,
    fingerprints,
    serp: entries.includes('serp.xml') ? await readFile(join(folder, 'serp.xml'), 'utf8') : null,
    aiCopy: entries.includes('aio_copy.txt') ? await readFile(join(folder, 'aio_copy.txt'), 'utf8') : null,
    finderTop: entries.includes('finder_top.xml') ? await readFile(join(folder, 'finder_top.xml'), 'utf8') : null,
    meta: entries.includes('meta.txt') ? await readFile(join(folder, 'meta.txt'), 'utf8') : '',
    final: finalXml,
    // Numeric order: dump_10 must come after dump_9, not after dump_1.
    scroll: await Promise.all(
      entries
        .filter((f) => /^dump_\d+\.xml$/.test(f))
        .sort((x, y) => Number(x.match(/\d+/)![0]) - Number(y.match(/\d+/)![0]))
        .map((f) => readFile(join(folder, f), 'utf8')),
    ),
    ai: await xml(/^aio_.*\.xml$/),
    flags: entries.includes('flags.txt') ? await readFile(join(folder, 'flags.txt'), 'utf8') : '',
    video: await readFile(join(folder, 'video.mp4')),
  };
}

